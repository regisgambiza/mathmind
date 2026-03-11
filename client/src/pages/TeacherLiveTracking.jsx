import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TopBar from '../components/TopBar';
import StudentLiveCard from '../components/StudentLiveCard';
import { useSocket } from '../hooks/useSocket';
import api from '../hooks/useApi';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function TeacherLiveTracking() {
  const navigate = useNavigate();
  const { code } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [students, setStudents] = useState([]);
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  
  const { socket, emit, on, getStatus, isConnected } = useSocket(code);
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // Fetch initial live data
  const fetchLiveData = useCallback(async () => {
    try {
      const res = await api.get(`/api/dashboard/${code.toUpperCase()}/live`);
      setQuiz(res.data.quiz);
      setStudents(res.data.students);
      setStats(res.data.stats);
      setAlerts(res.data.alerts || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch live data:', err);
      setError('Failed to load live tracking data');
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    fetchLiveData();
  }, [fetchLiveData]);

  // Update connection status
  useEffect(() => {
    setConnectionStatus(getStatus());
    const interval = setInterval(() => {
      setConnectionStatus(getStatus());
    }, 2000);
    return () => clearInterval(interval);
  }, [getStatus]);

  // Setup socket event listeners
  useEffect(() => {
    if (!socket) return;

    console.log('[LiveTracking] Socket ready, listening for events');

    // Listen for student events
    const cleanupJoined = on('student_joined', (data) => {
      console.log('[LiveTracking] Student joined:', data);
      if (!data?.attempt_id) return;
      setStudents(prev => {
        const exists = prev.find(s => s.attempt_id === data.attempt_id);
        if (exists) return prev;
        return [...prev, {
          ...data,
          is_active: true,
          is_completed: false,
          current_question: data.current_question || 0,
          progress_percent: data.progress_percent || 0,
          violation_count: data.violation_count || 0,
        }];
      });
      setStats(prev => prev ? { ...prev, started: prev.started + 1, active: prev.active + 1 } : null);
    });

    const cleanupProgress = on('student_progress', (data) => {
      console.log('[LiveTracking] Student progress:', data);
      setStudents(prev => prev.map(s =>
        s.attempt_id === data.attempt_id
          ? {
              ...s,
              current_question: (data.question_index || 0) + 1,
              progress_percent: quiz?.q_count > 0 
                ? Math.round(((data.question_index || 0) + 1) / quiz.q_count * 100)
                : 0,
              last_activity_at: new Date().toISOString(),
            }
          : s
      ));
    });

    const cleanupViolation = on('student_violation', (data) => {
      console.log('[LiveTracking] Student violation:', data);
      setStudents(prev => prev.map(s =>
        s.attempt_id === data.attempt_id
          ? { ...s, violation_count: data.violation_count }
          : s
      ));
      
      if (data.is_critical) {
        setAlerts(prev => [{
          type: 'violation',
          severity: 'critical',
          attempt_id: data.attempt_id,
          student_name: data.student_name,
          message: `${data.student_name} has ${data.violation_count} violations`,
          timestamp: new Date().toISOString(),
        }, ...prev]);
      }
    });

    const cleanupCompleted = on('student_completed', (data) => {
      console.log('[LiveTracking] Student completed:', data);
      setStudents(prev => prev.map(s =>
        s.attempt_id === data.attempt_id
          ? {
              ...s,
              is_completed: true,
              is_active: false,
              status: 'completed',
              score: data.score,
              total: data.total,
              percentage: data.percentage,
              time_taken_s: data.time_taken,
              completed_at: data.timestamp,
            }
          : s
      ));
      setStats(prev => prev ? {
        ...prev,
        completed: prev.completed + 1,
        active: prev.active - 1,
      } : null);
    });

    return () => {
      cleanupJoined?.();
      cleanupProgress?.();
      cleanupViolation?.();
      cleanupCompleted?.();
    };
  }, [socket, on, quiz?.q_count]);

  // Auto-refresh stats every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchLiveData, 30000);
    return () => clearInterval(interval);
  }, [fetchLiveData]);

  const handleSendMessage = async (student, type) => {
    if (!socket || !isConnected) {
      alert('Not connected to server. Please wait...');
      return;
    }
    
    try {
      // Send via socket instead of API
      if (type === 'warning') {
        emit('teacher_warning', {
          student_socket_id: student.socket_id,
          quiz_code: code.toUpperCase(),
        });
        
        setAlerts(prev => [{
          type: 'info',
          severity: 'info',
          message: `Sent warning to ${student.student_name}`,
          timestamp: new Date().toISOString(),
        }, ...prev]);
        
        setTimeout(() => {
          setAlerts(prev => prev.slice(0, -1));
        }, 3000);
      } else if (type === 'message' && messageInput.trim()) {
        emit('teacher_message', {
          student_socket_id: student.socket_id,
          message: messageInput,
          quiz_code: code.toUpperCase(),
        });
        setMessageInput('');
        
        setAlerts(prev => [{
          type: 'info',
          severity: 'info',
          message: `Sent message to ${student.student_name}`,
          timestamp: new Date().toISOString(),
        }, ...prev]);
        
        setTimeout(() => {
          setAlerts(prev => prev.slice(0, -1));
        }, 3000);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      alert('Failed to send message. Student may not be connected.');
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim() || !socket || !isConnected) return;
    
    emit('teacher_broadcast', {
      quiz_code: code.toUpperCase(),
      message: broadcastMessage,
    });
    
    setBroadcastMessage('');
    setShowBroadcast(false);
    
    setAlerts(prev => [{
      type: 'info',
      severity: 'info',
      message: 'Broadcast sent to all students',
      timestamp: new Date().toISOString(),
    }, ...prev]);
    
    setTimeout(() => {
      setAlerts(prev => prev.slice(0, -1));
    }, 3000);
  };

  const handleEndQuiz = async () => {
    if (!window.confirm('End quiz early for all students? This cannot be undone.')) return;
    
    // TODO: Implement end quiz endpoint
    alert('Quiz ended. This feature is coming soon.');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center animate-fadeUp">
          <div className="w-12 h-12 border-4 border-border border-t-accent rounded-full animate-spin mb-4" />
          <p className="font-dm text-muted text-sm">Loading live tracking...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center animate-fadeUp">
          <p className="text-4xl mb-4">⚠️</p>
          <h2 className="font-syne font-700 text-xl text-ink mb-2">Failed to Load</h2>
          <p className="font-dm text-sm text-muted mb-4">{error}</p>
          <button
            onClick={fetchLiveData}
            className="px-6 py-3 rounded-xl bg-accent text-white font-syne font-700 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper pb-20">
      <TopBar 
        title={`📡 Live: ${code}`} 
        role="teacher" 
        showBack 
        onBack={() => navigate('/teacher/history')} 
      />

      <div className="max-w-[1400px] mx-auto px-5 py-6 space-y-6 animate-fadeUp">
        {/* Header */}
        <header className="bg-card border-2 border-border rounded-2xl p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="font-syne font-800 text-xl text-ink">{quiz?.topic}</h1>
              <p className="font-dm text-sm text-muted mt-1">
                {quiz?.q_count} questions • {quiz?.time_limit_mins || 'No'} min time limit
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Connection Status */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-syne font-700 ${
                isConnected 
                  ? 'bg-green-500/20 text-green-500' 
                  : 'bg-red-500/20 text-red-500'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                {isConnected ? 'Live' : 'Disconnected'}
              </div>
              
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent2/10 border border-accent2/20">
                <span className="text-xl">⏱️</span>
                <span className="font-syne font-700 text-sm text-accent2">
                  {quiz?.time_limit_mins ? formatTime(quiz.time_limit_mins * 60) : 'Untimed'}
                </span>
              </div>
              <button
                onClick={handleEndQuiz}
                className="px-4 py-2 rounded-xl bg-wrong/10 text-wrong font-syne font-700 text-sm hover:bg-wrong/20 transition-colors"
              >
                End Quiz Early
              </button>
              <button
                onClick={() => setShowBroadcast(!showBroadcast)}
                className="px-4 py-2 rounded-xl bg-accent text-white font-syne font-700 text-sm hover:bg-accent/90 transition-colors"
              >
                📢 Broadcast
              </button>
            </div>
          </div>

          {/* Broadcast Input */}
          {showBroadcast && (
            <div className="mt-4 p-4 rounded-xl border-2 border-accent/30 bg-accent/5 animate-fadeUp">
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Type message to all students..."
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleBroadcast()}
                  className="flex-1 px-4 py-2 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent"
                  autoFocus
                />
                <button
                  onClick={handleBroadcast}
                  className="px-6 py-2 rounded-xl bg-accent text-white font-syne font-700 text-sm hover:bg-accent/90"
                >
                  Send
                </button>
                <button
                  onClick={() => setShowBroadcast(false)}
                  className="px-4 py-2 rounded-xl border border-border bg-card font-syne font-700 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </header>

        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-card border-2 border-border rounded-xl p-4">
              <p className="font-dm text-[10px] uppercase text-muted">Total</p>
              <p className="font-syne font-800 text-2xl text-ink mt-1">{stats.total}</p>
            </div>
            <div className="bg-card border-2 border-border rounded-xl p-4">
              <p className="font-dm text-[10px] uppercase text-muted">Started</p>
              <p className="font-syne font-800 text-2xl text-ink mt-1">{stats.started}</p>
            </div>
            <div className="bg-card border-2 border-border rounded-xl p-4">
              <p className="font-dm text-[10px] uppercase text-muted">Active</p>
              <p className="font-syne font-800 text-2xl text-accent2 mt-1">{stats.active}</p>
            </div>
            <div className="bg-card border-2 border-border rounded-xl p-4">
              <p className="font-dm text-[10px] uppercase text-muted">Completed</p>
              <p className="font-syne font-800 text-2xl text-correct mt-1">{stats.completed}</p>
            </div>
            <div className="bg-card border-2 border-border rounded-xl p-4">
              <p className="font-dm text-[10px] uppercase text-muted">Avg Progress</p>
              <p className="font-syne font-800 text-2xl text-ink mt-1">{stats.avg_progress}%</p>
            </div>
            <div className="bg-card border-2 border-border rounded-xl p-4">
              <p className="font-dm text-[10px] uppercase text-muted">Avg Q#</p>
              <p className="font-syne font-800 text-2xl text-ink mt-1">{stats.avg_question}</p>
            </div>
          </div>
        )}

        {/* Alerts Panel */}
        {alerts.length > 0 && (
          <div className="bg-card border-2 border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-syne font-700 text-lg text-ink">🔔 Live Alerts</h2>
              <button
                onClick={() => setAlerts([])}
                className="text-xs font-syne font-700 text-accent hover:underline"
              >
                Clear All
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-auto">
              {alerts.map((alert, idx) => (
                <div
                  key={`${alert.attempt_id}-${idx}`}
                  className={`p-3 rounded-xl border-2 ${
                    alert.severity === 'critical' ? 'border-red-500/30 bg-red-500/5' :
                    alert.severity === 'warning' ? 'border-yellow-500/30 bg-yellow-500/5' :
                    'border-accent/30 bg-accent/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className={`font-dm text-sm ${
                      alert.severity === 'critical' ? 'text-wrong' :
                      alert.severity === 'warning' ? 'text-yellow-600' :
                      'text-accent'
                    }`}>
                      {alert.message}
                    </p>
                    <span className="font-dm text-[10px] text-muted">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Students Grid */}
        <div className="bg-card border-2 border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-syne font-700 text-lg text-ink">👥 Students ({students.length})</h2>
            <div className="flex gap-2">
              <select className="px-3 py-1.5 rounded-lg border border-border bg-card font-dm text-sm">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="warning">Warnings</option>
              </select>
            </div>
          </div>

          {students.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">👀</p>
              <p className="font-syne font-700 text-ink mb-2">Waiting for students...</p>
              <p className="font-dm text-sm text-muted">Share the quiz code with students to begin.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {students.map((student, idx) => (
                <StudentLiveCard
                  key={student.attempt_id || `student-${idx}`}
                  student={student}
                  quizTotalQuestions={quiz?.q_count || 10}
                  onClick={() => setSelectedStudent(student)}
                  onSendMessage={handleSendMessage}
                />
              ))}
            </div>
          )}
        </div>

        {/* Student Detail Modal */}
        {selectedStudent && (
          <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center px-5">
            <div className="bg-card rounded-2xl p-6 max-w-md w-full animate-fadeUp max-h-[80vh] overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-syne font-700 text-lg text-ink">
                  {selectedStudent.student_name}
                </h3>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="text-muted hover:text-ink transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-3 rounded-xl border border-border bg-paper">
                  <p className="font-dm text-xs text-muted mb-1">Status</p>
                  <p className="font-syne font-700 text-sm text-ink">
                    {selectedStudent.is_completed ? '✓ Completed' : 
                     selectedStudent.is_active ? '● Active' : '○ Inactive'}
                  </p>
                </div>

                {selectedStudent.is_completed ? (
                  <>
                    <div className="p-3 rounded-xl border border-border bg-paper">
                      <p className="font-dm text-xs text-muted mb-1">Score</p>
                      <p className="font-syne font-700 text-lg text-ink">
                        {selectedStudent.score}/{selectedStudent.total} ({Math.round(selectedStudent.percentage)}%)
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border border-border bg-paper">
                      <p className="font-dm text-xs text-muted mb-1">Time Taken</p>
                      <p className="font-syne font-700 text-sm text-ink">
                        {formatTime(selectedStudent.time_taken_s)}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-3 rounded-xl border border-border bg-paper">
                      <p className="font-dm text-xs text-muted mb-1">Current Question</p>
                      <p className="font-syne font-700 text-lg text-ink">
                        {selectedStudent.current_question}/{quiz?.q_count}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border border-border bg-paper">
                      <p className="font-dm text-xs text-muted mb-1">Progress</p>
                      <div className="h-2 bg-paper rounded-full overflow-hidden border border-border mt-1">
                        <div
                          className="h-full bg-accent2"
                          style={{ width: `${selectedStudent.progress_percent}%` }}
                        />
                      </div>
                      <p className="font-dm text-xs text-muted mt-1">
                        {selectedStudent.progress_percent}%
                      </p>
                    </div>
                  </>
                )}

                {selectedStudent.violation_count > 0 && (
                  <div className="p-3 rounded-xl border-2 border-wrong/30 bg-wrong/5">
                    <p className="font-dm text-xs text-wrong font-700 mb-1">
                      ⚠️ Violations: {selectedStudent.violation_count}
                    </p>
                    <p className="font-dm text-xs text-muted">
                      {selectedStudent.violation_count >= 3 
                        ? 'Critical: Consider intervention' 
                        : 'Warning: Monitor closely'}
                    </p>
                  </div>
                )}

                <div className="p-3 rounded-xl border border-border bg-paper">
                  <p className="font-dm text-xs text-muted mb-1">Started</p>
                  <p className="font-syne font-700 text-sm text-ink">
                    {new Date(selectedStudent.started_at).toLocaleString()}
                  </p>
                </div>

                {selectedStudent.last_activity_at && (
                  <div className="p-3 rounded-xl border border-border bg-paper">
                    <p className="font-dm text-xs text-muted mb-1">Last Activity</p>
                    <p className="font-syne font-700 text-sm text-ink">
                      {new Date(selectedStudent.last_activity_at).toLocaleString()}
                    </p>
                  </div>
                )}

                {/* Quick Actions */}
                {selectedStudent.is_active && (
                  <div className="flex gap-2 pt-4 border-t border-border">
                    <button
                      onClick={() => handleSendMessage(selectedStudent, 'warning')}
                      className="flex-1 py-2.5 rounded-xl bg-wrong/10 text-wrong font-syne font-700 text-sm hover:bg-wrong/20"
                    >
                      ⚠️ Send Warning
                    </button>
                    <button
                      onClick={() => setSelectedStudent(null)}
                      className="flex-1 py-2.5 rounded-xl bg-ink text-paper font-syne font-700 text-sm hover:bg-ink/90"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
