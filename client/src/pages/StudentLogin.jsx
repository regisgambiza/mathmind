import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { useStudent } from '../context/StudentContext';
import GoogleLoginButton from '../components/GoogleLoginButton';

export default function StudentLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isStudentAuthenticated, student, logout } = useStudent();

  const redirectTo = useMemo(() => location.state?.from || '/student/dashboard', [location.state]);

  // Store the redirect destination so the OAuth callback can pick it up
  const handleGoogleLogin = () => {
    if (redirectTo !== '/student/dashboard') {
      sessionStorage.setItem('student_login_redirect', redirectTo);
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      <TopBar title="Student Account" showBack role="student" onBack={() => navigate('/')} />
      <div className="max-w-[480px] mx-auto px-5 py-8 animate-fadeUp">
        <h1 className="font-syne font-800 text-3xl text-ink mb-2">Student Account</h1>
        <p className="font-dm text-muted text-sm mb-8">
          Sign in with your school Google account to track quizzes, XP, streaks, and mastery.
        </p>

        {isStudentAuthenticated ? (
          <div className="p-4 rounded-xl border border-accent2/30 bg-accent2/5">
            <p className="font-dm text-sm text-ink">
              Signed in as <span className="font-syne font-700">{student?.name}</span>.
            </p>
            <p className="font-dm text-xs text-muted mt-1">{student?.email}</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => navigate('/student/dashboard')}
                className="flex-1 py-2.5 rounded-lg bg-accent2 text-white font-syne font-700 text-sm"
              >
                Open Dashboard
              </button>
              <button
                onClick={logout}
                className="flex-1 py-2.5 rounded-lg border border-border bg-card font-syne font-600 text-sm text-ink"
              >
                Switch Account
              </button>
            </div>
          </div>
        ) : (
          <div onClick={handleGoogleLogin}>
            <GoogleLoginButton
              user_type="student"
              text="Sign in with Google"
              fullWidth
              size="lg"
            />
          </div>
        )}
      </div>
    </div>
  );
}
