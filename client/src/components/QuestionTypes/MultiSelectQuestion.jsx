import { useMemo, useState } from 'react';
import FeedbackBubble from '../FeedbackBubble';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function normalizeOptionText(value) {
  return String(value || '').replace(/^[A-Z]\.\s*/, '').trim();
}

function toOptionText(option) {
  if (option && typeof option === 'object') {
    if (option.text) return String(option.text).trim();
    if (option.label) return String(option.label).trim();
    if (option.value) return String(option.value).trim();
  }
  return String(option || '').trim();
}

function normalizeSelectionToken(token, options) {
  if (typeof token === 'number' && token >= 0 && token < options.length) {
    return LETTERS[token];
  }

  const raw = String(token || '').trim();
  if (!raw) return null;

  if (/^[A-Za-z]$/.test(raw)) {
    return raw.toUpperCase();
  }

  if (/^\d+$/.test(raw)) {
    const idx = Number(raw);
    if (idx >= 0 && idx < options.length) return LETTERS[idx];
    if (idx >= 1 && idx <= options.length) return LETTERS[idx - 1];
  }

  const cleaned = normalizeOptionText(raw).toLowerCase();
  const matchIdx = options.findIndex((opt) => normalizeOptionText(opt.text).toLowerCase() === cleaned);
  return matchIdx >= 0 ? LETTERS[matchIdx] : null;
}

function buildCorrectKeys(question, options) {
  const raw = Array.isArray(question.correct_answers)
    ? question.correct_answers
    : (typeof question.answer === 'string' && question.answer.includes(','))
      ? question.answer.split(',').map((x) => x.trim())
      : [question.answer].filter(Boolean);

  const keys = [];
  for (const token of raw) {
    const key = normalizeSelectionToken(token, options);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

export default function MultiSelectQuestion({ question, onAnswer, disabled }) {
  const options = useMemo(() => {
    const list = Array.isArray(question.options) ? question.options : [];
    return list.map((opt, idx) => ({
      key: LETTERS[idx],
      text: toOptionText(opt),
    }));
  }, [question.options]);

  const correctKeys = useMemo(() => buildCorrectKeys(question, options), [question, options]);
  const [selected, setSelected] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  const toggleSelect = (key) => {
    if (disabled || submitted) return;
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleSubmit = () => {
    if (disabled || submitted || selected.length === 0) return;
    setSubmitted(true);
    const sortedSelected = [...selected].sort();
    const sortedCorrect = [...correctKeys].sort();
    const isCorrect = sortedSelected.length === sortedCorrect.length
      && sortedSelected.every((k, i) => k === sortedCorrect[i]);

    onAnswer({
      isCorrect,
      studentAnswer: JSON.stringify(sortedSelected),
      correctAnswer: JSON.stringify(sortedCorrect),
    });
  };

  return (
    <div className="animate-fadeUp">
      <p className="font-syne font-600 text-ink text-lg leading-snug mb-5">{question.question}</p>

      <div className="space-y-3">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.key);
          const isCorrectOption = correctKeys.includes(opt.key);
          const style = (() => {
            if (!submitted) {
              return isSelected
                ? 'border-accent2 bg-accent2/5'
                : 'border-border bg-card hover:border-accent2/50 hover:bg-accent2/5';
            }
            if (isCorrectOption && isSelected) return 'border-correct bg-green-50';
            if (isCorrectOption && !isSelected) return 'border-correct/60 bg-green-50/60';
            if (!isCorrectOption && isSelected) return 'border-wrong bg-red-50';
            return 'border-border bg-card opacity-60';
          })();

          return (
            <button
              key={opt.key}
              onClick={() => toggleSelect(opt.key)}
              disabled={submitted || disabled}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${style}`}
            >
              <span className={`w-7 h-7 rounded-md border flex items-center justify-center font-syne font-700 text-xs ${
                isSelected ? 'border-accent2 bg-accent2 text-white' : 'border-border bg-paper text-muted'
              }`}>
                {isSelected ? 'X' : ''}
              </span>
              <span className="w-6 text-center font-syne font-700 text-xs text-muted">{opt.key}</span>
              <span className="font-dm text-ink text-sm">{normalizeOptionText(opt.text)}</span>
            </button>
          );
        })}
      </div>

      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={selected.length === 0 || disabled}
          className="mt-4 w-full py-3 rounded-xl bg-accent2 text-white font-syne font-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Submit Selection
        </button>
      )}

      {submitted && (
        <FeedbackBubble
          isCorrect={(() => {
            const a = [...selected].sort();
            const b = [...correctKeys].sort();
            return a.length === b.length && a.every((k, i) => k === b[i]);
          })()}
          explanation={question.explanation}
        />
      )}
    </div>
  );
}
