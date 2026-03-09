const BADGES = {
  first_quiz: {
    code: 'first_quiz',
    name: 'First Steps',
    description: 'Complete your first quiz.',
    icon: 'seed',
  },
  streak_3: {
    code: 'streak_3',
    name: 'Consistent Learner',
    description: 'Maintain a 3-day study streak.',
    icon: 'flame',
  },
  streak_7: {
    code: 'streak_7',
    name: 'Streak Master',
    description: 'Maintain a 7-day study streak.',
    icon: 'fire',
  },
  perfect_100: {
    code: 'perfect_100',
    name: 'Perfect Run',
    description: 'Score 100% on a quiz.',
    icon: 'crown',
  },
  quiz_10: {
    code: 'quiz_10',
    name: 'Quiz Explorer',
    description: 'Complete 10 quizzes.',
    icon: 'map',
  },
  quiz_25: {
    code: 'quiz_25',
    name: 'Math Marathoner',
    description: 'Complete 25 quizzes.',
    icon: 'trophy',
  },
  high_achiever: {
    code: 'high_achiever',
    name: 'High Achiever',
    description: 'Score 90%+ on 5 quizzes.',
    icon: 'star',
  },
  level_5: {
    code: 'level_5',
    name: 'Level Up',
    description: 'Reach level 5.',
    icon: 'rocket',
  },
  quest_champion: {
    code: 'quest_champion',
    name: 'Quest Champion',
    description: 'Complete every weekly quest.',
    icon: 'medal',
  },
};

const WEEKLY_QUESTS = [
  {
    code: 'weekly_3_quizzes',
    name: 'Weekly Warmup',
    description: 'Complete 3 quizzes this week.',
    reward_xp: 90,
    progress: ({ attempts }) => attempts,
    target: 3,
    isComplete: ({ attempts }) => attempts >= 3,
  },
  {
    code: 'weekly_accuracy_80',
    name: 'Accuracy Builder',
    description: 'Average 80%+ across at least 3 quizzes this week.',
    reward_xp: 120,
    progress: ({ avgPct }) => Math.round(avgPct || 0),
    target: 80,
    isComplete: ({ attempts, avgPct }) => attempts >= 3 && (avgPct || 0) >= 80,
  },
  {
    code: 'weekly_high_score',
    name: 'Ace One',
    description: 'Score at least 90% once this week.',
    reward_xp: 70,
    progress: ({ highScores }) => highScores,
    target: 1,
    isComplete: ({ highScores }) => highScores >= 1,
  },
];

function getActiveQuestDefinitions(db) {
  try {
    const rows = db.prepare(`
      SELECT code, name, description, metric, target_value, reward_xp
      FROM quest_definitions
      WHERE active = 1
      ORDER BY id ASC
    `).all();
    if (!rows || rows.length === 0) return null;
    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      description: row.description,
      metric: row.metric,
      target: Number(row.target_value) || 0,
      reward_xp: Number(row.reward_xp) || 0,
    }));
  } catch {
    return null;
  }
}

function getBadgeDefinitionMap(db) {
  const map = {};
  for (const [code, def] of Object.entries(BADGES)) {
    map[code] = { ...def };
  }
  try {
    const rows = db.prepare(`
      SELECT code, name, description, icon, active
      FROM badge_definitions
    `).all();
    for (const row of rows) {
      map[row.code] = {
        code: row.code,
        name: row.name,
        description: row.description || '',
        icon: row.icon || 'badge',
        active: Number(row.active) === 1,
      };
    }
  } catch { }
  return map;
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

function toFloat(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function isoDateUtc(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return isoDateUtc(d);
}

function startOfIsoWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday=0
  d.setUTCDate(d.getUTCDate() - day);
  return isoDateUtc(d);
}

function levelFromXp(xp) {
  return Math.floor(toFloat(xp, 0) / 250) + 1;
}

function awardBadgeIfEligible(db, studentId, badgeCode) {
  const badgeMap = getBadgeDefinitionMap(db);
  const badge = badgeMap[badgeCode];
  if (!badge) return null;
  if (badge.active === false) return null;
  const existing = db.prepare('SELECT id FROM student_badges WHERE student_id = ? AND badge_code = ?').get(studentId, badgeCode);
  if (existing) return null;
  db.prepare('INSERT INTO student_badges (student_id, badge_code) VALUES (?, ?)').run(studentId, badgeCode);
  return badge;
}

function getWeeklyMetrics(db, studentId, weekStart) {
  const row = db.prepare(`
    SELECT
      COUNT(*) as attempts,
      AVG(percentage) as avg_pct,
      SUM(CASE WHEN percentage >= 90 THEN 1 ELSE 0 END) as high_scores,
      SUM(CASE WHEN percentage >= 100 THEN 1 ELSE 0 END) as perfect_scores
    FROM attempts
    WHERE student_id = ?
      AND completed_at IS NOT NULL
      AND date(completed_at) >= date(?)
  `).get(studentId, weekStart) || {};

  return {
    attempts: toInt(row.attempts, 0),
    avgPct: toFloat(row.avg_pct, 0),
    highScores: toInt(row.high_scores, 0),
    perfectScores: toInt(row.perfect_scores, 0),
  };
}

function computeQuestStates(db, studentId, weekStart) {
  const metrics = getWeeklyMetrics(db, studentId, weekStart);
  const dynamicQuests = getActiveQuestDefinitions(db);
  const quests = dynamicQuests && dynamicQuests.length > 0 ? dynamicQuests : WEEKLY_QUESTS.map((q) => ({
    code: q.code,
    name: q.name,
    description: q.description,
    reward_xp: q.reward_xp,
    metric: q.code === 'weekly_3_quizzes'
      ? 'attempts_weekly'
      : (q.code === 'weekly_accuracy_80' ? 'avg_pct_weekly' : 'high_scores_weekly'),
    target: q.target,
  }));

  return quests.map((quest) => {
    const claimed = db.prepare(`
      SELECT id FROM student_quest_claims
      WHERE student_id = ? AND quest_code = ? AND week_start = ?
    `).get(studentId, quest.code, weekStart);

    let progress = 0;
    let complete = false;
    if (quest.metric === 'attempts_weekly') {
      progress = metrics.attempts;
      complete = metrics.attempts >= Number(quest.target || 0);
    } else if (quest.metric === 'avg_pct_weekly') {
      progress = Math.round(metrics.avgPct || 0);
      const minAttempts = Number(quest.min_attempts || (quest.code === 'weekly_accuracy_80' ? 3 : 1));
      complete = metrics.attempts >= minAttempts && (metrics.avgPct || 0) >= Number(quest.target || 0);
    } else if (quest.metric === 'high_scores_weekly') {
      progress = metrics.highScores;
      complete = metrics.highScores >= Number(quest.target || 0);
    } else if (quest.metric === 'perfect_scores_weekly') {
      progress = metrics.perfectScores;
      complete = metrics.perfectScores >= Number(quest.target || 0);
    } else {
      progress = 0;
      complete = false;
    }

    return {
      code: quest.code,
      name: quest.name,
      description: quest.description,
      reward_xp: quest.reward_xp,
      progress,
      target: Number(quest.target || 0),
      complete,
      claimed: !!claimed,
    };
  });
}

function getStudentBadges(db, studentId) {
  const badgeMap = getBadgeDefinitionMap(db);
  const rows = db.prepare(`
    SELECT badge_code, unlocked_at
    FROM student_badges
    WHERE student_id = ?
    ORDER BY unlocked_at DESC
  `).all(studentId);

  return rows.map((row) => {
    const def = badgeMap[row.badge_code];
    return {
      code: row.badge_code,
      name: def?.name || row.badge_code,
      description: def?.description || '',
      icon: def?.icon || 'badge',
      unlocked_at: row.unlocked_at,
    };
  });
}

function applyGamificationForAttempt({
  db,
  studentId,
  attemptId,
  quizCode,
  percentage,
  totalQuestions,
  timeTakenSeconds,
}) {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) return null;

  const pct = Math.max(0, Math.min(100, toFloat(percentage, 0)));
  const total = Math.max(1, toInt(totalQuestions, 1));
  const timeS = Math.max(0, toInt(timeTakenSeconds, 0));
  const secPerQuestion = total > 0 ? timeS / total : 0;

  const today = isoDateUtc();
  const yesterday = addDays(today, -1);
  const previousStreak = toInt(student.streak_days, 0);
  const previousBestStreak = toInt(student.best_streak_days, 0);
  const totalQuizzesBefore = toInt(student.total_quizzes, 0);

  let streakAfter = previousStreak;
  if (!student.last_activity_date) {
    streakAfter = 1;
  } else if (student.last_activity_date === today) {
    streakAfter = previousStreak > 0 ? previousStreak : 1;
  } else if (student.last_activity_date === yesterday) {
    streakAfter = previousStreak + 1;
  } else {
    streakAfter = 1;
  }
  const bestStreakAfter = Math.max(previousBestStreak, streakAfter);

  const priorRows = db.prepare(`
    SELECT percentage
    FROM attempts
    WHERE student_id = ?
      AND completed_at IS NOT NULL
      AND id <> ?
    ORDER BY completed_at DESC
    LIMIT 5
  `).all(studentId, attemptId);

  const priorAvg = priorRows.length
    ? priorRows.reduce((sum, row) => sum + toFloat(row.percentage, 0), 0) / priorRows.length
    : null;
  const improvement = priorAvg === null ? 0 : pct - priorAvg;

  const sameQuizRecentRow = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM attempts
    WHERE student_id = ?
      AND quiz_code = ?
      AND completed_at IS NOT NULL
      AND datetime(completed_at) >= datetime('now', '-1 day')
      AND id <> ?
  `).get(studentId, quizCode, attemptId) || {};
  const sameQuizRecentCount = toInt(sameQuizRecentRow.cnt, 0);

  let antiFarmingMultiplier = 1;
  if (sameQuizRecentCount >= 2) antiFarmingMultiplier = 0.6;
  else if (sameQuizRecentCount === 1) antiFarmingMultiplier = 0.8;

  const baseXp = 35;
  const accuracyXp = Math.round(pct * 1.1);
  let speedXp = 0;
  if (secPerQuestion > 0 && secPerQuestion <= 45) speedXp = 30;
  else if (secPerQuestion <= 75) speedXp = 20;
  else if (secPerQuestion <= 120) speedXp = 10;

  let improvementXp = 0;
  if (improvement >= 15) improvementXp = 35;
  else if (improvement >= 8) improvementXp = 20;
  else if (improvement >= 4) improvementXp = 10;

  const streakXp = Math.min(30, streakAfter * 3);

  const rawXp = baseXp + accuracyXp + speedXp + improvementXp + streakXp;
  const quizXp = Math.max(15, Math.round(rawXp * antiFarmingMultiplier));

  const weekStart = startOfIsoWeek(today);
  const questStates = computeQuestStates(db, studentId, weekStart);
  const claimedQuests = [];
  let questXp = 0;

  for (const quest of questStates) {
    if (!quest.complete || quest.claimed) continue;
    db.prepare(`
      INSERT INTO student_quest_claims (student_id, quest_code, week_start, points_awarded)
      VALUES (?, ?, ?, ?)
    `).run(studentId, quest.code, weekStart, quest.reward_xp);
    questXp += quest.reward_xp;
    claimedQuests.push({
      code: quest.code,
      name: quest.name,
      reward_xp: quest.reward_xp,
    });
  }

  const totalXpGain = quizXp + questXp;
  const xpBefore = toInt(student.xp, 0);
  const levelBefore = Math.max(1, toInt(student.level, 1));
  const totalQuizzesAfter = totalQuizzesBefore + 1;
  const xpAfter = xpBefore + totalXpGain;
  const levelAfter = levelFromXp(xpAfter);

  db.prepare(`
    UPDATE students
    SET xp = ?, level = ?, streak_days = ?, best_streak_days = ?, total_quizzes = ?, last_activity_date = ?
    WHERE id = ?
  `).run(xpAfter, levelAfter, streakAfter, bestStreakAfter, totalQuizzesAfter, today, studentId);

  const unlockedBadges = [];
  const maybeUnlock = (code, condition) => {
    if (!condition) return;
    const unlocked = awardBadgeIfEligible(db, studentId, code);
    if (unlocked) unlockedBadges.push(unlocked);
  };

  const highScoreCountRow = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM attempts
    WHERE student_id = ?
      AND completed_at IS NOT NULL
      AND percentage >= 90
  `).get(studentId) || {};
  const highScoreCount = toInt(highScoreCountRow.cnt, 0);

  maybeUnlock('first_quiz', totalQuizzesAfter >= 1);
  maybeUnlock('streak_3', streakAfter >= 3);
  maybeUnlock('streak_7', streakAfter >= 7);
  maybeUnlock('perfect_100', pct >= 100);
  maybeUnlock('quiz_10', totalQuizzesAfter >= 10);
  maybeUnlock('quiz_25', totalQuizzesAfter >= 25);
  maybeUnlock('high_achiever', highScoreCount >= 5);
  maybeUnlock('level_5', levelAfter >= 5);

  const postClaimStates = computeQuestStates(db, studentId, weekStart);
  const allWeeklyClaimed = postClaimStates.length > 0 && postClaimStates.every((q) => q.claimed);
  maybeUnlock('quest_champion', allWeeklyClaimed);

  // Check database-defined badges with auto_award enabled
  const autoBadges = db.prepare(`
    SELECT code, name, description, icon, auto_award, criteria_type, target_value
    FROM badge_definitions
    WHERE active = 1 AND auto_award = 1
  `).all();
  
  for (const badge of autoBadges) {
    // Skip if already handled by hardcoded badges
    if (['first_quiz', 'streak_3', 'streak_7', 'perfect_100', 'quiz_10', 'quiz_25', 'high_achiever', 'level_5', 'quest_champion'].includes(badge.code)) {
      continue;
    }
    
    // Check if student already has this badge
    const existing = db.prepare('SELECT 1 FROM student_badges WHERE student_id = ? AND badge_code = ?').get(studentId, badge.code);
    if (existing) continue;
    
    // Auto-award based on stored criteria
    let shouldAward = false;
    const criteriaType = badge.criteria_type || 'quizzes_completed';
    const targetValue = badge.target_value || 1;
    
    switch (criteriaType) {
      case 'quizzes_completed':
        shouldAward = totalQuizzesAfter >= targetValue;
        break;
      case 'score_percent':
        shouldAward = pct >= targetValue;
        break;
      case 'streak_days':
        shouldAward = streakAfter >= targetValue;
        break;
      case 'level_reached':
        shouldAward = levelAfter >= targetValue;
        break;
      case 'correct_answers':
        // Count total correct answers across all attempts
        const correctRow = db.prepare(`
          SELECT COUNT(*) as cnt FROM answers ans
          INNER JOIN attempts a ON a.id = ans.attempt_id
          WHERE a.student_id = ? AND ans.is_correct = 1
        `).get(studentId);
        shouldAward = toInt(correctRow.cnt, 0) >= targetValue;
        break;
      default:
        // Fallback to parsing description for legacy badges
        if (badge.code.includes('quiz_') || badge.description.toLowerCase().includes('quiz')) {
          const match = badge.code.match(/quiz_(\d+)/) || badge.description.match(/(\d+)/);
          shouldAward = match && totalQuizzesAfter >= parseInt(match[1]);
        }
    }
    
    if (shouldAward) {
      const unlocked = awardBadgeIfEligible(db, studentId, badge.code);
      if (unlocked) unlockedBadges.push(unlocked);
    }
  }

  db.prepare(`
    INSERT INTO gamification_events (student_id, attempt_id, event_type, points, detail_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    studentId,
    attemptId,
    'quiz_completion',
    quizXp,
    JSON.stringify({
      percentage: pct,
      total_questions: total,
      time_taken_s: timeS,
      base_xp: baseXp,
      accuracy_xp: accuracyXp,
      speed_xp: speedXp,
      improvement_xp: improvementXp,
      streak_xp: streakXp,
      anti_farming_multiplier: antiFarmingMultiplier,
    })
  );

  for (const quest of claimedQuests) {
    db.prepare(`
      INSERT INTO gamification_events (student_id, attempt_id, event_type, points, detail_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      studentId,
      attemptId,
      'quest_reward',
      quest.reward_xp,
      JSON.stringify({ quest_code: quest.code, quest_name: quest.name, week_start: weekStart })
    );
  }

  return {
    xp_gained: totalXpGain,
    xp_breakdown: {
      quiz_xp: quizXp,
      quest_xp: questXp,
      base_xp: baseXp,
      accuracy_xp: accuracyXp,
      speed_xp: speedXp,
      improvement_xp: improvementXp,
      streak_xp: streakXp,
      anti_farming_multiplier: antiFarmingMultiplier,
    },
    level_before: levelBefore,
    level_after: levelAfter,
    level_up: levelAfter > levelBefore,
    streak_before: previousStreak,
    streak_after: streakAfter,
    best_streak_after: bestStreakAfter,
    unlocked_badges: unlockedBadges,
    completed_quests: claimedQuests,
    week_start: weekStart,
  };
}

module.exports = {
  BADGES,
  WEEKLY_QUESTS,
  levelFromXp,
  startOfIsoWeek,
  getWeeklyMetrics,
  computeQuestStates,
  getStudentBadges,
  applyGamificationForAttempt,
};
