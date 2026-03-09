import { useMemo, useState } from 'react';
import FeedbackBubble from '../FeedbackBubble';

function parseNumericInput(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value ?? '').trim().replace(/,/g, '');
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

function formatCorrectAnswer(answers, tolerance, unit) {
  if (!answers.length) return 'N/A';
  const base = answers.map((n) => Number(n).toString()).join(' or ');
  const tol = tolerance > 0 ? ` (+/- ${tolerance})` : '';
  const suffix = unit ? ` ${unit}` : '';
  return `${base}${tol}${suffix}`.trim();
}

export default function NumericResponseQuestion({ question, onAnswer, disabled }) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const acceptedValues = useMemo(() => {
    const raw = Array.isArray(question.answers)
      ? question.answers
      : [question.answer].filter((value) => value !== undefined && value !== null && String(value).trim() !== '');
    return toUniqueNumbers(raw.map(parseNumericInput));
  }, [question.answer, question.answers]);

  const tolerance = useMemo(() => {
    const n = Number(question.tolerance);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [question.tolerance]);

  const unit = String(question.unit || '').trim();

  const handleSubmit = () => {
    if (disabled || submitted || !answer.trim()) return;
    const parsed = parseNumericInput(answer);
    const correct = Number.isFinite(parsed)
      && acceptedValues.some((value) => Math.abs(parsed - value) <= tolerance + 1e-9);

    setIsCorrect(correct);
    setSubmitted(true);

    onAnswer({
      isCorrect: correct,
      studentAnswer: answer,
      correctAnswer: formatCorrectAnswer(acceptedValues, tolerance, unit),
    });
  };

  return (
    <div className="animate-fadeUp">
      <p className="font-syne font-600 text-ink text-lg leading-snug mb-5">{question.question}</p>

      {unit && (
        <p className="font-dm text-xs text-muted mb-2">Answer unit: {unit}</p>
      )}

      <input
        type="text"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={submitted || disabled}
        placeholder="Enter a number..."
        className="w-full p-4 rounded-xl border-2 border-border bg-card font-dm text-sm text-ink outline-none focus:border-accent2 transition-colors disabled:opacity-60"
      />

      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={!answer.trim() || disabled}
          className="mt-3 w-full py-3 rounded-xl bg-ink text-paper font-syne font-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-ink/90 active:scale-[0.98] transition-all"
        >
          Submit Answer
        </button>
      )}

      {submitted && (
        <FeedbackBubble
          isCorrect={isCorrect}
          explanation={question.explanation}
        />
      )}
    </div>
  );
}
