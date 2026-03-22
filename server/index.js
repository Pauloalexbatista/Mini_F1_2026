import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000; // Match Coolify default Node route
const JWT_SECRET = process.env.JWT_SECRET || 'f1_2026_super_secret_key_omega';

app.use(cors());
app.use(express.json());

let db;

// Authentication Middleware
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

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Require Admin Role' });
  next();
};

// ---------------------------------------------------------
// AUTHENTICATION
// ---------------------------------------------------------

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, pilot_name } = req.body;
    const password_hash = await bcrypt.hash(password, 10);
    // First user is automatically admin
    const countRes = await db.get('SELECT COUNT(*) as count FROM users');
    const role = countRes.count === 0 ? 'admin' : 'pilot';

    const result = await db.run(
      'INSERT INTO users (username, password_hash, role, pilot_name) VALUES (?, ?, ?, ?)',
      [username, password_hash, role, pilot_name || username]
    );

    const user = { id: result.lastID, username, role, pilot_name };
    const token = jwt.sign(user, JWT_SECRET);

    res.status(201).json({ token, user });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const userRow = await db.get('SELECT * FROM users WHERE username = ?', [username]);

    if (!userRow) return res.status(400).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(password, userRow.password_hash);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    const user = { 
       id: userRow.id, 
       username: userRow.username, 
       role: userRow.role, 
       pilot_name: userRow.pilot_name,
       selected_car_id: userRow.selected_car_id
    };
    
    const token = jwt.sign(user, JWT_SECRET);
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const userRow = await db.get('SELECT id, username, role, pilot_name, selected_car_id FROM users WHERE id = ?', [req.user.id]);
    res.json(userRow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/me', authenticateToken, async (req, res) => {
  try {
    const { pilot_name, selected_car_id } = req.body;
    await db.run(
      'UPDATE users SET pilot_name = ?, selected_car_id = ? WHERE id = ?',
      [pilot_name, selected_car_id, req.user.id]
    );
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/me/records', authenticateToken, async (req, res) => {
  try {
    const records = await db.all(`
      SELECT t.name as track_name, t.id as track_id, MIN(l.lap_time_ms) as personal_best
      FROM leaderboards l
      JOIN tracks t ON l.track_id = t.id
      WHERE l.user_id = ?
      GROUP BY t.id
      ORDER BY t.created_at ASC
    `, [req.user.id]);
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------
// TRACKS
// ---------------------------------------------------------

app.get('/api/tracks', async (req, res) => {
  try {
    const tracks = await db.all('SELECT id, name, svg_data, pit_svg_data, created_at FROM tracks ORDER BY created_at DESC');
    res.json(tracks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tracks', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id, name, svg_data, pit_svg_data } = req.body;
    await db.run(
      'INSERT INTO tracks (id, name, svg_data, pit_svg_data, created_by) VALUES (?, ?, ?, ?, ?)',
      [id, name, svg_data, pit_svg_data, req.user.id]
    );
    res.status(201).json({ message: 'Track created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tracks/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Delete associated leaderboards first
    await db.run('DELETE FROM leaderboards WHERE track_id = ?', [req.params.id]);
    await db.run('DELETE FROM tracks WHERE id = ?', [req.params.id]);
    res.json({ message: 'Track deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------
// LEADERBOARDS
// ---------------------------------------------------------

app.post('/api/lap-times', authenticateToken, async (req, res) => {
  try {
    const { track_id, lap_time_ms } = req.body;
    await db.run(
      'INSERT INTO leaderboards (track_id, user_id, lap_time_ms) VALUES (?, ?, ?)',
      [track_id, req.user.id, lap_time_ms]
    );
    res.status(201).json({ message: 'Lap time recorded' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tracks/:track_id/leaderboard', async (req, res) => {
  try {
    // Gets top 10 unique users with their best lap times
    const leaderboard = await db.all(`
      SELECT 
        MIN(l.lap_time_ms) as best_time, 
        u.pilot_name, 
        u.id as user_id,
        u.selected_car_id
      FROM leaderboards l
      JOIN users u ON l.user_id = u.id
      WHERE l.track_id = ?
      GROUP BY u.id
      ORDER BY best_time ASC
      LIMIT 10
    `, [req.params.track_id]);
    
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------
// SERVE REACT FRONTEND (Must be after all API routes)
// ---------------------------------------------------------
app.use(express.static(path.join(__dirname, '../dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// ---------------------------------------------------------
// SERVER BOOT
// ---------------------------------------------------------

async function startServer() {
  db = await initDB();
  app.listen(PORT, () => {
    console.log(`F1 2026 API Server running on http://localhost:${PORT}`);
  });
}

startServer();
