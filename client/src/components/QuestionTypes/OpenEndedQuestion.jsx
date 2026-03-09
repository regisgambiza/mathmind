import { useState } from 'react';
import FeedbackBubble from '../FeedbackBubble';
import { useQuiz } from '../../context/QuizContext';
import { useRegis } from '../../context/RegisContext';
import {
  evaluateOpenEndedWithAI,
} from '../../utils/aiScoring';

export default function OpenEndedQuestion({ question, onAnswer, disabled }) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [grading, setGrading] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [feedback, setFeedback] = useState('');
  const { generateCompletion } = useRegis();
  const { quizConfig } = useQuiz();

  const handleSubmit = async () => {
    if (!answer.trim() || disabled || grading || submitted) return;
    setGrading(true);

    let finalIsCorrect = null;
    let explanation = String(question.explanation || '').trim();

    try {
      const aiResult = await evaluateOpenEndedWithAI({
        generateCompletion,
        question,
        studentAnswer: answer,
        gradeLabel: quizConfig?.grade || '',
      });

      if (aiResult) {
        finalIsCorrect = aiResult.isCorrect;
      }
      if (aiResult?.feedback) {
        explanation = aiResult.feedback;
      }
    } catch { }

    setIsCorrect(finalIsCorrect);
    setFeedback(explanation);
    setSubmitted(true);
    setGrading(false);
    onAnswer({
      isCorrect: finalIsCorrect,
      studentAnswer: answer,
      correctAnswer: question.sample_answer || '',
    });
  };

  return (
    <div className="animate-fadeUp">
      <p className="font-syne font-600 text-ink text-lg leading-snug mb-5">{question.question}</p>

      <textarea
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        disabled={submitted || disabled || grading}
        placeholder="Type your answer here…"
        rows={4}
        className="w-full p-4 rounded-xl border-2 border-border bg-card font-dm text-sm text-ink resize-none outline-none focus:border-accent2 transition-colors disabled:opacity-60"
      />
      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={!answer.trim() || disabled || grading}
          className="mt-3 w-full py-3 rounded-xl bg-ink text-paper font-syne font-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-ink/90 active:scale-[0.98] transition-all"
        >
          {grading ? 'Scoring...' : 'Submit Answer'}
        </button>
      )}
      {submitted && (
        <>
          <FeedbackBubble
            isCorrect={isCorrect}
            explanation={feedback || question.explanation}
            sampleAnswer={isCorrect === null ? question.sample_answer : undefined}
          />
          {isCorrect !== null && question.sample_answer && (
            <div className="mt-3 p-4 rounded-xl bg-blue-50 border border-blue-200 animate-fadeUp">
              <p className="font-syne font-600 text-accent2 text-sm mb-1">Reference Answer</p>
              <p className="font-dm text-sm text-ink whitespace-pre-wrap">{question.sample_answer}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
