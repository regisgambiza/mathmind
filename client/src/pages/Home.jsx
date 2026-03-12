import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStudent } from '../context/StudentContext';
import { useTheme } from '../context/ThemeContext';
import RegisSettingsModal from '../components/RegisSettingsModal';

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout, googleLogin } = useAuth();
  const { isStudentAuthenticated, student, logout: logoutStudent, googleLogin: studentGoogleLogin } = useStudent();
  const { darkMode, toggleDarkMode } = useTheme();
  const [showSettings, setShowSettings] = useState(false);
  const teacherButtonRef = useRef(null);
  const studentButtonRef = useRef(null);

  // Initialize Google Sign-In buttons after component mounts
  useEffect(() => {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      // DEBUG: Log the client ID being used
      console.log('VITE_GOOGLE_CLIENT_ID:', import.meta.env.VITE_GOOGLE_CLIENT_ID);
      
      // Initialize Teacher Google Sign-In
      if (teacherButtonRef.current && !teacherButtonRef.current.hasAttribute('data-initialized')) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID',
          callback: async (response) => {
            try {
              await googleLogin(response.credential);
              navigate('/teacher/dashboard-home');
            } catch (error) {
              console.error('Teacher Google login failed:', error);
              alert('Login failed. Please try again.');
            }
          },
        });

        window.google.accounts.id.renderButton(teacherButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: '100%',
          text: 'signin_with',
        });
        teacherButtonRef.current.setAttribute('data-initialized', 'true');
      }

      // Initialize Student Google Sign-In
      if (studentButtonRef.current && !studentButtonRef.current.hasAttribute('data-initialized')) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID',
          callback: async (response) => {
            try {
              const decoded = JSON.parse(atob(response.credential.split('.')[1]));
              await studentGoogleLogin(response.credential, decoded.sub);
              navigate('/student/dashboard');
            } catch (error) {
              console.error('Student Google login failed:', error);
              alert('Login failed. Please try again.');
            }
          },
        });

        window.google.accounts.id.renderButton(studentButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: '100%',
          text: 'signin_with',
        });
        studentButtonRef.current.setAttribute('data-initialized', 'true');
      }
    }
  }, [googleLogin, studentGoogleLogin, navigate]);

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
            <div ref={teacherButtonRef} className="w-full flex justify-center"></div>
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
            <div ref={studentButtonRef} className="w-full flex justify-center"></div>
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

