import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStudent } from '../context/StudentContext';
import { useTheme } from '../context/ThemeContext';
import { useQuiz } from '../context/QuizContext';
import RegisSettingsModal from '../components/RegisSettingsModal';
import GoogleLoginButton from '../components/GoogleLoginButton';
import api from '../hooks/useApi';

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout, login } = useAuth();
  const { isStudentAuthenticated, student, hydrateFromOAuth, logout: logoutStudent } = useStudent();
  const { darkMode, toggleDarkMode } = useTheme();
  const {
    setStudentName,
    setQuizConfig,
    setAttemptId,
    setQuizCode,
    setTimeLimit,
    setSubmissionRewards,
    setCurrentQuestions,
  } = useQuiz();
  const [showSettings, setShowSettings] = useState(false);

  // Capture pending quiz code from direct links (e.g., /quiz/ABCD or #/quiz/ABCD)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('quiz_code');
    const pathMatch = window.location.pathname.match(/\/quiz\/([A-Za-z0-9]+)/i);
    const hashMatch = window.location.hash.match(/#\/quiz\/([A-Za-z0-9]+)/i);
    const code = (codeParam || pathMatch?.[1] || hashMatch?.[1] || '').toUpperCase();
    if (code) {
      sessionStorage.setItem('pending_quiz_code', code);
    }
  }, []);

  const startQuizFromCode = useCallback(async (quizCode, studentInfo) => {
    if (!quizCode) return;
    try {
      const normalizedCode = quizCode.toUpperCase();
      const quizRes = await api.get(`/api/quiz/${normalizedCode}`);
      const quiz = quizRes.data;

      const attemptRes = await api.post('/api/attempt/start', {
        quiz_code: normalizedCode,
        student_id: studentInfo?.id,
        student_name: studentInfo?.name,
        student_email: studentInfo?.email,
      });

      const parsedSubtopics = Array.isArray(quiz.subtopic)
        ? quiz.subtopic
        : (() => {
          try {
            return quiz.subtopic ? JSON.parse(quiz.subtopic) : [];
          } catch {
            return [];
          }
        })();

      setStudentName(studentInfo?.name || '');
      setQuizConfig({
        topic: quiz.topic,
        grade: quiz.grade,
        count: quiz.q_count,
        types: quiz.question_types,
        extra: quiz.extra_instructions || '',
        chapter: quiz.chapter || quiz.topic,
        subtopics: parsedSubtopics,
        activity_type: quiz.activity_type || 'class_activity',
        class_name: quiz.class_name || null,
        section_name: quiz.section_name || null,
      });
      setAttemptId(attemptRes.data.attempt_id);
      setQuizCode(normalizedCode);
      setTimeLimit(Number(quiz.time_limit_mins) || 0);
      setSubmissionRewards(null);
      setCurrentQuestions([]);

      sessionStorage.removeItem('pending_quiz_code');
      navigate('/quiz/loading', { replace: true });
    } catch (err) {
      console.error('Failed to auto-start quiz from link:', err);
      sessionStorage.removeItem('pending_quiz_code');
      navigate('/student/dashboard', { replace: true });
    }
  }, [
    navigate,
    setAttemptId,
    setCurrentQuestions,
    setQuizCode,
    setQuizConfig,
    setStudentName,
    setSubmissionRewards,
    setTimeLimit,
  ]);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginSuccess = params.get('login_success');
    const userType = params.get('user_type');
    const userData = params.get('user_data');
    const error = params.get('error');

    if (error) {
      alert('Login failed: ' + decodeURIComponent(error));
      window.history.replaceState({}, document.title, '/');
      return;
    }

    if (loginSuccess && userData) {
      (async () => {
        try {
          const parsedUser = JSON.parse(decodeURIComponent(userData));
          if (userType === 'teacher') {
            login(parsedUser);
            navigate('/teacher/dashboard-home');
          } else if (userType === 'student') {
            await hydrateFromOAuth(parsedUser);
            const pending = sessionStorage.getItem('pending_quiz_code');
            if (pending) {
              await startQuizFromCode(pending, parsedUser);
            } else {
              navigate('/student/dashboard');
            }
          }
          window.history.replaceState({}, document.title, '/');
        } catch (e) {
          console.error('Failed to parse user data:', e);
        }
      })();
    }
  }, [navigate, login, hydrateFromOAuth, startQuizFromCode]);

  // If already logged in as student and a pending quiz code exists, jump straight in
  useEffect(() => {
    const pending = sessionStorage.getItem('pending_quiz_code');
    if (pending && isStudentAuthenticated && student) {
      startQuizFromCode(pending, student);
    }
  }, [isStudentAuthenticated, student, startQuizFromCode]);

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-5 py-12 relative transition-colors duration-300">
      {/* Dark Mode Toggle */}
      <button
        onClick={toggleDarkMode}
        className="fixed top-6 left-6 w-10 h-10 bg-card border-2 border-border rounded-xl flex items-center justify-center text-lg hover:border-accent transition-all shadow-sm"
        title="Toggle Dark Mode"
      >
        {darkMode ? '☀️' : '🌙'}
      </button>

      {/* Logout Buttons */}
      <div className="fixed top-6 right-6 flex flex-col items-end gap-2">
        {isAuthenticated && (
          <button
            onClick={logout}
            className="font-syne font-600 text-xs text-muted hover:text-wrong transition-colors"
          >
            Logout ({user?.name || user?.username})
          </button>
        )}
        {isStudentAuthenticated && (
          <button
            onClick={logoutStudent}
            className="font-syne font-600 text-xs text-muted hover:text-wrong transition-colors"
          >
            Logout ({student?.name})
          </button>
        )}
      </div>

      {/* Header */}
      <div className="text-center animate-fadeUp mb-12">
        <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-1.5 rounded-full font-syne font-600 text-xs mb-6">
          Powered by Regis
        </div>
        <h1 className="font-syne font-800 text-5xl text-ink leading-none mb-3">
          Math<span className="text-accent">Mind</span>
        </h1>
        <p className="font-dm text-muted text-base max-w-xs mx-auto leading-relaxed">
          AI-powered math quizzes for personalized learning
        </p>
      </div>

      {/* Login Cards */}
      <div className="w-full max-w-[480px] space-y-6 animate-fadeUp">
        {/* Teacher Login Card */}
        <div className="w-full bg-card border-2 border-border rounded-2xl p-6 transition-all duration-200">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 bg-accent/10 rounded-xl flex items-center justify-center text-2xl">📋</div>
            <div>
              <p className="font-syne font-700 text-ink text-lg">Teacher</p>
              <p className="font-dm text-muted text-sm">Create and manage quizzes</p>
            </div>
          </div>

          {isAuthenticated ? (
            <button
              onClick={() => navigate('/teacher/dashboard-home')}
              className="w-full py-4 rounded-xl bg-accent text-white font-syne font-800 text-sm hover:bg-accent/90 active:scale-[0.98] transition-all"
            >
              Go to Dashboard
            </button>
          ) : (
            <GoogleLoginButton
              user_type="teacher"
              text="Sign in with Google"
              fullWidth
              size="lg"
            />
          )}
        </div>

        {/* Student Login Card */}
        <div className="w-full bg-card border-2 border-border rounded-2xl p-6 transition-all duration-200">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 bg-accent2/10 rounded-xl flex items-center justify-center text-2xl">🎓</div>
            <div>
              <p className="font-syne font-700 text-ink text-lg">Student</p>
              <p className="font-dm text-muted text-sm">Track your progress</p>
            </div>
          </div>

          {isStudentAuthenticated ? (
            <button
              onClick={() => navigate('/student/dashboard')}
              className="w-full py-4 rounded-xl bg-accent2 text-white font-syne font-800 text-sm hover:bg-accent2/90 active:scale-[0.98] transition-all"
            >
              Go to Dashboard
            </button>
          ) : (
            <GoogleLoginButton
              user_type="student"
              text="Sign in with Google"
              fullWidth
              size="lg"
            />
          )}
        </div>
      </div>

      {/* Settings Button */}
      {isAuthenticated && (
        <button
          onClick={() => setShowSettings(true)}
          className="fixed bottom-6 right-6 w-12 h-12 bg-card border-2 border-border rounded-full flex items-center justify-center text-xl hover:border-accent2 hover:rotate-45 transition-all duration-300 shadow-sm"
          title="Regis Settings"
        >
          ⚙️
        </button>
      )}

      {showSettings && <RegisSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
