const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.serialize(() => {
      // Create users table
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT
      )`);

      // Create tasks table
      db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Seed initial user if not exists
      const email = process.env.INITIAL_USER_EMAIL || 'victorcifuentes4ceis@gmail.com';
      const password = process.env.INITIAL_USER_PASSWORD || 'Vmcifuentes2509_.';

      db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
        if (!row) {
          const salt = bcrypt.genSaltSync(10);
          const hash = bcrypt.hashSync(password, salt);
          db.run(`INSERT INTO users (email, password) VALUES (?, ?)`, [email, hash], (err) => {
            if (err) {
              console.error('Error seeding initial user', err);
            } else {
              console.log('Initial user seeded.');
            }
          });
        }
      });
    });
  }
});

module.exports = db;
