export default function FeedbackBubble({ isCorrect, explanation, sampleAnswer }) {
  if (isCorrect === null && !sampleAnswer) return null;

  // Info mode (open ended)
  if (sampleAnswer !== undefined) {
    return (
      <div className="mt-3 p-4 rounded-xl bg-blue-50 border border-blue-200 animate-fadeUp">
        <p className="font-syne font-600 text-accent2 text-sm mb-1">Sample Answer</p>
        <p className="font-dm text-sm text-ink">{sampleAnswer}</p>
        {explanation && <p className="font-dm text-xs text-muted mt-2">{explanation}</p>}
      </div>
    );
  }

  return (
    <div className={`mt-3 p-4 rounded-xl animate-fadeUp border ${
      isCorrect
        ? 'bg-green-50 border-green-200'
        : 'bg-red-50 border-red-200'
    }`}>
      <p className={`font-syne font-600 text-sm mb-1 ${isCorrect ? 'text-correct' : 'text-wrong'}`}>
        {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
      </p>
      {explanation && <p className="font-dm text-sm text-ink">{explanation}</p>}
    </div>
  );
}
