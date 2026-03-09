import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useStudent } from '../context/StudentContext';
import RegisSettingsModal from '../components/RegisSettingsModal';

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const { isStudentAuthenticated, student, logout: logoutStudent } = useStudent();
  const { darkMode, toggleDarkMode } = useTheme();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-5 py-12 relative transition-colors duration-300">
      <button
        onClick={toggleDarkMode}
        className="fixed top-6 left-6 w-10 h-10 bg-card border-2 border-border rounded-xl flex items-center justify-center text-lg hover:border-accent transition-all shadow-sm"
        title="Toggle Dark Mode"
      >
        {darkMode ? '☀️' : '🌙'}
      </button>

      <div className="fixed top-6 right-6 flex flex-col items-end gap-2">
        {isAuthenticated && (
          <button
            onClick={logout}
            className="font-syne font-600 text-xs text-muted hover:text-wrong transition-colors"
          >
            Teacher Logout ({user?.username})
          </button>
        )}
        {isStudentAuthenticated && (
          <button
            onClick={logoutStudent}
            className="font-syne font-600 text-xs text-muted hover:text-wrong transition-colors"
          >
            Student Logout ({student?.name})
          </button>
        )}
      </div>

      <div className="text-center animate-fadeUp mb-12">
        <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-1.5 rounded-full font-syne font-600 text-xs mb-6">
          Powered by Regis
        </div>
        <h1 className="font-syne font-800 text-5xl text-ink leading-none mb-3">
          Math<span className="text-accent">Mind</span>
        </h1>
        <p className="font-dm text-muted text-base max-w-xs mx-auto leading-relaxed">
          Personalized math quizzes with durable progress tracking and gamified learning.
        </p>
      </div>

      <div className="w-full max-w-[480px] space-y-4 animate-fadeUp px-0">
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
              Enter Teacher Dashboard
            </button>
          ) : (
            <button
              onClick={() => navigate('/teacher/login')}
              className="w-full py-3 rounded-xl bg-ink text-paper font-syne font-600 text-sm hover:bg-ink/90 active:scale-[0.98] transition-all"
            >
              Teacher Login
            </button>
          )}
        </div>

        {isStudentAuthenticated ? (
          <div className="w-full bg-card border-2 border-accent2/30 rounded-2xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-accent2/10 rounded-xl flex items-center justify-center text-2xl">🎓</div>
              <div>
                <p className="font-syne font-700 text-ink text-lg">Student</p>
                <p className="font-dm text-muted text-sm">Signed in as {student?.name}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate('/student/dashboard')}
                className="py-3 rounded-xl bg-accent2 text-white font-syne font-700 text-sm"
              >
                Dashboard
              </button>
              <button
                onClick={() => navigate('/student/join')}
                className="py-3 rounded-xl border-2 border-border bg-card font-syne font-700 text-sm text-ink"
              >
                Join Quiz
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => navigate('/student/login')}
            className="w-full bg-card border-2 border-border rounded-2xl p-6 text-left hover:border-accent2 hover:shadow-lg transition-all duration-200 active:scale-[0.98] group"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-accent2/10 rounded-xl flex items-center justify-center text-2xl">🎓</div>
              <div>
                <p className="font-syne font-700 text-ink text-lg">Student</p>
                <p className="font-dm text-muted text-sm">Sign in and track your progress</p>
              </div>
              <svg className="w-5 h-5 text-muted ml-auto group-hover:text-accent2 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        )}
      </div>

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

