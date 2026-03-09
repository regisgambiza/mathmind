import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRegis } from '../context/RegisContext';
import { useQuiz } from '../context/QuizContext';
import { useStudent } from '../context/StudentContext';
import api from '../hooks/useApi';

const DEMO_QUESTIONS = [
  {
    type: 'multiple_choice',
    skill_tag: 'Fraction Multiplication',
    difficulty: 'foundation',
    question: 'Calculate: 3/4 x 2/5',
    options: ['A. 6/20', 'B. 3/10', 'C. 5/9', 'D. 6/9'],
    answer: 'B',
    explanation: 'Multiply numerators and denominators, then simplify.',
  },
  {
    type: 'true_false',
    skill_tag: 'Fraction Multiplication',
    difficulty: 'core',
    question: 'Multiplying two proper fractions always gives a result smaller than both fractions.',
    answer: 'True',
    explanation: 'Multiplying values less than 1 gives a smaller product.',
  },
  {
    type: 'matching',
    skill_tag: 'Simplifying Fractions',
    difficulty: 'core',
    question: 'Match each multiplication with its simplified result:',
    pairs: [
      { left: '1/2 x 1/3', right: '1/6' },
      { left: '2/3 x 3/4', right: '1/2' },
      { left: '4/5 x 5/8', right: '1/2' },
    ],
    explanation: 'Multiply numerators and denominators, then simplify.',
  },
  {
    type: 'open_ended',
    skill_tag: 'Word Problems with Fractions',
    difficulty: 'advanced',
    question: 'A recipe needs 3/4 cup sugar. If making 2/3 of the recipe, how much sugar is needed?',
    sample_answer: '3/4 x 2/3 = 6/12 = 1/2 cup',
    keywords: ['3/4', '2/3', '1/2'],
  },
  {
    type: 'multiple_choice',
    skill_tag: 'Fraction Division',
    difficulty: 'advanced',
    question: 'What is 5/6 divided by 2/3?',
    options: ['A. 10/18', 'B. 5/4', 'C. 6/5', 'D. 3/4'],
    answer: 'B',
    explanation: 'Divide by multiplying by the reciprocal.',
  },
];

function normalizeDifficulty(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'foundation' || raw === 'easy') return 'foundation';
  if (raw === 'advanced' || raw === 'hard') return 'advanced';
  if (raw === 'core' || raw === 'medium') return 'core';
  return 'core';
}

const SUPPORTED_TYPES = [
  'multiple_choice',
  'multi_select',
  'true_false',
  'matching',
  'numeric_response',
  'ordering',
  'fill_blank',
  'error_analysis',
  'open_ended',
];

const TYPE_ALIASES = {
  multiple_choice: ['mcq', 'multiple choice', 'multiplechoice'],
  multi_select: ['multi select', 'multiple_select', 'select_all', 'select_all_that_apply'],
  true_false: ['true false', 'true/false', 'boolean', 'tf'],
  matching: ['match', 'match_pairs', 'pairing'],
  numeric_response: ['numeric', 'number_response', 'short_numeric', 'numeric answer'],
  ordering: ['sequence', 'arrange', 'arrangement', 'order'],
  fill_blank: ['fill in the blank', 'fill_in_blank', 'fill in blank', 'cloze'],
  error_analysis: ['error analysis', 'find_error', 'diagnose_error'],
  open_ended: ['open ended', 'short_answer', 'free_response'],
};

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripOptionPrefix(value) {
  return String(value || '').replace(/^[A-Z]\.\s*/, '').trim();
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  if (!value) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item || '').trim())
          .filter(Boolean);
      }
    } catch { }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return [];
}

function parseNumericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value || '').trim().replace(/,/g, '');
  if (!raw) return null;

  const fractionMatch = raw.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return numerator / denominator;
    }
  }

  const direct = Number(raw);
  if (Number.isFinite(direct)) return direct;

  const embedded = raw.match(/-?\d+(?:\.\d+)?/);
  if (!embedded) return null;
  const parsed = Number(embedded[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toUniqueNumbers(values) {
  const seen = new Set();
  const out = [];
  for (const n of values) {
    if (!Number.isFinite(n)) continue;
    const key = Number(n).toFixed(8);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  }
  return out;
}

function normalizeQuestionType(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!raw) return null;
  if (SUPPORTED_TYPES.includes(raw)) return raw;
  const entry = Object.entries(TYPE_ALIASES).find(([, aliases]) => aliases.includes(raw.replace(/_/g, ' ')) || aliases.includes(raw));
  return entry ? entry[0] : null;
}

function normalizeRequestedTypes(value) {
  const types = toStringArray(value)
    .map((item) => normalizeQuestionType(item))
    .filter(Boolean);
  return [...new Set(types)];
}

function normalizeOptions(options) {
  return toStringArray(options)
    .map((opt) => stripOptionPrefix(opt))
    .filter(Boolean)
    .map((opt, idx) => `${LETTERS[idx]}. ${opt}`);
}

function normalizeChoiceToken(token, options) {
  if (typeof token === 'number' && token >= 0 && token < options.length) {
    return LETTERS[token];
  }

  const raw = String(token || '').trim();
  if (!raw) return '';

  if (/^[A-Za-z]$/.test(raw)) {
    const upper = raw.toUpperCase();
    return options[LETTERS.indexOf(upper)] ? upper : '';
  }

  if (/^\d+$/.test(raw)) {
    const idx = Number(raw);
    if (idx >= 0 && idx < options.length) return LETTERS[idx];
    if (idx >= 1 && idx <= options.length) return LETTERS[idx - 1];
  }

  const cleaned = stripOptionPrefix(raw).toLowerCase();
  const idx = options.findIndex((opt) => stripOptionPrefix(opt).toLowerCase() === cleaned);
  return idx >= 0 ? LETTERS[idx] : '';
}

function normalizeBooleanAnswer(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['true', 't', 'yes', '1'].includes(raw)) return 'True';
  if (['false', 'f', 'no', '0'].includes(raw)) return 'False';
  return '';
}

function resolveOrderToken(token, items) {
  if (typeof token === 'number' && token >= 0 && token < items.length) return items[token];
  const raw = String(token || '').trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const idx = Number(raw);
    if (idx >= 0 && idx < items.length) return items[idx];
    if (idx >= 1 && idx <= items.length) return items[idx - 1];
  }

  if (/^[A-Za-z]$/.test(raw)) {
    const idx = LETTERS.indexOf(raw.toUpperCase());
    if (idx >= 0 && idx < items.length) return items[idx];
  }

  const normalized = normalizeText(raw);
  return items.find((item) => normalizeText(item) === normalized) || null;
}

function normalizeFillBlankAnswers(source, blankCount) {
  const blankAnswers = Array.from({ length: blankCount }, () => []);
  if (!source) return blankAnswers;

  if (Array.isArray(source)) {
    if (source.length === blankCount) {
      source.forEach((entry, idx) => {
        if (Array.isArray(entry)) {
          blankAnswers[idx] = entry.map((item) => String(item || '').trim()).filter(Boolean);
        } else if (typeof entry === 'string') {
          blankAnswers[idx] = entry.split('|').map((item) => item.trim()).filter(Boolean);
        }
      });
      return blankAnswers;
    }

    blankAnswers[0] = source.map((item) => String(item || '').trim()).filter(Boolean);
    return blankAnswers;
  }

  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (!trimmed) return blankAnswers;

    const perBlank = trimmed.includes('||')
      ? trimmed.split('||')
      : trimmed.includes(';')
        ? trimmed.split(';')
        : [trimmed];

    if (perBlank.length === blankCount) {
      perBlank.forEach((entry, idx) => {
        blankAnswers[idx] = entry.split('|').map((item) => item.trim()).filter(Boolean);
      });
      return blankAnswers;
    }

    blankAnswers[0] = trimmed.split('|').map((item) => item.trim()).filter(Boolean);
    return blankAnswers;
  }

  return blankAnswers;
}

function normalizeQuestionByType(item, type, questionText) {
  if (type === 'multiple_choice') {
    const options = normalizeOptions(item.options);
    if (options.length < 2) return null;
    const answer = normalizeChoiceToken(item.answer ?? item.correct_answer, options);
    if (!answer) return null;
    return { ...item, question: questionText, options, answer };
  }

  if (type === 'multi_select') {
    const options = normalizeOptions(item.options);
    if (options.length < 2) return null;

    const rawAnswers = Array.isArray(item.correct_answers)
      ? item.correct_answers
      : Array.isArray(item.answer)
        ? item.answer
        : typeof item.answer === 'string'
          ? item.answer.split(',').map((part) => part.trim())
          : [item.answer].filter(Boolean);

    const correctAnswers = [...new Set(
      rawAnswers
        .map((token) => normalizeChoiceToken(token, options))
        .filter(Boolean)
    )];

    if (!correctAnswers.length) return null;
    return {
      ...item,
      question: questionText,
      options,
      correct_answers: correctAnswers,
      answer: correctAnswers.join(','),
    };
  }

  if (type === 'true_false') {
    const answer = normalizeBooleanAnswer(item.answer ?? item.correct_answer);
    if (!answer) return null;
    return { ...item, question: questionText, answer };
  }

  if (type === 'matching') {
    const sourcePairs = Array.isArray(item.pairs) ? item.pairs : (Array.isArray(item.matches) ? item.matches : []);
    const pairs = sourcePairs
      .map((pair) => {
        if (!pair || typeof pair !== 'object') return null;
        const left = String(pair.left ?? pair.prompt ?? pair.term ?? '').trim();
        const right = String(pair.right ?? pair.answer ?? pair.match ?? '').trim();
        return left && right ? { left, right } : null;
      })
      .filter(Boolean);
    if (pairs.length < 2) return null;
    return { ...item, question: questionText, pairs };
  }

  if (type === 'numeric_response') {
    const rawValues = Array.isArray(item.answers)
      ? item.answers
      : Array.isArray(item.accepted_answers)
        ? item.accepted_answers
        : [item.answer ?? item.correct_answer].filter((value) => value !== undefined && value !== null && String(value).trim() !== '');
    const values = toUniqueNumbers(rawValues.map(parseNumericValue));
    if (!values.length) return null;

    const toleranceVal = Number(item.tolerance ?? item.acceptance ?? 0);
    const tolerance = Number.isFinite(toleranceVal) && toleranceVal >= 0 ? toleranceVal : 0;
    const unit = String(item.unit || '').trim();

    return {
      ...item,
      question: questionText,
      answers: values,
      answer: values[0],
      tolerance,
      unit,
    };
  }

  if (type === 'ordering') {
    const items = toStringArray(item.items ?? item.steps ?? item.options);
    if (items.length < 2) return null;

    const rawOrder = Array.isArray(item.correct_order)
      ? item.correct_order
      : Array.isArray(item.answer)
        ? item.answer
        : (typeof item.answer === 'string' && item.answer.includes(','))
          ? item.answer.split(',').map((part) => part.trim())
          : Array.isArray(item.order)
            ? item.order
            : [];

    const resolved = rawOrder.map((token) => resolveOrderToken(token, items)).filter(Boolean);
    const dedup = [];
    for (const entry of resolved) {
      if (!dedup.includes(entry)) dedup.push(entry);
    }

    const correctOrder = dedup.length === items.length ? dedup : items;

    return {
      ...item,
      question: questionText,
      items,
      correct_order: correctOrder,
      answer: correctOrder,
    };
  }

  if (type === 'fill_blank') {
    const sentence = String(item.sentence || questionText).trim();
    const blankCount = Math.max((sentence.match(/_{3,}/g) || []).length, 1);
    const answers = normalizeFillBlankAnswers(item.answers ?? item.blanks ?? item.answer, blankCount);
    if (!answers.some((entry) => entry.length > 0)) return null;
    return {
      ...item,
      question: questionText,
      sentence,
      answers,
    };
  }

  if (type === 'error_analysis') {
    const studentWork = String(item.student_work ?? item.worked_solution ?? item.attempt ?? '').trim();
    const correction = String(item.correction ?? item.sample_answer ?? item.answer ?? '').trim();
    const keywords = toStringArray(item.keywords ?? item.error_spot);
    if (!correction && !keywords.length) return null;
    return {
      ...item,
      question: questionText,
      student_work: studentWork,
      correction,
      keywords,
    };
  }

  if (type === 'open_ended') {
    const sampleAnswer = String(item.sample_answer ?? item.answer ?? item.model_answer ?? '').trim();
    const keywords = toStringArray(item.keywords);
    return {
      ...item,
      question: questionText,
      sample_answer: sampleAnswer,
      keywords,
    };
  }

  return null;
}

function normalizeGeneratedQuestions(questions, context = {}) {
  const list = Array.isArray(questions) ? questions : [];
  const subtopics = Array.isArray(context.subtopics) ? context.subtopics.filter(Boolean) : [];
  const allowedTypes = normalizeRequestedTypes(context.types);
  const fallbackSkill = String(context.chapter || context.topic || 'General').trim() || 'General';

  return list
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null;
      const type = normalizeQuestionType(item.type);
      const questionText = String(item.question || item.prompt || '').trim();
      if (!type || !questionText) return null;
      if (allowedTypes.length && !allowedTypes.includes(type)) return null;

      const normalized = normalizeQuestionByType(item, type, questionText);
      if (!normalized) return null;

      const autoSkill = subtopics.length > 0 ? subtopics[idx % subtopics.length] : fallbackSkill;
      const skillTag = String(item.skill_tag || autoSkill || fallbackSkill).trim();
      const difficulty = normalizeDifficulty(item.difficulty);

      return {
        ...normalized,
        type,
        question: questionText,
        skill_tag: skillTag || fallbackSkill,
        difficulty,
      };
    })
    .filter(Boolean);
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch { }
  }
  return [];
}

function buildAdaptivePromptBlock(plan) {
  if (!plan) return '';

  const difficultyCount = plan.difficulty_distribution_count || {};
  const difficultyPct = plan.difficulty_distribution_pct || {};
  const focusSkills = Array.isArray(plan.focus_skills) ? plan.focus_skills : [];
  const strengths = Array.isArray(plan.strengths) ? plan.strengths : [];

  return `
Adaptive learner profile (must follow):
- Overall mastery: ${plan.mastery_overall ?? 'unknown'}%
- Recent accuracy: ${plan.recent_accuracy ?? 'unknown'}%
- Trend: ${plan.trend || 'stable'}
- Focus skills to reinforce: ${focusSkills.length ? focusSkills.join(', ') : 'none'}
- Stronger skills to stretch: ${strengths.length ? strengths.join(', ') : 'none'}
- Target difficulty mix by count: foundation=${difficultyCount.foundation ?? 0}, core=${difficultyCount.core ?? 0}, advanced=${difficultyCount.advanced ?? 0}
- Target difficulty mix by percent: foundation=${difficultyPct.foundation ?? 0}%, core=${difficultyPct.core ?? 0}%, advanced=${difficultyPct.advanced ?? 0}%
`;
}

export default function QuizLoading() {
  const navigate = useNavigate();
  const { generateCompletion } = useRegis();
  const { student } = useStudent();
  const {
    quizConfig,
    setQuizConfig,
    setCurrentQuestions,
    quizCode,
    attemptId,
    setTimeLimit,
    setChapter: setCtxChapter,
    setSubtopics: setCtxSubtopics,
    chapter: ctxChapter,
    subtopics: ctxSubtopics,
  } = useQuiz();

  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingMsg, setLoadingMsg] = useState('Initializing...');
  const activeRunRef = useRef(0);
  const progressIntervalRef = useRef(null);
  const messageIntervalRef = useRef(null);
  const timeoutRefs = useRef([]);

  const MESSAGES = [
    'Analyzing mastery profile...',
    'Generating adaptive questions...',
    'Balancing difficulty tiers...',
    'Building personalized feedback...',
    'Finalizing your quiz...',
  ];

  const clearAsyncWork = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    if (messageIntervalRef.current) {
      clearInterval(messageIntervalRef.current);
      messageIntervalRef.current = null;
    }

    timeoutRefs.current.forEach((id) => clearTimeout(id));
    timeoutRefs.current = [];
  };

  const scheduleTimeout = (fn, delay) => {
    const id = setTimeout(fn, delay);
    timeoutRefs.current.push(id);
    return id;
  };

  const isRunActive = (runId) => activeRunRef.current === runId;

  const fetchQuizMeta = async (runId) => {
    if (!quizCode || quizCode === 'DEMO') return null;

    try {
      const res = await api.get(`/api/quiz/${quizCode}`);
      if (!isRunActive(runId)) return null;

      setTimeLimit(Number(res.data.time_limit_mins) || 0);

      const parsedSubtopics = toArray(res.data.subtopic);
      const parsedTypes = Array.isArray(res.data.question_types)
        ? res.data.question_types
        : toArray(res.data.question_types);
      const chapterTitle = res.data.chapter || res.data.topic;

      if (!isRunActive(runId)) return null;
      setCtxChapter(chapterTitle);
      setCtxSubtopics(parsedSubtopics);

      if (!quizConfig && isRunActive(runId)) {
        setQuizConfig({
          topic: res.data.topic,
          grade: res.data.grade,
          count: res.data.q_count,
          types: parsedTypes,
          chapter: chapterTitle,
          subtopics: parsedSubtopics,
          extra: res.data.extra_instructions || '',
        });
      }

      return {
        ...res.data,
        question_types: parsedTypes,
        subtopic: parsedSubtopics,
      };
    } catch (err) {
      console.error('Failed to fetch quiz meta:', err);
      return null;
    }
  };

  const fetchAdaptivePlan = async (runId, config, meta) => {
    if (!student?.id || !quizCode || quizCode === 'DEMO') return null;
    try {
      const subtopics = Array.isArray(config?.subtopics) && config.subtopics.length > 0
        ? config.subtopics
        : (Array.isArray(meta?.subtopic) ? meta.subtopic : (Array.isArray(ctxSubtopics) ? ctxSubtopics : []));

      const params = {
        topic: config?.topic || meta?.topic || '',
        chapter: config?.chapter || meta?.chapter || ctxChapter || config?.topic || '',
        subtopics: JSON.stringify(subtopics),
        count: Number(config?.count || meta?.q_count || 5),
      };

      const res = await api.get(`/api/student/${student.id}/adaptive-plan`, { params });
      if (!isRunActive(runId)) return null;
      return res.data?.plan || null;
    } catch (err) {
      console.warn('Adaptive plan fetch failed, falling back to default generation:', err.message);
      return null;
    }
  };

  const generate = async () => {
    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;
    clearAsyncWork();

    const meta = await fetchQuizMeta(runId);
    if (!isRunActive(runId)) return;

    setError('');
    setRetrying(false);
    setProgress(5);

    progressIntervalRef.current = setInterval(() => {
      if (!isRunActive(runId)) return;
      setProgress((prev) => {
        if (prev >= 92) {
          clearAsyncWork();
          return prev;
        }
        const step = prev < 50 ? 5 : prev < 80 ? 2 : 0.5;
        return Math.min(prev + step, 92);
      });
    }, 400);

    let msgIdx = 0;
    messageIntervalRef.current = setInterval(() => {
      if (!isRunActive(runId)) return;
      msgIdx = (msgIdx + 1) % MESSAGES.length;
      setLoadingMsg(MESSAGES[msgIdx]);
    }, 2500);

    if (quizCode === 'DEMO') {
      scheduleTimeout(() => {
        if (!isRunActive(runId)) return;
        clearAsyncWork();
        setProgress(100);
        scheduleTimeout(() => {
          if (!isRunActive(runId)) return;
          setCurrentQuestions(normalizeGeneratedQuestions(DEMO_QUESTIONS, { topic: 'Fractions', chapter: 'Fractions' }));
          navigate('/quiz');
        }, 300);
      }, 1500);
      return;
    }

    const metaTypes = Array.isArray(meta?.question_types)
      ? meta.question_types
      : toArray(meta?.question_types);

    const effectiveConfig = quizConfig || (meta ? {
      topic: meta.topic,
      grade: meta.grade,
      count: meta.q_count,
      types: metaTypes,
      extra: meta.extra_instructions || '',
      chapter: meta.chapter || meta.topic,
      subtopics: Array.isArray(meta.subtopic) ? meta.subtopic : [],
      activity_type: meta.activity_type || 'class_activity',
    } : null);

    if (!effectiveConfig) {
      clearAsyncWork();
      setError('Quiz session expired. Please rejoin with your quiz code.');
      return;
    }

    const safeTypes = normalizeRequestedTypes(effectiveConfig.types);
    const requestedTypes = safeTypes.length ? safeTypes : ['multiple_choice'];
    const safeSubtopics = Array.isArray(effectiveConfig.subtopics) ? effectiveConfig.subtopics : [];
    const chapterTitle = effectiveConfig.chapter || meta?.chapter || ctxChapter || effectiveConfig.topic;
    const activityType = String(effectiveConfig.activity_type || 'class_activity').toLowerCase() === 'topic_quiz'
      ? 'topic_quiz'
      : 'class_activity';
    const activityLabel = activityType === 'topic_quiz' ? 'Topic Quiz' : 'Class Activity';
    const adaptivePlan = await fetchAdaptivePlan(runId, effectiveConfig, meta);
    if (!isRunActive(runId)) return;

    const adaptiveBlock = buildAdaptivePromptBlock(adaptivePlan);
    const prompt = `You are an expert math teacher creating an adaptive quiz.
Generate exactly ${effectiveConfig.count} questions for ${effectiveConfig.grade} on topic "${effectiveConfig.topic}".
Activity type: ${activityLabel}.
Question types to use: ${requestedTypes.join(', ')}.
Use ONLY these exact type ids: ${requestedTypes.join(', ')}.
${effectiveConfig.extra ? `Extra instructions: ${effectiveConfig.extra}` : ''}

${adaptiveBlock}

Return output as a SINGLE VALID JSON ARRAY only.
No markdown, no prose, no backticks.
Start with "[" and end with "]".

Each question object MUST include:
- "type"
- "skill_tag"
- "difficulty" (one of: foundation, core, advanced)
- question body fields by type

Structures:

For multiple_choice:
{ "type":"multiple_choice", "skill_tag":"...", "difficulty":"core", "question":"...", "options":["A. ...","B. ...","C. ...","D. ..."], "answer":"A", "explanation":"..." }

For multi_select:
{ "type":"multi_select", "skill_tag":"...", "difficulty":"core", "question":"...", "options":["A. ...","B. ...","C. ...","D. ..."], "correct_answers":["A","C"], "explanation":"..." }

For true_false:
{ "type":"true_false", "skill_tag":"...", "difficulty":"foundation", "question":"...", "answer":"True", "explanation":"..." }

For matching:
{ "type":"matching", "skill_tag":"...", "difficulty":"core", "question":"Match each expression with its value:", "pairs":[{"left":"...","right":"..."}], "explanation":"..." }

For numeric_response:
{ "type":"numeric_response", "skill_tag":"...", "difficulty":"core", "question":"...", "answer":12.5, "tolerance":0.01, "unit":"optional", "explanation":"..." }

For ordering:
{ "type":"ordering", "skill_tag":"...", "difficulty":"core", "question":"Arrange these steps in order:", "items":["...","...","..."], "correct_order":["...","...","..."], "explanation":"..." }

For fill_blank:
{ "type":"fill_blank", "skill_tag":"...", "difficulty":"foundation", "question":"Complete the sentence.", "sentence":"The value of 3/4 of 20 is ____.", "answers":[["15"]], "explanation":"..." }

For error_analysis:
{ "type":"error_analysis", "skill_tag":"...", "difficulty":"advanced", "question":"Find the mistake in this working.", "student_work":"...", "correction":"...", "keywords":["...","..."], "explanation":"..." }

For open_ended:
{ "type":"open_ended", "skill_tag":"...", "difficulty":"advanced", "question":"...", "sample_answer":"...", "keywords":["kw1","kw2"] }

Keep difficulty appropriate for ${effectiveConfig.grade}.
${activityType === 'topic_quiz'
  ? 'Ensure full-topic coverage with a stronger core/advanced mix and summative rigor.'
  : 'Use lesson-level scaffolding with approachable progression and quick formative checks.'}
Keep content aligned to chapter "${chapterTitle}" and subtopics: ${safeSubtopics.length ? safeSubtopics.join(', ') : 'not specified'}.
Randomize values so each learner gets unique questions.`;

    try {
      const raw = await generateCompletion(prompt);
      if (!isRunActive(runId)) return;
      clearAsyncWork();
      setProgress(100);

      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const firstBracket = cleaned.indexOf('[');
      const lastBracket = cleaned.lastIndexOf(']');

      let parsedJson = null;
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        parsedJson = JSON.parse(cleaned.substring(firstBracket, lastBracket + 1));
      } else {
        parsedJson = JSON.parse(cleaned);
      }

      const normalized = normalizeGeneratedQuestions(parsedJson, {
        topic: effectiveConfig.topic,
        chapter: chapterTitle,
        subtopics: safeSubtopics,
        types: requestedTypes,
      });

      if (!Array.isArray(normalized) || normalized.length === 0) {
        throw new Error('Empty question array');
      }

      api.post('/api/admin/content/question-sets', {
        quiz_code: quizCode || null,
        attempt_id: attemptId || null,
        student_id: student?.id || null,
        questions: normalized,
      }).catch(() => { });

      setCurrentQuestions(normalized);
      scheduleTimeout(() => {
        if (!isRunActive(runId)) return;
        navigate('/quiz');
      }, 400);
    } catch (err) {
      if (!isRunActive(runId)) return;
      console.error('[QuizLoading] Generation Error:', err);
      clearAsyncWork();
      
      // Show specific error for credit issues
      if (err.message.includes('credits') || err.message.includes('tokens')) {
        setError('Insufficient OpenRouter credits. Please add credits at https://openrouter.ai/settings/credits');
      } else if (err.message.includes('Empty question array')) {
        setError('No questions were generated. Try a different topic.');
      } else if (err.message.includes('JSON') || err.message.includes('parse') || err instanceof SyntaxError) {
        setError('Could not read Regis response. Please try again.');
      } else {
        setError(`${err.message}${!String(err.message).includes('settings') ? '. Check your Regis settings.' : ''}`);
      }

      api.post('/api/admin/system/events', {
        event_type: 'generation_error',
        level: 'error',
        message: String(err?.message || 'quiz_generation_failed'),
        path: '/quiz/loading',
        detail: {
          quiz_code: quizCode || null,
          student_id: student?.id || null,
        },
      }).catch(() => { });
    }
  };

  useEffect(() => {
    generate();
    return () => {
      activeRunRef.current += 1;
      clearAsyncWork();
    };
  }, []);

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-10 animate-fadeUp">
      {!error ? (
        <div className="w-full max-w-md text-center">
          <div className="text-5xl mb-8 animate-bounce">Brain</div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-8 group transition-all hover:bg-accent/15">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-syne font-800 text-[10px] text-accent uppercase tracking-[0.2em]">
              Preparing Adaptive Quiz
            </span>
          </div>

          <p className="font-dm text-muted text-sm italic mb-10 transition-all duration-500 min-h-[1.5em]">
            {loadingMsg}
          </p>

          <div className="w-full h-5 bg-ink/[0.04] border-2 border-ink/20 rounded-full overflow-hidden relative mb-3 shadow-inner">
            <div
              className="h-full bg-accent transition-all duration-700 ease-out relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute top-0 right-0 w-1 h-full bg-white/30" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" style={{ width: '100%' }} />
            </div>
          </div>

          <p className="font-syne font-800 text-[11px] text-ink/80 uppercase tracking-[0.4em]">🧠 Generating Quiz</p>
          <p className="font-dm text-sm text-muted mt-1">{Math.round(progress)}% Complete</p>
        </div>
      ) : (
        <div className="max-w-sm text-center">
          <p className="text-4xl mb-4">Warning</p>
          <p className="font-syne font-600 text-ink mb-2">{error}</p>
          <button
            onClick={() => { setRetrying(true); generate(); }}
            className="mt-4 px-8 py-4 rounded-2xl bg-accent text-white font-syne font-700 text-sm hover:bg-accent/90 active:scale-[0.98] transition-all shadow-lg shadow-accent/20"
          >
            {retrying ? 'Retrying...' : 'Try Again'}
          </button>
        </div>
      )}
    </div>
  );
}
