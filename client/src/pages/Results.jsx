import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuiz } from '../context/QuizContext';
import { useRegis } from '../context/RegisContext';
import { useStudent } from '../context/StudentContext';
import TopBar from '../components/TopBar';
import TutorExplanation from '../components/TutorExplanation';
import TopicCard from '../components/TopicCard';

const BADGE_ICON_MAP = {
  seed: '🌱',
  flame: '🔥',
  fire: '🚀',
  crown: '👑',
  map: '🧭',
  trophy: '🏆',
  star: '⭐',
  rocket: '🚀',
  medal: '🥇',
  badge: '🎖️',
};

function safeJsonParse(value, fallback = null) {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatCorrectAnswer(question) {
  if (!question || typeof question !== 'object') return '';

  if (question.type === 'multiple_choice') {
    return String(question.answer || '').trim();
  }

  if (question.type === 'multi_select') {
    const answers = Array.isArray(question.correct_answers)
      ? question.correct_answers
      : String(question.answer || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    return answers.length ? answers.join(', ') : '';
  }

  if (question.type === 'true_false') {
    return String(question.answer || '').trim();
  }

  if (question.type === 'matching') {
    const pairs = Array.isArray(question.pairs) ? question.pairs : [];
    return pairs.map((pair) => `${pair.left} -> ${pair.right}`).join('; ');
  }

  if (question.type === 'numeric_response') {
    const values = Array.isArray(question.answers)
      ? question.answers
      : [question.answer].filter((value) => value !== undefined && value !== null && String(value).trim() !== '');
    const tolerance = Number(question.tolerance);
    const tolText = Number.isFinite(tolerance) && tolerance > 0 ? ` (+/- ${tolerance})` : '';
    const unit = String(question.unit || '').trim();
    const unitText = unit ? ` ${unit}` : '';
    return values.length ? `${values.join(' or ')}${tolText}${unitText}` : '';
  }

  if (question.type === 'ordering') {
    const order = Array.isArray(question.correct_order)
      ? question.correct_order
      : Array.isArray(question.answer)
        ? question.answer
        : safeJsonParse(question.answer, []);
    return Array.isArray(order) ? order.join(' -> ') : '';
  }

  if (question.type === 'fill_blank') {
    const blanks = Array.isArray(question.answers) ? question.answers : safeJsonParse(question.answer, []);
    if (!Array.isArray(blanks)) return '';
    return blanks
      .map((entry, idx) => {
        const choices = Array.isArray(entry) ? entry : [entry];
        const text = choices.map((item) => String(item || '').trim()).filter(Boolean).join(' / ');
        return text ? `Blank ${idx + 1}: ${text}` : '';
      })
      .filter(Boolean)
      .join('; ');
  }

  if (question.type === 'error_analysis') {
    const correction = String(question.correction || question.sample_answer || '').trim();
    if (correction) return correction;
    const keywords = Array.isArray(question.keywords) ? question.keywords : [];
    return keywords.join(', ');
  }

  return String(question.answer || question.sample_answer || '').trim();
}

export default function Results() {
  const navigate = useNavigate();
  const {
    score,
    currentQuestions,
    studentName,
    answers,
    quizConfig,
    chapter,
    subtopics,
    submissionRewards,
  } = useQuiz();
  const { generateCompletion } = useRegis();
  const { student, loadProgress } = useStudent();

  const [explanations, setExplanations] = useState({});
  const [loadingExpl, setLoadingExpl] = useState({});

  useEffect(() => {
    if (student?.id) {
      loadProgress(student.id).catch(() => { });
    }
  }, [loadProgress, student?.id]);

  const total = currentQuestions.length || 1;
  const wrong = currentQuestions.reduce((count, _q, idx) => (answers[idx] === false ? count + 1 : count), 0);
  const ungraded = currentQuestions.reduce(
    (count, _q, idx) => (answers[idx] === null || typeof answers[idx] === 'undefined' ? count + 1 : count),
    0
  );
  const gradedTotal = Math.max(0, total - ungraded);
  const pct = gradedTotal > 0 ? Math.round((score / gradedTotal) * 100) : Math.round((score / total) * 100);
  const summaryCards = [
    { label: 'Correct', val: score, color: 'text-accent2' },
    { label: 'Wrong', val: wrong, color: 'text-wrong' },
    ...(ungraded > 0 ? [{ label: 'Ungraded', val: ungraded, color: 'text-muted' }] : []),
    { label: 'Total', val: total, color: 'text-ink' },
  ];

  const title = pct >= 80 ? 'Excellent Work!' : pct >= 60 ? 'Good Effort!' : 'Keep Studying!';

  const circumference = 2 * Math.PI * 54;
  const strokeDash = circumference - (circumference * pct) / 100;

  const handleExplain = async (idx) => {
    const q = currentQuestions[idx];
    const isCorrect = answers[idx];
    if (isCorrect !== false) return;
    const correctAnswerText = formatCorrectAnswer(q) || 'N/A';

    setLoadingExpl((prev) => ({ ...prev, [idx]: true }));
    try {
      const prompt = `You are a helpful math tutor named Regis. A student in ${quizConfig?.grade || 'Grade 7'} answered a question incorrectly.
Question: "${q.question}"
Correct Answer: "${correctAnswerText}"
Student's Answer was WRONG.

Explain why they might have made a mistake and provide a clear, step-by-step path to the correct solution. Keep it encouraging and easy to understand for their grade level.

Return ONLY a valid JSON object with the following fields:
- intro: A short, friendly opening sentence.
- why_mistake: A brief explanation of what might have led to the error.
- steps: An array of strings, each being a clear step toward the solution.
- key_rule: A single core mathematical rule that applies here.
- practice_tip: A short encouraging tip or example to practice.

No markdown, no backticks, just the RAW JSON.`;

      const explanationRaw = await generateCompletion(prompt);
      const cleaned = explanationRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const explanationJson = JSON.parse(cleaned);
      setExplanations((prev) => ({ ...prev, [idx]: explanationJson }));
    } catch {
      setExplanations((prev) => ({
        ...prev,
        [idx]: { intro: "Sorry, I couldn't generate an explanation right now. Try again!" },
      }));
    } finally {
      setLoadingExpl((prev) => ({ ...prev, [idx]: false }));
    }
  };

  const handleBackHome = () => {
    if (student?.id) {
      navigate('/student/dashboard');
      return;
    }
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-paper pb-20">
      <TopBar title="Results" showBack={false} role="student" />

      <div className="max-w-[560px] mx-auto px-5 py-8 animate-fadeUp text-center">
        <h1 className="font-syne font-800 text-4xl text-ink mb-1">🎉 {title}</h1>
        <div className="mb-10">
          <p className="font-dm text-muted text-base mb-6 italic">
            {studentName ? `Great effort, ${studentName}.` : 'Here are your results.'}
          </p>
          <div className="max-w-[360px] mx-auto text-left">
            <TopicCard chapter={chapter || quizConfig?.topic} subtopics={subtopics} />
          </div>
        </div>

        <div className="relative w-36 h-36 mx-auto mb-8">
          <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke={pct >= 80 ? 'var(--accent2)' : pct >= 60 ? 'var(--accent)' : 'var(--wrong)'}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDash}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-syne font-800 text-3xl text-ink">{pct}%</span>
          </div>
        </div>

        <div className={`grid gap-3 mb-8 grid-cols-2 ${summaryCards.length > 3 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          {summaryCards.map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-xl py-4">
              <p className={`font-syne font-800 text-2xl ${s.color}`}>{s.val}</p>
              <p className="font-dm text-muted text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {submissionRewards && (
          <div className="text-left bg-card border border-accent2/30 rounded-2xl p-5 mb-10">
            <h2 className="font-syne font-700 text-lg text-ink mb-3">🎁 Rewards Earned</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-xl border border-border bg-paper">
                <p className="font-dm text-xs text-muted uppercase tracking-wider">XP Gained</p>
                <p className="font-syne font-800 text-2xl text-accent2">+{submissionRewards.xp_gained || 0}</p>
              </div>
              <div className="p-3 rounded-xl border border-border bg-paper">
                <p className="font-dm text-xs text-muted uppercase tracking-wider">Level</p>
                <p className="font-syne font-800 text-2xl text-ink">
                  {submissionRewards.level_before || 1} → {submissionRewards.level_after || 1}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-border bg-paper">
                <p className="font-dm text-xs text-muted uppercase tracking-wider">Streak</p>
                <p className="font-syne font-800 text-2xl text-ink">{submissionRewards.streak_after || 0}d</p>
              </div>
              <div className="p-3 rounded-xl border border-border bg-paper">
                <p className="font-dm text-xs text-muted uppercase tracking-wider">Level Up</p>
                <p className="font-syne font-800 text-2xl text-ink">{submissionRewards.level_up ? 'Yes' : 'No'}</p>
              </div>
            </div>

            {Array.isArray(submissionRewards.unlocked_badges) && submissionRewards.unlocked_badges.length > 0 && (
              <div className="mb-4">
                <p className="font-syne font-700 text-sm text-ink mb-2">New Badges</p>
                <div className="grid grid-cols-2 gap-2">
                  {submissionRewards.unlocked_badges.map((badge) => (
                    <div key={badge.code} className="p-2.5 rounded-lg border border-border bg-paper">
                      <p className="font-syne font-700 text-sm text-ink">
                        {(BADGE_ICON_MAP[badge.icon] || '🎖️')} {badge.name}
                      </p>
                      <p className="font-dm text-xs text-muted">{badge.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(submissionRewards.completed_quests) && submissionRewards.completed_quests.length > 0 && (
              <div>
                <p className="font-syne font-700 text-sm text-ink mb-2">Quest Rewards</p>
                <div className="space-y-2">
                  {submissionRewards.completed_quests.map((quest) => (
                    <div key={quest.code} className="p-2.5 rounded-lg border border-border bg-paper flex justify-between items-center">
                      <p className="font-dm text-sm text-ink">{quest.name}</p>
                      <p className="font-syne font-700 text-sm text-accent2">+{quest.reward_xp} XP</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="text-left mb-10">
          <h2 className="font-syne font-700 text-lg text-ink mb-4 px-1">📖 Review Questions</h2>
          <div className="space-y-4">
            {currentQuestions.map((q, idx) => {
              const isCorrect = answers[idx];
              const explanation = explanations[idx];
              const loading = loadingExpl[idx];
              const statusIcon = isCorrect === true ? 'Correct' : isCorrect === false ? 'Wrong' : 'Ungraded';
              const cardBorderClass = isCorrect === true
                ? 'border-accent2/20'
                : isCorrect === false
                  ? 'border-wrong/20'
                  : 'border-border';

              return (
                <div key={idx} className={`bg-card border-2 rounded-2xl p-5 ${cardBorderClass}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="font-dm font-500 text-ink text-sm leading-relaxed flex-1">
                      {q.question}
                    </p>
                    <span className="text-base flex-shrink-0">
                      {statusIcon}
                    </span>
                  </div>

                  {isCorrect === false && (
                    <div className="mt-4 pt-4 border-t border-border">
                      {!explanation ? (
                        <button
                          onClick={() => handleExplain(idx)}
                          disabled={loading}
                          className="text-xs font-syne font-700 text-accent hover:underline flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                        >
                          {loading ? 'Thinking...' : 'Ask Regis to Explain'}
                        </button>
                      ) : (
                        <TutorExplanation data={explanation} />
                      )}
                    </div>
                  )}

                  {isCorrect === null && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="font-dm text-xs text-muted">
                        Not auto-graded. Reference answer: {formatCorrectAnswer(q) || 'N/A'}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/student/dashboard')}
            className="w-full py-4 rounded-xl bg-accent2 text-white font-syne font-700 text-base hover:bg-accent2/90 active:scale-[0.98] transition-all cursor-pointer"
          >
            View My Progress
          </button>
          <button
            onClick={() => navigate('/student/join')}
            className="w-full py-4 rounded-xl bg-ink text-paper font-syne font-700 text-base hover:bg-ink/90 active:scale-[0.98] transition-all cursor-pointer"
          >
            Take Another Quiz
          </button>
          <button
            onClick={handleBackHome}
            className="w-full py-4 rounded-xl border-2 border-border bg-card font-syne font-600 text-base text-ink hover:border-accent transition-colors cursor-pointer"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
