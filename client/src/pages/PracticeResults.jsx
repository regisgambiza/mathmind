import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import TopBar from '../components/TopBar';
import api from '../hooks/useApi';

export default function PracticeResults() {
  const navigate = useNavigate();
  const location = useLocation();
  const { answers, questions, mode, skill, topic, quizCode } = location.state || {};

  const [masteryChange, setMasteryChange] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!answers || !questions) {
      navigate('/student/practice');
      return;
    }

    // Calculate results
    const correct = answers.filter(a => a.is_correct === 1).length;
    const total = questions.length;
    const percentage = Math.round((correct / total) * 100);

    // Update mastery for practiced skill
    updateMastery(skill || topic);
    setLoading(false);
  }, []);

  const updateMastery = async (skillTag) => {
    try {
      const student = JSON.parse(localStorage.getItem('mathmind_student') || '{}');
      if (student?.id) {
        // Fetch updated progress to get new mastery data
        const { data } = await api.get(`/api/student/${student.id}/progress`);
        const skillMastery = data.mastery?.find(m => 
          m.topic.toLowerCase() === (skillTag || topic || '').toLowerCase()
        );
        if (skillMastery) {
          setMasteryChange(skillMastery.avg_pct);
        }
      }
    } catch (err) {
      console.error('Failed to update mastery:', err);
    }
  };

  if (!answers || !questions) {
    return null;
  }

  const correct = answers.filter(a => a.is_correct === 1).length;
  const total = questions.length;
  const percentage = Math.round((correct / total) * 100);

  // Analyze difficulty performance
  const difficultyBreakdown = questions.reduce((acc, q, i) => {
    const diff = q.difficulty?.toLowerCase() || 'core';
    const answer = answers[i];
    if (!acc[diff]) acc[diff] = { total: 0, correct: 0 };
    acc[diff].total++;
    if (answer?.is_correct === 1) acc[diff].correct++;
    return acc;
  }, {});

  const getMessage = () => {
    if (percentage >= 90) return { emoji: '🌟', text: 'Outstanding! You\'ve mastered this!' };
    if (percentage >= 70) return { emoji: '🎉', text: 'Great job! Keep practicing!' };
    if (percentage >= 50) return { emoji: '💪', text: 'Good effort! Practice makes progress!' };
    return { emoji: '🌱', text: 'Every mistake is a learning opportunity!' };
  };

  const message = getMessage();

  return (
    <div className="min-h-screen bg-paper pb-20">
      <TopBar title="Practice Results" role="student" showBack onBack={() => navigate('/student/practice')} />

      <div className="max-w-[480px] mx-auto px-5 py-8 space-y-6 animate-fadeUp">
        {/* Result Card */}
        <section className="bg-card border-2 border-border rounded-2xl p-6 text-center">
          <div className="text-6xl mb-4">{message.emoji}</div>
          <h1 className="font-syne font-800 text-2xl text-ink mb-2">{message.text}</h1>
          
          <div className="mt-6 flex items-center justify-center gap-6">
            <div className="text-center">
              <p className="font-dm text-xs text-muted uppercase tracking-wider">Score</p>
              <p className={`font-syne font-800 text-3xl ${
                percentage >= 70 ? 'text-correct' : percentage >= 50 ? 'text-accent2' : 'text-wrong'
              }`}>
                {percentage}%
              </p>
            </div>
            <div className="w-px h-12 bg-border" />
            <div className="text-center">
              <p className="font-dm text-xs text-muted uppercase tracking-wider">Correct</p>
              <p className="font-syne font-800 text-3xl text-ink">{correct}/{total}</p>
            </div>
          </div>

          {masteryChange !== null && (
            <div className="mt-4 p-3 bg-accent2/10 rounded-xl border border-accent2/20">
              <p className="font-dm text-xs text-accent2">
                Topic Mastery: <span className="font-700">{masteryChange}%</span>
              </p>
            </div>
          )}
        </section>

        {/* Practice Summary */}
        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-syne font-700 text-lg text-ink mb-4">📊 Practice Summary</h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-dm text-sm text-muted">Mode</span>
              <span className="font-syne font-600 text-sm text-ink capitalize">{mode || 'Skill'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-dm text-sm text-muted">Topic</span>
              <span className="font-syne font-600 text-sm text-ink">{skill || topic || quizCode || 'Practice'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-dm text-sm text-muted">Questions</span>
              <span className="font-syne font-600 text-sm text-ink">{total}</span>
            </div>
          </div>

          {/* Difficulty Breakdown */}
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="font-syne font-600 text-sm text-ink mb-3">Difficulty Performance</h3>
            <div className="space-y-2">
              {['foundation', 'core', 'advanced'].map((diff) => {
                const data = difficultyBreakdown[diff];
                if (!data || data.total === 0) return null;
                const accuracy = Math.round((data.correct / data.total) * 100);
                const barColor = accuracy >= 80 ? 'bg-correct' : accuracy >= 60 ? 'bg-accent2' : 'bg-wrong';
                
                return (
                  <div key={diff} className="flex items-center gap-3">
                    <span className="font-dm text-xs text-muted capitalize w-20">{diff}</span>
                    <div className="flex-1 h-2 bg-paper rounded-full overflow-hidden border border-border">
                      <div className={`h-full ${barColor}`} style={{ width: `${accuracy}%` }} />
                    </div>
                    <span className="font-syne font-700 text-xs text-ink w-12 text-right">
                      {data.correct}/{data.total}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* What's Next */}
        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-syne font-700 text-lg text-ink mb-4">🎯 What's Next?</h2>
          
          <div className="space-y-3">
            {percentage < 60 && (
              <button
                onClick={() => navigate('/student/practice', { state: { practiceSkill: skill || topic } })}
                className="w-full py-3 px-4 rounded-xl border-2 border-accent2/30 bg-accent2/5 text-accent2 font-syne font-700 text-sm hover:bg-accent2/10 active:scale-[0.98] transition-all text-left flex items-center gap-3"
              >
                <span className="text-xl">🔄</span>
                Try Again - More practice needed
              </button>
            )}
            
            <button
              onClick={() => navigate('/student/dashboard')}
              className="w-full py-3 px-4 rounded-xl bg-ink text-paper font-syne font-700 text-sm hover:bg-ink/90 active:scale-[0.98] transition-all text-left flex items-center gap-3"
            >
              <span className="text-xl">📚</span>
              Back to Dashboard
            </button>

            <button
              onClick={() => navigate('/student/practice')}
              className="w-full py-3 px-4 rounded-xl border-2 border-border bg-card text-ink font-syne font-700 text-sm hover:border-accent/50 active:scale-[0.98] transition-all text-left flex items-center gap-3"
            >
              <span className="text-xl">🎯</span>
              Practice Another Topic
            </button>
          </div>
        </section>

        {/* Encouragement */}
        <section className="text-center">
          <p className="font-dm text-xs text-muted">
            {percentage >= 80 
              ? '🌟 You\'re on fire! Keep up the great work!'
              : percentage >= 60
                ? '💪 Solid progress! A bit more practice and you\'ll master it!'
                : '🌱 Every expert was once a beginner. Keep practicing!'}
          </p>
        </section>
      </div>
    </div>
  );
}
