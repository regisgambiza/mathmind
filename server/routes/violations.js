const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

router.post('/', async (req, res) => {
  const { attempt_id, quiz_code, student_name, violation_num, left_at, returned_at, away_seconds } = req.body;
  const db = await getDb();
  db.prepare(`INSERT INTO violations (attempt_id,quiz_code,student_name,violation_num,left_at,returned_at,away_seconds) VALUES (?,?,?,?,?,?,?)`)
    .run(attempt_id, quiz_code, student_name, violation_num, left_at, returned_at || null, away_seconds || null);

  // Emit event for teacher dashboard
  req.app.get('io').to(quiz_code.toUpperCase()).emit('student_violation', {
    attempt_id,
    student_name,
    violation_num
  });

  res.json({ success: true });
});

router.get('/:attempt_id', async (req, res) => {
  const db = await getDb();
  const violations = db.prepare('SELECT * FROM violations WHERE attempt_id = ? ORDER BY violation_num').all(req.params.attempt_id);
  res.json(violations);
});

module.exports = router;
