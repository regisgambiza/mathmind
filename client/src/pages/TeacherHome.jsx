import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../hooks/useApi';
import { useQuiz } from '../context/QuizContext';

function normalizeActivityType(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'topic_quiz' ? 'topic_quiz' : 'class_activity';
}

function activityLabel(value) {
  return normalizeActivityType(value) === 'topic_quiz' ? 'Topic Quiz' : 'Class Activity';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TeacherHome() {
  const [quizzes, setQuizzes] = useState([]);
  const [statsData, setStatsData] = useState({
    totalQuizzes: 0,
    classActivities: 0,
    topicQuizzes: 0,
    totalAttempts: 0,
    avgScore: 0,
    activeToday: 0,
  });
  const [recentAttempts, setRecentAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { setQuizCode, setQuizConfig } = useQuiz();

  useEffect(() => {
    const fetchQuizzes = async () => {
      try {
        const [qRes, sRes, aRes] = await Promise.all([
          api.get('/api/quiz'),
          api.get('/api/quiz/stats'),
          api.get('/api/admin/overview').catch(() => ({ data: null })),
        ]);
        setQuizzes(qRes.data || []);
        setStatsData(sRes.data || {});
        
        // Extract recent attempts from overview if available
        if (aRes.data?.live_class_monitor?.classes) {
          setRecentAttempts(aRes.data.live_class_monitor.classes.slice(0, 5));
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchQuizzes();
  }, []);

  const handleSelect = (q) => {
    setQuizCode(q.code);
    setQuizConfig({
      topic: q.topic,
      grade: q.grade,
      count: q.q_count,
      types: q.question_types,
      extra: q.extra_instructions,
      activity_type: normalizeActivityType(q.activity_type),
    });
    navigate('/teacher/dashboard');
  };

  // Calculate activity type distribution
  const activityDistribution = useMemo(() => {
    const total = statsData.classActivities + statsData.topicQuizzes;
    if (total === 0) return { classPct: 50, topicPct: 50 };
    return {
      classPct: Math.round((statsData.classActivities / total) * 100),
      topicPct: Math.round((statsData.topicQuizzes / total) * 100),
    };
  }, [statsData.classActivities, statsData.topicQuizzes]);

  // Calculate performance trend based on avg score
  const getPerformanceTrend = (avgScore) => {
    if (avgScore >= 80) return { label: 'Excellent', color: 'text-correct', bg: 'bg-correct/10' };
    if (avgScore >= 60) return { label: 'Good', color: 'text-yellow-600', bg: 'bg-yellow-500/10' };
    return { label: 'Needs Attention', color: 'text-wrong', bg: 'bg-wrong/10' };
  };

  const performanceTrend = getPerformanceTrend(statsData.avgScore);

  const stats = [
    { label: 'Class Activities', value: statsData.classActivities || 0, icon: '📝', color: 'bg-blue-500' },
    { label: 'Topic Quizzes', value: statsData.topicQuizzes || 0, icon: '📊', color: 'bg-indigo-500' },
    { label: 'Avg. Score', value: `${statsData.avgScore || 0}%`, icon: '🎯', color: performanceTrend.bg },
    { label: 'Total Attempts', value: statsData.totalAttempts || 0, icon: '✅', color: 'bg-orange-500' },
    { label: 'Created Today', value: statsData.activeToday || 0, icon: '📅', color: 'bg-cyan-500' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 animate-fadeUp">
      <header>
        <h1 className="font-syne font-800 text-2xl md:text-3xl text-ink">👋 Welcome back!</h1>
        <p className="font-dm text-muted mt-1 md:mt-2 text-sm">Manage class activities and track student progress.</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className={`bg-card border-2 border-border p-4 rounded-2xl shadow-sm ${stat.color.includes('/') ? '' : 'hover:border-accent/30 transition-colors'}`}>
            <div className="text-2xl mb-2">{stat.icon}</div>
            <p className="text-[10px] text-muted font-800 uppercase tracking-widest">{stat.label}</p>
            <p className="font-syne font-800 text-2xl text-ink mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Performance Overview & Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance Card */}
        <div className="bg-card border-2 border-border rounded-2xl p-5">
          <h3 className="font-syne font-700 text-lg text-ink mb-4">Overall Performance</h3>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-syne font-800 text-3xl text-ink">{statsData.avgScore || 0}%</p>
              <p className="font-dm text-xs text-muted">Average score across all attempts</p>
            </div>
            <div className={`px-4 py-2 rounded-xl font-syne font-700 text-sm ${performanceTrend.bg} ${performanceTrend.color}`}>
              {performanceTrend.label}
            </div>
          </div>
          <div className="h-3 bg-paper rounded-full overflow-hidden border border-border">
            <div
              className={`h-full transition-all ${
                statsData.avgScore >= 80 ? 'bg-correct' :
                statsData.avgScore >= 60 ? 'bg-yellow-500' : 'bg-wrong'
              }`}
              style={{ width: `${Math.min(100, statsData.avgScore || 0)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs font-dm text-muted">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Activity Type Distribution */}
        <div className="bg-card border-2 border-border rounded-2xl p-5">
          <h3 className="font-syne font-700 text-lg text-ink mb-4">Activity Distribution</h3>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 rounded-full bg-accent" />
                <span className="font-dm text-xs text-muted">Class Activities</span>
              </div>
              <p className="font-syne font-700 text-2xl text-ink">{activityDistribution.classPct}%</p>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 rounded-full bg-accent2" />
                <span className="font-dm text-xs text-muted">Topic Quizzes</span>
              </div>
              <p className="font-syne font-700 text-2xl text-ink">{activityDistribution.topicPct}%</p>
            </div>
          </div>
          <div className="h-3 bg-paper rounded-full overflow-hidden border border-border flex">
            <div
              className="bg-accent transition-all"
              style={{ width: `${activityDistribution.classPct}%` }}
            />
            <div
              className="bg-accent2 transition-all"
              style={{ width: `${activityDistribution.topicPct}%` }}
            />
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-card border-2 border-border rounded-2xl p-5">
          <h3 className="font-syne font-700 text-lg text-ink mb-4">Recent Activity</h3>
          {recentAttempts.length > 0 ? (
            <div className="space-y-2">
              {recentAttempts.map((activity, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-paper rounded-lg">
                  <div className="min-w-0">
                    <p className="font-syne font-700 text-xs text-ink truncate">{activity.quiz_code}</p>
                    <p className="font-dm text-[10px] text-muted truncate">{activity.topic}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-syne font-700 text-xs text-accent2">{activity.completion_rate_pct || 0}%</p>
                    <p className="font-dm text-[10px] text-muted">complete</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-dm text-sm text-muted">No recent activity to show.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-syne font-700 text-lg text-ink">Recent Activities</h2>
            <button onClick={() => navigate('/teacher/history')} className="text-xs font-syne font-700 text-accent hover:underline">View All</button>
          </div>
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted">Loading...</p>
            ) : quizzes.length === 0 ? (
              <div className="p-10 border-2 border-dashed border-border rounded-2xl text-center">
                <p className="text-sm text-muted mb-4">No activities yet.</p>
                <button onClick={() => navigate('/teacher/setup')} className="px-4 py-2 bg-accent text-white rounded-xl text-xs font-syne font-700">Create Your First Activity</button>
              </div>
            ) : (
              quizzes.slice(0, 4).map((q) => (
                <button
                  key={q.code}
                  onClick={() => handleSelect(q)}
                  className="w-full bg-card border-2 border-border p-4 rounded-xl flex items-center justify-between hover:border-accent transition-all group"
                >
                  <div className="text-left">
                    <p className="font-syne font-800 text-xs text-accent uppercase tracking-widest mb-1">{q.code}</p>
                    <h3 className="font-syne font-700 text-sm text-ink group-hover:text-accent transition-colors">{q.topic}</h3>
                    <p className="text-[10px] text-muted font-dm">{activityLabel(q.activity_type)} | {q.grade} | {q.q_count} questions • {formatDate(q.created_at)}</p>
                  </div>
                  <span className="text-muted group-hover:translate-x-1 transition-transform">→</span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-syne font-700 text-lg text-ink">Quick Actions</h2>
          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={() => navigate('/teacher/setup')}
              className="group p-6 bg-accent border-2 border-accent rounded-2xl text-white text-left shadow-lg shadow-accent/20 hover:scale-[1.02] transition-all"
            >
              <span className="text-2xl mb-4 block">+</span>
              <h3 className="font-syne font-800 text-xl mb-1">Create New Activity</h3>
              <p className="text-xs text-white/80 font-dm">Choose class activity or topic quiz and share the code instantly.</p>
            </button>

            <button
              onClick={() => navigate('/teacher/history')}
              className="p-6 bg-card border-2 border-border rounded-2xl text-left hover:border-accent transition-all"
            >
              <span className="text-2xl mb-4 block">📋</span>
              <h3 className="font-syne font-800 text-xl text-ink mb-1">Browse History</h3>
              <p className="text-xs text-muted font-dm">Review past class activities, topic quizzes, and results.</p>
            </button>

            <button
              onClick={() => navigate('/teacher/admin')}
              className="p-6 bg-card border-2 border-border rounded-2xl text-left hover:border-accent2 transition-all"
            >
              <span className="text-2xl mb-4 block">⚙️</span>
              <h3 className="font-syne font-800 text-xl text-ink mb-1">Admin Control Center</h3>
              <p className="text-xs text-muted font-dm">Assignments, gamification, and system settings.</p>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
