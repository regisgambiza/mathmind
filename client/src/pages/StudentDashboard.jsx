import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { SkillHeatmap, ProgressChart, ReviewSuggestions, SkillDetailModal } from '../components/MasteryDashboard';
import { useStudent } from '../context/StudentContext';
import api from '../hooks/useApi';

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

function formatDate(dateText) {
  if (!dateText) return 'N/A';
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return dateText;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDuration(totalSeconds = 0) {
  const s = Number(totalSeconds) || 0;
  if (s <= 0) return '0m';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}

function normalizeActivityType(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'topic_quiz' ? 'topic_quiz' : 'class_activity';
}

function activityLabel(value) {
  return normalizeActivityType(value) === 'topic_quiz' ? 'Topic Quiz' : 'Class Activity';
}

function parseAnswerValue(value) {
  if (value === null || typeof value === 'undefined') return 'N/A';
  const raw = String(value).trim();
  if (!raw) return 'N/A';

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry)).join(', ');
    }
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed)
        .map(([key, entry]) => `${key}: ${String(entry)}`)
        .join(' | ');
    }
  } catch { }

  return raw;
}

export default function StudentDashboard() {
  const navigate = useNavigate();
  const {
    student,
    profile,
    progress,
    progressLoading,
    loadProgress,
    updateSettings,
    logout,
  } = useStudent();

  const [savingOptIn, setSavingOptIn] = useState(false);
  const [selectedAttemptId, setSelectedAttemptId] = useState(null);
  const [attemptDetailsById, setAttemptDetailsById] = useState({});
  const [loadingAttemptId, setLoadingAttemptId] = useState(null);
  const [attemptLoadError, setAttemptLoadError] = useState('');
  
  // Mastery dashboard state
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'mastery'

  useEffect(() => {
    if (!student?.id) return;
    loadProgress(student.id).catch(() => { });
  }, [loadProgress, student?.id]);

  const summary = progress?.summary || {};
  const studentInfo = progress?.student || profile || student;
  const quests = progress?.quests || [];
  const badges = progress?.badges || [];
  const activityHistory = progress?.activity_history || progress?.recent_history || [];
  const weeklyTrend = progress?.weekly_trend || [];
  const events = progress?.events || [];
  const leaderboard = progress?.leaderboard || { enabled: true, top: [], me: null };
  const classActivityCount = Number(summary.class_activity_count || 0);
  const topicQuizCount = Number(summary.topic_quiz_count || 0);
  const classActivityAvg = Number(summary.class_activity_avg || 0);
  const topicQuizAvg = Number(summary.topic_quiz_avg || 0);
  const weightedMastery = Number(summary.weighted_mastery || 0);

  const maxTrendScore = useMemo(() => {
    const max = weeklyTrend.reduce((m, w) => Math.max(m, w.avg_score || 0), 0);
    return Math.max(max, 100);
  }, [weeklyTrend]);

  const handleToggleLeaderboard = async () => {
    if (!student?.id) return;
    setSavingOptIn(true);
    try {
      await updateSettings({ leaderboard_opt_in: !leaderboard.enabled });
    } finally {
      setSavingOptIn(false);
    }
  };

  const handleSkillClick = (skill) => {
    setSelectedSkill(skill);
    setShowSkillModal(true);
  };

  const handleSuggestionClick = (suggestion) => {
    // Could navigate to practice mode or show more info
    console.log('Review suggestion:', suggestion);
  };

  const handleOpenAttempt = async (attemptId) => {
    const safeAttemptId = Number(attemptId);
    if (!safeAttemptId) return;

    if (selectedAttemptId === safeAttemptId) {
      setSelectedAttemptId(null);
      setAttemptLoadError('');
      return;
    }

    setSelectedAttemptId(safeAttemptId);
    setAttemptLoadError('');

    if (attemptDetailsById[safeAttemptId]) return;

    setLoadingAttemptId(safeAttemptId);
    try {
      const res = await api.get(`/api/attempt/${safeAttemptId}`);
      const answers = Array.isArray(res.data?.answers) ? res.data.answers : [];
      setAttemptDetailsById((prev) => ({
        ...prev,
        [safeAttemptId]: {
          ...res.data,
          answers,
        },
      }));
    } catch {
      setAttemptLoadError('Could not load this activity details right now.');
    } finally {
      setLoadingAttemptId(null);
    }
  };

  return (
    <div className="min-h-screen bg-paper pb-20">
      <TopBar title="Student Dashboard" role="student" showBack onBack={() => navigate('/')} />
      <div className="max-w-[760px] mx-auto px-5 py-6 space-y-6 animate-fadeUp">
        <section className="bg-card border-2 border-border rounded-2xl p-5">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div>
              <h1 className="font-syne font-800 text-2xl text-ink">👋 Welcome back, {studentInfo?.name}</h1>
              <p className="font-dm text-muted text-sm mt-1">
                Track your progress, review mistakes, and keep your streak alive.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/student/practice')}
                className="px-4 py-2.5 rounded-lg bg-accent text-white font-syne font-700 text-sm"
              >
                🎯 Practice
              </button>
              <button
                onClick={() => navigate('/student/join')}
                className="px-4 py-2.5 rounded-lg bg-accent2 text-white font-syne font-700 text-sm"
              >
                Join Quiz
              </button>
              <button
                onClick={logout}
                className="px-4 py-2.5 rounded-lg border border-border bg-paper font-syne font-600 text-sm text-ink"
              >
                Log Out
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: 'Level', value: studentInfo?.level ?? 1 },
            { label: 'XP', value: studentInfo?.xp ?? 0 },
            { label: 'Streak', value: `${studentInfo?.streak_days ?? 0}d` },
            { label: 'Activities', value: summary.completed_quizzes ?? 0 },
            { label: 'Topic Quizzes', value: topicQuizCount },
            { label: 'Avg Score', value: `${summary.avg_score ?? 0}%` },
          ].map((item) => (
            <div key={item.label} className="bg-card border border-border rounded-xl p-4">
              <p className="font-dm text-[11px] uppercase tracking-widest text-muted">{item.label}</p>
              <p className="font-syne font-800 text-2xl text-ink mt-1">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-syne font-700 text-lg text-ink mb-4">📈 Activity Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl border border-border">
              <p className="font-dm text-xs text-muted uppercase">Class Activities</p>
              <p className="font-syne font-800 text-xl text-ink mt-1">{classActivityCount}</p>
              <p className="font-dm text-xs text-muted mt-1">Average: {classActivityAvg}%</p>
            </div>
            <div className="p-3 rounded-xl border border-border">
              <p className="font-dm text-xs text-muted uppercase">Topic Quizzes</p>
              <p className="font-syne font-800 text-xl text-ink mt-1">{topicQuizCount}</p>
              <p className="font-dm text-xs text-muted mt-1">Average: {topicQuizAvg}%</p>
            </div>
            <div className="p-3 rounded-xl border border-border">
              <p className="font-dm text-xs text-muted uppercase">Weighted Mastery</p>
              <p className="font-syne font-800 text-xl text-accent2 mt-1">{weightedMastery}%</p>
              <p className="font-dm text-xs text-muted mt-1">35% class activities, 65% topic quizzes</p>
            </div>
          </div>
        </section>

        <section className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-syne font-700 text-lg text-ink">📊 Weekly Trend</h2>
            <span className="font-dm text-xs text-muted">Last 8 weeks</span>
          </div>
          <div className="space-y-2">
            {weeklyTrend.length === 0 && (
              <p className="font-dm text-sm text-muted">No quiz history yet.</p>
            )}
            {weeklyTrend.map((week) => (
              <div key={week.week_start} className="grid grid-cols-[100px_1fr_60px] items-center gap-3">
                <p className="font-dm text-xs text-muted">{formatDate(week.week_start)}</p>
                <div className="h-3 bg-paper rounded-full overflow-hidden border border-border">
                  <div
                    className="h-full bg-accent2"
                    style={{ width: `${Math.max(2, Math.round(((week.avg_score || 0) / maxTrendScore) * 100))}%` }}
                  />
                </div>
                <p className="font-syne font-700 text-xs text-ink text-right">{week.avg_score || 0}%</p>
              </div>
            ))}
          </div>
        </section>

        {/* Mastery Dashboard Tabs */}
        <section className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg font-syne font-700 text-sm transition-all ${
                activeTab === 'overview'
                  ? 'bg-accent2 text-white'
                  : 'bg-paper text-muted hover:text-ink'
              }`}
            >
              📊 Overview
            </button>
            <button
              onClick={() => setActiveTab('mastery')}
              className={`px-4 py-2 rounded-lg font-syne font-700 text-sm transition-all ${
                activeTab === 'mastery'
                  ? 'bg-accent2 text-white'
                  : 'bg-paper text-muted hover:text-ink'
              }`}
            >
              🎯 Skill Mastery
            </button>
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-6">
              <ProgressChart weeklyTrend={weeklyTrend} />
              <ReviewSuggestions masteryData={progress?.mastery || []} onSuggestionClick={handleSuggestionClick} />
            </div>
          )}

          {activeTab === 'mastery' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-accent2/5 border border-accent2/20">
                <p className="font-dm text-sm text-ink">
                  <span className="font-syne font-700">💡 Tip:</span> Click on any skill to see detailed insights and improvement tips.
                </p>
              </div>
              <SkillHeatmap 
                masteryData={progress?.mastery || []} 
                onSkillClick={handleSkillClick}
                selectedSkill={selectedSkill}
              />
            </div>
          )}
        </section>

        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-syne font-700 text-lg text-ink mb-4">🏆 Weekly Quests</h2>
          <div className="space-y-3">
            {quests.length === 0 && <p className="font-dm text-sm text-muted">No quests available.</p>}
            {quests.map((quest) => {
              const progressPct = quest.target > 0
                ? Math.min(100, Math.round((Number(quest.progress || 0) / Number(quest.target || 1)) * 100))
                : (quest.complete ? 100 : 0);

              return (
                <div key={quest.code} className="p-3 rounded-xl border border-border">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-syne font-700 text-sm text-ink">{quest.name}</p>
                      <p className="font-dm text-xs text-muted mt-0.5">{quest.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-syne font-700 text-sm text-accent2">+{quest.reward_xp} XP</p>
                      <p className="font-dm text-[11px] text-muted">
                        {quest.complete ? (quest.claimed ? 'Claimed' : 'Ready') : `${quest.progress}/${quest.target}`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 h-2 bg-paper border border-border rounded-full overflow-hidden">
                    <div
                      className={`h-full ${quest.complete ? 'bg-accent2' : 'bg-accent'}`}
                      style={{ width: `${Math.max(4, progressPct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-syne font-700 text-lg text-ink mb-4">🎖️ Badges</h2>
          {badges.length === 0 ? (
            <p className="font-dm text-sm text-muted">Complete quizzes to unlock badges.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {badges.map((badge) => (
                <div key={`${badge.code}-${badge.unlocked_at}`} className="p-3 rounded-xl border border-border bg-paper">
                  <div className="text-2xl">{BADGE_ICON_MAP[badge.icon] || '🎖️'}</div>
                  <p className="font-syne font-700 text-sm text-ink mt-1">{badge.name}</p>
                  <p className="font-dm text-xs text-muted mt-0.5">{badge.description}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-syne font-700 text-lg text-ink">📝 All Attempted Activities</h2>
            <span className="font-dm text-xs text-muted">{activityHistory.length} total</span>
          </div>
          {activityHistory.length === 0 ? (
            <p className="font-dm text-sm text-muted">No completed activities yet.</p>
          ) : (
            <div className="space-y-3">
              {activityHistory.map((item) => {
                const isSelected = selectedAttemptId === item.attempt_id;
                const detail = attemptDetailsById[item.attempt_id];
                const answers = Array.isArray(detail?.answers) ? detail.answers : [];
                const correctCount = answers.filter((a) => a.is_correct === 1).length;
                const wrongCount = answers.filter((a) => a.is_correct === 0).length;
                const ungradedCount = answers.filter((a) => a.is_correct === null || typeof a.is_correct === 'undefined').length;
                const mistakesToReview = answers.filter((a) => a.is_correct === 0 || a.is_correct === null || typeof a.is_correct === 'undefined');

                return (
                  <div key={item.attempt_id} className={`rounded-xl border ${isSelected ? 'border-accent2/40 bg-accent2/5' : 'border-border bg-paper'}`}>
                    <button
                      onClick={() => handleOpenAttempt(item.attempt_id)}
                      className="w-full p-3 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-syne font-700 text-sm text-ink">{item.topic || item.chapter || item.quiz_code}</p>
                          <p className="font-dm text-[11px] text-muted">
                            {activityLabel(item.activity_type)} • {formatDate(item.completed_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-syne font-800 text-sm text-accent2">{Math.round(item.percentage || 0)}%</p>
                          <p className="font-dm text-[11px] text-muted">
                            {item.score}/{item.total}
                          </p>
                        </div>
                      </div>
                      <p className="font-dm text-xs text-muted mt-1">
                        {formatDuration(item.time_taken_s)} • +{item.xp_earned || 0} XP • {isSelected ? 'Hide details' : 'View details'}
                      </p>
                    </button>

                    {isSelected && (
                      <div className="px-3 pb-3 border-t border-border/60">
                        {loadingAttemptId === item.attempt_id && (
                          <p className="font-dm text-sm text-muted pt-3">Loading activity details...</p>
                        )}

                        {loadingAttemptId !== item.attempt_id && attemptLoadError && !detail && (
                          <p className="font-dm text-sm text-wrong pt-3">{attemptLoadError}</p>
                        )}

                        {loadingAttemptId !== item.attempt_id && detail && (
                          <div className="pt-3 space-y-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <div className="p-2 rounded-lg border border-border bg-card">
                                <p className="font-dm text-[11px] uppercase text-muted">Correct</p>
                                <p className="font-syne font-700 text-sm text-accent2">{correctCount}</p>
                              </div>
                              <div className="p-2 rounded-lg border border-border bg-card">
                                <p className="font-dm text-[11px] uppercase text-muted">Wrong</p>
                                <p className="font-syne font-700 text-sm text-wrong">{wrongCount}</p>
                              </div>
                              <div className="p-2 rounded-lg border border-border bg-card">
                                <p className="font-dm text-[11px] uppercase text-muted">Ungraded</p>
                                <p className="font-syne font-700 text-sm text-ink">{ungradedCount}</p>
                              </div>
                              <div className="p-2 rounded-lg border border-border bg-card">
                                <p className="font-dm text-[11px] uppercase text-muted">Questions</p>
                                <p className="font-syne font-700 text-sm text-ink">{answers.length}</p>
                              </div>
                            </div>

                            <div>
                              <p className="font-syne font-700 text-sm text-ink mb-2">Review Mistakes</p>
                              {mistakesToReview.length === 0 ? (
                                <p className="font-dm text-xs text-muted">No mistakes in this activity.</p>
                              ) : (
                                <div className="space-y-2">
                                  {mistakesToReview.map((answer, idx) => (
                                    <div key={`${answer.id || idx}-${answer.q_index ?? idx}`} className="p-3 rounded-lg border border-red-200 bg-red-50">
                                      <p className="font-dm text-sm text-ink">{answer.question_text || 'Question unavailable'}</p>
                                      <p className="font-dm text-xs text-muted mt-1">
                                        Your answer: <span className="text-wrong">{parseAnswerValue(answer.student_answer)}</span>
                                      </p>
                                      <p className="font-dm text-xs text-muted">
                                        Correct answer: <span className="text-correct">{parseAnswerValue(answer.correct_answer)}</span>
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>


        <section className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-syne font-700 text-lg text-ink">🏅 Leaderboard</h2>
            <button
              onClick={handleToggleLeaderboard}
              disabled={savingOptIn}
              className={`px-3 py-2 rounded-lg text-xs font-syne font-700 border transition-colors ${leaderboard.enabled
                ? 'bg-accent2/10 border-accent2/30 text-accent2'
                : 'bg-paper border-border text-muted'
                }`}
            >
              {savingOptIn ? 'Saving...' : (leaderboard.enabled ? 'Opted In' : 'Opted Out')}
            </button>
          </div>
          {leaderboard.enabled ? (
            <div className="space-y-2">
              {leaderboard.me && (
                <p className="font-dm text-sm text-muted">
                  Your rank: <span className="font-syne font-700 text-ink">#{leaderboard.me.rank}</span>
                </p>
              )}
              {leaderboard.top.length === 0 ? (
                <p className="font-dm text-sm text-muted">No leaderboard data yet.</p>
              ) : (
                leaderboard.top.map((entry) => (
                  <div key={entry.student_id} className={`p-3 rounded-xl border ${entry.student_id === student?.id ? 'border-accent2 bg-accent2/5' : 'border-border'}`}>
                    <div className="flex justify-between items-center gap-2">
                      <p className="font-syne font-700 text-sm text-ink">#{entry.rank} {entry.name}</p>
                      <p className="font-dm text-xs text-muted">Lv {entry.level} • {entry.xp} XP</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <p className="font-dm text-sm text-muted">
              You are hidden from the leaderboard. Toggle opt-in to join rankings.
            </p>
          )}
        </section>

        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-syne font-700 text-lg text-ink mb-4">⚡ Activity Feed</h2>
          {events.length === 0 ? (
            <p className="font-dm text-sm text-muted">No recent rewards yet.</p>
          ) : (
            <div className="space-y-2">
              {events.map((evt) => (
                <div key={evt.id} className="p-3 rounded-xl border border-border">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-syne font-700 text-sm text-ink">
                      {evt.event_type === 'quest_reward' ? 'Quest Reward' : 'Quiz Completion'}
                    </p>
                    <p className="font-syne font-800 text-sm text-accent2">+{evt.points} XP</p>
                  </div>
                  <p className="font-dm text-xs text-muted mt-1">{formatDate(evt.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {progressLoading && (
          <p className="text-center font-dm text-sm text-muted">Refreshing progress...</p>
        )}
      </div>

      {/* Skill Detail Modal */}
      {showSkillModal && selectedSkill && (
        <SkillDetailModal
          skill={selectedSkill}
          mastery={progress?.mastery?.find((m) => m.topic === selectedSkill)?.avg_pct || 0}
          onClose={() => {
            setShowSkillModal(false);
            setSelectedSkill(null);
          }}
        />
      )}
    </div>
  );
}

