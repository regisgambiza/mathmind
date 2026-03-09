function removeCodeFences(text) {
  return String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
}

function extractJsonObject(text) {
  const cleaned = removeCodeFences(text);
  if (!cleaned) return null;

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { }

  return null;
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').trim().toLowerCase();
  if (['true', 'yes', 'correct', 'pass', '1'].includes(raw)) return true;
  if (['false', 'no', 'incorrect', 'fail', '0'].includes(raw)) return false;
  return null;
}

function clamp01(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(/[^a-z0-9/.-]+/g)
    .filter((token) => token.length >= 2);
}

function keywordMatch(answer, keywords) {
  const normalizedAnswer = normalizeText(answer);
  if (!normalizedAnswer || !Array.isArray(keywords) || keywords.length === 0) return null;
  const cleaned = keywords
    .map((word) => String(word || '').trim())
    .filter(Boolean);
  if (!cleaned.length) return null;
  const hits = cleaned.reduce((count, word) => {
    return normalizedAnswer.includes(normalizeText(word)) ? count + 1 : count;
  }, 0);
  return hits >= Math.max(1, Math.ceil(cleaned.length * 0.6));
}

function tokenOverlap(answer, reference) {
  const a = new Set(tokenize(answer));
  const b = new Set(tokenize(reference));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / b.size;
}

function normalizeEvaluation(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const isCorrect = coerceBoolean(
    parsed.is_correct ?? parsed.correct ?? parsed.pass ?? parsed.result
  );
  if (isCorrect === null) return null;

  const confidence = clamp01(
    parsed.confidence ?? parsed.confidence_score ?? parsed.score_confidence ?? 0.5,
    0.5
  );
  const feedback = String(parsed.feedback ?? parsed.rationale ?? parsed.reason ?? '').trim();
  return { isCorrect, confidence, feedback };
}

async function runAiEvaluation(generateCompletion, prompt) {
  const raw = await generateCompletion(prompt);
  const parsed = extractJsonObject(raw);
  return normalizeEvaluation(parsed);
}

export async function evaluateOpenEndedWithAI({ generateCompletion, question, studentAnswer, gradeLabel }) {
  const expectedAnswer = String(question.sample_answer || '').trim();
  const keywords = Array.isArray(question.keywords)
    ? question.keywords.map((word) => String(word || '').trim()).filter(Boolean)
    : [];

  const prompt = `You are grading a math learner response for ${gradeLabel || 'middle school'}.
Question: "${String(question.question || '').trim()}"
Expected answer guide: "${expectedAnswer || 'N/A'}"
Expected keywords: ${keywords.length ? JSON.stringify(keywords) : '[]'}
Learner response: "${String(studentAnswer || '').trim()}"

Decide if the learner response is mathematically correct enough.
Accept equivalent wording, equivalent notation, and valid alternative methods.

Return ONLY valid JSON object:
{"is_correct": true|false, "confidence": 0.0-1.0, "feedback": "short one-sentence reason"}`;

  const ai = await runAiEvaluation(generateCompletion, prompt);
  if (ai) return ai;

  const keywordResult = keywordMatch(studentAnswer, keywords);
  if (keywordResult !== null) {
    return {
      isCorrect: keywordResult,
      confidence: 0.4,
      feedback: keywordResult
        ? 'Matches most expected mathematical keywords.'
        : 'Missing key mathematical ideas expected in the answer.',
    };
  }

  if (expectedAnswer) {
    const overlap = tokenOverlap(studentAnswer, expectedAnswer);
    return {
      isCorrect: overlap >= 0.45,
      confidence: 0.35,
      feedback: overlap >= 0.45
        ? 'Response is close to the expected mathematical method.'
        : 'Response does not align with the expected mathematical method.',
    };
  }

  return {
    isCorrect: false,
    confidence: 0.2,
    feedback: 'Could not confidently validate this response.',
  };
}

export function evaluateErrorAnalysisFallback({ response, keywords, correction }) {
  const normalized = normalizeText(response);
  if (!normalized) return false;

  const cleanedKeywords = Array.isArray(keywords)
    ? keywords.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (cleanedKeywords.length > 0) {
    const hits = cleanedKeywords.reduce((count, keyword) => {
      return normalized.includes(normalizeText(keyword)) ? count + 1 : count;
    }, 0);
    return hits >= Math.max(1, Math.ceil(cleanedKeywords.length / 2));
  }

  const correctionTokens = [...new Set(tokenize(correction))].slice(0, 6);
  if (correctionTokens.length === 0) return normalized.length >= 20;
  const hits = correctionTokens.filter((word) => normalized.includes(word)).length;
  return hits >= Math.max(1, Math.ceil(correctionTokens.length / 3));
}

export async function evaluateErrorAnalysisWithAI({
  generateCompletion,
  question,
  studentAnswer,
  gradeLabel,
}) {
  const correction = String(question.correction || question.sample_answer || '').trim();
  const keywords = Array.isArray(question.keywords)
    ? question.keywords.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const studentWork = String(question.student_work || '').trim();

  const prompt = `You are grading an error-analysis math response for ${gradeLabel || 'middle school'}.
Prompt: "${String(question.question || '').trim()}"
Student work to analyze: "${studentWork || 'N/A'}"
Reference correction: "${correction || 'N/A'}"
Required concepts/keywords: ${keywords.length ? JSON.stringify(keywords) : '[]'}
Learner analysis: "${String(studentAnswer || '').trim()}"

Mark correct only if learner identifies the core mistake and explains the valid correction.
Equivalent wording is acceptable.

Return ONLY valid JSON object:
{"is_correct": true|false, "confidence": 0.0-1.0, "feedback": "short one-sentence reason"}`;

  const ai = await runAiEvaluation(generateCompletion, prompt);
  if (ai) return ai;

  return {
    isCorrect: evaluateErrorAnalysisFallback({
      response: studentAnswer,
      keywords,
      correction,
    }),
    confidence: 0.35,
    feedback: 'Applied fallback keyword/rule-based error-analysis check.',
  };
}

export async function evaluateFillBlankWithAI({
  generateCompletion,
  question,
  studentResponses,
  expectedByBlank,
  gradeLabel,
}) {
  const prompt = `You are grading a fill-in-the-blank math response for ${gradeLabel || 'middle school'}.
Prompt: "${String(question.question || '').trim()}"
Sentence with blanks: "${String(question.sentence || question.question || '').trim()}"
Accepted answers by blank index: ${JSON.stringify(expectedByBlank)}
Learner answers by blank index: ${JSON.stringify(studentResponses)}

Mark correct only if every blank answer is mathematically equivalent to at least one accepted answer for that blank.
Allow equivalent notation where appropriate (e.g., simplified fraction forms).

Return ONLY valid JSON object:
{"is_correct": true|false, "confidence": 0.0-1.0, "feedback": "short one-sentence reason"}`;

  const ai = await runAiEvaluation(generateCompletion, prompt);
  if (ai) return ai;
  return {
    isCorrect: false,
    confidence: 0.25,
    feedback: 'AI parser fallback: kept deterministic result.',
  };
}

export const AI_SCORING_MIN_CONFIDENCE = 0.58;
