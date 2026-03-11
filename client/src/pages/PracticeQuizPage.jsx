import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRegis } from '../context/RegisContext';
import TopBar from '../components/TopBar';
import ProgressBar from '../components/ProgressBar';
import TopicCard from '../components/TopicCard';
import MCQQuestion from '../components/QuestionTypes/MCQQuestion';
import TrueFalseQuestion from '../components/QuestionTypes/TrueFalseQuestion';
import NumericResponseQuestion from '../components/QuestionTypes/NumericResponseQuestion';
import api from '../hooks/useApi';
import { generateHint, generateExplanation } from '../utils/aiHints';

const TYPE_LABELS = {
  multiple_choice: 'MCQ',
  true_false: 'True / False',
  matching: 'Matching',
  open_ended: 'Open Ended',
  numeric_response: 'Numeric',
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

export default function PracticeQuizPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { generateCompletion } = useRegis();

  const {
    practiceSkill,
    practiceTopic,
    practiceQuizCode,
    mode = 'skill',
    generatedQuestions,
  } = location.state || {};

  const [questions, setQuestions] = useState(generatedQuestions || []);
  const [qIdx, setQIdx] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [attemptId, setAttemptId] = useState(null);
  const [loading, setLoading] = useState(!generatedQuestions);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Instant feedback state
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState(null);
  const [explanation, setExplanation] = useState('');
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  // Hint state
  const [showHint, setShowHint] = useState(false);
  const [hintText, setHintText] = useState('');
  const [loadingHint, setLoadingHint] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);

  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });
  const [adaptiveMessage, setAdaptiveMessage] = useState(null);
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [loadingNext, setLoadingNext] = useState(false);
  const qStartRef = useRef(Date.now());
  const nextClickRef = useRef(false);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    console.log('[PracticeQuizPage] useEffect triggered');
    console.log('[PracticeQuizPage] generatedQuestions:', generatedQuestions);
    console.log('[PracticeQuizPage] hasStartedRef.current:', hasStartedRef.current);
    if (generatedQuestions || hasStartedRef.current) {
      console.log('[PracticeQuizPage] Skipping generation - already have questions or started');
      return;
    }
    hasStartedRef.current = true;
    console.log('[PracticeQuizPage] Calling generatePracticeQuestions');
    generatePracticeQuestions();
  }, []);

  const generatePracticeQuestions = async () => {
    console.log('[PracticeQuizPage] ========== generatePracticeQuestions START ==========');
    setGenerating(true);
    try {
      console.log('[PracticeQuizPage] Reading student from localStorage...');
      const student = JSON.parse(localStorage.getItem('mathmind_student') || '{}');
      console.log('[PracticeQuizPage] Student:', student);
      
      if (!student?.id) {
        console.error('[PracticeQuizPage] ❌ No student ID found, redirecting to join');
        navigate('/student/join');
        return;
      }

      // Start practice session
      const practiceData = {
        student_id: student.id,
        mode: practiceQuizCode ? 'quiz_prep' : (practiceTopic ? 'topic' : 'skill'),
        skill: practiceSkill,
        topic: practiceTopic,
        quiz_code: practiceQuizCode,
        count: practiceQuizCode ? 10 : 5,
        difficulty_focus: 'adaptive',
      };
      console.log('[PracticeQuizPage] Practice data:', practiceData);
      console.log('[PracticeQuizPage] POST /api/practice/start');

      const { data } = await api.post('/api/practice/start', practiceData);
      console.log('[PracticeQuizPage] Practice session response:', data);
      setAttemptId(data.practice_session.attempt_id);

      // Generate questions using AI
      console.log('[PracticeQuizPage] Building question generation prompt...');
      const prompt = buildQuestionGenerationPrompt(data.practice_session);
      console.log('[PracticeQuizPage] Prompt length:', prompt.length);
      console.log('[PracticeQuizPage] Prompt preview:', prompt.substring(0, 300) + '...');
      
      console.log('[PracticeQuizPage] Calling generateCompletion (AI)...');
      const aiResponse = await generateCompletion(prompt);
      console.log('[PracticeQuizPage] AI response length:', aiResponse?.length);
      console.log('[PracticeQuizPage] AI response preview:', aiResponse?.substring(0, 300) + '...');

      // Parse AI response
      console.log('[PracticeQuizPage] Parsing AI response...');
      const parsedQuestions = parseAIQuestions(aiResponse);
      console.log('[PracticeQuizPage] Parsed questions count:', parsedQuestions.length);
      console.log('[PracticeQuizPage] First question preview:', parsedQuestions[0]);
      
      setQuestions(parsedQuestions);
      setLoading(false);
      console.log('[PracticeQuizPage] ========== generatePracticeQuestions SUCCESS ==========');
    } catch (err) {
      console.error('[PracticeQuizPage] ========== generatePracticeQuestions ERROR ==========');
      console.error('[PracticeQuizPage] Error type:', err.constructor.name);
      console.error('[PracticeQuizPage] Error message:', err.message);
      console.error('[PracticeQuizPage] Error stack:', err.stack);
      
      // Show error in UI - no fallback, AI required
      let errorMsg = 'Failed to generate questions. ';
      if (err.message.includes('credits') || err.message.includes('tokens')) {
        errorMsg = 'Insufficient OpenRouter credits. Please add credits at openrouter.ai/settings/credits';
      } else if (err.message.includes('API')) {
        errorMsg = 'OpenRouter API error. Check your API key in settings.';
      } else {
        errorMsg += err.message;
      }
      console.error('[PracticeQuizPage] Display error message:', errorMsg);
      setError(errorMsg);
      setLoading(false);
      console.error('[PracticeQuizPage] ========== generatePracticeQuestions ERROR END ==========');
    } finally {
      setGenerating(false);
    }
  };

  const buildQuestionGenerationPrompt = (session) => {
    const { plan, mode, skill, topic, question_count } = session;
    const dist = plan?.difficulty_distribution_count || { foundation: 2, core: 2, advanced: 1 };
    const mastery = plan?.mastery_overall || 50;

    let context = '';
    if (mode === 'quiz_prep') {
      context = `Student is preparing for an upcoming quiz on ${topic}.`;
    } else if (mode === 'topic') {
      context = `Student wants to practice the full topic of ${topic}.`;
    } else {
      context = `Student needs practice on the skill: ${skill}`;
      if (plan?.focus_skills?.length) {
        context += `\nFocus especially on these weaker areas: ${plan.focus_skills.join(', ')}`;
      }
    }

    // Determine starting difficulty based on mastery
    let difficultyStrategy = '';
    if (mastery < 50) {
      difficultyStrategy = 'Start with foundation questions to build confidence, then gradually increase to core.';
    } else if (mastery < 75) {
      difficultyStrategy = 'Mix foundation and core questions. Include 1 advanced challenge if they do well.';
    } else {
      difficultyStrategy = 'Focus on core and advanced questions. Student has strong understanding.';
    }

    return `You are generating an ADAPTIVE practice quiz for a Grade 7 math student.

${context}

Current mastery level: ${mastery}%

Generate exactly ${question_count || 5} questions with this EXACT difficulty distribution:
- Foundation: ${dist.foundation} questions (easier, basic concepts)
- Core: ${dist.core} questions (grade-level, standard problems)
- Advanced: ${dist.advanced} questions (challenging, complex applications)

${difficultyStrategy}

CRITICAL RULES:
1. Questions MUST progress in difficulty: start easier, get harder
2. First question should be foundation level to build confidence
3. If student gets questions right, later questions should be harder
4. Label EVERY question with exact difficulty: "foundation", "core", or "advanced"
5. Match the exact count distribution above

Question types to use: multiple_choice, true_false, numeric_response

Each question MUST include:
1. "question": The question text
2. "type": Question type (multiple_choice, true_false, or numeric_response)
3. "difficulty": MUST be exactly "foundation", "core", or "advanced"
4. "skill_tag": The specific skill being tested
5. "options": For MCQ only (4 options labeled A, B, C, D)
6. "answer": Correct answer (letter "A"/"B"/"C"/"D" for MCQ, number/value for others)
7. "explanation": Detailed step-by-step explanation showing the work
8. "hint": A helpful hint that guides without giving the answer

Return ONLY a valid JSON array. No markdown, no code blocks, no extra text.

Example format:
[
  {
    "question": "What is 2/3 + 1/6?",
    "type": "multiple_choice",
    "difficulty": "foundation",
    "skill_tag": "Adding Fractions",
    "options": ["A. 5/6", "B. 1/2", "C. 3/4", "D. 2/3"],
    "answer": "A",
    "explanation": "Step 1: Find common denominator (6). Step 2: Convert 2/3 to 4/6. Step 3: Add 4/6 + 1/6 = 5/6.",
    "hint": "Find a common denominator first. What is the LCM of 3 and 6?"
  },
  {
    "question": "Simplify: 3/4 - 1/8",
    "type": "multiple_choice",
    "difficulty": "core",
    "skill_tag": "Subtracting Fractions",
    "options": ["A. 5/8", "B. 1/2", "C. 7/8", "D. 2/8"],
    "answer": "A",
    "explanation": "Step 1: Common denominator is 8. Step 2: Convert 3/4 to 6/8. Step 3: 6/8 - 1/8 = 5/8.",
    "hint": "Convert the first fraction so both have denominator 8."
  }
]`;
  };

  const parseAIQuestions = (aiResponse) => {
    console.log('[PracticeQuizPage] ========== parseAIQuestions START ==========');
    console.log('[PracticeQuizPage] Raw AI response length:', aiResponse?.length);
    console.log('[PracticeQuizPage] Raw AI response preview:', aiResponse?.substring(0, 500) + '...');
    
    try {
      // FIXED: Clean markdown code blocks from AI response
      let cleanedResponse = aiResponse.trim();
      console.log('[PracticeQuizPage] Cleaned response length:', cleanedResponse.length);

      // Remove markdown code blocks (```json ... ```)
      const beforeMarkdown = cleanedResponse;
      cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      if (beforeMarkdown !== cleanedResponse) {
        console.log('[PracticeQuizPage] Removed markdown code blocks');
      }

      // Try to extract JSON array from response
      const jsonMatch = cleanedResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        console.log('[PracticeQuizPage] Found JSON array match, length:', jsonMatch[0].length);
        console.log('[PracticeQuizPage] JSON preview:', jsonMatch[0].substring(0, 300) + '...');
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('[PracticeQuizPage] Parsed', parsed.length, 'questions');
        console.log('[PracticeQuizPage] ========== parseAIQuestions SUCCESS ==========');
        return parsed;
      }
      
      console.log('[PracticeQuizPage] No JSON array found, trying direct parse...');
      const parsed = JSON.parse(cleanedResponse);
      console.log('[PracticeQuizPage] ========== parseAIQuestions SUCCESS (direct parse) ==========');
      return parsed;
    } catch (err) {
      console.error('[PracticeQuizPage] ========== parseAIQuestions ERROR ==========');
      console.error('[PracticeQuizPage] Parse error:', err.message);
      console.error('[PracticeQuizPage] Error stack:', err.stack);
      console.error('[PracticeQuizPage] Raw AI response (first 500 chars):', aiResponse?.substring(0, 500));
      console.error('[PracticeQuizPage] Raw AI response (last 500 chars):', aiResponse?.substring(aiResponse?.length - 500));
      console.error('[PracticeQuizPage] ========== parseAIQuestions ERROR END ==========');
      
      // Fallback to demo questions
      console.warn('[PracticeQuizPage] ⚠️ Using fallback question due to parse error');
      return [
        {
          question: `Practice: ${practiceSkill || practiceTopic || 'Math Skill'}`,
          type: 'multiple_choice',
          difficulty: 'core',
          skill_tag: practiceSkill || practiceTopic || 'Practice',
          options: ['A. 10', 'B. 20', 'C. 30', 'D. 40'],
          answer: 'B',
          explanation: 'This is a practice question.',
          hint: 'Think carefully about the problem.',
        },
      ];
    }
  };

  useEffect(() => {
    qStartRef.current = Date.now();
    setAnswered(false);
    setShowFeedback(false);
    setFeedbackData(null);
    setExplanation('');
    setShowHint(false);
    setHintText('');
  }, [qIdx]);

  const handleGetHint = async () => {
    if (!questions[qIdx] || loadingHint) return;

    setLoadingHint(true);
    setShowHint(true);

    try {
      const q = questions[qIdx];
      // Use AI-generated hint if available, otherwise generate
      if (q.hint) {
        setHintText(q.hint);
      } else {
        const hint = await generateHint({
          questionText: q.question,
          questionType: q.type,
          skillTag: q.skill_tag || 'Practice',
          difficulty: q.difficulty,
          generateCompletion,
        });
        setHintText(hint);
      }
      setHintsUsed(prev => prev + 1);
    } catch (err) {
      console.error('Hint generation failed:', err);
      setHintText('Try breaking down the question. What information do you have?');
    } finally {
      setLoadingHint(false);
    }
  };

  const handleAnswer = async ({ isCorrect, studentAnswer, correctAnswer }) => {
    const timeTaken = Math.round((Date.now() - qStartRef.current) / 1000);
    const q = questions[qIdx];

    const entry = {
      q_index: qIdx,
      q_type: q.type,
      skill_tag: q.skill_tag || 'Practice',
      difficulty: normalizeDifficulty(q.difficulty),
      question_text: q.question,
      student_answer: studentAnswer,
      correct_answer: correctAnswer,
      is_correct: isCorrect ? 1 : 0,
      time_taken_s: timeTaken,
    };

    setAnswers(prev => {
      const updated = [...prev];
      updated[qIdx] = entry;
      return updated;
    });

    setAnswered(true);
    setShowFeedback(true);
    setFeedbackData({ isCorrect, studentAnswer, correctAnswer });

    // Update session stats and adaptive tracking
    const newCorrect = isCorrect ? 1 : 0;
    setSessionStats(prev => ({
      correct: prev.correct + newCorrect,
      total: prev.total + 1,
    }));

    // Adaptive difficulty tracking
    if (isCorrect) {
      const newConsecutive = consecutiveCorrect + 1;
      setConsecutiveCorrect(newConsecutive);

      // Show encouragement based on performance
      if (newConsecutive >= 3) {
        setAdaptiveMessage({
          type: 'excellent',
          text: '🔥 You\'re on fire! Ready for a challenge?',
        });
      } else if (newConsecutive >= 2) {
        setAdaptiveMessage({
          type: 'great',
          text: '💪 Great work! Keep it up!',
        });
      }
    } else {
      setConsecutiveCorrect(0);
      setAdaptiveMessage({
        type: 'encourage',
        text: '🌱 Don\'t worry! Every mistake helps you learn.',
      });
    }

    // Submit to backend for tracking
    if (attemptId) {
      try {
        await api.post('/api/practice/submit', {
          attempt_id: attemptId,
          ...entry,
        });
      } catch (err) {
        console.error('Failed to submit practice answer:', err);
      }
    }

    // Generate explanation in background (non-blocking)
    // Don't await - let it run asynchronously so user can continue
    if (!isCorrect || !q.explanation) {
      setLoadingExplanation(true);
      generateExplanation({
        question: q,
        studentAnswer,
        correctAnswer,
        isCorrect,
        generateCompletion,
      })
        .then(setExplanation)
        .catch((err) => {
          console.error('Explanation generation failed:', err);
          setExplanation(q.explanation || 'Review the concept and try similar problems.');
        })
        .finally(() => {
          setLoadingExplanation(false);
        });
    } else {
      setExplanation(q.explanation);
    }
  };

  const handleNext = async () => {
    if (nextClickRef.current || loadingNext) return;
    nextClickRef.current = true;
    setLoadingNext(true);

    try {
      if (qIdx < questions.length - 1) {
        setQIdx(i => i + 1);
      } else {
        await completePractice();
      }
    } finally {
      setLoadingNext(false);
      nextClickRef.current = false;
    }
  };

  const completePractice = async () => {
    if (attemptId) {
      try {
        await api.post('/api/practice/complete', { attempt_id: attemptId });
      } catch (err) {
        console.error('Failed to complete practice:', err);
      }
    }
    navigate('/student/practice/results', {
      state: {
        answers,
        questions,
        mode,
        skill: practiceSkill,
        topic: practiceTopic,
        quizCode: practiceQuizCode,
      },
    });
  };

  if (loading || generating) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center animate-fadeUp">
          <div className="text-6xl mb-4 animate-bounce">🧠</div>
          <h2 className="font-syne font-700 text-xl text-ink mb-2">
            {generating ? 'Generating Practice Questions...' : 'Loading...'}
          </h2>
          <p className="font-dm text-sm text-muted">
            {practiceQuizCode
              ? `Preparing quiz for ${practiceQuizCode}`
              : practiceTopic
                ? `Practicing ${practiceTopic}`
                : `Practicing ${practiceSkill}`}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-5">
        <div className="max-w-md w-full text-center animate-fadeUp">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="font-syne font-700 text-xl text-ink mb-2">Could Not Generate Questions</h2>
          <p className="font-dm text-sm text-muted mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/student/practice')}
              className="px-6 py-3 rounded-xl bg-ink text-paper font-syne font-700 text-sm hover:bg-ink/90 active:scale-[0.98] transition-all"
            >
              Back to Practice
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 rounded-xl border-2 border-border bg-card text-ink font-syne font-700 text-sm hover:border-accent/50 active:scale-[0.98] transition-all"
            >
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!questions.length) {
    navigate('/student/practice');
    return null;
  }

  const q = questions[qIdx];
  const isLast = qIdx === questions.length - 1;
  const qDifficulty = normalizeDifficulty(q?.difficulty);

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <TopBar
        title={`Practice • Q${qIdx + 1}/${questions.length}`}
        role="student"
        showBack
        onBack={() => navigate('/student/practice')}
      />

      <div className="sticky top-[57px] z-30 bg-paper/90 backdrop-blur-md px-4 sm:px-5 py-3 border-b border-border shadow-sm">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <TopicCard
              chapter={practiceTopic || practiceSkill}
              subtopics={q.skill_tag ? [q.skill_tag] : []}
              compact={true}
            />
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-syne font-600 text-[10px] sm:text-[9px] text-accent2 bg-accent2/10 px-2 py-0.5 rounded-md uppercase tracking-wider whitespace-nowrap border border-accent2/20">
              {TYPE_LABELS[q.type] || q.type}
            </span>
            <span className={`font-syne font-700 text-[10px] sm:text-[9px] px-2 py-0.5 rounded-md uppercase tracking-wider whitespace-nowrap border ${qDifficulty === 'advanced'
              ? 'text-accent bg-accent/10 border-accent/20'
              : qDifficulty === 'foundation'
                ? 'text-ink bg-ink/10 border-ink/20'
                : 'text-accent2 bg-accent2/10 border-accent2/20'
              }`}>
              {DIFFICULTY_LABELS[qDifficulty]}
            </span>
          </div>
        </div>

        <ProgressBar current={qIdx + (answered ? 1 : 0)} total={questions.length} />

        {/* Session Progress */}
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="font-dm text-muted">
            Correct: <span className="font-700 text-correct">{sessionStats.correct}</span> / {sessionStats.total}
          </span>
          <span className="font-dm text-muted">
            Accuracy: <span className="font-700 text-ink">
              {sessionStats.total > 0 ? Math.round((sessionStats.correct / sessionStats.total) * 100) : 0}%
            </span>
          </span>
        </div>
      </div>

      <div className="flex-1 max-w-[480px] mx-auto w-full px-4 sm:px-5 py-4 sm:py-6">
        {/* Adaptive Feedback Message */}
        {adaptiveMessage && answered && (
          <div className={`mb-4 p-4 rounded-xl border-2 animate-fadeUp ${adaptiveMessage.type === 'excellent'
            ? 'bg-gradient-to-r from-orange-50 to-yellow-50 border-orange-300'
            : adaptiveMessage.type === 'great'
              ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300'
              : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300'
            }`}>
            <p className="font-syne font-700 text-sm text-center">
              {adaptiveMessage.text}
            </p>
          </div>
        )}

        {/* Difficulty Progress Indicator */}
        <div className="mb-4 flex items-center justify-between text-xs">
          <span className="font-dm text-muted">Difficulty Progression:</span>
          <div className="flex items-center gap-1">
            {questions.map((q, i) => {
              const diff = normalizeDifficulty(q.difficulty);
              const bgColor = diff === 'advanced'
                ? 'bg-accent'
                : diff === 'core'
                  ? 'bg-accent2'
                  : 'bg-border';
              const isActive = i === qIdx;
              const isAnswered = i < qIdx;

              return (
                <div
                  key={i}
                  className={`w-6 h-2 rounded-full ${bgColor} ${isActive ? 'ring-2 ring-ink' : ''
                    } ${isAnswered ? 'opacity-50' : ''}`}
                  title={`${diff} - Question ${i + 1}`}
                />
              );
            })}
          </div>
        </div>

        {/* Hint Panel */}
        {showHint && (
          <div className="mb-4 p-4 rounded-xl border-2 border-accent/30 bg-accent/5 animate-fadeUp">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">💡</span>
                <span className="font-syne font-700 text-sm text-accent">Hint</span>
              </div>
              <button onClick={() => setShowHint(false)} className="text-muted hover:text-ink transition-colors">
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

        {/* Render question based on type */}
        {q.type === 'multiple_choice' && (
          <MCQQuestion key={qIdx} question={q} onAnswer={handleAnswer} disabled={false} />
        )}
        {q.type === 'true_false' && (
          <TrueFalseQuestion key={qIdx} question={q} onAnswer={handleAnswer} disabled={false} />
        )}
        {q.type === 'numeric_response' && (
          <NumericResponseQuestion key={qIdx} question={q} onAnswer={handleAnswer} disabled={false} />
        )}

        {/* Instant Feedback Panel */}
        {showFeedback && answered && (
          <div className={`mt-4 p-4 rounded-xl border-2 animate-fadeUp ${feedbackData?.isCorrect
            ? 'border-correct bg-green-50'
            : 'border-wrong bg-red-50'
            }`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{feedbackData?.isCorrect ? '✅' : '❌'}</span>
              <span className={`font-syne font-700 text-base ${feedbackData?.isCorrect ? 'text-correct' : 'text-wrong'
                }`}>
                {feedbackData?.isCorrect ? 'Correct!' : 'Not quite right'}
              </span>
            </div>

            {loadingExplanation ? (
              <p className="font-dm text-sm text-muted animate-pulse">Generating explanation...</p>
            ) : (
              <div className="space-y-2">
                <p className="font-dm text-sm text-ink">
                  <strong>Answer:</strong> {feedbackData?.correctAnswer}
                </p>
                <div className="pt-2 border-t border-border/50">
                  <p className="font-syne font-700 text-sm text-ink mb-1">Explanation:</p>
                  <p className="font-dm text-sm text-muted whitespace-pre-line">{explanation}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-paper border-t border-border px-4 sm:px-5 py-4 max-w-[480px] mx-auto w-full">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={handleGetHint}
            disabled={answered || loadingHint}
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
              {isLast ? 'Finishing...' : 'Loading Next...'}
            </>
          ) : (
            <>{isLast ? 'Finish Practice →' : 'Next Question →'}</>
          )}
        </button>
      </div>
    </div>
  );
}
