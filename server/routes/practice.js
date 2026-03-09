const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { buildAdaptivePlan, buildDefaultPlan } = require('../services/adaptive');

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function toFloat(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeText(value) {
  return String(value || '').trim().slice(0, 200);
}

function normalizeDifficulty(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'foundation' || raw === 'easy') return 'foundation';
  if (raw === 'advanced' || raw === 'hard') return 'advanced';
  return 'core';
}

/**
 * POST /api/practice/start
 * Start a practice session for a skill, topic, or quiz prep
 * Body: {
 *   student_id,
 *   mode: 'skill' | 'topic' | 'quiz_prep',
 *   skill?: string,
 *   topic?: string,
 *   quiz_code?: string,
 *   count?: number,
 *   difficulty_focus?: 'foundation' | 'core' | 'advanced' | 'adaptive'
 * }
 */
router.post('/start', async (req, res) => {
  const {
    student_id,
    mode = 'skill',
    skill,
    topic,
    quiz_code,
    count = 5,
    difficulty_focus = 'adaptive',
  } = req.body;

  if (!student_id) {
    return res.status(400).json({ error: 'student_id is required' });
  }

  if (mode === 'skill' && !skill) {
    return res.status(400).json({ error: 'skill is required for skill mode' });
  }

  if (mode === 'topic' && !topic) {
    return res.status(400).json({ error: 'topic is required for topic mode' });
  }

  if (mode === 'quiz_prep' && !quiz_code) {
    return res.status(400).json({ error: 'quiz_code is required for quiz_prep mode' });
  }

  try {
    const db = await getDb();

    // Verify student exists
    const student = db.prepare('SELECT id, name FROM students WHERE id = ?').get(student_id);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get quiz info for quiz_prep mode
    let quizInfo = null;
    let targetTopic = topic || skill;
    let targetChapter = null;
    let targetSubtopics = [];

    if (mode === 'quiz_prep') {
      quizInfo = db.prepare('SELECT * FROM quizzes WHERE code = ?').get(quiz_code.toUpperCase());
      if (!quizInfo) {
        return res.status(404).json({ error: 'Quiz not found' });
      }
      targetTopic = quizInfo.topic;
      targetChapter = quizInfo.chapter;
      try {
        targetSubtopics = quizInfo.subtopic ? JSON.parse(quizInfo.subtopic) : [];
      } catch { }
    }

    // Build adaptive plan based on mode
    let plan;
    if (difficulty_focus === 'adaptive') {
      plan = buildAdaptivePlan({
        db,
        studentId: student_id,
        topic: targetTopic,
        chapter: targetChapter,
        subtopics: targetSubtopics.length > 0 ? targetSubtopics : (skill ? [skill] : []),
        questionCount: count,
      });
    } else {
      // Fixed difficulty distribution
      const distributionPct =
        difficulty_focus === 'foundation' ? { foundation: 80, core: 15, advanced: 5 } :
        difficulty_focus === 'core' ? { foundation: 20, core: 60, advanced: 20 } :
        difficulty_focus === 'advanced' ? { foundation: 10, core: 30, advanced: 60 } :
        { foundation: 35, core: 50, advanced: 15 };

      plan = buildDefaultPlan({
        topic: targetTopic,
        chapter: targetChapter,
        subtopics: skill ? [skill] : targetSubtopics,
        questionCount: count,
      });
      plan.difficulty_distribution_pct = distributionPct;
      plan.difficulty_distribution_count = allocateDistribution(count, distributionPct);
    }

    // Create practice session record
    const practiceCode = `PRACTICE-${Date.now().toString(36).toUpperCase()}`;
    
    // Insert a quiz record for tracking
    db.prepare(`
      INSERT INTO quizzes (
        code, topic, chapter, subtopic, activity_type, grade,
        question_types, q_count, extra_instructions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      practiceCode,
      targetTopic || 'Practice',
      targetChapter,
      skill ? JSON.stringify([skill]) : (targetSubtopics.length > 0 ? JSON.stringify(targetSubtopics) : null),
      'practice',
      quizInfo?.grade || '7',
      JSON.stringify(['multiple_choice', 'true_false', 'numeric_response']),
      count,
      JSON.stringify({
        mode,
        original_quiz_code: quiz_code,
        target_skill: skill,
        is_practice: true,
      })
    );

    // Create attempt for this practice session
    const attemptResult = db.prepare(`
      INSERT INTO attempts (quiz_code, student_id, student_name, status)
      VALUES (?, ?, ?, 'practice')
    `).run(practiceCode, student_id, student.name);

    res.json({
      success: true,
      practice_session: {
        attempt_id: attemptResult.lastInsertRowid,
        practice_code: practiceCode,
        mode,
        skill,
        topic: targetTopic,
        quiz_code: quiz_code?.toUpperCase(),
        question_count: count,
        difficulty_focus,
        plan,
      },
    });
  } catch (err) {
    console.error('Error starting practice session:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/practice/submit
 * Submit a single practice question with instant feedback
 * Body: {
 *   attempt_id,
 *   q_index,
 *   student_answer,
 *   correct_answer,
 *   skill_tag,
 *   difficulty,
 *   question_text
 * }
 */
router.post('/submit', async (req, res) => {
  const {
    attempt_id,
    q_index,
    student_answer,
    correct_answer,
    skill_tag,
    difficulty,
    question_text,
    q_type = 'multiple_choice',
    time_taken_s = 0,
  } = req.body;

  if (!attempt_id || q_index === undefined || student_answer === undefined || correct_answer === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const db = await getDb();

    // Verify attempt exists and is a practice session
    const attempt = db.prepare(`
      SELECT a.*, q.activity_type
      FROM attempts a
      LEFT JOIN quizzes q ON q.code = a.quiz_code
      WHERE a.id = ?
    `).get(attempt_id);

    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    if (attempt.activity_type !== 'practice') {
      return res.status(400).json({ error: 'This is not a practice attempt' });
    }

    // Determine if answer is correct
    let isCorrect = false;
    if (typeof student_answer === 'string' && typeof correct_answer === 'string') {
      isCorrect = student_answer.trim().toLowerCase() === correct_answer.trim().toLowerCase();
    } else {
      isCorrect = JSON.stringify(student_answer) === JSON.stringify(correct_answer);
    }

    // Save the answer
    db.prepare(`
      INSERT INTO answers
      (attempt_id, q_index, q_type, skill_tag, difficulty, question_text, student_answer, correct_answer, is_correct, time_taken_s)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attempt_id,
      q_index,
      q_type,
      sanitizeText(skill_tag) || 'Practice',
      normalizeDifficulty(difficulty),
      question_text || '',
      typeof student_answer === 'string' ? student_answer : JSON.stringify(student_answer),
      typeof correct_answer === 'string' ? correct_answer : JSON.stringify(correct_answer),
      isCorrect ? 1 : 0,
      toInt(time_taken_s, 0)
    );

    // Get updated attempt stats
    const answers = db.prepare('SELECT * FROM answers WHERE attempt_id = ?').all(attempt_id);
    const correctCount = answers.filter(a => a.is_correct === 1).length;
    const totalCount = answers.length;
    const percentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

    // Update attempt progress
    db.prepare(`
      UPDATE attempts
      SET score = ?, total = ?, percentage = ?
      WHERE id = ?
    `).run(correctCount, totalCount, percentage, attempt_id);

    res.json({
      success: true,
      is_correct: isCorrect,
      correct_answer,
      student_answer,
      progress: {
        answered: totalCount,
        correct: correctCount,
        percentage,
      },
    });
  } catch (err) {
    console.error('Error submitting practice answer:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/practice/complete
 * Mark practice session as complete and update mastery
 */
router.post('/complete', async (req, res) => {
  const { attempt_id } = req.body;

  if (!attempt_id) {
    return res.status(400).json({ error: 'attempt_id is required' });
  }

  try {
    const db = await getDb();

    const attempt = db.prepare(`
      SELECT a.*, q.activity_type, q.topic, q.chapter
      FROM attempts a
      LEFT JOIN quizzes q ON q.code = a.quiz_code
      WHERE a.id = ?
    `).get(attempt_id);

    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    if (attempt.activity_type !== 'practice') {
      return res.status(400).json({ error: 'This is not a practice attempt' });
    }

    // Mark as completed
    db.prepare(`
      UPDATE attempts
      SET status = 'completed', completed_at = datetime('now')
      WHERE id = ?
    `).run(attempt_id);

    // Award small XP for practice completion
    const xpEarned = attempt.percentage >= 80 ? 15 : (attempt.percentage >= 60 ? 10 : 5);
    
    db.prepare(`
      UPDATE students
      SET xp = xp + ?, total_quizzes = total_quizzes + 1, last_activity_date = date('now')
      WHERE id = ?
    `).run(xpEarned, attempt.student_id);

    // Log gamification event
    db.prepare(`
      INSERT INTO gamification_events (student_id, attempt_id, event_type, points, detail_json)
      VALUES (?, ?, 'practice_complete', ?, ?)
    `).run(
      attempt.student_id,
      attempt_id,
      xpEarned,
      JSON.stringify({ percentage: attempt.percentage, topic: attempt.topic })
    );

    res.json({
      success: true,
      xp_earned: xpEarned,
      final_percentage: attempt.percentage,
    });
  } catch (err) {
    console.error('Error completing practice:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/practice/recommendations
 * Get personalized practice recommendations for a student
 */
router.get('/:student_id/recommendations', async (req, res) => {
  const studentId = toInt(req.params.student_id, 0);

  if (!studentId) {
    return res.status(400).json({ error: 'Invalid student_id' });
  }

  try {
    const db = await getDb();

    // Get student's mastery data
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
      ORDER BY accuracy_ratio ASC, questions_answered DESC
      LIMIT 20
    `).all(studentId);

    // Get upcoming quizzes for this student
    const upcomingQuizzes = db.prepare(`
      SELECT DISTINCT q.code, q.topic, q.chapter, q.release_at, q.close_at
      FROM quizzes q
      WHERE q.activity_type = 'class_activity'
        AND (q.release_at IS NULL OR datetime(q.release_at) <= datetime('now'))
        AND (q.close_at IS NULL OR datetime(q.close_at) > datetime('now'))
      LIMIT 5
    `).all();

    // Build recommendations
    const weakSkills = mastery
      .filter(m => m.accuracy_ratio < 0.6)
      .map(m => ({
        skill: m.topic,
        mastery: Math.round(m.accuracy_ratio * 100),
        questions_answered: m.questions_answered,
        priority: 'high',
        reason: 'Low accuracy - needs reinforcement',
      }));

    const developingSkills = mastery
      .filter(m => m.accuracy_ratio >= 0.6 && m.accuracy_ratio < 0.8)
      .map(m => ({
        skill: m.topic,
        mastery: Math.round(m.accuracy_ratio * 100),
        questions_answered: m.questions_answered,
        priority: 'medium',
        reason: 'Developing - practice to strengthen',
      }));

    // Get prerequisites for weak skills
    const recommendedTopics = [];
    for (const weak of weakSkills.slice(0, 3)) {
      recommendedTopics.push({
        ...weak,
        mode: 'skill',
        suggested_count: 5,
      });
    }

    // Add quiz prep recommendations
    for (const quiz of upcomingQuizzes) {
      const quizMastery = mastery.find(m => 
        m.topic.toLowerCase() === quiz.topic.toLowerCase() ||
        m.topic.toLowerCase() === quiz.chapter?.toLowerCase()
      );
      
      if (!quizMastery || quizMastery.accuracy_ratio < 0.75) {
        recommendedTopics.push({
          skill: quiz.topic,
          topic: quiz.topic,
          chapter: quiz.chapter,
          mastery: quizMastery ? Math.round(quizMastery.accuracy_ratio * 100) : 0,
          priority: quizMastery ? 'medium' : 'high',
          reason: quizMastery 
            ? `Prepare for quiz: ${quiz.code}`
            : `New topic - upcoming quiz ${quiz.code}`,
          mode: 'quiz_prep',
          quiz_code: quiz.code,
          suggested_count: 10,
        });
      }
    }

    res.json({
      student_id: studentId,
      recommendations: recommendedTopics.slice(0, 10),
      weak_skills: weakSkills,
      developing_skills: developingSkills,
      upcoming_quizzes: upcomingQuizzes,
    });
  } catch (err) {
    console.error('Error getting recommendations:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/quiz/:code/practice
 * Generate practice questions matching an upcoming quiz
 */
router.get('/quiz/:code/practice', async (req, res) => {
  const quizCode = String(req.params.code).toUpperCase();

  try {
    const db = await getDb();

    const quiz = db.prepare('SELECT * FROM quizzes WHERE code = ?').get(quizCode);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    let subtopics = [];
    try {
      subtopics = quiz.subtopic ? JSON.parse(quiz.subtopic) : [];
    } catch { }

    const practiceConfig = {
      quiz_code: quizCode,
      topic: quiz.topic,
      chapter: quiz.chapter,
      subtopics,
      grade: quiz.grade,
      question_types: JSON.parse(quiz.question_types || '["multiple_choice"]'),
      suggested_count: quiz.q_count || 10,
      difficulty: quiz.difficulty || 'core',
    };

    res.json({
      success: true,
      practice_config: practiceConfig,
    });
  } catch (err) {
    console.error('Error getting quiz practice config:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper function for difficulty distribution
function allocateDistribution(totalCount, distributionPct) {
  const keys = ['foundation', 'core', 'advanced'];
  const raw = keys.map((k) => ({ key: k, value: (distributionPct[k] || 0) * totalCount / 100 }));
  const base = {};
  let assigned = 0;

  for (const r of raw) {
    base[r.key] = Math.floor(r.value);
    assigned += base[r.key];
  }

  let remainder = Math.max(0, totalCount - assigned);
  raw.sort((a, b) => (b.value - Math.floor(b.value)) - (a.value - Math.floor(a.value)));

  let idx = 0;
  while (remainder > 0 && raw.length > 0) {
    const key = raw[idx % raw.length].key;
    base[key] += 1;
    remainder -= 1;
    idx += 1;
  }

  return base;
}

module.exports = router;
