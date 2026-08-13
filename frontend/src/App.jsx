import { useState, useEffect } from 'react';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  
  if (!token) {
    return <Login setToken={setToken} />;
  }

  return <Tasks token={token} setToken={setToken} />;
}

function Login({ setToken }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Login failed');
      
      localStorage.setItem('token', data.token);
      setToken(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container animate-slide-up">
      <div className="glass-panel">
        <h1>TaskSync</h1>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label>Email</label>
            <input 
              type="email" 
              className="input-control" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
              placeholder="tu@email.com"
            />
          </div>
          <div className="input-group" style={{marginBottom: '24px'}}>
            <label>Contraseña</label>
            <input 
              type="password" 
              className="input-control" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Iniciando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Tasks({ token, setToken }) {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    try {
      const res = await fetch(`${API_URL}/tasks`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return;
      }
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  const addTask = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    
    try {
      const res = await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, description: desc })
      });
      const newTask = await res.json();
      setTasks([newTask, ...tasks]);
      setTitle('');
      setDesc('');
    } catch (err) {
      console.error(err);
    }
  };

  const toggleStatus = async (task) => {
    const newStatus = task.status === 'pending' ? 'completed' : 'pending';
    
    // Optimistic update
    setTasks(tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    
    try {
      await fetch(`${API_URL}/tasks/${task.id}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (err) {
      // Revert on error
      fetchTasks();
    }
  };

  const deleteTask = async (id) => {
    // Optimistic update
    setTasks(tasks.filter(t => t.id !== id));
    
    try {
      await fetch(`${API_URL}/tasks/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (err) {
      // Revert on error
      fetchTasks();
    }
  };

  return (
    <div className="app-container">
      <header className="app-header animate-slide-up">
        <h1>Mis Tareas</h1>
        <button onClick={handleLogout} className="logout-btn">Salir</button>
      </header>

      <div className="add-task-form animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <form onSubmit={addTask} className="glass-panel">
          <div className="input-group">
            <input 
              type="text" 
              className="input-control" 
              placeholder="¿Qué necesitas hacer?" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <input 
              type="text" 
              className="input-control" 
              placeholder="Detalles (opcional)" 
              value={desc}
              onChange={e => setDesc(e.target.value)}
              style={{ fontSize: '14px', padding: '8px 12px' }}
            />
          </div>
          <button type="submit" className="btn" style={{ marginTop: '12px' }}>Agregar Tarea</button>
        </form>
      </div>

      <div className="task-list">
        {loading ? (
          <div className="empty-state">Cargando...</div>
        ) : tasks.length === 0 ? (
          <div className="empty-state animate-slide-up">No tienes tareas pendientes. ¡Buen trabajo!</div>
        ) : (
          tasks.map((task, idx) => (
            <div 
              key={task.id} 
              className={`task-item animate-slide-up ${task.status === 'completed' ? 'completed' : ''}`}
              style={{ animationDelay: `${0.1 + (idx * 0.05)}s` }}
            >
              <input 
                type="checkbox" 
                className="task-checkbox" 
                checked={task.status === 'completed'}
                onChange={() => toggleStatus(task)}
              />
              <div className="task-content">
                <div className="task-title">{task.title}</div>
                {task.description && <div className="task-desc">{task.description}</div>}
              </div>
              <button className="btn-icon delete-btn" onClick={() => deleteTask(task.id)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;
