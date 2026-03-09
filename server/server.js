const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors({ origin: '*' }));
app.use(express.json());

// Socket.io connection logic
io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);
  
  // Student joins quiz room
  socket.on('join_quiz', (code) => {
    if (code) {
      const quizCode = code.toUpperCase();
      socket.join(quizCode);
      socket.data.quizCode = quizCode;
      console.log('[Socket] Student joined quiz:', quizCode, 'Socket:', socket.id);
      
      // Notify teacher that student joined
      io.to(quizCode).emit('student_joined', {
        socket_id: socket.id,
        joined_at: new Date().toISOString(),
      });
    }
  });
  
  // Student progress update
  socket.on('student_progress', (data) => {
    const { quiz_code, attempt_id, student_name, question_index, time_on_question } = data;
    if (quiz_code) {
      const quizCode = quiz_code.toUpperCase();
      
      // Update attempt in database
      getDb().then((db) => {
        db.prepare(`
          UPDATE attempts 
          SET current_question = ?, last_activity_at = datetime('now'), socket_id = ?
          WHERE id = ?
        `).run(question_index, socket.id, attempt_id);
      }).catch(() => {});
      
      // Broadcast to teacher
      io.to(quizCode).emit('student_progress', {
        attempt_id,
        student_name,
        question_index,
        time_on_question,
        timestamp: new Date().toISOString(),
      });
    }
  });
  
  // Student violation
  socket.on('student_violation', (data) => {
    const { quiz_code, attempt_id, student_name, violation_count, left_at, returned_at, away_seconds } = data;
    if (quiz_code) {
      const quizCode = quiz_code.toUpperCase();
      
      io.to(quizCode).emit('student_violation', {
        attempt_id,
        student_name,
        violation_count,
        left_at,
        returned_at,
        away_seconds,
        timestamp: new Date().toISOString(),
        is_critical: violation_count >= 3,
      });
    }
  });
  
  // Student completed quiz
  socket.on('student_completed', (data) => {
    const { quiz_code, attempt_id, student_name, score, total, percentage, time_taken } = data;
    if (quiz_code) {
      const quizCode = quiz_code.toUpperCase();
      
      // Update attempt in database
      getDb().then((db) => {
        db.prepare(`
          UPDATE attempts 
          SET status = 'completed', completed_at = datetime('now'), score = ?, total = ?, percentage = ?
          WHERE id = ?
        `).run(score, total, percentage, attempt_id);
      }).catch(() => {});
      
      // Broadcast to teacher
      io.to(quizCode).emit('student_completed', {
        attempt_id,
        student_name,
        score,
        total,
        percentage,
        time_taken,
        timestamp: new Date().toISOString(),
      });
    }
  });
  
  // Teacher sends message to student
  socket.on('teacher_message', (data) => {
    const { student_socket_id, message, quiz_code } = data;
    if (student_socket_id && message) {
      io.to(student_socket_id).emit('teacher_message', {
        message,
        quiz_code,
        timestamp: new Date().toISOString(),
      });
      console.log('[Socket] Teacher message sent to:', student_socket_id);
    }
  });
  
  // Teacher sends warning to student
  socket.on('teacher_warning', (data) => {
    const { student_socket_id, quiz_code } = data;
    if (student_socket_id) {
      io.to(student_socket_id).emit('teacher_warning', {
        message: '⚠️ Teacher is watching. Stay focused!',
        quiz_code,
        timestamp: new Date().toISOString(),
      });
      console.log('[Socket] Teacher warning sent to:', student_socket_id);
    }
  });
  
  // Teacher broadcasts to all students
  socket.on('teacher_broadcast', (data) => {
    const { quiz_code, message } = data;
    if (quiz_code && message) {
      io.to(quiz_code.toUpperCase()).emit('teacher_broadcast', {
        message,
        timestamp: new Date().toISOString(),
      });
      console.log('[Socket] Teacher broadcast to quiz:', quiz_code);
    }
  });
  
  // Student leaving
  socket.on('disconnect', () => {
    console.log('[Socket] Client disconnected:', socket.id);
    // Could emit student_left event if needed
  });
});

app.set('io', io);

// Initialise DB before mounting routes
const { getDb } = require('./db');
getDb().then(() => {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const latency = Date.now() - start;
      getDb().then((db) => {
        db.prepare(`
          INSERT INTO system_events (event_type, level, message, path, status_code, latency_ms, detail_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'http_request',
          res.statusCode >= 500 ? 'error' : (res.statusCode >= 400 ? 'warn' : 'info'),
          `${req.method} ${req.path}`,
          req.path,
          res.statusCode,
          latency,
          JSON.stringify({ method: req.method })
        );
      }).catch(() => { });
    });
    next();
  });

  app.use('/api/quiz', require('./routes/quiz'));
  app.use('/api/attempt', require('./routes/attempt'));
  app.use('/api/violations', require('./routes/violations'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/student', require('./routes/student'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/practice', require('./routes/practice'));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  const PORT = process.env.PORT || 4000;
  server.listen(PORT, () => console.log(`MathMind server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to initialise database:', err);
  process.exit(1);
});
