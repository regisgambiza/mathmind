import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';

export default function TeacherLogin() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await api.post('/api/auth/login', { username, password });
            login(res.data.user);
            navigate('/teacher/dashboard-home');
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed. Try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-5 py-12">
            <div className="w-full max-w-[400px] bg-card border-2 border-border rounded-2xl p-8 shadow-sm animate-fadeUp">
                <div className="text-center mb-8">
                    <h1 className="font-syne font-800 text-3xl text-ink mb-2">Teacher Login</h1>
                    <p className="font-dm text-muted text-sm">Access your dashboard & settings</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block font-syne font-600 text-sm text-ink mb-2">Username</label>
                        <input
                            type="text"
                            required
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="w-full p-3 rounded-xl border-2 border-border bg-paper font-dm text-sm outline-none focus:border-accent"
                            placeholder="e.g. admin"
                        />
                    </div>

                    <div>
                        <label className="block font-syne font-600 text-sm text-ink mb-2">Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full p-3 rounded-xl border-2 border-border bg-paper font-dm text-sm outline-none focus:border-accent"
                            placeholder="••••••••"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-wrong text-center animate-shake">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 rounded-xl bg-accent text-white font-syne font-700 text-base hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        {loading ? 'Logging in…' : 'Login →'}
                    </button>
                </form>

                <p className="mt-8 text-center font-dm text-[11px] text-muted">
                    Default credentials: <span className="text-ink font-600">admin / password123</span>
                </p>
            </div>

            <button
                onClick={() => navigate('/')}
                className="mt-6 font-dm text-sm text-muted hover:text-ink transition-colors"
            >
                ← Back to home
            </button>
        </div>
    );
}
