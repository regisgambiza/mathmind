import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { useStudent } from '../context/StudentContext';
import api from '../hooks/useApi';
import {
  suggestReviewTopics,
  getSkillCategory,
  CATEGORY_COLORS,
} from '../utils/skillPrerequisites';

function PracticeTopicCard({ skill, mastery, isRecommended, becauseOf, onSelect, mode = 'skill' }) {
  const category = getSkillCategory(skill);
  const statusColor = mastery >= 80 ? 'bg-green-500' : mastery >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <button
      onClick={() => onSelect(skill, mode)}
      className={`p-4 rounded-xl border-2 transition-all text-left ${
        isRecommended
          ? 'border-accent2 bg-accent2/5 shadow-lg'
          : 'border-border bg-card hover:border-accent/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-3 h-3 rounded-full ${CATEGORY_COLORS[category] || 'bg-gray-500'}`} />
            <span className="font-syne font-700 text-sm text-ink">{skill}</span>
          </div>

          {isRecommended && becauseOf && (
            <div className="mb-2 px-2 py-1 rounded bg-accent2/10 border border-accent2/20 inline-block">
              <p className="font-dm text-[10px] text-accent2">
                {becauseOf}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-paper rounded-full overflow-hidden border border-border">
              <div
                className={`h-full ${statusColor} transition-all`}
                style={{ width: `${Math.max(5, mastery || 0)}%` }}
              />
            </div>
            <span className="font-syne font-800 text-xs text-ink w-10 text-right">{mastery || 0}%</span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-lg">{mode === 'quiz_prep' ? '📝' : '🎯'}</span>
        </div>
      </div>
    </button>
  );
}

export default function PracticeMode() {
  const navigate = useNavigate();
  const { student, progress, loadProgress } = useStudent();

  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [practiceType, setPracticeType] = useState('recommended');
  const [showQuizPrep, setShowQuizPrep] = useState(false);
  const [upcomingQuizzes, setUpcomingQuizzes] = useState([]);
  const [quizPrepLoading, setQuizPrepLoading] = useState(false);

  useEffect(() => {
    if (student?.id) {
      loadProgress(student.id).finally(() => setLoading(false));
      fetchUpcomingQuizzes();
    }
  }, [student?.id, loadProgress]);

  const fetchUpcomingQuizzes = async () => {
    try {
      const { data } = await api.get('/api/quiz');
      const now = new Date();
      const upcoming = data.filter(q => {
        if (q.activity_type !== 'class_activity') return false;
        const closeAt = q.close_at ? new Date(q.close_at) : null;
        const releaseAt = q.release_at ? new Date(q.release_at) : null;
        if (closeAt && closeAt < now) return false;
        if (releaseAt && releaseAt > now) return false;
        return true;
      }).slice(0, 5);
      setUpcomingQuizzes(upcoming);
    } catch (err) {
      console.error('Failed to fetch upcoming quizzes:', err);
    }
  };

  const masteryData = progress?.mastery || [];
  const weakSkills = masteryData.filter((s) => s.avg_pct < 60);

  const recommendedTopics = React.useMemo(() => {
    const weakSkillNames = weakSkills.map((s) => s.topic);
    const suggestions = suggestReviewTopics(weakSkillNames);
    return suggestions.slice(0, 8);
  }, [weakSkills]);

  const allTopics = React.useMemo(() => {
    const topicMap = new Map();

    masteryData.forEach((m) => {
      if (!topicMap.has(m.topic)) {
        topicMap.set(m.topic, { skill: m.topic, mastery: m.avg_pct });
      }
    });

    recommendedTopics.forEach((r) => {
      if (!topicMap.has(r.skill)) {
        topicMap.set(r.skill, { skill: r.skill, mastery: 0, isPrerequisite: true });
      }
    });

    return Array.from(topicMap.values());
  }, [masteryData, recommendedTopics]);

  const handleStartPractice = async (skillOrTopic, mode = 'skill', quizCode = null) => {
    if (!student) return;

    setGeneratingQuiz(true);
    setSelectedSkill(skillOrTopic);

    try {
      navigate('/practice/quiz', {
        state: {
          practiceSkill: mode === 'skill' ? skillOrTopic : null,
          practiceTopic: mode === 'topic' ? skillOrTopic : null,
          practiceQuizCode: quizCode,
          mode: mode || 'skill',
        },
      });
    } catch (err) {
      console.error('Failed to start practice:', err);
      setGeneratingQuiz(false);
    }
  };

  const handleQuizPrepSelect = async (quiz) => {
    setQuizPrepLoading(true);
    try {
      navigate('/practice/quiz', {
        state: {
          practiceTopic: quiz.topic,
          practiceQuizCode: quiz.code,
          mode: 'quiz_prep',
        },
      });
    } catch (err) {
      console.error('Failed to start quiz prep:', err);
    } finally {
      setQuizPrepLoading(false);
    }
  };

  const filteredTopics = practiceType === 'recommended'
    ? recommendedTopics.map((r) => ({
        ...r,
        mastery: masteryData.find((m) => m.topic === r.skill)?.avg_pct || 0,
      }))
    : practiceType === 'weak'
      ? weakSkills.map((w) => ({ skill: w.topic, mastery: w.avg_pct }))
      : allTopics;

  return (
    <div className="min-h-screen bg-paper pb-20">
      <TopBar title="Practice Mode" role="student" showBack onBack={() => navigate('/student/dashboard')} />

      <div className="max-w-[760px] mx-auto px-5 py-6 space-y-6 animate-fadeUp">
        {/* Header */}
        <section className="bg-card border-2 border-border rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="text-4xl">🎯</div>
            <div className="flex-1">
              <h1 className="font-syne font-800 text-xl text-ink">🎯 Targeted Practice</h1>
              <p className="font-dm text-sm text-muted mt-1">
                Practice specific skills or prepare for upcoming quizzes.
              </p>
            </div>
          </div>
        </section>

        {/* Mode Toggle */}
        <section className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQuizPrep(false)}
              className={`flex-1 py-2.5 rounded-lg font-syne font-700 text-sm transition-all ${
                !showQuizPrep
                  ? 'bg-accent2 text-white'
                  : 'bg-paper text-muted hover:text-ink'
              }`}
            >
              🎯 Skill Practice
            </button>
            <button
              onClick={() => setShowQuizPrep(true)}
              className={`flex-1 py-2.5 rounded-lg font-syne font-700 text-sm transition-all ${
                showQuizPrep
                  ? 'bg-accent2 text-white'
                  : 'bg-paper text-muted hover:text-ink'
              }`}
            >
              📝 Quiz Prep
            </button>
          </div>
        </section>

        {/* Quiz Prep Mode */}
        {showQuizPrep && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-syne font-700 text-lg text-ink">📝 Prepare for Upcoming Quiz</h2>
            </div>

            {upcomingQuizzes.length === 0 ? (
              <div className="p-10 border-2 border-dashed border-border rounded-2xl text-center">
                <p className="text-4xl mb-3">🎉</p>
                <p className="font-syne font-700 text-ink mb-1">No upcoming quizzes!</p>
                <p className="font-dm text-sm text-muted">Practice your weak skills instead.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingQuizzes.map((quiz) => {
                  const quizMastery = masteryData.find(m => 
                    m.topic.toLowerCase() === quiz.topic.toLowerCase()
                  );
                  const mastery = quizMastery?.avg_pct || 0;
                  const isReady = mastery >= 75;

                  return (
                    <button
                      key={quiz.code}
                      onClick={() => handleQuizPrepSelect(quiz)}
                      disabled={quizPrepLoading}
                      className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                        isReady
                          ? 'border-green-500/30 bg-green-500/5'
                          : 'border-accent2/30 bg-accent2/5 hover:border-accent2/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-syne font-700 text-sm text-ink">{quiz.topic}</span>
                            {isReady && (
                              <span className="px-2 py-0.5 rounded bg-green-500 text-white text-[10px] font-700">
                                READY
                              </span>
                            )}
                          </div>
                          <p className="font-dm text-xs text-muted mb-2">
                            Quiz Code: <span className="font-600">{quiz.code}</span>
                          </p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-paper rounded-full overflow-hidden border border-border">
                              <div
                                className={`h-full ${isReady ? 'bg-green-500' : mastery >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${mastery}%` }}
                              />
                            </div>
                            <span className="font-syne font-800 text-xs text-ink w-10 text-right">{mastery}%</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl">📝</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Skill Practice Mode */}
        {!showQuizPrep && (
          <>
            {/* Practice Type Selector */}
            <section className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPracticeType('recommended')}
                  className={`flex-1 py-2.5 rounded-lg font-syne font-700 text-sm transition-all ${
                    practiceType === 'recommended'
                      ? 'bg-accent2 text-white'
                      : 'bg-paper text-muted hover:text-ink'
                  }`}
                >
                  ⭐ Recommended
                </button>
                <button
                  onClick={() => setPracticeType('weak')}
                  className={`flex-1 py-2.5 rounded-lg font-syne font-700 text-sm transition-all ${
                    practiceType === 'weak'
                      ? 'bg-accent2 text-white'
                      : 'bg-paper text-muted hover:text-ink'
                  }`}
                >
                  🔴 Weak Areas
                </button>
                <button
                  onClick={() => setPracticeType('all')}
                  className={`flex-1 py-2.5 rounded-lg font-syne font-700 text-sm transition-all ${
                    practiceType === 'all'
                      ? 'bg-accent2 text-white'
                      : 'bg-paper text-muted hover:text-ink'
                  }`}
                >
                  📚 All Topics
                </button>
              </div>
            </section>

            {/* Topics List */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-syne font-700 text-lg text-ink">
                  {practiceType === 'recommended' ? 'Recommended for You' :
                   practiceType === 'weak' ? 'Areas Needing Work' : 'All Topics'}
                </h2>
                <span className="font-dm text-xs text-muted">{filteredTopics.length} topics</span>
              </div>

              {loading ? (
                <div className="p-10 border-2 border-dashed border-border rounded-2xl text-center">
                  <p className="font-dm text-sm text-muted animate-pulse">Loading your progress...</p>
                </div>
              ) : filteredTopics.length === 0 ? (
                <div className="p-10 border-2 border-dashed border-border rounded-2xl text-center">
                  <p className="text-4xl mb-3">🎉</p>
                  <p className="font-syne font-700 text-ink mb-1">All caught up!</p>
                  <p className="font-dm text-sm text-muted">Complete more quizzes to unlock practice topics.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredTopics.map((topic) => {
                    const isRecommended = recommendedTopics.some((r) => r.skill === topic.skill);
                    const becauseOf = recommendedTopics.find((r) => r.skill === topic.skill)?.becauseOf;

                    return (
                      <PracticeTopicCard
                        key={topic.skill}
                        skill={topic.skill}
                        mastery={topic.mastery}
                        isRecommended={isRecommended}
                        becauseOf={becauseOf}
                        onSelect={(skill) => handleStartPractice(skill, 'skill')}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* Generating State */}
        {generatingQuiz && (
          <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center px-5">
            <div className="bg-card rounded-2xl p-6 max-w-sm w-full text-center animate-fadeUp">
              <div className="text-5xl mb-4 animate-bounce">🧠</div>
              <h3 className="font-syne font-700 text-lg text-ink mb-2">Generating Practice Quiz</h3>
              <p className="font-dm text-sm text-muted">
                Creating personalized questions for <span className="font-700 text-accent2">{selectedSkill}</span>...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
