import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { useStudent } from '../context/StudentContext';

export default function StudentLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isStudentAuthenticated, student, register, login, logout } = useStudent();

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const redirectTo = useMemo(() => location.state?.from || '/student/dashboard', [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') await register(email.trim(), name.trim(), pin.trim());
      else await login(email.trim(), pin.trim());
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Could not sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      <TopBar title="Student Account" showBack role="student" onBack={() => navigate('/')} />
      <div className="max-w-[480px] mx-auto px-5 py-8 animate-fadeUp">
        <h1 className="font-syne font-800 text-3xl text-ink mb-2">Student Account</h1>
        <p className="font-dm text-muted text-sm mb-8">
          Sign in to track your quizzes, XP, streaks, badges, and mastery over time.
        </p>

        {isStudentAuthenticated && (
          <div className="mb-6 p-4 rounded-xl border border-accent2/30 bg-accent2/5">
            <p className="font-dm text-sm text-ink">
              Signed in as <span className="font-syne font-700">{student?.name}</span>.
            </p>
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
        )}

        <div className="grid grid-cols-2 gap-2 mb-5">
          <button
            onClick={() => setMode('login')}
            className={`py-3 rounded-xl font-syne font-700 text-sm border-2 transition-colors ${mode === 'login' ? 'bg-ink text-paper border-ink' : 'bg-card text-ink border-border'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode('register')}
            className={`py-3 rounded-xl font-syne font-700 text-sm border-2 transition-colors ${mode === 'register' ? 'bg-ink text-paper border-ink' : 'bg-card text-ink border-border'}`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-syne font-600 text-sm text-ink block mb-2">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={120}
              placeholder="e.g. maya@school.edu"
              className="w-full p-4 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2 transition-colors"
              required
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="font-syne font-600 text-sm text-ink block mb-2">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="e.g. Maya Johnson"
                className="w-full p-4 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2 transition-colors"
                required
              />
            </div>
          )}

          <div>
            <label className="font-syne font-600 text-sm text-ink block mb-2">PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              minLength={4}
              maxLength={12}
              placeholder="At least 4 characters"
              className="w-full p-4 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2 transition-colors"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm font-dm text-wrong">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl bg-accent2 text-white font-syne font-700 text-base disabled:opacity-60 disabled:cursor-not-allowed hover:bg-accent2/90 active:scale-[0.98] transition-all"
          >
            {loading ? 'Please wait...' : (mode === 'register' ? 'Create Account' : 'Sign In')}
          </button>
        </form>
      </div>
    </div>
  );
}
