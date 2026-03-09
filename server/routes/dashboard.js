const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function toFloat(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Get all quizzes with optional filters
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const { activity_type, grade, topic, date_from, date_to } = req.query;
    
    let where = [];
    let params = [];
    
    if (activity_type) {
      where.push('lower(COALESCE(activity_type, \'class_activity\')) = ?');
      params.push(activity_type.toLowerCase());
    }
    if (grade) {
      where.push('grade = ?');
      params.push(grade);
    }
    if (topic) {
      where.push('lower(topic) LIKE ?');
      params.push(`%${topic.toLowerCase()}%`);
    }
    if (date_from) {
      where.push('datetime(created_at) >= datetime(?)');
      params.push(date_from);
    }
    if (date_to) {
      where.push('datetime(created_at) <= datetime(?)');
      params.push(date_to);
    }
    
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    
    const quizzes = db.prepare(`
      SELECT *,
        (SELECT COUNT(*) FROM attempts WHERE quiz_code = code) as attempt_count,
        (SELECT AVG(percentage) FROM attempts WHERE quiz_code = code AND completed_at IS NOT NULL) as avg_score,
        (SELECT COUNT(*) FROM attempts WHERE quiz_code = code AND completed_at IS NOT NULL) * 100.0 / 
          NULLIF((SELECT COUNT(*) FROM attempts WHERE quiz_code = code), 0) as completion_rate
      FROM quizzes
      ${whereClause}
      ORDER BY datetime(created_at) DESC
    `).all(...params);
    
    res.json(quizzes.map(q => ({
      ...q,
      attempt_count: toInt(q.attempt_count, 0),
      avg_score: Math.round(toFloat(q.avg_score, 0)),
      completion_rate: Math.round(toFloat(q.completion_rate, 0)),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const db = await getDb();
  const quiz = db.prepare(`
    SELECT topic, grade, q_count, activity_type
    FROM quizzes
    WHERE code = ?
  `).get(code);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  const students = db.prepare(`
    SELECT a.id as attempt_id, a.student_name, a.status, a.score, a.total, a.percentage,
           a.time_taken_s, a.started_at, a.completed_at, COUNT(v.id) as violations
    FROM attempts a
    LEFT JOIN violations v ON v.attempt_id = a.id
    WHERE a.quiz_code = ?
    GROUP BY a.id
    ORDER BY a.started_at DESC
  `).all(code);
  res.json({ quiz, students });
});

router.get('/:code/results', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const db = await getDb();
  const attempts = db.prepare('SELECT * FROM attempts WHERE quiz_code = ?').all(code);
  const result = attempts.map(a => ({
    ...a,
    answers:    db.prepare('SELECT * FROM answers WHERE attempt_id = ?').all(a.id),
    violations: db.prepare('SELECT * FROM violations WHERE attempt_id = ?').all(a.id),
  }));
  res.json(result);
});

router.get('/:code/export', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const db = await getDb();
  const quiz = db.prepare('SELECT activity_type FROM quizzes WHERE code = ?').get(code);
  const activityType = String(quiz?.activity_type || 'class_activity');
  const students = db.prepare(`
    SELECT a.student_name, a.score, a.total, a.percentage, a.time_taken_s,
           a.status, a.started_at, a.completed_at, COUNT(v.id) as violations
    FROM attempts a
    LEFT JOIN violations v ON v.attempt_id = a.id
    WHERE a.quiz_code = ?
    GROUP BY a.id
    ORDER BY a.started_at DESC
  `).all(code);
  const headers = 'Activity Type,Student Name,Score,Total,Percentage,Time (s),Violations,Status,Started At,Completed At\n';
  const rows = students.map(s =>
    `"${activityType}","${s.student_name}",${s.score??''},${s.total??''},${s.percentage??''},${s.time_taken_s??''},${s.violations},"${s.status}","${s.started_at??''}","${s.completed_at??''}"`
  ).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="mathmind-${code}.csv"`);
  res.send(headers + rows);
});

// Question-level analytics
router.get('/:code/questions', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const db = await getDb();
  
  const questions = db.prepare(`
    SELECT
      ans.q_index,
      ans.q_type,
      ans.skill_tag,
      ans.difficulty,
      ans.question_text,
      COUNT(*) as attempts,
      SUM(CASE WHEN ans.is_correct = 1 THEN 1 ELSE 0 END) as correct,
      ROUND(AVG(CASE WHEN ans.is_correct = 1 THEN 100.0 ELSE 0.0 END), 1) as pct_correct
    FROM answers ans
    INNER JOIN attempts a ON a.id = ans.attempt_id
    WHERE a.quiz_code = ?
    GROUP BY ans.q_index, ans.q_type, ans.skill_tag, ans.difficulty, ans.question_text
    ORDER BY ans.q_index
  `).all(code);
  
  res.json(questions.map(q => ({
    q_index: toInt(q.q_index, 0) + 1,
    q_type: q.q_type,
    skill_tag: q.skill_tag || 'General',
    difficulty: q.difficulty || 'core',
    question_text: q.question_text,
    attempts: toInt(q.attempts, 0),
    correct: toInt(q.correct, 0),
    pct_correct: Math.round(toFloat(q.pct_correct, 0)),
  })));
});

// Skill breakdown for a quiz
router.get('/:code/skills', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const db = await getDb();
  
  const skills = db.prepare(`
    SELECT
      COALESCE(NULLIF(TRIM(ans.skill_tag), ''), 'General') as skill,
      COUNT(*) as questions,
      AVG(CASE WHEN ans.is_correct = 1 THEN 100.0 ELSE 0.0 END) as avg_pct,
      COUNT(DISTINCT a.student_id) as students_attempted,
      SUM(CASE WHEN ans.is_correct = 1 THEN 1 ELSE 0 END) as total_correct
    FROM answers ans
    INNER JOIN attempts a ON a.id = ans.attempt_id
    WHERE a.quiz_code = ?
    GROUP BY COALESCE(NULLIF(TRIM(ans.skill_tag), ''), 'General')
    ORDER BY avg_pct ASC
  `).all(code);
  
  res.json(skills.map(s => ({
    skill: s.skill,
    questions: toInt(s.questions, 0),
    avg_pct: Math.round(toFloat(s.avg_pct, 0)),
    students_attempted: toInt(s.students_attempted, 0),
    total_correct: toInt(s.total_correct, 0),
    students_below_60: 0, // Will be calculated in frontend or additional query
  })));
});

// Student growth tracking - get all attempts for a student across quizzes
router.get('/student/:studentId/growth', async (req, res) => {
  const studentId = toInt(req.params.studentId, 0);
  const db = await getDb();
  
  const attempts = db.prepare(`
    SELECT
      a.quiz_code,
      a.percentage,
      a.completed_at,
      q.topic
    FROM attempts a
    LEFT JOIN quizzes q ON q.code = a.quiz_code
    WHERE a.student_id = ? AND a.completed_at IS NOT NULL
    ORDER BY datetime(a.completed_at) ASC
  `).all(studentId);
  
  res.json(attempts.map(a => ({
    quiz_code: a.quiz_code,
    topic: a.topic || 'Unknown',
    percentage: Math.round(toFloat(a.percentage, 0)),
    completed_at: a.completed_at,
  })));
});

// Class progress over time
router.get('/:code/progress', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const db = await getDb();
  
  const progress = db.prepare(`
    SELECT
      DATE(a.completed_at) as date,
      AVG(a.percentage) as avg_score,
      COUNT(*) as attempts
    FROM attempts a
    WHERE a.quiz_code = ? AND a.completed_at IS NOT NULL
    GROUP BY DATE(a.completed_at)
    ORDER BY date ASC
  `).all(code);
  
  res.json(progress.map(p => ({
    date: p.date,
    avg_score: Math.round(toFloat(p.avg_score, 0)),
    attempts: toInt(p.attempts, 0),
  })));
});

// Live tracking - get all active attempts for a quiz
router.get('/:code/live', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const db = await getDb();
  
  const quiz = db.prepare('SELECT * FROM quizzes WHERE code = ?').get(code);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  
  const attempts = db.prepare(`
    SELECT 
      a.id as attempt_id,
      a.student_id,
      a.student_name,
      a.status,
      a.score,
      a.total,
      a.percentage,
      a.time_taken_s,
      a.current_question,
      a.started_at,
      a.completed_at,
      a.last_activity_at,
      (SELECT COUNT(*) FROM violations WHERE attempt_id = a.id) as violation_count,
      (SELECT GROUP_CONCAT(json_object('left_at', left_at, 'returned_at', returned_at, 'away_seconds', away_seconds)) 
       FROM violations WHERE attempt_id = a.id) as violations_json
    FROM attempts a
    WHERE a.quiz_code = ?
    ORDER BY 
      CASE a.status 
        WHEN 'completed' THEN 1 
        WHEN 'force_submitted' THEN 2 
        ELSE 0 
      END,
      datetime(a.started_at) ASC
  `).all(code);
  
  // Parse violations JSON
  const students = attempts.map(a => ({
    ...a,
    violations: a.violations_json ? JSON.parse(`[${a.violations_json}]`) : [],
    is_active: a.status === 'in_progress' || a.status === 'practice',
    is_completed: a.status === 'completed' || a.status === 'force_submitted',
    progress_percent: quiz.q_count > 0 ? Math.round((a.current_question || 0) / quiz.q_count * 100) : 0,
  }));
  
  // Calculate live stats
  const total = students.length;
  const started = students.filter(s => s.status !== 'in_progress' || s.current_question > 0).length;
  const completed = students.filter(s => s.is_completed).length;
  const active = students.filter(s => s.is_active).length;
  
  const avgProgress = students.length > 0 
    ? Math.round(students.reduce((sum, s) => sum + s.progress_percent, 0) / students.length)
    : 0;
  
  const avgTime = students.filter(s => s.time_taken_s > 0).reduce((sum, s) => sum + s.time_taken_s, 0) / 
    Math.max(1, students.filter(s => s.time_taken_s > 0).length);
  
  const avgQuestion = students.length > 0
    ? (students.reduce((sum, s) => sum + (s.current_question || 0), 0) / students.length).toFixed(1)
    : 0;
  
  // Get alerts
  const alerts = [];
  students.forEach(s => {
    if (s.violation_count >= 3) {
      alerts.push({
        type: 'violation',
        severity: 'critical',
        attempt_id: s.attempt_id,
        student_name: s.student_name,
        message: `${s.student_name} has ${s.violation_count} violations`,
        timestamp: new Date().toISOString(),
      });
    }
    
    if (s.is_active && s.last_activity_at) {
      const minutesSinceActivity = Math.floor((Date.now() - new Date(s.last_activity_at).getTime()) / 60000);
      if (minutesSinceActivity >= 5) {
        alerts.push({
          type: 'inactivity',
          severity: 'warning',
          attempt_id: s.attempt_id,
          student_name: s.student_name,
          message: `${s.student_name} inactive for ${minutesSinceActivity} minutes`,
          minutes: minutesSinceActivity,
          timestamp: new Date().toISOString(),
        });
      }
    }
  });
  
  res.json({
    quiz,
    students,
    stats: {
      total,
      started,
      completed,
      active,
      avg_progress: avgProgress,
      avg_time_s: Math.round(avgTime),
      avg_question: parseFloat(avgQuestion),
    },
    alerts,
  });
});

// Send broadcast message to all students in quiz
router.post('/:code/broadcast', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const { message } = req.body;
  
  if (!message) return res.status(400).json({ error: 'Message is required' });
  
  const io = req.app.get('io');
  io.to(code).emit('teacher_broadcast', {
    message,
    timestamp: new Date().toISOString(),
  });
  
  res.json({ success: true, sent: true });
});

// Send message to specific student
router.post('/:code/students/:attemptId/message', async (req, res) => {
  const { attemptId } = req.params;
  const { message, warning } = req.body;
  
  if (!message && !warning) {
    return res.status(400).json({ error: 'Either message or warning is required' });
  }
  
  const db = await getDb();
  const attempt = db.prepare('SELECT socket_id, student_name FROM attempts WHERE id = ?').get(attemptId);
  
  if (!attempt) {
    return res.status(404).json({ error: 'Student attempt not found' });
  }
  
  if (!attempt.socket_id) {
    // Student not connected via socket - message won't be delivered
    // But we still return success to avoid confusing teachers
    console.log('[Message] Student not connected:', attempt.student_name);
    return res.json({ 
      success: true, 
      sent: false, 
      reason: 'Student not connected' 
    });
  }
  
  const io = req.app.get('io');
  
  if (warning) {
    io.to(attempt.socket_id).emit('teacher_warning', {
      message: '⚠️ Teacher is watching. Stay focused!',
      timestamp: new Date().toISOString(),
    });
    console.log('[Message] Warning sent to:', attempt.student_name);
  } else if (message) {
    io.to(attempt.socket_id).emit('teacher_message', {
      message,
      timestamp: new Date().toISOString(),
    });
    console.log('[Message] Message sent to:', attempt.student_name);
  }
  
  res.json({ success: true, sent: true });
});

module.exports = router;
