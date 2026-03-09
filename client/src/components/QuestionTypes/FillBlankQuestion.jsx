import { useMemo, useState } from 'react';
import FeedbackBubble from '../FeedbackBubble';
import { useQuiz } from '../../context/QuizContext';
import { useRegis } from '../../context/RegisContext';
import {
  AI_SCORING_MIN_CONFIDENCE,
  evaluateFillBlankWithAI,
} from '../../utils/aiScoring';

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function splitAliases(value) {
  return String(value || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

function getSentence(question) {
  const sentence = String(question.sentence || '').trim();
  if (sentence) return sentence;
  return String(question.question || '').trim();
}

function countBlanks(sentence) {
  const matches = String(sentence || '').match(/_{3,}/g);
  return matches ? matches.length : 1;
}

function buildBlankAnswers(question, blankCount) {
  const source = question.answers ?? question.blanks ?? question.answer ?? [];
  const base = Array.from({ length: blankCount }, () => []);

  if (Array.isArray(source)) {
    if (source.length === blankCount) {
      source.forEach((entry, idx) => {
        if (Array.isArray(entry)) {
          base[idx] = entry.map((x) => String(x || '').trim()).filter(Boolean);
          return;
        }
        base[idx] = splitAliases(entry);
      });
      return base;
    }

    if (source.every((entry) => typeof entry === 'string')) {
      base[0] = source.map((entry) => String(entry || '').trim()).filter(Boolean);
      return base;
    }
  }

  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (!trimmed) return base;

    const blankParts = trimmed.includes('||')
      ? trimmed.split('||')
      : trimmed.includes(';')
        ? trimmed.split(';')
        : [trimmed];

    if (blankParts.length === blankCount) {
      blankParts.forEach((part, idx) => {
        base[idx] = splitAliases(part);
      });
      return base;
    }

    base[0] = splitAliases(trimmed);
  }

  return base;
}

export default function FillBlankQuestion({ question, onAnswer, disabled }) {
  const sentence = useMemo(() => getSentence(question), [question]);
  const parts = useMemo(() => sentence.split(/_{3,}/), [sentence]);
  const blankCount = useMemo(() => Math.max(countBlanks(sentence), parts.length - 1), [sentence, parts.length]);
  const expectedByBlank = useMemo(
    () => buildBlankAnswers(question, blankCount),
    [question, blankCount]
  );

  const [responses, setResponses] = useState(() => Array.from({ length: blankCount }, () => ''));
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const { generateCompletion } = useRegis();
  const { quizConfig } = useQuiz();

  const updateResponse = (index, value) => {
    if (submitted || disabled) return;
    setResponses((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const allFilled = responses.every((entry) => entry.trim().length > 0);

  const handleSubmit = async () => {
    if (submitted || disabled || grading || !allFilled) return;
    setGrading(true);

    const checks = responses.map((response, idx) => {
      const expected = expectedByBlank[idx] || [];
      if (!expected.length) return response.trim().length > 0;
      const normalized = normalizeText(response);
      return expected.some((item) => normalizeText(item) === normalized);
    });

    const deterministicCorrect = checks.every(Boolean);
    let correct = deterministicCorrect;
    let explanation = String(question.explanation || '').trim();

    if (!deterministicCorrect) {
      try {
        const aiResult = await evaluateFillBlankWithAI({
          generateCompletion,
          question,
          studentResponses: responses,
          expectedByBlank,
          gradeLabel: quizConfig?.grade || '',
        });
        if (aiResult && aiResult.confidence >= AI_SCORING_MIN_CONFIDENCE) {
          correct = aiResult.isCorrect;
        }
        if (aiResult?.feedback) {
          explanation = aiResult.feedback;
        }
      } catch { }
    }

    setIsCorrect(correct);
    setFeedback(explanation);
    setSubmitted(true);
    setGrading(false);
    onAnswer({
      isCorrect: correct,
      studentAnswer: JSON.stringify(responses),
      correctAnswer: JSON.stringify(expectedByBlank),
    });
  };

  return (
    <div className="animate-fadeUp">
      <p className="font-syne font-600 text-ink text-lg leading-snug mb-5">{question.question}</p>

      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2">
          {parts.map((part, idx) => (
            <span key={`part-${idx}`} className="font-dm text-sm text-ink">
              {part}
              {idx < blankCount && (
                <input
                  type="text"
                  value={responses[idx] || ''}
                  onChange={(e) => updateResponse(idx, e.target.value)}
                  disabled={submitted || disabled}
                  className="mx-2 px-2 py-1 min-w-[96px] rounded-md border border-border bg-paper font-dm text-sm text-ink outline-none focus:border-accent2 disabled:opacity-60"
                />
              )}
            </span>
          ))}
        </div>
      </div>

      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={!allFilled || disabled || grading}
          className="mt-4 w-full py-3 rounded-xl bg-accent2 text-white font-syne font-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {grading ? 'Scoring...' : 'Check Answers'}
        </button>
      )}

      {submitted && (
        <FeedbackBubble
          isCorrect={isCorrect}
          explanation={feedback || question.explanation}
        />
      )}
    </div>
  );
}
