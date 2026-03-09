import { useMemo, useState } from 'react';
import FeedbackBubble from '../FeedbackBubble';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeItems(rawItems) {
  const list = Array.isArray(rawItems) ? rawItems : [];
  return list
    .map((item) => String(item || '').trim())
    .filter(Boolean);
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

  const cleaned = normalizeText(raw);
  return items.find((item) => normalizeText(item) === cleaned) || null;
}

function buildCorrectOrder(question, items) {
  const raw = Array.isArray(question.correct_order)
    ? question.correct_order
    : Array.isArray(question.answer)
      ? question.answer
      : (typeof question.answer === 'string' && question.answer.includes(','))
        ? question.answer.split(',').map((part) => part.trim())
        : Array.isArray(question.order)
          ? question.order
          : [];

  if (!raw.length) return items;

  const mapped = raw
    .map((token) => resolveOrderToken(token, items))
    .filter(Boolean);

  const dedup = [];
  for (const item of mapped) {
    if (!dedup.includes(item)) dedup.push(item);
  }

  if (dedup.length !== items.length) return items;
  return dedup;
}

export default function OrderingQuestion({ question, onAnswer, disabled }) {
  const items = useMemo(() => normalizeItems(question.items), [question.items]);
  const correctOrder = useMemo(() => buildCorrectOrder(question, items), [question, items]);
  const [currentOrder, setCurrentOrder] = useState(() => shuffle(items));
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const moveItem = (index, direction) => {
    if (disabled || submitted) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= currentOrder.length) return;

    setCurrentOrder((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSubmit = () => {
    if (disabled || submitted || currentOrder.length === 0) return;

    const correct = currentOrder.length === correctOrder.length
      && currentOrder.every((item, idx) => normalizeText(item) === normalizeText(correctOrder[idx]));

    setIsCorrect(correct);
    setSubmitted(true);

    onAnswer({
      isCorrect: correct,
      studentAnswer: JSON.stringify(currentOrder),
      correctAnswer: JSON.stringify(correctOrder),
    });
  };

  return (
    <div className="animate-fadeUp">
      <p className="font-syne font-600 text-ink text-lg leading-snug mb-3">{question.question}</p>
      <p className="font-dm text-xs text-muted mb-4">Arrange from first to last.</p>

      <div className="space-y-2">
        {currentOrder.map((item, idx) => (
          <div key={`${item}-${idx}`} className="flex items-center gap-2 p-3 rounded-xl border-2 border-border bg-card">
            <span className="w-6 text-center font-syne font-700 text-xs text-muted">{idx + 1}</span>
            <p className="flex-1 font-dm text-sm text-ink">{item}</p>
            <div className="flex gap-1">
              <button
                onClick={() => moveItem(idx, 'up')}
                disabled={submitted || disabled || idx === 0}
                className="px-2 py-1 rounded-lg border border-border text-xs font-syne font-700 text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-paper"
              >
                Up
              </button>
              <button
                onClick={() => moveItem(idx, 'down')}
                disabled={submitted || disabled || idx === currentOrder.length - 1}
                className="px-2 py-1 rounded-lg border border-border text-xs font-syne font-700 text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-paper"
              >
                Down
              </button>
            </div>
          </div>
        ))}
      </div>

      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={disabled || currentOrder.length === 0}
          className="mt-4 w-full py-3 rounded-xl bg-accent2 text-white font-syne font-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Check Order
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
