import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuiz } from '../context/QuizContext';
import { useVisibilityGuard } from '../hooks/useVisibilityGuard';
import { useRegis } from '../context/RegisContext';
import { generateHint } from '../utils/aiHints';
import { io } from 'socket.io-client';
import TopBar from '../components/TopBar';
import ProgressBar from '../components/ProgressBar';
import TopicCard from '../components/TopicCard';
import MCQQuestion from '../components/QuestionTypes/MCQQuestion';
import TrueFalseQuestion from '../components/QuestionTypes/TrueFalseQuestion';
import MatchingQuestion from '../components/QuestionTypes/MatchingQuestion';
import OpenEndedQuestion from '../components/QuestionTypes/OpenEndedQuestion';
import MultiSelectQuestion from '../components/QuestionTypes/MultiSelectQuestion';
import NumericResponseQuestion from '../components/QuestionTypes/NumericResponseQuestion';
import OrderingQuestion from '../components/QuestionTypes/OrderingQuestion';
import FillBlankQuestion from '../components/QuestionTypes/FillBlankQuestion';
import ErrorAnalysisQuestion from '../components/QuestionTypes/ErrorAnalysisQuestion';
import api from '../hooks/useApi';

const TYPE_LABELS = {
  multiple_choice: 'MCQ',
  true_false: 'True / False',
  matching: 'Matching',
  open_ended: 'Open Ended',
  multi_select: 'Multi Select',
  numeric_response: 'Numeric',
  ordering: 'Ordering',
  fill_blank: 'Fill Blank',
  error_analysis: 'Error Analysis',
};

const DIFFICULTY_LABELS = {
  foundation: 'Foundation',
  core: 'Core',
  advanced: 'Advanced',
};

function normalizeDifficulty(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'foundation' || raw === 'easy') return 'foundation';
  if (raw === 'advanced' || raw === 'hard') return 'advanced';
  return 'core';
}

export default function QuizPage() {
  const navigate = useNavigate();
  const { generateCompletion } = useRegis();
  const {
    currentQuestions,
    studentName,
    attemptId,
    quizCode,
    setScore,
    setAnswers: setCtxAnswers,
    setSubmissionRewards,
    timeLimit,
    chapter,
    subtopics,
    quizConfig
  } = useQuiz();

  const [qIdx, setQIdx] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [qKey, setQKey] = useState(0);
  const [showViolation, setShowViolation] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [forceSubmitted, setForceSubmitted] = useState(false);
  const [socket, setSocket] = useState(null);

  const [timeLeft, setTimeLeft] = useState(timeLimit ? timeLimit * 60 : null);
  const [loadingNext, setLoadingNext] = useState(false);
  const nextClickRef = useRef(false);

  // Setup socket connection for live tracking
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const newSocket = io(apiBase, {
      transports: ['websocket', 'polling'],
    });
    
    newSocket.on('connect', () => {
      console.log('[QuizPage] Socket connected');
      if (quizCode) {
        newSocket.emit('join_quiz', quizCode);
        console.log('[QuizPage] Joined quiz room:', quizCode);
      }
    });
    
    setSocket(newSocket);
    
    return () => {
      newSocket.disconnect();
    };
  }, [quizCode]);
  
  // Mid-quiz adaptive difficulty state
  const [adaptiveAdjustment, setAdaptiveAdjustment] = useState(null);
  const [consecutiveWrong, setConsecutiveWrong] = useState(0);
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  
  // Hint system state
  const [showHint, setShowHint] = useState(false);
  const [hintText, setHintText] = useState('');
  const [loadingHint, setLoadingHint] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);

  const qStartRef = useRef(Date.now());
  const startRef = useRef(Date.now());
  const pendingViolation = useRef(null);

  // Timer effect
  useEffect(() => {
    if (timeLeft === null || forceSubmitted) return;
    if (timeLeft <= 0) {
      submitQuiz(answers, 'time_expired');
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, answers, forceSubmitted]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const submitQuiz = useCallback(async (currentAnswers, status = 'completed') => {
    const correct = currentAnswers.filter(a => a.is_correct === 1).length;
    const total = currentQuestions.length;
    const pct = Math.round((correct / total) * 100);
    const timeSec = Math.round((Date.now() - startRef.current) / 1000);

    setScore(correct);
    setCtxAnswers(Object.fromEntries(currentAnswers.map((a, i) => [
      i,
      a.is_correct === 1 ? true : a.is_correct === 0 ? false : null,
    ])));

    let rewards = null;
    if (attemptId) {
      try {
        const res = await api.patch(`/api/attempt/${attemptId}/complete`, {
          score: correct,
          total,
          percentage: pct,
          time_taken_s: timeSec,
          status,
          answers: currentAnswers,
        });
        rewards = res.data?.rewards || null;
        
        // Emit completion to teacher (live tracking)
        if (socket) {
          socket.emit('student_completed', {
            quiz_code: quizCode,
            attempt_id: attemptId,
            student_name: studentName,
            score: correct,
            total,
            percentage: pct,
            time_taken: timeSec,
          });
        }
      } catch { }
    }
    setSubmissionRewards(rewards);

    navigate('/results');
  }, [currentQuestions, attemptId, navigate, setScore, setCtxAnswers, setSubmissionRewards, socket, quizCode, studentName]);

  const handleViolation = useCallback((count, details) => {
    setViolationCount(count);
    setShowViolation(true);
    pendingViolation.current = details;

    if (attemptId) {
      api.post('/api/violations', {
        attempt_id: attemptId,
        quiz_code: quizCode,
        student_name: studentName,
        violation_num: count,
        left_at: details.leftAt,
        returned_at: details.returnedAt,
        away_seconds: details.awaySeconds,
      }).catch(() => { });
      
      // Emit violation to teacher (live tracking)
      if (socket) {
        socket.emit('student_violation', {
          quiz_code: quizCode,
          attempt_id: attemptId,
          student_name: studentName,
          violation_count: count,
          left_at: details.leftAt,
          returned_at: details.returnedAt,
          away_seconds: details.awaySeconds,
        });
      }
    }
  }, [attemptId, quizCode, studentName, socket]);

  const handleExceed = useCallback(() => {
    setForceSubmitted(true);
    submitQuiz(answers, 'force_submitted');
  }, [answers, submitQuiz]);

  useVisibilityGuard({ onViolation: handleViolation, maxViolations: 3, onExceed: handleExceed });

  useEffect(() => {
    qStartRef.current = Date.now();
    setAnswered(false);
    setQKey(k => k + 1);
    setShowHint(false);
    setHintText('');
  }, [qIdx]);

  // Check for adaptive difficulty adjustment after each answer
  useEffect(() => {
    if (answers.length === 0 || !answered) return;

    const lastAnswer = answers[qIdx];
    if (!lastAnswer || lastAnswer.is_correct === null) return;

    // Get adaptive level from quiz config
    const currentAdaptiveLevel = quizConfig?.adaptive_level || 'max';

    // Calculate new consecutive counts based on current answer
    const newConsecutiveCorrect = lastAnswer.is_correct === 1 ? (consecutiveCorrect + 1) : 0;
    const newConsecutiveWrong = lastAnswer.is_correct === 1 ? 0 : (consecutiveWrong + 1);

    // Update consecutive counters
    if (lastAnswer.is_correct === 1) {
      setConsecutiveCorrect(newConsecutiveCorrect);
      setConsecutiveWrong(0);
    } else {
      setConsecutiveWrong(newConsecutiveWrong);
      setConsecutiveCorrect(0);
    }

    // Trigger adaptive adjustment if needed (based on adaptive level)
    const remainingQuestions = currentQuestions.length - qIdx - 1;
    if (remainingQuestions <= 0) return;

    let shouldAdjust = false;
    let adjustType = null;

    if (currentAdaptiveLevel === 'max') {
      // Level 3: Most responsive (2 wrong or 3 correct)
      if (newConsecutiveWrong >= 2) {
        shouldAdjust = true;
        adjustType = 'easier';
      } else if (newConsecutiveCorrect >= 3) {
        shouldAdjust = true;
        adjustType = 'harder';
      }
    } else if (currentAdaptiveLevel === 'medium') {
      // Level 2: Moderate (3 wrong or 4 correct)
      if (newConsecutiveWrong >= 3) {
        shouldAdjust = true;
        adjustType = 'easier';
      } else if (newConsecutiveCorrect >= 4) {
        shouldAdjust = true;
        adjustType = 'harder';
      }
    } else if (currentAdaptiveLevel === 'light') {
      // Level 1: Messages only (3 wrong or 5 correct) - no difficulty change
      if (newConsecutiveWrong >= 3 || newConsecutiveCorrect >= 5) {
        shouldAdjust = true;
        adjustType = 'message';  // Special type - message only
      }
    }
    // Level 0 (none): No adjustment

    // Set adaptive adjustment state
    if (shouldAdjust) {
      if (adjustType === 'message') {
        setAdaptiveAdjustment({
          type: 'message',
          message: newConsecutiveWrong >= 3 
            ? 'Take your time. Review each question carefully.'
            : 'Excellent work! Keep it up!',
          adjustDifficulty: null,  // No difficulty change for light adaptive
        });
      } else if (adjustType === 'easier') {
        setAdaptiveAdjustment({
          type: 'easier',
          message: currentAdaptiveLevel === 'medium'
            ? "Let's review the basics. Next question will be simpler."
            : "Let's focus on the fundamentals. Next question will be adjusted.",
          adjustDifficulty: 'foundation',
        });
      } else if (adjustType === 'harder') {
        setAdaptiveAdjustment({
          type: 'harder',
          message: currentAdaptiveLevel === 'medium'
            ? "Great job! Ready for a challenge?"
            : "You're crushing it! Next question will be more challenging.",
          adjustDifficulty: 'advanced',
        });
      }
    } else {
      setAdaptiveAdjustment(null);
    }
  }, [answered, answers, qIdx, currentQuestions.length, quizConfig?.adaptive_level]);

  if (!currentQuestions.length) {
    navigate('/student/join');
    return null;
  }

  const q = currentQuestions[qIdx];
  const isLast = qIdx === currentQuestions.length - 1;
  const qDifficulty = normalizeDifficulty(q?.difficulty);
  const qSkillTag = String(q?.skill_tag || '').trim();

  const handleGetHint = async () => {
    if (!q || loadingHint) return;
    
    setLoadingHint(true);
    setShowHint(true);
    
    try {
      const hint = await generateHint({
        questionText: q.question,
        questionType: q.type,
        skillTag: qSkillTag || chapter || quizConfig?.topic || 'General',
        difficulty: qDifficulty,
        studentAnswer: null,
        isWrong: false,
        generateCompletion,
      });
      setHintText(hint);
      setHintsUsed(prev => prev + 1);
    } catch (err) {
      console.error('Hint generation failed:', err);
      setHintText('Try breaking down the question. What information do you have? What are you looking for?');
    } finally {
      setLoadingHint(false);
    }
  };

  const handleAnswer = ({ isCorrect, studentAnswer, correctAnswer }) => {
    const timeTaken = Math.round((Date.now() - qStartRef.current) / 1000);
    const entry = {
      q_index: qIdx,
      q_type: q.type,
      skill_tag: qSkillTag || chapter || quizConfig?.topic || '',
      difficulty: qDifficulty,
      question_text: q.question,
      student_answer: studentAnswer,
      correct_answer: correctAnswer,
      is_correct: isCorrect === null ? null : isCorrect ? 1 : 0,
      time_taken_s: timeTaken,
    };
    setAnswers(prev => {
      const updated = [...prev];
      updated[qIdx] = entry;
      return updated;
    });
    setAnswered(true);
    
    // Emit progress to teacher (live tracking)
    if (socket && attemptId) {
      socket.emit('student_progress', {
        quiz_code: quizCode,
        attempt_id: attemptId,
        student_name: studentName,
        question_index: qIdx,
        time_on_question: timeTaken,
      });
    }
  };

  const handleNext = async () => {
    if (loadingNext || !answered) return;
    nextClickRef.current = true;
    setLoadingNext(true);

    try {
      if (isLast) {
        await submitQuiz(answers);
      } else {
        // Get adaptive level from quiz config (default to 'max' if not set)
        const currentAdaptiveLevel = quizConfig?.adaptive_level || 'max';

        // Check if we need to generate an adaptive next question
        if (adaptiveAdjustment?.adjustDifficulty && currentAdaptiveLevel !== 'none') {
          try {
            // Call backend to get adaptive prompt
            const response = await api.post('/api/practice/next-question', {
              attempt_id: attemptId,
              previous_correct: answers[qIdx]?.is_correct === 1,
              consecutive_wrong: consecutiveWrong,
              consecutive_correct: consecutiveCorrect,
              current_difficulty: qDifficulty,
              skill_tag: qSkillTag || chapter || quizConfig?.topic,
              topic: chapter || quizConfig?.topic,
              chapter: chapter,
              question_types: quizConfig?.question_types,
              adaptive_level: currentAdaptiveLevel,
            });

            const { next_difficulty, prompt, adjustment_message, should_generate } = response.data;

            // Only generate new question if should_generate is true
            if (should_generate && prompt) {
              // Generate next question using AI
              const aiResponse = await generateCompletion(prompt);

              // Parse the AI response (remove markdown if present)
              let cleanedResponse = aiResponse.trim();
              cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');

              const nextQuestion = JSON.parse(cleanedResponse);

              // Update the next question in the quiz
              const updatedQuestions = [...currentQuestions];
              updatedQuestions[qIdx + 1] = {
                ...nextQuestion,
                difficulty: next_difficulty,
                skill_tag: response.data.context?.skill || qSkillTag,
              };
              setCurrentQuestions(updatedQuestions);

              console.log(`[Adaptive ${currentAdaptiveLevel.toUpperCase()}] ${adjustment_message} Adjusted to ${next_difficulty} difficulty`);
            } else if (adjustment_message) {
              // Light adaptive - just show message
              console.log(`[Adaptive ${currentAdaptiveLevel.toUpperCase()}] ${adjustment_message}`);
            }
          } catch (err) {
            console.error('[Adaptive] Failed to generate next question:', err);
            // Continue with existing question if adaptive fails
          }
        }

        setQIdx(i => i + 1);
      }
    } finally {
      setLoadingNext(false);
      nextClickRef.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <TopBar title={`Question ${qIdx + 1} of ${currentQuestions.length}`} role="student" />

      <div className="sticky top-[57px] z-30 bg-paper/90 backdrop-blur-md px-4 sm:px-5 py-3 border-b border-border shadow-sm">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <TopicCard chapter={chapter || quizConfig?.topic} subtopics={subtopics} compact={true} />
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-syne font-600 text-[10px] sm:text-[9px] text-accent2 bg-accent2/10 px-2 py-0.5 rounded-md uppercase tracking-wider whitespace-nowrap border border-accent2/20">
              {TYPE_LABELS[q.type] || q.type}
            </span>
            <span className={`font-syne font-700 text-[10px] sm:text-[9px] px-2 py-0.5 rounded-md uppercase tracking-wider whitespace-nowrap border ${
              qDifficulty === 'advanced'
                ? 'text-accent bg-accent/10 border-accent/20'
                : qDifficulty === 'foundation'
                  ? 'text-ink bg-ink/10 border-ink/20'
                  : 'text-accent2 bg-accent2/10 border-accent2/20'
            }`}>
              {DIFFICULTY_LABELS[qDifficulty]}
            </span>
            <span className="font-dm text-[11px] sm:text-[10px] text-muted font-600 uppercase tracking-tighter tabular-nums">Q{qIdx + 1} of {currentQuestions.length}</span>
          </div>
        </div>

        {timeLeft !== null && (
          <div className="flex items-center justify-between mb-2">
            <span className="font-dm text-xs text-muted">Time Remaining</span>
            <span className={`font-syne font-700 text-sm ${timeLeft < 30 ? 'text-wrong animate-pulse' : 'text-ink'}`}>
              ⏱️ {formatTime(timeLeft)}
            </span>
          </div>
        )}

        <ProgressBar current={qIdx + (answered ? 1 : 0)} total={currentQuestions.length} />
      </div>

      <div className="flex-1 max-w-[480px] mx-auto w-full px-4 sm:px-5 py-4 sm:py-6">
        {/* Adaptive Adjustment Notification */}
        {adaptiveAdjustment && answered && (
          <div className={`mb-4 p-4 rounded-xl border-2 animate-fadeUp ${
            adaptiveAdjustment.type === 'easier'
              ? 'bg-blue-50 border-blue-200'
              : 'bg-purple-50 border-purple-200'
          }`}>
            <p className={`font-syne font-700 text-sm ${
              adaptiveAdjustment.type === 'easier' ? 'text-blue-700' : 'text-purple-700'
            }`}>
              {adaptiveAdjustment.message}
            </p>
          </div>
        )}

        {/* Hint Panel */}
        {showHint && (
          <div className="mb-4 p-4 rounded-xl border-2 border-accent/30 bg-accent/5 animate-fadeUp">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">💡</span>
                <span className="font-syne font-700 text-sm text-accent">Hint</span>
              </div>
              <button
                onClick={() => setShowHint(false)}
                className="text-muted hover:text-ink transition-colors"
              >
                ✕
              </button>
            </div>
            {loadingHint ? (
              <p className="font-dm text-sm text-muted animate-pulse">Generating hint...</p>
            ) : (
              <p className="font-dm text-sm text-ink">{hintText}</p>
            )}
          </div>
        )}

        {q.type === 'multiple_choice' && (
          <MCQQuestion key={qKey} question={q} onAnswer={handleAnswer} disabled={forceSubmitted} />
        )}
        {q.type === 'true_false' && (
          <TrueFalseQuestion key={qKey} question={q} onAnswer={handleAnswer} disabled={forceSubmitted} />
        )}
        {q.type === 'matching' && (
          <MatchingQuestion key={qKey} question={q} onAnswer={handleAnswer} disabled={forceSubmitted} />
        )}
        {q.type === 'open_ended' && (
          <OpenEndedQuestion key={qKey} question={q} onAnswer={handleAnswer} disabled={forceSubmitted} />
        )}
        {q.type === 'multi_select' && (
          <MultiSelectQuestion key={qKey} question={q} onAnswer={handleAnswer} disabled={forceSubmitted} />
        )}
        {q.type === 'numeric_response' && (
          <NumericResponseQuestion key={qKey} question={q} onAnswer={handleAnswer} disabled={forceSubmitted} />
        )}
        {q.type === 'ordering' && (
          <OrderingQuestion key={qKey} question={q} onAnswer={handleAnswer} disabled={forceSubmitted} />
        )}
        {q.type === 'fill_blank' && (
          <FillBlankQuestion key={qKey} question={q} onAnswer={handleAnswer} disabled={forceSubmitted} />
        )}
        {q.type === 'error_analysis' && (
          <ErrorAnalysisQuestion key={qKey} question={q} onAnswer={handleAnswer} disabled={forceSubmitted} />
        )}
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-paper border-t border-border px-4 sm:px-5 py-4 max-w-[480px] mx-auto w-full">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={handleGetHint}
            disabled={answered || loadingHint || forceSubmitted}
            className="flex-1 py-3 rounded-xl border-2 border-accent/30 bg-accent/5 text-accent font-syne font-700 text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span>💡</span>
            {loadingHint ? 'Generating...' : hintsUsed === 0 ? 'Get Hint' : `Hint (${hintsUsed})`}
          </button>
        </div>
        <button
          onClick={handleNext}
          disabled={!answered || loadingNext}
          className="w-full py-4 rounded-xl bg-ink text-paper font-syne font-700 text-base disabled:opacity-30 disabled:cursor-not-allowed hover:bg-ink/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {loadingNext ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {isLast ? 'Submitting...' : 'Generating Next...'}
            </>
          ) : (
            <>{isLast ? 'See Results →' : 'Next →'}</>
          )}
        </button>
      </div>

      {/* Violation overlay */}
      {showViolation && !forceSubmitted && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center px-5">
          <div className="bg-card rounded-2xl p-6 max-w-sm w-full text-center animate-fadeUp">
            <p className="text-4xl mb-3">⚠️</p>
            <h3 className="font-syne font-700 text-xl text-ink mb-2">You left the exam</h3>
            <p className="font-dm text-muted text-sm mb-4">
              This has been recorded. <span className="font-500 text-wrong">{violationCount} of 3</span> warnings used.
            </p>
            <button
              onClick={() => setShowViolation(false)}
              className="w-full py-3 rounded-xl bg-ink text-paper font-syne font-600 text-sm hover:bg-ink/90 active:scale-[0.98] transition-all"
            >
              Continue Quiz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
