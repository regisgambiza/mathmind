import { useState } from 'react';
import FeedbackBubble from '../FeedbackBubble';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function MCQQuestion({ question, onAnswer, disabled }) {
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);

  const handleSelect = (letter) => {
    if (disabled || revealed) return;
    setSelected(letter);
    setRevealed(true);
    const isCorrect = letter === question.answer;
    onAnswer({ isCorrect, studentAnswer: letter, correctAnswer: question.answer });
  };

  const getOptionStyle = (letter) => {
    if (!revealed) {
      return selected === letter
        ? 'border-accent2 bg-accent2/5'
        : 'border-border bg-card hover:border-accent2/50 hover:bg-accent2/5 cursor-pointer';
    }
    if (letter === question.answer) return 'border-correct bg-green-50';
    if (letter === selected && letter !== question.answer) return 'border-wrong bg-red-50';
    return 'border-border bg-card opacity-50';
  };

  return (
    <div className="animate-fadeUp">
      <p className="font-syne font-600 text-ink text-lg leading-snug mb-5">{question.question}</p>

      <div className="space-y-3">
        {question.options?.map((opt, i) => {
          const letter = LETTERS[i];
          return (
            <button
              key={i}
              onClick={() => handleSelect(letter)}
              disabled={revealed || disabled}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 text-left ${getOptionStyle(letter)}`}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center font-syne font-700 text-sm flex-shrink-0 ${revealed && letter === question.answer ? 'bg-correct text-white' :
                revealed && letter === selected ? 'bg-wrong text-white' :
                  'bg-border text-ink'
                }`}>
                {letter}
              </span>
              <span className="font-dm text-ink text-sm">{opt.replace(/^[A-D]\.\s*/, '')}</span>
            </button>
          );
        })}
      </div>
      {revealed && (
        <FeedbackBubble
          isCorrect={selected === question.answer}
          explanation={question.explanation}
        />
      )}
    </div>
  );
}
