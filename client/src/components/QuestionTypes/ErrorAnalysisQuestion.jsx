import { useMemo, useState } from 'react';
import FeedbackBubble from '../FeedbackBubble';
import { useQuiz } from '../../context/QuizContext';
import { useRegis } from '../../context/RegisContext';
import {
  AI_SCORING_MIN_CONFIDENCE,
  evaluateErrorAnalysisFallback,
  evaluateErrorAnalysisWithAI,
} from '../../utils/aiScoring';

function buildKeywords(question) {
  const raw = Array.isArray(question.keywords)
    ? question.keywords
    : String(question.keywords || question.error_spot || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

  const unique = [];
  for (const item of raw) {
    const token = String(item || '').trim();
    if (token && !unique.includes(token)) unique.push(token);
  }
  return unique;
}

export default function ErrorAnalysisQuestion({ question, onAnswer, disabled }) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const correction = String(question.correction || question.sample_answer || '').trim();
  const keywords = useMemo(() => buildKeywords(question), [question]);
  const { generateCompletion } = useRegis();
  const { quizConfig } = useQuiz();

  const handleSubmit = async () => {
    if (disabled || submitted || grading || !answer.trim()) return;
    setGrading(true);

    let correct = evaluateErrorAnalysisFallback({
      response: answer,
      keywords,
      correction,
    });
    let explanation = String(question.explanation || '').trim();

    try {
      const aiResult = await evaluateErrorAnalysisWithAI({
        generateCompletion,
        question,
        studentAnswer: answer,
        gradeLabel: quizConfig?.grade || '',
      });
      if (aiResult && aiResult.confidence >= AI_SCORING_MIN_CONFIDENCE) {
        correct = aiResult.isCorrect;
      }
      if (aiResult?.feedback) {
        explanation = aiResult.feedback;
      }
    } catch { }

    setIsCorrect(correct);
    setFeedback(explanation);
    setSubmitted(true);
    setGrading(false);
    onAnswer({
      isCorrect: correct,
      studentAnswer: answer,
      correctAnswer: correction || keywords.join(', '),
    });
  };

  return (
    <div className="animate-fadeUp">
      <p className="font-syne font-600 text-ink text-lg leading-snug mb-4">{question.question}</p>

      {question.student_work && (
        <div className="mb-4 p-4 rounded-xl border border-border bg-card">
          <p className="font-syne font-700 text-xs uppercase tracking-wider text-muted mb-1">Student Work</p>
          <p className="font-dm text-sm text-ink whitespace-pre-wrap">{question.student_work}</p>
        </div>
      )}

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={submitted || disabled || grading}
        placeholder="Identify the mistake and explain the correction..."
        rows={5}
        className="w-full p-4 rounded-xl border-2 border-border bg-card font-dm text-sm text-ink resize-none outline-none focus:border-accent2 transition-colors disabled:opacity-60"
      />

      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={!answer.trim() || disabled || grading}
          className="mt-3 w-full py-3 rounded-xl bg-ink text-paper font-syne font-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-ink/90 active:scale-[0.98] transition-all"
        >
          {grading ? 'Scoring...' : 'Submit Analysis'}
        </button>
      )}

      {submitted && (
        <>
          <FeedbackBubble
            isCorrect={isCorrect}
            explanation={feedback || question.explanation}
          />
          {correction && (
            <div className="mt-3 p-4 rounded-xl bg-blue-50 border border-blue-200 animate-fadeUp">
              <p className="font-syne font-600 text-accent2 text-sm mb-1">Reference Correction</p>
              <p className="font-dm text-sm text-ink whitespace-pre-wrap">{correction}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
