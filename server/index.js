import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

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
       selected_car_id: userRow.selected_car_id,
       primary_color: userRow.primary_color || '#E10600',
       secondary_color: userRow.secondary_color || '#000000',
       helmet_color: userRow.helmet_color || '#FFDD00'
    };
    
    const token = jwt.sign(user, JWT_SECRET);
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const userRow = await db.get('SELECT id, username, role, pilot_name, selected_car_id, primary_color, secondary_color, helmet_color, controls FROM users WHERE id = ?', [req.user.id]);
    res.json({
        ...userRow,
        primary_color: userRow.primary_color || '#E10600',
        secondary_color: userRow.secondary_color || '#000000',
        helmet_color: userRow.helmet_color || '#FFDD00',
        controls: userRow.controls ? JSON.parse(userRow.controls) : undefined
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/me', authenticateToken, async (req, res) => {
  try {
    const { pilot_name, selected_car_id, primary_color, secondary_color, helmet_color, controls } = req.body;
    await db.run(
      'UPDATE users SET pilot_name = ?, selected_car_id = ?, primary_color = ?, secondary_color = ?, helmet_color = ?, controls = ? WHERE id = ?',
      [pilot_name, selected_car_id, primary_color, secondary_color, helmet_color, JSON.stringify(controls), req.user.id]
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
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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
      'INSERT OR REPLACE INTO tracks (id, name, svg_data, pit_svg_data, created_by) VALUES (?, ?, ?, ?, ?)',
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
// EVENTS (CHAMPIONSHIPS/RACES)
// ---------------------------------------------------------

app.get('/api/events', async (req, res) => {
  try {
    const events = await db.all("SELECT * FROM events WHERE status = 'open' ORDER BY created_at DESC");
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', authenticateToken, async (req, res) => {
  try {
    const { id, name, tracks_json, laps } = req.body;
    await db.run(
      'INSERT INTO events (id, name, host_id, host_name, tracks_json, laps, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, req.user.id, req.user.pilot_name, tracks_json, laps, 'open']
    );
    res.status(201).json({ message: 'Event created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/events/:id', authenticateToken, async (req, res) => {
  try {
    const event = await db.get('SELECT host_id FROM events WHERE id = ?', [req.params.id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.host_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to delete this event' });
    }
    await db.run('DELETE FROM events WHERE id = ?', [req.params.id]);
    res.json({ message: 'Event deleted successfully' });
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
// WEBSOCKETS LOBBY MULTIPLAYER (FASE 4)
// ---------------------------------------------------------

let onlinePlayers = []; // Track everyone

io.on('connection', (socket) => {
  console.log(`[SOCKET] Handshake established: ${socket.id}`);

  // Entra na plataforma global (Paddock Livre)
  socket.on('join_global', (data) => {
      onlinePlayers = onlinePlayers.filter(p => p.socketId !== socket.id);
      onlinePlayers.push({
         socketId: socket.id,
         userId: data.userId,
         driverName: data.driverName,
         teamName: data.teamName,
         color: data.color,
         color2: data.color2,
         helmetColor: data.helmetColor,
         eventId: null,
         isReady: false,
         status: 'available' // available, racing
      });
      // Avisar todos da nova entrada
      io.emit('global_roster', onlinePlayers);
  });
  
  // Entra num evento específico
  socket.on('join_event', (eventId) => {
      const p = onlinePlayers.find(x => x.socketId === socket.id);
      if (p) {
          if (p.eventId) socket.leave(p.eventId); // leave old
          
          p.eventId = eventId;
          p.isReady = false;
          p.setupReady = false; // Reset setup readiness on join
          p.status = 'in_lobby';
          socket.join(eventId);
          
          io.emit('global_roster', onlinePlayers);
          io.to(eventId).emit('lobby_state', onlinePlayers.filter(x => x.eventId === eventId));
      }
  });

  // Host emite para notificar que apagou a sala ou a sala deve ser atualizada
  socket.on('refresh_events', () => {
      io.emit('trigger_refresh_events');
  });


  // Parc Fermé: player confirmed setup and is ready to race
  socket.on('setup_ready', () => {
      const p = onlinePlayers.find(x => x.socketId === socket.id);
      if (p && p.eventId) {
          p.setupReady = true;
          const roomPlayers = onlinePlayers.filter(x => x.eventId === p.eventId);
          io.to(p.eventId).emit('lobby_state', roomPlayers);
          // Start countdown only when ALL players in the room confirmed
          if (roomPlayers.length > 0 && roomPlayers.every(x => x.setupReady)) {
              roomPlayers.forEach(x => { x.setupReady = false; });
              io.to(p.eventId).emit('all_setup_ready');
          }
      }
  });
  socket.on('set_ready', (isReady) => {
      const p = onlinePlayers.find(p => p.socketId === socket.id);
      if (p && p.eventId) {
         p.isReady = isReady;
         io.to(p.eventId).emit('lobby_state', onlinePlayers.filter(x => x.eventId === p.eventId));
      }
  });

  socket.on('player_tick', (carData) => {
      const p = onlinePlayers.find(p => p.socketId === socket.id);
      if (p && p.eventId) {
         socket.to(p.eventId).emit('remote_tick', carData);
      }
  });

  async function handleEventCleanup(eventId) {
      const playersInEvent = onlinePlayers.filter(x => x.eventId === eventId);
      if (playersInEvent.length === 0) {
          try {
              await db.run("DELETE FROM events WHERE id = ?", [eventId]);
              io.emit('trigger_refresh_events');
          } catch (e) { console.error('Auto-delete error:', e); }
      } else if (!playersInEvent.some(x => x.isHost)) {
          playersInEvent[0].isHost = true;
          io.to(eventId).emit('lobby_state', playersInEvent);
      }
  }

  socket.on('start_race', async (data) => {
      const p = onlinePlayers.find(p => p.socketId === socket.id);
      if (p && p.eventId) {
          // Mark event as 'racing' in DB so it disappears from the open events list
          try { await db.run("UPDATE events SET status = 'racing' WHERE id = ?", [p.eventId]); } catch(e) {}
          // Update all players in the room to 'racing' status
          const roomPlayers = onlinePlayers.filter(x => x.eventId === p.eventId);
          roomPlayers.forEach(x => {
              x.status = 'racing';
              x.setupReady = false; // Ensure reset before race starts
          });
          console.log(`[EVENT] Starting race for event ${p.eventId}. Players: ${roomPlayers.length}`);
          io.to(p.eventId).emit('race_started', data);
          // Notify all clients to refresh their events list (event is now gone)
          io.emit('trigger_refresh_events');
      }
  });
  
  socket.on('advance_championship', () => {
      const p = onlinePlayers.find(p => p.socketId === socket.id);
      if (p && p.eventId && p.isHost) {
          io.to(p.eventId).emit('championship_advanced');
      }
  });

  // Sair de um evento e voltar à box
  socket.on('leave_event', async () => {
      const p = onlinePlayers.find(x => x.socketId === socket.id);
      if (p && p.eventId) {
         const oldEvent = p.eventId;
         socket.leave(oldEvent);
         p.eventId = null;
         p.isReady = false;
         p.status = 'available';
         p.isHost = false;
         
         io.emit('global_roster', onlinePlayers);
         io.to(oldEvent).emit('lobby_state', onlinePlayers.filter(x => x.eventId === oldEvent));
         await handleEventCleanup(oldEvent);
      }
  });

  socket.on('disconnect', async () => {
      const p = onlinePlayers.find(x => x.socketId === socket.id);
      onlinePlayers = onlinePlayers.filter(x => x.socketId !== socket.id);
      if (p) {
         io.emit('global_roster', onlinePlayers);
         if (p.eventId) {
             const oldEvt = p.eventId;
             io.to(oldEvt).emit('lobby_state', onlinePlayers.filter(x => x.eventId === oldEvt));
             await handleEventCleanup(oldEvt);
         }
      }
  });
});

// ---------------------------------------------------------
// SERVER BOOT
// ---------------------------------------------------------

async function startServer() {
  db = await initDB();
  
  // Limpeza de eventos órfãos de sessões anteriores gravados na BD
  try {
      await db.run("DELETE FROM events WHERE status = 'open'");
      console.log('Orphan events purged from database.');
  } catch (e) {
      console.error('Failed to purge open events from DB:', e);
  }

  server.listen(PORT, () => {
    console.log(`F1 2026 API & WSS Server running on http://localhost:${PORT}`);
  });
}

startServer();
