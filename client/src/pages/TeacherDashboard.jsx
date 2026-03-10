import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useQuiz } from '../context/QuizContext';
import StudentCard from '../components/StudentCard';
import api from '../hooks/useApi';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const normalizeActivityType = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'topic_quiz' ? 'topic_quiz' : 'class_activity';
};

const activityLabel = (value) => {
  return normalizeActivityType(value) === 'topic_quiz' ? 'Topic Quiz' : 'Class Activity';
};

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function calculateStats(students) {
  const completed = students.filter(s => s.status === 'completed' || s.status === 'force_submitted');
  const inProgress = students.filter(s => s.status === 'in_progress');
  
  if (completed.length === 0) {
    return {
      avgScore: 0,
      medianScore: 0,
      highestScore: 0,
      lowestScore: 0,
      completionRate: 0,
      avgTime: 0,
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

  return {
    avgScore,
    medianScore,
    highestScore,
    lowestScore,
    completionRate: Math.round((completed.length / students.length) * 100),
    avgTime,
    struggling,
    excelling,
  };
}

function getScoreDistribution(students) {
  const completed = students.filter(s => s.status === 'completed' || s.status === 'force_submitted');
  const distribution = { '0-49': 0, '50-59': 0, '60-69': 0, '70-79': 0, '80-89': 0, '90-100': 0 };
  
  completed.forEach(s => {
    const pct = s.percentage || 0;
    if (pct < 50) distribution['0-49']++;
    else if (pct < 60) distribution['50-59']++;
    else if (pct < 70) distribution['60-69']++;
    else if (pct < 80) distribution['70-79']++;
    else if (pct < 90) distribution['80-89']++;
    else distribution['90-100']++;
  });
  
  return distribution;
}

export default function TeacherDashboard() {
  const { quizCode, quizConfig } = useQuiz();
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [quizInfo, setQuizInfo] = useState(null);
  const [showInsights, setShowInsights] = useState(true);

  useEffect(() => {
    if (!quizCode) return;

    const fetchData = async () => {
      try {
        const res = await api.get(`/api/dashboard/${quizCode}`);
        setStudents(res.data.students || []);
        setQuizInfo(res.data.quiz || null);
      } catch {
        setStudents([]);
      }
    };
    fetchData();

    const socket = io(SOCKET_URL);
    socket.emit('join_quiz', quizCode);

    socket.on('student_update', (data) => {
      setStudents((prev) => {
        const exists = prev.find((s) => s.attempt_id === data.attempt_id);
        if (exists) return prev.map((s) => (s.attempt_id === data.attempt_id ? { ...s, ...data } : s));
        return [data, ...prev];
      });
    });

    socket.on('student_violation', (data) => {
      setStudents((prev) => prev.map((s) => (
        s.attempt_id === data.attempt_id
          ? { ...s, violations: data.violation_num }
          : s
      )));
    });

    return () => socket.disconnect();
  }, [quizCode]);

  const stats = useMemo(() => calculateStats(students), [students]);
  const distribution = useMemo(() => getScoreDistribution(students), [students]);

  const addSimStudent = () => {
    const names = ['Amara', 'Liam', 'Zoe', 'Kai', 'Sofia', 'Omar', 'Priya', 'Elijah'];
    const name = `${names[Math.floor(Math.random() * names.length)]} ${Math.floor(Math.random() * 100)}`;
    const totalQuestions = quizConfig?.count || 5;
    const fake = {
      attempt_id: Date.now(),
      student_name: name,
      status: 'in_progress',
      score: null,
      total: totalQuestions,
      percentage: null,
      violations: 0,
      time_taken_s: 0,
    };
    setStudents((prev) => [fake, ...prev]);

    setTimeout(() => {
      const score = Math.floor(Math.random() * totalQuestions) + 1;
      const time = Math.floor(60 + Math.random() * 300);
      setStudents((prev) => prev.map((s) => (
        s.attempt_id === fake.attempt_id
          ? { ...s, status: 'completed', score, total: totalQuestions, percentage: (score / totalQuestions) * 100, time_taken_s: time }
          : s
      )));
    }, (3 + Math.random() * 4) * 1000);
  };

  if (!quizCode) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center gap-4">
        <p className="font-dm text-muted">No active activity.</p>
        <button onClick={() => navigate('/teacher/setup')} className="font-syne font-600 text-accent underline">Create an activity</button>
      </div>
    );
  }

  const completed = students.filter(s => s.status === 'completed' || s.status === 'force_submitted');
  const inProgress = students.filter(s => s.status === 'in_progress');
  const type = quizInfo?.activity_type || quizConfig?.activity_type || 'class_activity';
  const maxDist = Math.max(...Object.values(distribution), 1);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-6 animate-fadeUp">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-syne font-800 text-2xl md:text-3xl text-ink">📊 Live Monitoring</h1>
          <p className="font-dm text-muted mt-1 text-sm">Real-time learner progress and analytics.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-accent/5 border border-accent/10 rounded-lg">
          <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
          <span className="font-syne font-800 text-[10px] text-accent uppercase tracking-widest">Live</span>
        </div>
      </header>

      {/* Activity Code Card */}
      <div className="bg-card border-2 border-border rounded-2xl p-6 text-center">
        <p className="font-dm text-muted text-[10px] uppercase tracking-widest mb-1">Activity Code</p>
        <p className="font-syne font-800 text-4xl md:text-5xl text-accent tracking-[0.2em]">{quizCode}</p>
        <p className="font-dm text-muted text-xs md:text-sm mt-2">Share this code with learners</p>
      </div>

      {/* Quiz Info Bar */}
      <div className="flex items-center gap-3 p-4 bg-accent/5 border border-accent/20 rounded-xl">
        <span className="w-2.5 h-2.5 bg-accent rounded-full animate-pulse2 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-syne font-600 text-ink text-sm">{activityLabel(type)} is live</p>
          <p className="font-dm text-muted text-xs truncate">
            {quizInfo?.topic || quizConfig?.topic} | {quizInfo?.grade || quizConfig?.grade} | {quizInfo?.q_count || quizConfig?.count} questions
          </p>
        </div>
        <span className="font-syne font-600 text-accent text-sm ml-auto flex-shrink-0">{completed.length}/{students.length}</span>
      </div>

      {/* Summary Stats */}
      {students.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-card border-2 border-border rounded-xl p-4">
            <p className="font-dm text-[10px] uppercase text-muted">Completion</p>
            <p className="font-syne font-800 text-2xl text-ink mt-1">{stats.completionRate}%</p>
            <p className="font-dm text-xs text-muted mt-1">{completed.length} of {students.length} students</p>
          </div>
          <div className="bg-card border-2 border-border rounded-xl p-4">
            <p className="font-dm text-[10px] uppercase text-muted">Avg Score</p>
            <p className={`font-syne font-800 text-2xl mt-1 ${
              stats.avgScore >= 80 ? 'text-correct' : stats.avgScore >= 60 ? 'text-yellow-600' : 'text-wrong'
            }`}>{stats.avgScore}%</p>
            <p className="font-dm text-xs text-muted mt-1">Median: {stats.medianScore}%</p>
          </div>
          <div className="bg-card border-2 border-border rounded-xl p-4">
            <p className="font-dm text-[10px] uppercase text-muted">Avg Time</p>
            <p className="font-syne font-800 text-2xl text-ink mt-1">{formatTime(stats.avgTime)}</p>
            <p className="font-dm text-xs text-muted mt-1">Per student</p>
          </div>
          <div className="bg-card border-2 border-border rounded-xl p-4">
            <p className="font-dm text-[10px] uppercase text-muted">Score Range</p>
            <p className="font-syne font-800 text-2xl text-ink mt-1">{stats.lowestScore}-{stats.highestScore}%</p>
            <p className="font-dm text-xs text-muted mt-1">Lowest to highest</p>
          </div>
        </div>
      )}

      {/* Score Distribution Chart */}
      {completed.length > 0 && (
        <div className="bg-card border-2 border-border rounded-2xl p-5">
          <h3 className="font-syne font-700 text-lg text-ink mb-4">Score Distribution</h3>
          <div className="flex items-end gap-2 h-32">
            {Object.entries(distribution).map(([range, count]) => (
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
      )}

      {/* Actionable Insights */}
      {students.length > 0 && (
        <div className="bg-card border-2 border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-syne font-700 text-lg text-ink">Insights & Actions</h3>
            <button 
              onClick={() => setShowInsights(!showInsights)}
              className="text-xs font-syne font-700 text-accent hover:underline"
            >
              {showInsights ? 'Hide' : 'Show'}
            </button>
          </div>
          
          {showInsights && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.struggling.length > 0 && (
                <div className="p-4 rounded-xl border border-wrong/30 bg-wrong/5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">⚠️</span>
                    <h4 className="font-syne font-700 text-sm text-wrong">Students Needing Help</h4>
                  </div>
                  <p className="font-dm text-xs text-muted mb-2">
                    {stats.struggling.length} student{stats.struggling.length > 1 ? 's' : ''} scored below 60%
                  </p>
                  <div className="space-y-1">
                    {stats.struggling.slice(0, 5).map(s => (
                      <p key={s.name} className="font-dm text-xs text-ink">
                        {s.name} <span className="text-wrong font-syne font-700">{s.score}%</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}
              
              {stats.excelling.length > 0 && (
                <div className="p-4 rounded-xl border border-correct/30 bg-correct/5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">🌟</span>
                    <h4 className="font-syne font-700 text-sm text-correct">Top Performers</h4>
                  </div>
                  <p className="font-dm text-xs text-muted mb-2">
                    {stats.excelling.length} student{stats.excelling.length > 1 ? 's' : ''} scored 90% or higher
                  </p>
                  <div className="space-y-1">
                    {stats.excelling.slice(0, 5).map(s => (
                      <p key={s.name} className="font-dm text-xs text-ink">
                        {s.name} <span className="text-correct font-syne font-700">{s.score}%</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}
              
              {stats.struggling.length === 0 && stats.excelling.length === 0 && (
                <p className="font-dm text-sm text-muted col-span-2">
                  No specific insights yet. More data needed as students complete the activity.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Export Button */}
      {students.length > 0 && (
        <a
          href={`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/dashboard/${quizCode}/export`}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-border bg-card font-syne font-600 text-sm text-ink hover:border-accent2 transition-colors"
        >
          <span>📥</span> Download CSV Report
        </a>
      )}

      {/* Student Lists */}
      <div className="space-y-4">
        {/* In Progress Section */}
        {inProgress.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-accent2 rounded-full animate-pulse" />
              <h3 className="font-syne font-700 text-lg text-ink">In Progress ({inProgress.length})</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {inProgress.map((s) => <StudentCard key={s.attempt_id} student={s} />)}
            </div>
          </section>
        )}
        
        {/* Completed Section */}
        {completed.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-correct rounded-full" />
              <h3 className="font-syne font-700 text-lg text-ink">Completed ({completed.length})</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {completed
                .sort((a, b) => (b.percentage || 0) - (a.percentage || 0))
                .map((s) => <StudentCard key={s.attempt_id} student={s} />)
              }
            </div>
          </section>
        )}
        
        {/* Empty State */}
        {students.length === 0 && (
          <div className="text-center py-10">
            <p className="font-dm text-muted text-sm">Waiting for learners to join...</p>
          </div>
        )}
      </div>

      {/* Simulate Student Button */}
      <button
        onClick={addSimStudent}
        className="w-full py-3 rounded-xl border-2 border-dashed border-border font-syne font-600 text-sm text-muted hover:border-accent2 hover:text-ink transition-colors"
      >
        + Simulate Another Learner
      </button>
    </div>
  );
}
