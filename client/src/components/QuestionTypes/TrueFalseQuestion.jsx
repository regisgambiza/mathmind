import { useState } from 'react';
import FeedbackBubble from '../FeedbackBubble';

export default function TrueFalseQuestion({ question, onAnswer, disabled }) {
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);

  const handleSelect = (val) => {
    if (disabled || revealed) return;
    setSelected(val);
    setRevealed(true);
    const isCorrect = val === question.answer;
    onAnswer({ isCorrect, studentAnswer: val, correctAnswer: question.answer });
  };

  const getBtnStyle = (val) => {
    if (!revealed) {
      return val === 'True'
        ? 'border-correct/30 bg-green-50 text-correct hover:bg-green-100 cursor-pointer'
        : 'border-wrong/30 bg-red-50 text-wrong hover:bg-red-100 cursor-pointer';
    }
    if (val === question.answer) {
      return val === 'True' ? 'border-correct bg-green-100 text-correct' : 'border-wrong bg-red-100 text-wrong';
    }
    return val === selected ? 'border-wrong bg-red-100 text-wrong opacity-70' : 'border-border bg-card opacity-30';
  };

  return (
    <div className="animate-fadeUp">
      <p className="font-syne font-600 text-ink text-lg leading-snug mb-6">{question.question}</p>

      <div className="grid grid-cols-2 gap-4">
        {['True', 'False'].map(val => (
          <button
            key={val}
            onClick={() => handleSelect(val)}
            disabled={revealed || disabled}
            className={`py-8 rounded-xl border-2 font-syne font-700 text-xl transition-all duration-200 ${getBtnStyle(val)}`}
          >
            {val === 'True' ? '✓ True' : '✗ False'}
          </button>
        ))}
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
