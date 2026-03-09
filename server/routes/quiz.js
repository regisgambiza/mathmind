const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

function normalizeActivityType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'topic_quiz' || raw === 'topic quiz') return 'topic_quiz';
  return 'class_activity';
}

function normalizeDifficulty(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'foundation' || raw === 'easy') return 'foundation';
  if (raw === 'advanced' || raw === 'hard') return 'advanced';
  return 'core';
}

router.post('/', async (req, res) => {
  const {
    code,
    topic,
    chapter,
    subtopic,
    activity_type,
    grade,
    difficulty,
    question_types,
    type_weights,
    q_count,
    time_limit_mins,
    release_at,
    close_at,
    extra_instructions,
  } = req.body;
  if (!code || !topic || !grade || !question_types || !q_count)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    const db = await getDb();
    db.prepare(`
      INSERT INTO quizzes (
        code, topic, chapter, subtopic, activity_type, grade,
        difficulty, question_types, type_weights, q_count, time_limit_mins, release_at, close_at,
        extra_instructions
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      code,
      topic,
      chapter || null,
      subtopic || null,
      normalizeActivityType(activity_type),
      grade,
      normalizeDifficulty(difficulty),
      JSON.stringify(question_types),
      type_weights ? JSON.stringify(type_weights) : null,
      q_count,
      time_limit_mins || 0,
      release_at || null,
      close_at || null,
      extra_instructions || null
    );
    res.json({ success: true, code });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Quiz code already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  const db = await getDb();
  try {
    const totalQuizzes = db.prepare('SELECT COUNT(*) as count FROM quizzes').get().count;
    const totalAttempts = db.prepare('SELECT COUNT(*) as count FROM attempts').get().count;
    const avgScore = db.prepare('SELECT AVG(percentage) as avg FROM attempts WHERE status = "completed"').get().avg || 0;
    const activeToday = db.prepare('SELECT COUNT(*) as count FROM quizzes WHERE date(created_at) = date("now")').get().count;
    const classActivities = db.prepare(`
      SELECT COUNT(*) as count
      FROM quizzes
      WHERE lower(COALESCE(activity_type, 'class_activity')) = 'class_activity'
    `).get().count;
    const topicQuizzes = db.prepare(`
      SELECT COUNT(*) as count
      FROM quizzes
      WHERE lower(COALESCE(activity_type, 'class_activity')) = 'topic_quiz'
    `).get().count;

    res.json({
      totalQuizzes,
      classActivities,
      topicQuizzes,
      totalAttempts,
      avgScore: Math.round(avgScore),
      activeToday
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:code', async (req, res) => {
  const db = await getDb();
  const quiz = db.prepare('SELECT * FROM quizzes WHERE code = ?').get(req.params.code.toUpperCase());
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  quiz.question_types = JSON.parse(quiz.question_types);
  try { quiz.subtopic = JSON.parse(quiz.subtopic); } catch { }
  res.json(quiz);
});

router.get('/', async (req, res) => {
  const db = await getDb();
  const quizzes = db.prepare('SELECT * FROM quizzes ORDER BY created_at DESC').all();
  quizzes.forEach(q => {
    q.question_types = JSON.parse(q.question_types);
    try { q.subtopic = JSON.parse(q.subtopic); } catch { }
  });
  res.json(quizzes);
});

router.patch('/:code', async (req, res) => {
  const {
    topic,
    chapter,
    subtopic,
    activity_type,
    class_name,
    section_name,
    grade,
    question_types,
    q_count,
    time_limit_mins,
    release_at,
    close_at,
    extra_instructions,
  } = req.body;
  const db = await getDb();
  try {
    db.prepare(`UPDATE quizzes SET 
      topic = COALESCE(?, topic),
      chapter = COALESCE(?, chapter),
      subtopic = COALESCE(?, subtopic),
      activity_type = COALESCE(?, activity_type),
      class_name = COALESCE(?, class_name),
      section_name = COALESCE(?, section_name),
      grade = COALESCE(?, grade),
      question_types = COALESCE(?, question_types),
      q_count = COALESCE(?, q_count),
      time_limit_mins = COALESCE(?, time_limit_mins),
      release_at = COALESCE(?, release_at),
      close_at = COALESCE(?, close_at),
      extra_instructions = COALESCE(?, extra_instructions)
      WHERE code = ?`)
      .run(
        topic,
        chapter,
        subtopic,
        typeof activity_type === 'undefined' ? null : normalizeActivityType(activity_type),
        class_name,
        section_name,
        grade,
        question_types ? JSON.stringify(question_types) : null,
        q_count,
        time_limit_mins,
        release_at,
        close_at,
        extra_instructions,
        req.params.code.toUpperCase()
      );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:code', async (req, res) => {
  const db = await getDb();
  try {
    const code = req.params.code.toUpperCase();
    const attempts = db.prepare('SELECT id FROM attempts WHERE quiz_code = ?').all(code);
    for (const a of attempts) {
      db.prepare('DELETE FROM answers WHERE attempt_id = ?').run(a.id);
      db.prepare('DELETE FROM violations WHERE attempt_id = ?').run(a.id);
      db.prepare('DELETE FROM gamification_events WHERE attempt_id = ?').run(a.id);
    }
    db.prepare('DELETE FROM attempts WHERE quiz_code = ?').run(code);
    db.prepare('DELETE FROM quizzes WHERE code = ?').run(code);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
