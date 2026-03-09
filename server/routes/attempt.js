const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { applyGamificationForAttempt } = require('../services/gamification');

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function toFloat(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDifficulty(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'foundation' || raw === 'easy') return 'foundation';
  if (raw === 'advanced' || raw === 'hard') return 'advanced';
  if (raw === 'core' || raw === 'medium') return 'core';
  return 'core';
}

function parseDateMs(value) {
  if (!value) return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function validateReleaseWindow({ releaseAt, closeAt, nowMs }) {
  const releaseMs = parseDateMs(releaseAt);
  const closeMs = parseDateMs(closeAt);
  if (releaseMs != null && nowMs < releaseMs) {
    return {
      status: 403,
      code: 'not_open_yet',
      message: 'This quiz is not open yet.',
      release_at: releaseAt,
    };
  }
  if (closeMs != null && nowMs > closeMs) {
    return {
      status: 403,
      code: 'closed',
      message: 'This quiz is closed.',
      close_at: closeAt,
    };
  }
  return null;
}

router.post('/start', async (req, res) => {
  const { quiz_code, student_name, student_id } = req.body;
  if (!quiz_code) return res.status(400).json({ error: 'Missing quiz_code' });
  const db = await getDb();
  const quiz = db.prepare(`
    SELECT id, code, class_name, section_name, release_at, close_at
    FROM quizzes
    WHERE code = ?
  `).get(quiz_code.toUpperCase());
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

  const nowMs = Date.now();
  const quizWindowError = validateReleaseWindow({
    releaseAt: quiz.release_at,
    closeAt: quiz.close_at,
    nowMs,
  });
  if (quizWindowError) {
    return res.status(quizWindowError.status).json({
      error: quizWindowError.message,
      code: quizWindowError.code,
      release_at: quizWindowError.release_at || null,
      close_at: quizWindowError.close_at || null,
    });
  }

  const schedule = db.prepare(`
    SELECT *
    FROM assignment_schedules
    WHERE quiz_code = ?
    ORDER BY
      CASE
        WHEN COALESCE(class_name, '') = COALESCE(?, '')
         AND COALESCE(section_name, '') = COALESCE(?, '') THEN 0
        ELSE 1
      END,
      datetime(updated_at) DESC,
      id DESC
    LIMIT 1
  `).get(quiz.code, quiz.class_name || '', quiz.section_name || '');

  if (schedule) {
    const status = String(schedule.status || '').toLowerCase();
    if (status === 'paused') {
      return res.status(423).json({
        error: 'This assignment is currently paused by an administrator.',
        code: 'assignment_paused',
      });
    }
    if (status === 'closed') {
      return res.status(403).json({
        error: 'This assignment is closed.',
        code: 'assignment_closed',
      });
    }

    const scheduleWindowError = validateReleaseWindow({
      releaseAt: schedule.release_at,
      closeAt: schedule.close_at,
      nowMs,
    });
    if (scheduleWindowError) {
      return res.status(scheduleWindowError.status).json({
        error: scheduleWindowError.message,
        code: scheduleWindowError.code,
        release_at: scheduleWindowError.release_at || null,
        close_at: scheduleWindowError.close_at || null,
      });
    }
  }

  let resolvedStudentId = null;
  let resolvedStudentName = String(student_name || '').trim();

  if (student_id) {
    const student = db.prepare('SELECT id, name FROM students WHERE id = ?').get(student_id);
    if (!student) return res.status(404).json({ error: 'Student account not found' });
    resolvedStudentId = student.id;
    resolvedStudentName = student.name;
  }

  if (!resolvedStudentName) return res.status(400).json({ error: 'Missing student_name or valid student_id' });

  const result = db.prepare('INSERT INTO attempts (quiz_code, student_id, student_name, last_activity_at) VALUES (?, ?, ?, datetime(\'now\'))')
    .run(quiz_code.toUpperCase(), resolvedStudentId, resolvedStudentName);

  // Emit event for teacher dashboard (live tracking)
  const io = req.app.get('io');
  io.to(quiz_code.toUpperCase()).emit('student_joined', {
    attempt_id: result.lastInsertRowid,
    student_name: resolvedStudentName,
    student_id: resolvedStudentId,
    started_at: new Date().toISOString(),
    is_active: true,
    is_completed: false,
    current_question: 0,
    progress_percent: 0,
    violation_count: 0,
  });

  res.json({ attempt_id: result.lastInsertRowid });
});

router.patch('/:id/complete', async (req, res) => {
  const { score, total, percentage, time_taken_s, status, answers } = req.body;
  const attemptId = req.params.id;
  const db = await getDb();
  const existing = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
  if (!existing) return res.status(404).json({ error: 'Attempt not found' });

  if (existing.completed_at) {
    let parsedRewards = null;
    try { parsedRewards = existing.rewards_json ? JSON.parse(existing.rewards_json) : null; } catch { }
    return res.json({ success: true, already_completed: true, rewards: parsedRewards });
  }

  const safeScore = toInt(score, 0);
  const safeTotal = Math.max(1, toInt(total, 1));
  const safePct = Math.max(0, Math.min(100, toFloat(percentage, 0)));
  const safeTimeTaken = Math.max(0, toInt(time_taken_s, 0));
  const safeStatus = status || 'completed';

  db.prepare(`
    UPDATE attempts
    SET completed_at=datetime('now'), score=?, total=?, percentage=?, time_taken_s=?, status=?
    WHERE id=?
  `).run(safeScore, safeTotal, safePct, safeTimeTaken, safeStatus, attemptId);

  // Emit event for teacher dashboard (live tracking)
  const io = req.app.get('io');
  io.to(existing.quiz_code.toUpperCase()).emit('student_completed', {
    attempt_id: parseInt(attemptId),
    student_name: existing.student_name,
    score: safeScore,
    total: safeTotal,
    percentage: safePct,
    time_taken: safeTimeTaken,
    timestamp: new Date().toISOString(),
  });

  db.prepare('DELETE FROM answers WHERE attempt_id = ?').run(attemptId);
  const normalizedAnswers = Array.isArray(answers) ? answers.filter(Boolean) : [];
  if (normalizedAnswers.length) {
    const insert = db.prepare(`
      INSERT INTO answers
      (attempt_id,q_index,q_type,skill_tag,difficulty,question_text,student_answer,correct_answer,is_correct,time_taken_s)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    const insertMany = db.transaction((ans) => {
      for (const a of ans)
        insert.run(
          attemptId,
          toInt(a.q_index, 0),
          a.q_type || 'unknown',
          String(a.skill_tag || '').trim(),
          normalizeDifficulty(a.difficulty),
          a.question_text || '',
          typeof a.student_answer === 'string' ? a.student_answer : JSON.stringify(a.student_answer ?? ''),
          typeof a.correct_answer === 'string' ? a.correct_answer : JSON.stringify(a.correct_answer ?? ''),
          a.is_correct === null || typeof a.is_correct === 'undefined' ? null : toInt(a.is_correct, 0),
          toInt(a.time_taken_s, 0)
        );
    });
    insertMany(normalizedAnswers);
  }

  const completedAttempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
  let rewards = null;

  if (completedAttempt?.student_id) {
    rewards = applyGamificationForAttempt({
      db,
      studentId: completedAttempt.student_id,
      attemptId: toInt(attemptId, 0),
      quizCode: completedAttempt.quiz_code,
      percentage: safePct,
      totalQuestions: safeTotal,
      timeTakenSeconds: safeTimeTaken,
    });

    if (rewards) {
      db.prepare(`
        UPDATE attempts
        SET xp_earned = ?, level_after = ?, streak_after = ?, rewards_json = ?
        WHERE id = ?
      `).run(
        toInt(rewards.xp_gained, 0),
        toInt(rewards.level_after, 1),
        toInt(rewards.streak_after, 0),
        JSON.stringify(rewards),
        attemptId
      );
    }
  }

  res.json({ success: true, rewards });
});

router.get('/:id', async (req, res) => {
  const db = await getDb();
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(req.params.id);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  const answers = db.prepare('SELECT * FROM answers WHERE attempt_id = ? ORDER BY q_index').all(req.params.id);
  res.json({ ...attempt, answers });
});

module.exports = router;
