function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function toFloat(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function parseMaybeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((x) => cleanText(x));
  if (!value) return [];
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).map((x) => cleanText(x));
  } catch { }
  return [cleanText(value)];
}

function parseDateSafe(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function recencyWeight(dateText) {
  const d = parseDateSafe(dateText);
  if (!d) return 1;
  const now = Date.now();
  const diffDays = Math.max(0, (now - d.getTime()) / (1000 * 60 * 60 * 24));
  // Keep older data but bias to recent learning.
  return 1 / (1 + (diffDays / 21));
}

function inferSkillTag(row) {
  const explicit = cleanText(row.skill_tag);
  if (explicit) return explicit;

  const subtopics = parseMaybeArray(row.quiz_subtopic);
  if (subtopics.length > 0) return subtopics[0];

  const chapter = cleanText(row.quiz_chapter);
  if (chapter) return chapter;

  const topic = cleanText(row.quiz_topic);
  if (topic) return topic;

  return 'General';
}

function inferDifficultyTier(raw) {
  const d = normalizeText(raw);
  if (d === 'foundation' || d === 'easy') return 'foundation';
  if (d === 'advanced' || d === 'hard') return 'advanced';
  if (d === 'core' || d === 'medium') return 'core';
  return 'core';
}

function difficultyToWeight(tier) {
  if (tier === 'foundation') return 1;
  if (tier === 'advanced') return 3;
  return 2;
}

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

function chooseDistribution(overallMastery) {
  if (overallMastery < 50) return { foundation: 60, core: 35, advanced: 5 };
  if (overallMastery < 65) return { foundation: 45, core: 45, advanced: 10 };
  if (overallMastery < 80) return { foundation: 30, core: 50, advanced: 20 };
  if (overallMastery < 92) return { foundation: 20, core: 45, advanced: 35 };
  return { foundation: 15, core: 35, advanced: 50 };
}

function buildDefaultPlan({ topic, chapter, subtopics, questionCount }) {
  // For new students, start with a balanced approach that can adapt
  const distributionPct = { foundation: 30, core: 50, advanced: 20 };
  return {
    has_history: false,
    mastery_overall: 50, // Default to middle ground
    recent_accuracy: null,
    trend: 'unknown',
    context: {
      topic: cleanText(topic),
      chapter: cleanText(chapter),
      subtopics: parseMaybeArray(subtopics),
    },
    focus_skills: parseMaybeArray(subtopics).slice(0, 3),
    strengths: [],
    skill_breakdown: [],
    difficulty_distribution_pct: distributionPct,
    difficulty_distribution_count: allocateDistribution(questionCount, distributionPct),
    prompt_hints: [
      'Start with foundation to assess baseline, then progress to core and advanced.',
      'Label every question with "skill_tag" and "difficulty".',
      'Difficulty must be one of foundation, core, advanced.',
      'Questions should increase in difficulty as the quiz progresses.',
    ],
  };
}

function rowMatchesContext(row, contextTerms) {
  if (contextTerms.length === 0) return true;
  const values = [
    row.skill_tag,
    row.quiz_topic,
    row.quiz_chapter,
    row.quiz_subtopic,
  ]
    .map((v) => normalizeText(v))
    .filter(Boolean);

  if (values.length === 0) return false;
  for (const term of contextTerms) {
    if (values.some((v) => v.includes(term))) return true;
  }
  return false;
}

function computeTrend(filteredRows) {
  if (filteredRows.length < 10) return 'stable';
  const scored = filteredRows
    .map((r) => ({ correct: toInt(r.is_correct, 0) === 1 ? 1 : 0, completed_at: r.completed_at }))
    .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));

  const recent = scored.slice(0, 10);
  const previous = scored.slice(10, 20);
  if (previous.length === 0) return 'stable';

  const recentAcc = recent.reduce((sum, r) => sum + r.correct, 0) / recent.length;
  const previousAcc = previous.reduce((sum, r) => sum + r.correct, 0) / previous.length;
  const delta = recentAcc - previousAcc;
  if (delta >= 0.1) return 'improving';
  if (delta <= -0.1) return 'declining';
  return 'stable';
}

function buildAdaptivePlan({
  db,
  studentId,
  topic,
  chapter,
  subtopics,
  questionCount,
}) {
  const safeQuestionCount = Math.max(3, toInt(questionCount, 5));
  const contextTerms = [
    cleanText(topic),
    cleanText(chapter),
    ...parseMaybeArray(subtopics),
  ]
    .map((t) => normalizeText(t))
    .filter(Boolean);

  const rawRows = db.prepare(`
    SELECT
      ans.skill_tag,
      ans.difficulty,
      ans.is_correct,
      a.completed_at,
      q.topic as quiz_topic,
      q.chapter as quiz_chapter,
      q.subtopic as quiz_subtopic
    FROM answers ans
    INNER JOIN attempts a ON a.id = ans.attempt_id
    LEFT JOIN quizzes q ON q.code = a.quiz_code
    WHERE a.student_id = ?
      AND a.completed_at IS NOT NULL
    ORDER BY datetime(a.completed_at) DESC
    LIMIT 1500
  `).all(studentId);

  if (!rawRows.length) {
    return buildDefaultPlan({ topic, chapter, subtopics, questionCount: safeQuestionCount });
  }

  let filteredRows = rawRows.filter((row) => rowMatchesContext(row, contextTerms));
  if (!filteredRows.length) filteredRows = rawRows;

  const buckets = new Map();
  let weightedCorrect = 0;
  let weightedTotal = 0;
  const recentRows = filteredRows.slice(0, 40);

  for (const row of filteredRows) {
    const skillTag = inferSkillTag(row);
    const difficultyTier = inferDifficultyTier(row.difficulty);
    const key = normalizeText(skillTag) || 'general';
    const bucket = buckets.get(key) || {
      skill_tag: skillTag,
      total_weight: 0,
      correct_weight: 0,
      questions_answered: 0,
      difficulty_weight_sum: 0,
    };

    const isCorrect = toInt(row.is_correct, 0) === 1 ? 1 : 0;
    const weight = recencyWeight(row.completed_at);
    bucket.total_weight += weight;
    bucket.correct_weight += (isCorrect * weight);
    bucket.questions_answered += 1;
    bucket.difficulty_weight_sum += (difficultyToWeight(difficultyTier) * weight);
    buckets.set(key, bucket);

    weightedTotal += weight;
    weightedCorrect += (isCorrect * weight);
  }

  const skillBreakdown = Array.from(buckets.values()).map((bucket) => {
    const accuracy = bucket.total_weight > 0 ? (bucket.correct_weight / bucket.total_weight) : 0;
    const mastery = Math.round(accuracy * 100);
    const avgDiffWeight = bucket.total_weight > 0 ? (bucket.difficulty_weight_sum / bucket.total_weight) : 2;
    const avgDifficulty = avgDiffWeight < 1.5 ? 'foundation' : (avgDiffWeight < 2.5 ? 'core' : 'advanced');
    return {
      skill_tag: bucket.skill_tag,
      mastery_score: mastery,
      accuracy_pct: mastery,
      questions_answered: bucket.questions_answered,
      avg_difficulty: avgDifficulty,
      recommendation: mastery < 60 ? 'reinforce' : (mastery < 80 ? 'practice' : 'stretch'),
    };
  }).sort((a, b) => a.mastery_score - b.mastery_score || b.questions_answered - a.questions_answered);

  const overallMastery = Math.round((weightedCorrect / Math.max(weightedTotal, 1)) * 100);
  const recentAccuracy = recentRows.length
    ? Math.round((recentRows.reduce((sum, row) => sum + (toInt(row.is_correct, 0) === 1 ? 1 : 0), 0) / recentRows.length) * 100)
    : overallMastery;
  const trend = computeTrend(filteredRows);

  let distributionPct = chooseDistribution(overallMastery);
  if (trend === 'improving') {
    distributionPct = {
      foundation: Math.max(10, distributionPct.foundation - 5),
      core: distributionPct.core,
      advanced: Math.min(60, distributionPct.advanced + 5),
    };
  } else if (trend === 'declining') {
    distributionPct = {
      foundation: Math.min(70, distributionPct.foundation + 8),
      core: distributionPct.core,
      advanced: Math.max(3, distributionPct.advanced - 8),
    };
  }

  const focusSkills = skillBreakdown
    .filter((s) => s.questions_answered >= 2)
    .slice(0, 3)
    .map((s) => s.skill_tag);

  const strengths = [...skillBreakdown]
    .sort((a, b) => b.mastery_score - a.mastery_score || b.questions_answered - a.questions_answered)
    .filter((s) => s.questions_answered >= 2)
    .slice(0, 3)
    .map((s) => s.skill_tag);

  const plan = {
    has_history: true,
    mastery_overall: overallMastery,
    recent_accuracy: recentAccuracy,
    trend,
    context: {
      topic: cleanText(topic),
      chapter: cleanText(chapter),
      subtopics: parseMaybeArray(subtopics),
    },
    focus_skills: focusSkills,
    strengths,
    skill_breakdown: skillBreakdown,
    difficulty_distribution_pct: distributionPct,
    difficulty_distribution_count: allocateDistribution(safeQuestionCount, distributionPct),
    prompt_hints: [
      'Prioritize weaker skills first while preserving curriculum coverage.',
      'Use easier scaffolding for weak skills and stretch problems for strengths.',
      'Label every question with "skill_tag" and "difficulty".',
      'Difficulty must be one of foundation, core, advanced.',
    ],
  };

  return plan;
}

module.exports = {
  buildAdaptivePlan,
  buildDefaultPlan,
};
