import { useState, useMemo } from 'react';
import FeedbackBubble from '../FeedbackBubble';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MatchingQuestion({ question, onAnswer, disabled }) {
  const [selections, setSelections] = useState({});
  const [checked, setChecked] = useState(false);
  const [results, setResults] = useState({});

  const shuffledRights = useMemo(() => shuffle(question.pairs?.map(p => p.right) || []), [question]);

  const handleSelect = (leftIdx, rightVal) => {
    if (checked || disabled) return;
    setSelections(prev => ({ ...prev, [leftIdx]: rightVal }));
  };

  const handleCheck = () => {
    const newResults = {};
    let correct = 0;
    question.pairs.forEach((pair, i) => {
      const isCorrect = selections[i] === pair.right;
      newResults[i] = isCorrect;
      if (isCorrect) correct++;
    });
    setResults(newResults);
    setChecked(true);
    const allCorrect = correct === question.pairs.length;
    onAnswer({
      isCorrect: allCorrect,
      studentAnswer: JSON.stringify(selections),
      correctAnswer: JSON.stringify(Object.fromEntries(question.pairs.map((p, i) => [i, p.right]))),
    });
  };

  const allSelected = question.pairs?.every((_, i) => selections[i] !== undefined);

  return (
    <div className="animate-fadeUp">
      <p className="font-syne font-600 text-ink text-lg leading-snug mb-5">{question.question}</p>

      <div className="space-y-3">
        {question.pairs?.map((pair, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex-1 p-3 bg-card border border-border rounded-xl font-dm text-sm text-ink">
              {pair.left}
            </div>
            <span className="text-muted">→</span>
            <div className="flex-1">
              <select
                value={selections[i] || ''}
                onChange={e => handleSelect(i, e.target.value)}
                disabled={checked || disabled}
                className={`w-full p-3 rounded-xl border-2 font-dm text-sm transition-colors outline-none ${checked
                  ? results[i] ? 'border-correct bg-green-50 text-correct' : 'border-wrong bg-red-50 text-wrong'
                  : 'border-border bg-card focus:border-accent2'
                  }`}
              >
                <option value="">Select…</option>
                {shuffledRights.map((r, j) => (
                  <option key={j} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      {!checked && (
        <button
          onClick={handleCheck}
          disabled={!allSelected || disabled}
          className="mt-5 w-full py-3 rounded-xl bg-accent2 text-white font-syne font-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent2/90 active:scale-[0.98] transition-all"
        >
          Check Matching
        </button>
      )}

      {checked && (
        <FeedbackBubble
          isCorrect={Object.values(results).every(Boolean)}
          explanation={question.explanation}
        />
      )}
    </div>
  );
}
