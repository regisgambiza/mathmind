const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const {
  computeQuestStates,
  getStudentBadges,
  startOfIsoWeek,
} = require('../services/gamification');
const { buildAdaptivePlan, buildDefaultPlan } = require('../services/adaptive');

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function toFloat(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeName(name = '') {
  return String(name).trim().replace(/\s+/g, ' ').slice(0, 40);
}

function sanitizePin(pin = '') {
  return String(pin).trim().slice(0, 12);
}

function safeParseJSON(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeActivityType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'topic_quiz' || raw === 'topic quiz') return 'topic_quiz';
  return 'class_activity';
}

function obfuscateName(name) {
  const str = String(name || '').trim();
  if (!str) return 'Student';
  if (str.length <= 2) return `${str[0]}*`;
  return `${str[0]}${'*'.repeat(Math.max(1, str.length - 2))}${str[str.length - 1]}`;
}

function parseSubtopicsInput(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  const raw = value.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
  } catch { }
  return raw.split(',').map((x) => x.trim()).filter(Boolean);
}

async function getStudentById(db, id) {
  return db.prepare(`
    SELECT id, name, xp, level, streak_days, best_streak_days, total_quizzes, leaderboard_opt_in, created_at, last_login_at
    FROM students
    WHERE id = ?
  `).get(id);
}

function buildWeeklyTrend(history, weeks = 8) {
  const now = new Date();
  const buckets = new Map();
  const result = [];

  for (let i = weeks - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - (i * 7));
    const key = startOfIsoWeek(d.toISOString().slice(0, 10));
    buckets.set(key, { week_start: key, attempts: 0, avg_score: 0, _sum: 0 });
  }

  for (const row of history) {
    if (!row.completed_at) continue;
    const day = String(row.completed_at).slice(0, 10);
    const key = startOfIsoWeek(day);
    if (!buckets.has(key)) continue;
    const bucket = buckets.get(key);
    bucket.attempts += 1;
    bucket._sum += toFloat(row.percentage, 0);
  }

  for (const entry of buckets.values()) {
    result.push({
      week_start: entry.week_start,
      attempts: entry.attempts,
      avg_score: entry.attempts > 0 ? Math.round(entry._sum / entry.attempts) : 0,
    });
  }

  return result;
}

router.post('/register', async (req, res) => {
  const name = sanitizeName(req.body?.name);
  const pin = sanitizePin(req.body?.pin);

  if (!name || name.length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  }
  if (!pin || pin.length < 4) {
    return res.status(400).json({ error: 'PIN must be at least 4 characters.' });
  }

  try {
    const db = await getDb();
    const existing = db.prepare('SELECT id FROM students WHERE lower(name) = lower(?)').get(name);
    if (existing) {
      return res.status(409).json({ error: 'Student name is already taken. Please sign in.' });
    }

    const insert = db.prepare('INSERT INTO students (name, pin, last_login_at) VALUES (?, ?, datetime(\'now\'))').run(name, pin);
    const student = await getStudentById(db, insert.lastInsertRowid);
    return res.json({ success: true, student });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  const name = sanitizeName(req.body?.name);
  const pin = sanitizePin(req.body?.pin);
  if (!name || !pin) return res.status(400).json({ error: 'Name and PIN are required.' });

  try {
    const db = await getDb();
    const student = db.prepare('SELECT * FROM students WHERE lower(name) = lower(?) AND pin = ?').get(name, pin);
    if (!student) return res.status(401).json({ error: 'Invalid name or PIN.' });

    db.prepare('UPDATE students SET last_login_at = datetime(\'now\') WHERE id = ?').run(student.id);
    const profile = await getStudentById(db, student.id);
    return res.json({ success: true, student: profile });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const db = await getDb();
    const limit = Math.max(1, Math.min(100, toInt(req.query.limit, 10)));
    const studentId = req.query.student_id ? toInt(req.query.student_id, 0) : null;
    const quizCode = req.query.quiz_code ? String(req.query.quiz_code).toUpperCase() : '';

    const controlsRow = db.prepare('SELECT value_json FROM admin_settings WHERE setting_key = ?').get('leaderboard_controls');
    const controls = safeParseJSON(controlsRow?.value_json, { enabled: true, anonymize: false, class_only: false }) || {};
    if (controls.enabled === false) {
      return res.json({
        leaderboard: [],
        me: null,
        total_ranked: 0,
        disabled: true,
      });
    }

    let rows = [];
    if (controls.class_only) {
      if (!quizCode) {
        return res.json({
          leaderboard: [],
          me: null,
          total_ranked: 0,
          class_only: true,
          requires_quiz_code: true,
        });
      }
      rows = db.prepare(`
        SELECT s.id, s.name, s.xp, s.level, s.total_quizzes, s.streak_days
        FROM students s
        WHERE s.leaderboard_opt_in = 1
          AND EXISTS (
            SELECT 1 FROM attempts a
            WHERE a.student_id = s.id AND a.quiz_code = ?
          )
        ORDER BY s.xp DESC, s.total_quizzes DESC, s.name ASC
      `).all(quizCode);
    } else {
      rows = db.prepare(`
        SELECT id, name, xp, level, total_quizzes, streak_days
        FROM students
        WHERE leaderboard_opt_in = 1
        ORDER BY xp DESC, total_quizzes DESC, name ASC
      `).all();
    }

    const ranked = rows.map((row, index) => ({
      rank: index + 1,
      student_id: row.id,
      name: controls.anonymize ? obfuscateName(row.name) : row.name,
      xp: toInt(row.xp, 0),
      level: toInt(row.level, 1),
      total_quizzes: toInt(row.total_quizzes, 0),
      streak_days: toInt(row.streak_days, 0),
    }));

    const me = studentId ? ranked.find((r) => r.student_id === studentId) || null : null;
    return res.json({
      leaderboard: ranked.slice(0, limit),
      me,
      total_ranked: ranked.length,
      class_only: !!controls.class_only,
      anonymized: !!controls.anonymize,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id/adaptive-plan', async (req, res) => {
  try {
    const db = await getDb();
    const studentId = toInt(req.params.id, 0);
    const student = await getStudentById(db, studentId);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const topic = req.query.topic || '';
    const chapter = req.query.chapter || '';
    const subtopics = parseSubtopicsInput(req.query.subtopics);
    const questionCount = toInt(req.query.count, 5);
    const quizCode = req.query.quiz_code ? String(req.query.quiz_code).toUpperCase() : null;

    const flagRow = db.prepare(`
      SELECT enabled, rollout_pct, config_json
      FROM feature_flags
      WHERE flag_key = 'adaptive_engine'
    `).get();
    const flagEnabled = typeof flagRow?.enabled === 'undefined' ? true : toInt(flagRow.enabled, 1) === 1;
    const rolloutPct = Math.max(0, Math.min(100, toInt(flagRow?.rollout_pct, 100)));
    const inRollout = (studentId % 100) < rolloutPct;

    let plan = null;
    let fallbackUsed = false;

    if (flagEnabled && inRollout) {
      plan = buildAdaptivePlan({
        db,
        studentId,
        topic,
        chapter,
        subtopics,
        questionCount,
      });
      fallbackUsed = !plan?.has_history;
    } else {
      plan = buildDefaultPlan({
        topic,
        chapter,
        subtopics,
        questionCount,
      });
      plan.adaptive_disabled = true;
      plan.adaptive_disabled_reason = !flagEnabled
        ? 'feature_flag_disabled'
        : `rollout_${rolloutPct}_percent`;
      fallbackUsed = true;
    }

    db.prepare(`
      INSERT INTO adaptive_plan_events (
        student_id, quiz_code, topic, chapter, subtopics_json,
        has_history, fallback_used, mastery_overall, recent_accuracy, trend, plan_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      studentId,
      quizCode,
      topic,
      chapter,
      JSON.stringify(subtopics),
      plan?.has_history ? 1 : 0,
      fallbackUsed ? 1 : 0,
      typeof plan?.mastery_overall === 'number' ? plan.mastery_overall : null,
      typeof plan?.recent_accuracy === 'number' ? plan.recent_accuracy : null,
      plan?.trend || null,
      JSON.stringify(plan)
    );

    return res.json({
      student_id: studentId,
      generated_at: new Date().toISOString(),
      adaptive_enabled: flagEnabled,
      rollout_pct: rolloutPct,
      rollout_included: inRollout,
      plan,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id/profile', async (req, res) => {
  try {
    const db = await getDb();
    const studentId = toInt(req.params.id, 0);
    const student = await getStudentById(db, studentId);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const stats = db.prepare(`
      SELECT
        COUNT(*) as completed_quizzes,
        AVG(percentage) as avg_score,
        SUM(score) as total_correct,
        SUM(total) as total_questions
      FROM attempts
      WHERE student_id = ? AND completed_at IS NOT NULL
    `).get(studentId) || {};

    const badges = getStudentBadges(db, studentId);
    const weekStart = startOfIsoWeek(new Date().toISOString().slice(0, 10));
    const quests = computeQuestStates(db, studentId, weekStart);

    return res.json({
      ...student,
      completed_quizzes: toInt(stats.completed_quizzes, 0),
      avg_score: Math.round(toFloat(stats.avg_score, 0)),
      total_correct: toInt(stats.total_correct, 0),
      total_questions: toInt(stats.total_questions, 0),
      badges,
      weekly_quests: quests,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id/progress', async (req, res) => {
  try {
    const db = await getDb();
    const studentId = toInt(req.params.id, 0);
    const student = await getStudentById(db, studentId);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const summary = db.prepare(`
      SELECT
        COUNT(*) as completed_quizzes,
        AVG(a.percentage) as avg_score,
        AVG(a.time_taken_s) as avg_time_s,
        SUM(a.score) as total_correct,
        SUM(a.total) as total_questions,
        SUM(CASE WHEN lower(COALESCE(q.activity_type, 'class_activity')) = 'class_activity' THEN 1 ELSE 0 END) as class_activity_count,
        AVG(CASE WHEN lower(COALESCE(q.activity_type, 'class_activity')) = 'class_activity' THEN a.percentage END) as class_activity_avg,
        SUM(CASE WHEN lower(COALESCE(q.activity_type, 'class_activity')) = 'topic_quiz' THEN 1 ELSE 0 END) as topic_quiz_count,
        AVG(CASE WHEN lower(COALESCE(q.activity_type, 'class_activity')) = 'topic_quiz' THEN a.percentage END) as topic_quiz_avg
      FROM attempts a
      LEFT JOIN quizzes q ON q.code = a.quiz_code
      WHERE a.student_id = ? AND a.completed_at IS NOT NULL
    `).get(studentId) || {};

    const history = db.prepare(`
      SELECT
        a.id as attempt_id,
        a.quiz_code,
        q.topic,
        q.chapter,
        q.grade,
        q.activity_type,
        a.score,
        a.total,
        a.percentage,
        a.time_taken_s,
        a.status,
        a.completed_at,
        a.xp_earned
      FROM attempts a
      LEFT JOIN quizzes q ON q.code = a.quiz_code
      WHERE a.student_id = ? AND a.completed_at IS NOT NULL
      ORDER BY datetime(a.completed_at) DESC
    `).all(studentId);

    const activityHistory = history.map((row) => ({
      ...row,
      activity_type: normalizeActivityType(row.activity_type),
    }));
    const recentHistory = activityHistory.slice(0, 20);
    const weeklyTrend = buildWeeklyTrend(history, 8);

    const mastery = db.prepare(`
      SELECT
        COALESCE(NULLIF(TRIM(ans.skill_tag), ''), COALESCE(q.chapter, q.topic, 'General')) as topic,
        COUNT(*) as questions_answered,
        AVG(CASE WHEN ans.is_correct = 1 THEN 1.0 ELSE 0.0 END) as accuracy_ratio,
        AVG(
          CASE lower(COALESCE(ans.difficulty, 'core'))
            WHEN 'foundation' THEN 1
            WHEN 'advanced' THEN 3
            ELSE 2
          END
        ) as avg_difficulty_weight
      FROM answers ans
      INNER JOIN attempts a ON a.id = ans.attempt_id
      LEFT JOIN quizzes q ON q.code = a.quiz_code
      WHERE a.student_id = ? AND a.completed_at IS NOT NULL
      GROUP BY COALESCE(NULLIF(TRIM(ans.skill_tag), ''), COALESCE(q.chapter, q.topic, 'General'))
      HAVING COUNT(*) >= 1
      ORDER BY accuracy_ratio DESC, questions_answered DESC
      LIMIT 30
    `).all(studentId).map((row) => {
      const avgPct = Math.round(toFloat(row.accuracy_ratio, 0) * 100);
      const avgWeight = toFloat(row.avg_difficulty_weight, 2);
      const nextTargetDifficulty = avgPct >= 85
        ? 'advanced'
        : (avgPct >= 60 ? 'core' : 'foundation');
      const currentBand = avgWeight < 1.5 ? 'foundation' : (avgWeight < 2.5 ? 'core' : 'advanced');
      return {
        topic: row.topic,
        attempts: toInt(row.questions_answered, 0),
        avg_pct: avgPct,
        status: avgPct >= 80 ? 'strong' : (avgPct >= 60 ? 'developing' : 'needs_work'),
        current_band: currentBand,
        next_target_difficulty: nextTargetDifficulty,
      };
    });

    const mistakes = db.prepare(`
      SELECT
        ans.id,
        ans.q_type,
        ans.question_text,
        ans.student_answer,
        ans.correct_answer,
        a.quiz_code,
        q.topic,
        a.completed_at
      FROM answers ans
      INNER JOIN attempts a ON a.id = ans.attempt_id
      LEFT JOIN quizzes q ON q.code = a.quiz_code
      WHERE a.student_id = ?
        AND a.completed_at IS NOT NULL
        AND (ans.is_correct = 0 OR ans.is_correct IS NULL)
      ORDER BY datetime(a.completed_at) DESC
      LIMIT 40
    `).all(studentId);

    const badges = getStudentBadges(db, studentId);
    const weekStart = startOfIsoWeek(new Date().toISOString().slice(0, 10));
    const quests = computeQuestStates(db, studentId, weekStart);

    const leaderboardRows = db.prepare(`
      SELECT id, name, xp, level, total_quizzes, streak_days
      FROM students
      WHERE leaderboard_opt_in = 1
      ORDER BY xp DESC, total_quizzes DESC, name ASC
    `).all();
    const ranked = leaderboardRows.map((row, i) => ({
      rank: i + 1,
      student_id: row.id,
      name: row.name,
      xp: toInt(row.xp, 0),
      level: toInt(row.level, 1),
      total_quizzes: toInt(row.total_quizzes, 0),
      streak_days: toInt(row.streak_days, 0),
    }));
    const myRank = ranked.find((r) => r.student_id === studentId) || null;

    const events = db.prepare(`
      SELECT id, event_type, points, detail_json, created_at
      FROM gamification_events
      WHERE student_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT 30
    `).all(studentId).map((evt) => ({
      ...evt,
      detail: (() => {
        try { return evt.detail_json ? JSON.parse(evt.detail_json) : null; } catch { return null; }
      })(),
    }));

    const classActivityCount = toInt(summary.class_activity_count, 0);
    const classActivityAvg = Math.round(toFloat(summary.class_activity_avg, 0));
    const topicQuizCount = toInt(summary.topic_quiz_count, 0);
    const topicQuizAvg = Math.round(toFloat(summary.topic_quiz_avg, 0));
    const weightedMastery = (() => {
      if (classActivityCount > 0 && topicQuizCount > 0) {
        return Math.round((classActivityAvg * 0.35) + (topicQuizAvg * 0.65));
      }
      if (topicQuizCount > 0) return topicQuizAvg;
      if (classActivityCount > 0) return classActivityAvg;
      return Math.round(toFloat(summary.avg_score, 0));
    })();

    return res.json({
      student,
      summary: {
        completed_quizzes: toInt(summary.completed_quizzes, 0),
        avg_score: Math.round(toFloat(summary.avg_score, 0)),
        avg_time_s: Math.round(toFloat(summary.avg_time_s, 0)),
        total_correct: toInt(summary.total_correct, 0),
        total_questions: toInt(summary.total_questions, 0),
        class_activity_count: classActivityCount,
        class_activity_avg: classActivityAvg,
        topic_quiz_count: topicQuizCount,
        topic_quiz_avg: topicQuizAvg,
        weighted_mastery: weightedMastery,
      },
      activity_history: activityHistory,
      recent_history: recentHistory,
      weekly_trend: weeklyTrend,
      mastery,
      mistakes,
      badges,
      quests,
      leaderboard: {
        enabled: toInt(student.leaderboard_opt_in, 1) === 1,
        top: ranked.slice(0, 10),
        me: myRank,
      },
      events,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/settings', async (req, res) => {
  try {
    const db = await getDb();
    const studentId = toInt(req.params.id, 0);
    const student = await getStudentById(db, studentId);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    if (typeof req.body?.leaderboard_opt_in !== 'undefined') {
      const optIn = req.body.leaderboard_opt_in ? 1 : 0;
      db.prepare('UPDATE students SET leaderboard_opt_in = ? WHERE id = ?').run(optIn, studentId);
    }

    const updated = await getStudentById(db, studentId);
    return res.json({ success: true, student: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
