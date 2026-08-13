require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

// MCP SDK imports
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { z } = require('zod');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkeyforthisapp2024';
const path = require('path');

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend/dist')));


// --- REST API Endpoints ---

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  });
});

// Middleware for API protection
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Get Tasks
app.get('/api/tasks', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM tasks ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

// Add Task
app.post('/api/tasks', authenticateToken, (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  db.run(`INSERT INTO tasks (title, description) VALUES (?, ?)`, [title, description || ''], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    db.get(`SELECT * FROM tasks WHERE id = ?`, [this.lastID], (err, row) => {
      res.json(row);
    });
  });
});

// Update Task Status
app.patch('/api/tasks/:id/status', authenticateToken, (req, res) => {
  const { status } = req.body;
  const { id } = req.params;
  
  if (!['pending', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  db.run(`UPDATE tasks SET status = ? WHERE id = ?`, [status, id], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  });
});

// Delete Task
app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM tasks WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  });
});


// --- MCP Server Setup (SSE Transport) ---

const mcpServer = new McpServer({
  name: 'task-manager-mcp',
  version: '1.0.0'
});

// Tool: get_tasks
mcpServer.tool('get_tasks', 'Retrieve all tasks', {}, async () => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM tasks ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) resolve({ content: [{ type: 'text', text: `Error fetching tasks: ${err.message}` }] });
      else resolve({ content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] });
    });
  });
});

// Tool: add_task
mcpServer.tool('add_task', 'Add a new task', {
  title: z.string().describe('Title of the task'),
  description: z.string().optional().describe('Description of the task')
}, async ({ title, description }) => {
  return new Promise((resolve) => {
    db.run(`INSERT INTO tasks (title, description) VALUES (?, ?)`, [title, description || ''], function(err) {
      if (err) resolve({ content: [{ type: 'text', text: `Error adding task: ${err.message}` }] });
      else resolve({ content: [{ type: 'text', text: `Task added successfully with ID ${this.lastID}` }] });
    });
  });
});

// Tool: update_task_status
mcpServer.tool('update_task_status', 'Update status of a task to pending or completed', {
  id: z.number().describe('ID of the task to update'),
  status: z.enum(['pending', 'completed']).describe('New status for the task')
}, async ({ id, status }) => {
  return new Promise((resolve) => {
    db.run(`UPDATE tasks SET status = ? WHERE id = ?`, [status, id], function(err) {
      if (err) resolve({ content: [{ type: 'text', text: `Error updating task: ${err.message}` }] });
      else if (this.changes === 0) resolve({ content: [{ type: 'text', text: `Task with ID ${id} not found.` }] });
      else resolve({ content: [{ type: 'text', text: `Task status updated to ${status}.` }] });
    });
  });
});

// Tool: delete_task
mcpServer.tool('delete_task', 'Delete a task by ID', {
  id: z.number().describe('ID of the task to delete')
}, async ({ id }) => {
  return new Promise((resolve) => {
    db.run(`DELETE FROM tasks WHERE id = ?`, [id], function(err) {
      if (err) resolve({ content: [{ type: 'text', text: `Error deleting task: ${err.message}` }] });
      else if (this.changes === 0) resolve({ content: [{ type: 'text', text: `Task with ID ${id} not found.` }] });
      else resolve({ content: [{ type: 'text', text: `Task deleted successfully.` }] });
    });
  });
});

let mcpTransport;

app.get('/mcp/sse', async (req, res) => {
  try {
    console.log('MCP SSE Client connected');
    if (mcpTransport) {
      try { await mcpServer.close(); } catch (e) {}
      try { await mcpTransport.close(); } catch (e) {}
    }
    const endpoint = req.protocol + '://' + req.get('host') + '/mcp/messages';
    mcpTransport = new SSEServerTransport(endpoint, res);
    await mcpServer.connect(mcpTransport);
    
    req.on('close', async () => {
      console.log('MCP SSE Client disconnected');
      try { await mcpServer.close(); } catch (e) {}
      mcpTransport = null;
    });
  } catch (err) {
    console.error('SSE Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/mcp/messages', async (req, res) => {
  if (mcpTransport) {
    await mcpTransport.handlePostMessage(req, res);
  } else {
    res.status(500).send('MCP transport not initialized');
  }
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
  console.log(`MCP SSE endpoint available at http://localhost:${PORT}/mcp/sse`);
});
