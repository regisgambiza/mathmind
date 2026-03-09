import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuiz } from '../context/QuizContext';
import api from '../hooks/useApi';
import StudentCard from '../components/StudentCard';

function normalizeActivityType(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'topic_quiz' ? 'topic_quiz' : 'class_activity';
}

function activityLabel(value) {
  return normalizeActivityType(value) === 'topic_quiz' ? 'Topic Quiz' : 'Class Activity';
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().split('T')[0];
}

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function calculateResultsStats(attempts) {
  const completed = attempts.filter(a => a.status === 'completed' || a.status === 'force_submitted');

  if (completed.length === 0) {
    return {
      avgScore: 0,
      medianScore: 0,
      highestScore: 0,
      lowestScore: 0,
      completionRate: 0,
      avgTime: 0,
      distribution: { '0-49': 0, '50-59': 0, '60-69': 0, '70-79': 0, '80-89': 0, '90-100': 0 },
      struggling: [],
      excelling: [],
    };
  }

  const scores = completed.map(s => s.percentage || 0).sort((a, b) => a - b);
  const times = completed.map(s => s.time_taken_s || 0).filter(t => t > 0);

  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const medianScore = scores.length % 2 === 0
    ? Math.round((scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2)
    : Math.round(scores[Math.floor(scores.length / 2)]);
  const highestScore = Math.max(...scores);
  const lowestScore = Math.min(...scores);
  const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

  const distribution = { '0-49': 0, '50-59': 0, '60-69': 0, '70-79': 0, '80-89': 0, '90-100': 0 };
  scores.forEach(pct => {
    if (pct < 50) distribution['0-49']++;
    else if (pct < 60) distribution['50-59']++;
    else if (pct < 70) distribution['60-69']++;
    else if (pct < 80) distribution['70-79']++;
    else if (pct < 90) distribution['80-89']++;
    else distribution['90-100']++;
  });

  const struggling = completed.filter(s => (s.percentage || 0) < 60).map(s => ({
    name: s.student_name,
    score: Math.round(s.percentage || 0),
    time: s.time_taken_s,
  })).sort((a, b) => a.score - b.score);

  const excelling = completed.filter(s => (s.percentage || 0) >= 90).map(s => ({
    name: s.student_name,
    score: Math.round(s.percentage || 0),
    time: s.time_taken_s,
  })).sort((a, b) => b.score - a.score);

  // Group by intervention need
  const reTeach = completed.filter(s => (s.percentage || 0) < 60);
  const onTrack = completed.filter(s => (s.percentage || 0) >= 60 && (s.percentage || 0) < 85);
  const extension = completed.filter(s => (s.percentage || 0) >= 85);

  return {
    avgScore,
    medianScore,
    highestScore,
    lowestScore,
    completionRate: Math.round((completed.length / attempts.length) * 100),
    avgTime,
    distribution,
    struggling,
    excelling,
    reTeach,
    onTrack,
    extension,
  };
}

// Generate recommended next steps
function generateRecommendations(stats, quiz) {
  const recommendations = [];
  
  if (stats.avgScore < 60) {
    recommendations.push({
      type: 'warning',
      title: 'Class-wide Re-teaching Needed',
      description: `Average score is ${stats.avgScore}%. Consider re-teaching this topic before moving forward.`,
      action: 'Schedule re-teach session',
    });
  }
  
  if (stats.struggling.length >= 3) {
    recommendations.push({
      type: 'warning',
      title: 'Small Group Intervention',
      description: `${stats.struggling.length} students scored below 60%. Schedule small group sessions.`,
      action: 'Create intervention groups',
    });
  }
  
  if (stats.excelling.length >= 3) {
    recommendations.push({
      type: 'success',
      title: 'Extension Activities Available',
      description: `${stats.excelling.length} students scored 90%+. Provide enrichment activities.`,
      action: 'Assign extension work',
    });
  }
  
  if (stats.completionRate < 80) {
    recommendations.push({
      type: 'info',
      title: 'Low Completion Rate',
      description: `Only ${stats.completionRate}% completed. Follow up with absent students.`,
      action: 'Contact absent students',
    });
  }
  
  if (stats.avgScore >= 75 && stats.completionRate >= 80) {
    recommendations.push({
      type: 'success',
      title: 'Ready to Advance',
      description: `Class average ${stats.avgScore}% with ${stats.completionRate}% completion. Ready for next topic.`,
      action: 'Continue curriculum',
    });
  }
  
  return recommendations;
}

export default function TeacherHistory() {
  const navigate = useNavigate();
  const { code } = useParams();
  const { setQuizCode, setQuizConfig } = useQuiz();
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [results, setResults] = useState(null);
  const [questionAnalytics, setQuestionAnalytics] = useState([]);
  const [skillBreakdown, setSkillBreakdown] = useState([]);
  const [studentGrowth, setStudentGrowth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [activeTab, setActiveTab] = useState('overview');
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    activity_type: '',
    grade: '',
    topic: '',
    date_from: '',
    date_to: '',
  });

  const fetchQuizzes = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.activity_type) params.append('activity_type', filters.activity_type);
      if (filters.grade) params.append('grade', filters.grade);
      if (filters.topic) params.append('topic', filters.topic);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      
      const res = await api.get(`/api/dashboard?${params.toString()}`);
      setQuizzes(res.data || []);
    } catch (err) {
      console.error('Failed to fetch quizzes:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  useEffect(() => {
    if (code) {
      const quiz = quizzes.find(q => q.code === code);
      if (quiz) {
        setSelectedQuiz(quiz);
        setView('results');
      }
    }
  }, [code, quizzes]);

  useEffect(() => {
    if (selectedQuiz && view === 'results') {
      fetchResults();
    }
  }, [selectedQuiz, view]);

  // Auto-refresh when enabled
  useEffect(() => {
    if (!autoRefresh || view !== 'results') return;
    const interval = setInterval(fetchResults, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, view]);

  const fetchResults = async () => {
    try {
      const [resultsRes, questionsRes, skillsRes] = await Promise.all([
        api.get(`/api/dashboard/${selectedQuiz.code}/results`),
        api.get(`/api/dashboard/${selectedQuiz.code}/questions`),
        api.get(`/api/dashboard/${selectedQuiz.code}/skills`),
      ]);
      setResults(resultsRes.data);
      setQuestionAnalytics(questionsRes.data);
      setSkillBreakdown(skillsRes.data);
    } catch (err) {
      console.error('Failed to fetch results:', err);
    }
  };

  const handleSelect = (q) => {
    setSelectedQuiz(q);
    setQuizCode(q.code);
    setQuizConfig({
      topic: q.topic,
      grade: q.grade,
      count: q.q_count,
      types: q.question_types,
      extra: q.extra_instructions,
      activity_type: normalizeActivityType(q.activity_type),
    });
    setView('results');
    navigate(`/teacher/history/${q.code}`);
  };

  const handleDelete = async (quizCode) => {
    if (!window.confirm(`Are you sure you want to delete ${quizCode}? This also deletes attempts.`)) return;
    try {
      await api.delete(`/api/quiz/${quizCode}`);
      setQuizzes((prev) => prev.filter((q) => q.code !== quizCode));
      if (selectedQuiz?.code === quizCode) {
        setSelectedQuiz(null);
        setResults(null);
        setView('list');
        navigate('/teacher/history');
      }
    } catch {
      alert('Failed to delete activity');
    }
  };

  const handleCloseResults = () => {
    setSelectedQuiz(null);
    setResults(null);
    setQuestionAnalytics([]);
    setSkillBreakdown([]);
    setView('list');
    navigate('/teacher/history');
  };

  const stats = useMemo(() => results ? calculateResultsStats(results) : null, [results]);
  const recommendations = useMemo(() => stats ? generateRecommendations(stats, selectedQuiz) : [], [stats, selectedQuiz]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      activity_type: '',
      grade: '',
      topic: '',
      date_from: '',
      date_to: '',
    });
  };

  const handleStudentClick = async (studentId) => {
    try {
      const res = await api.get(`/api/dashboard/student/${studentId}/growth`);
      setStudentGrowth({ studentId, data: res.data });
    } catch (err) {
      console.error('Failed to fetch student growth:', err);
    }
  };

  // Results View
  if (view === 'results' && selectedQuiz && stats) {
    const completed = results?.filter(r => r.status === 'completed' || r.status === 'force_submitted') || [];
    const maxDist = Math.max(...Object.values(stats.distribution), 1);

    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-6 animate-fadeUp">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <button
              onClick={handleCloseResults}
              className="text-xs font-syne font-700 text-accent hover:underline mb-2"
            >
              ← Back to History
            </button>
            <h1 className="font-syne font-800 text-2xl md:text-3xl text-ink">Results: {selectedQuiz.code}</h1>
            <p className="font-dm text-muted mt-1 text-sm">{selectedQuiz.topic}</p>
          </div>
          <div className="flex gap-2 items-center">
            <label className="flex items-center gap-2 text-xs font-dm text-muted">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              Auto-refresh
            </label>
            <button
              onClick={fetchResults}
              className="px-4 py-2 rounded-xl border border-border bg-card font-syne font-700 text-sm text-ink hover:border-accent2"
            >
              🔄 Refresh
            </button>
            <a
              href={`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/dashboard/${selectedQuiz.code}/export`}
              className="px-4 py-2 rounded-xl border border-border bg-card font-syne font-700 text-sm text-ink hover:border-accent2"
            >
              📥 Export CSV
            </a>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'questions', label: 'Question Analysis' },
            { id: 'skills', label: 'Skill Breakdown' },
            { id: 'students', label: 'Student Groups' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-syne font-700 text-sm transition-colors ${
                activeTab === tab.id
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Quiz Info */}
        <div className="bg-card border-2 border-border rounded-2xl p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="font-dm text-[10px] uppercase text-muted">Activity Type</p>
              <p className="font-syne font-700 text-sm text-ink">{activityLabel(selectedQuiz.activity_type)}</p>
            </div>
            <div>
              <p className="font-dm text-[10px] uppercase text-muted">Grade</p>
              <p className="font-syne font-700 text-sm text-ink">{selectedQuiz.grade}</p>
            </div>
            <div>
              <p className="font-dm text-[10px] uppercase text-muted">Questions</p>
              <p className="font-syne font-700 text-sm text-ink">{selectedQuiz.q_count}</p>
            </div>
            <div>
              <p className="font-dm text-[10px] uppercase text-muted">Created</p>
              <p className="font-syne font-700 text-sm text-ink">{formatDateTime(selectedQuiz.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-card border-2 border-border rounded-xl p-4">
                <p className="font-dm text-[10px] uppercase text-muted">Total Attempts</p>
                <p className="font-syne font-800 text-2xl text-ink mt-1">{results?.length || 0}</p>
              </div>
              <div className="bg-card border-2 border-border rounded-xl p-4">
                <p className="font-dm text-[10px] uppercase text-muted">Completion</p>
                <p className="font-syne font-800 text-2xl text-ink mt-1">{stats.completionRate}%</p>
              </div>
              <div className="bg-card border-2 border-border rounded-xl p-4">
                <p className="font-dm text-[10px] uppercase text-muted">Avg Score</p>
                <p className={`font-syne font-800 text-2xl mt-1 ${
                  stats.avgScore >= 80 ? 'text-correct' : stats.avgScore >= 60 ? 'text-yellow-600' : 'text-wrong'
                }`}>{stats.avgScore}%</p>
              </div>
              <div className="bg-card border-2 border-border rounded-xl p-4">
                <p className="font-dm text-[10px] uppercase text-muted">Median</p>
                <p className="font-syne font-800 text-2xl text-ink mt-1">{stats.medianScore}%</p>
              </div>
              <div className="bg-card border-2 border-border rounded-xl p-4">
                <p className="font-dm text-[10px] uppercase text-muted">Avg Time</p>
                <p className="font-syne font-800 text-2xl text-ink mt-1">{formatTime(stats.avgTime)}</p>
              </div>
            </div>

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <div className="bg-card border-2 border-border rounded-2xl p-5">
                <h3 className="font-syne font-700 text-lg text-ink mb-4">💡 Recommended Next Steps</h3>
                <div className="space-y-3">
                  {recommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border-2 ${
                        rec.type === 'warning' ? 'border-wrong/30 bg-wrong/5' :
                        rec.type === 'success' ? 'border-correct/30 bg-correct/5' :
                        'border-accent/30 bg-accent/5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className={`font-syne font-700 text-sm mb-1 ${
                            rec.type === 'warning' ? 'text-wrong' :
                            rec.type === 'success' ? 'text-correct' :
                            'text-accent'
                          }`}>{rec.title}</h4>
                          <p className="font-dm text-xs text-muted">{rec.description}</p>
                        </div>
                        <span className="text-xs font-syne font-700 text-accent2 whitespace-nowrap">{rec.action}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Score Distribution */}
            <div className="bg-card border-2 border-border rounded-2xl p-5">
              <h3 className="font-syne font-700 text-lg text-ink mb-4">Score Distribution</h3>
              <div className="flex items-end gap-2 h-40">
                {Object.entries(stats.distribution).map(([range, count]) => (
                  <div key={range} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className={`w-full rounded-t-lg transition-all ${
                        range === '90-100' || range === '80-89' ? 'bg-correct' :
                        range === '70-79' || range === '60-69' ? 'bg-yellow-500' : 'bg-wrong'
                      }`}
                      style={{ height: `${(count / maxDist) * 100}%`, minHeight: count > 0 ? '8px' : '4px' }}
                    />
                    <span className="font-dm text-[10px] text-muted">{range}%</span>
                    <span className="font-syne font-700 text-xs text-ink">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Insights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.struggling.length > 0 && (
                <div className="bg-card border-2 border-wrong/30 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">⚠️</span>
                    <h3 className="font-syne font-700 text-lg text-wrong">Students Needing Help</h3>
                  </div>
                  <p className="font-dm text-xs text-muted mb-3">
                    {stats.struggling.length} student{stats.struggling.length > 1 ? 's' : ''} scored below 60%
                  </p>
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {stats.struggling.map(s => (
                      <div key={s.name} className="flex items-center justify-between p-2 bg-wrong/5 rounded-lg">
                        <span className="font-dm text-sm text-ink">{s.name}</span>
                        <span className="font-syne font-700 text-sm text-wrong">{s.score}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.excelling.length > 0 && (
                <div className="bg-card border-2 border-correct/30 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">🌟</span>
                    <h3 className="font-syne font-700 text-lg text-correct">Top Performers</h3>
                  </div>
                  <p className="font-dm text-xs text-muted mb-3">
                    {stats.excelling.length} student{stats.excelling.length > 1 ? 's' : ''} scored 90% or higher
                  </p>
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {stats.excelling.map(s => (
                      <div key={s.name} className="flex items-center justify-between p-2 bg-correct/5 rounded-lg">
                        <span className="font-dm text-sm text-ink">{s.name}</span>
                        <span className="font-syne font-700 text-sm text-correct">{s.score}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Questions Tab */}
        {activeTab === 'questions' && (
          <div className="bg-card border-2 border-border rounded-2xl p-5">
            <h3 className="font-syne font-700 text-lg text-ink mb-4">📊 Question Analytics</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="px-4 py-3 font-syne font-800 text-[10px] text-muted uppercase">#</th>
                    <th className="px-4 py-3 font-syne font-800 text-[10px] text-muted uppercase">Skill</th>
                    <th className="px-4 py-3 font-syne font-800 text-[10px] text-muted uppercase">Difficulty</th>
                    <th className="px-4 py-3 font-syne font-800 text-[10px] text-muted uppercase text-right">% Correct</th>
                  </tr>
                </thead>
                <tbody>
                  {questionAnalytics.map((q) => (
                    <tr key={q.q_index} className="border-b border-border/50 hover:bg-muted/5">
                      <td className="px-4 py-3 font-dm text-sm text-ink">{q.q_index}</td>
                      <td className="px-4 py-3 font-dm text-sm text-ink">{q.skill_tag}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-syne font-700 ${
                          q.difficulty === 'advanced' ? 'bg-accent/10 text-accent' :
                          q.difficulty === 'foundation' ? 'bg-ink/10 text-ink' :
                          'bg-accent2/10 text-accent2'
                        }`}>
                          {q.difficulty}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-syne font-700 text-sm ${
                          q.pct_correct >= 80 ? 'text-correct' :
                          q.pct_correct >= 60 ? 'text-yellow-600' :
                          'text-wrong'
                        }`}>
                          {q.pct_correct}%
                          {q.pct_correct < 60 && ' ⚠️'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Skills Tab */}
        {activeTab === 'skills' && (
          <div className="bg-card border-2 border-border rounded-2xl p-5">
            <h3 className="font-syne font-700 text-lg text-ink mb-4">🎯 Skill Breakdown</h3>
            <div className="space-y-3">
              {skillBreakdown.map((skill) => (
                <div key={skill.skill} className="p-4 rounded-xl border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-syne font-700 text-sm text-ink">{skill.skill}</span>
                    <span className={`font-syne font-800 text-sm ${
                      skill.avg_pct >= 80 ? 'text-correct' :
                      skill.avg_pct >= 60 ? 'text-yellow-600' :
                      'text-wrong'
                    }`}>{skill.avg_pct}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-paper rounded-full overflow-hidden border border-border">
                      <div
                        className={`h-full ${
                          skill.avg_pct >= 80 ? 'bg-correct' :
                          skill.avg_pct >= 60 ? 'bg-yellow-500' :
                          'bg-wrong'
                        }`}
                        style={{ width: `${skill.avg_pct}%` }}
                      />
                    </div>
                    <span className="font-dm text-xs text-muted">{skill.questions} questions</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Students Tab */}
        {activeTab === 'students' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Re-teach Group */}
            <div className="bg-card border-2 border-wrong/30 rounded-2xl p-5">
              <h3 className="font-syne font-700 text-lg text-wrong mb-3">🔴 Re-teach ({stats.reTeach?.length || 0})</h3>
              <p className="font-dm text-xs text-muted mb-3">Scored below 60%</p>
              <div className="space-y-2 max-h-64 overflow-auto">
                {stats.reTeach?.map(s => (
                  <div key={s.student_name} className="p-2 bg-wrong/5 rounded-lg">
                    <p className="font-dm text-sm text-ink">{s.student_name}</p>
                    <p className="font-syne font-700 text-xs text-wrong">{Math.round(s.percentage)}%</p>
                  </div>
                ))}
              </div>
            </div>

            {/* On Track Group */}
            <div className="bg-card border-2 border-yellow-500/30 rounded-2xl p-5">
              <h3 className="font-syne font-700 text-lg text-yellow-600 mb-3">🟡 On Track ({stats.onTrack?.length || 0})</h3>
              <p className="font-dm text-xs text-muted mb-3">Scored 60-84%</p>
              <div className="space-y-2 max-h-64 overflow-auto">
                {stats.onTrack?.map(s => (
                  <div key={s.student_name} className="p-2 bg-yellow-500/5 rounded-lg">
                    <p className="font-dm text-sm text-ink">{s.student_name}</p>
                    <p className="font-syne font-700 text-xs text-yellow-600">{Math.round(s.percentage)}%</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Extension Group */}
            <div className="bg-card border-2 border-correct/30 rounded-2xl p-5">
              <h3 className="font-syne font-700 text-lg text-correct mb-3">🟢 Extension ({stats.extension?.length || 0})</h3>
              <p className="font-dm text-xs text-muted mb-3">Scored 85%+</p>
              <div className="space-y-2 max-h-64 overflow-auto">
                {stats.extension?.map(s => (
                  <div key={s.student_name} className="p-2 bg-correct/5 rounded-lg">
                    <p className="font-dm text-sm text-ink">{s.student_name}</p>
                    <p className="font-syne font-700 text-xs text-correct">{Math.round(s.percentage)}%</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* All Student Results */}
        <div className="bg-card border-2 border-border rounded-2xl p-5">
          <h3 className="font-syne font-700 text-lg text-ink mb-4">All Student Results</h3>
          <div className="space-y-2">
            {completed
              .sort((a, b) => (b.percentage || 0) - (a.percentage || 0))
              .map((s) => (
                <div key={s.attempt_id} onClick={() => handleStudentClick(s.student_id)} className="cursor-pointer">
                  <StudentCard student={{...s, violations: s.violations?.length || 0}} />
                </div>
              ))
            }
          </div>
        </div>

        {/* Student Growth Modal */}
        {studentGrowth && (
          <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center px-5">
            <div className="bg-card rounded-2xl p-6 max-w-md w-full animate-fadeUp">
              <h3 className="font-syne font-700 text-lg text-ink mb-4">📈 Student Growth</h3>
              <div className="space-y-2 max-h-64 overflow-auto">
                {studentGrowth.data.map((attempt, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-paper rounded-lg">
                    <div>
                      <p className="font-dm text-xs text-ink">{attempt.quiz_code}</p>
                      <p className="font-dm text-[10px] text-muted">{formatDate(attempt.completed_at)}</p>
                    </div>
                    <span className={`font-syne font-700 text-sm ${
                      attempt.percentage >= 80 ? 'text-correct' :
                      attempt.percentage >= 60 ? 'text-yellow-600' :
                      'text-wrong'
                    }`}>{attempt.percentage}%</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStudentGrowth(null)}
                className="mt-4 w-full py-3 rounded-xl bg-ink text-paper font-syne font-700 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // List View
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4 md:space-y-6 animate-fadeUp">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-syne font-800 text-2xl md:text-3xl text-ink">📋 Activity History</h1>
          <p className="font-dm text-muted mt-1 text-sm">Review class activities and topic quizzes.</p>
        </div>
        <button
          onClick={() => navigate('/teacher/setup')}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-accent text-white font-syne font-700 text-sm"
        >
          + Create Activity
        </button>
      </header>

      {/* Filters */}
      <div className="bg-card border-2 border-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-syne font-700 text-sm text-ink">🔍 Filters</h2>
          <button
            onClick={clearFilters}
            className="text-xs font-syne font-700 text-accent hover:underline"
          >
            Clear All
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select
            value={filters.activity_type}
            onChange={(e) => handleFilterChange('activity_type', e.target.value)}
            className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
          >
            <option value="">All Types</option>
            <option value="class_activity">Class Activities</option>
            <option value="topic_quiz">Topic Quizzes</option>
          </select>
          <select
            value={filters.grade}
            onChange={(e) => handleFilterChange('grade', e.target.value)}
            className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
          >
            <option value="">All Grades</option>
            <option value="6">Grade 6</option>
            <option value="7">Grade 7</option>
            <option value="8">Grade 8</option>
          </select>
          <input
            type="text"
            placeholder="Search topic..."
            value={filters.topic}
            onChange={(e) => handleFilterChange('topic', e.target.value)}
            className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
          />
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => handleFilterChange('date_from', e.target.value)}
            className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
          />
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => handleFilterChange('date_to', e.target.value)}
            className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-border border-t-accent rounded-full animate-spin mb-4" />
          <p className="font-dm text-muted text-sm">Loading history...</p>
        </div>
      ) : quizzes.length === 0 ? (
        <div className="text-center py-20 bg-card border-2 border-dashed border-border rounded-3xl">
          <p className="font-syne font-700 text-ink mb-2">No activities found</p>
          <p className="font-dm text-muted text-sm mb-6 px-4">Try adjusting your filters or create a new activity.</p>
          <button
            onClick={() => navigate('/teacher/setup')}
            className="px-5 py-2.5 rounded-xl bg-accent text-white font-syne font-700 text-sm"
          >
            + Create Activity
          </button>
        </div>
      ) : (
        <div className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-paper border-b-2 border-border">
                <th className="px-4 py-3 font-syne font-800 text-[10px] text-muted uppercase tracking-widest">Code</th>
                <th className="px-4 py-3 font-syne font-800 text-[10px] text-muted uppercase tracking-widest">Type</th>
                <th className="px-4 py-3 font-syne font-800 text-[10px] text-muted uppercase tracking-widest">Topic</th>
                <th className="px-4 py-3 font-syne font-800 text-[10px] text-muted uppercase tracking-widest">Attempts</th>
                <th className="px-4 py-3 font-syne font-800 text-[10px] text-muted uppercase tracking-widest">Avg Score</th>
                <th className="px-4 py-3 font-syne font-800 text-[10px] text-muted uppercase tracking-widest">Completion</th>
                <th className="px-4 py-3 font-syne font-800 text-[10px] text-muted uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {quizzes.map((q) => (
                <tr key={q.code} className="hover:bg-muted/5 transition-colors group">
                  <td className="px-4 py-4">
                    <span className="bg-accent/10 text-accent font-syne font-800 text-xs px-2 py-1 rounded-lg">{q.code}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-syne font-700 ${
                      normalizeActivityType(q.activity_type) === 'topic_quiz' 
                        ? 'bg-accent2/15 text-accent2' 
                        : 'bg-accent/10 text-accent'
                    }`}>
                      {activityLabel(q.activity_type)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-syne font-700 text-sm text-ink">{q.topic}</p>
                    <p className="text-[10px] text-muted font-dm">{formatDate(q.created_at)}</p>
                  </td>
                  <td className="px-4 py-4 font-dm text-sm text-ink">{q.attempt_count || 0}</td>
                  <td className="px-4 py-4">
                    <span className={`font-syne font-700 text-sm ${
                      q.avg_score >= 80 ? 'text-correct' :
                      q.avg_score >= 60 ? 'text-yellow-600' :
                      'text-wrong'
                    }`}>{q.avg_score || 0}%</span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-paper rounded-full overflow-hidden border border-border w-20">
                        <div
                          className={`h-full ${
                            q.completion_rate >= 80 ? 'bg-correct' :
                            q.completion_rate >= 60 ? 'bg-yellow-500' :
                            'bg-wrong'
                          }`}
                          style={{ width: `${q.completion_rate || 0}%` }}
                        />
                      </div>
                      <span className="font-dm text-xs text-muted">{q.completion_rate || 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right space-x-2">
                    <button
                      onClick={() => navigate(`/teacher/live/${q.code}`)}
                      className="px-3 py-1.5 rounded-lg border border-border bg-card font-syne font-700 text-[10px] text-accent2 hover:bg-accent2 hover:text-white transition-colors"
                      title="Open Live Tracking"
                    >
                      📡 Live
                    </button>
                    <button
                      onClick={() => handleSelect(q)}
                      className="px-3 py-1.5 rounded-lg border border-border bg-card font-syne font-700 text-[10px] text-accent hover:bg-accent hover:text-white transition-colors"
                    >
                      View Results
                    </button>
                    <button
                      onClick={() => handleDelete(q.code)}
                      className="px-3 py-1.5 rounded-lg border border-border bg-card font-syne font-700 text-[10px] text-wrong hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
