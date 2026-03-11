import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function TeacherLogin() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleGoogleLogin = () => {
        setLoading(true);
        setError('');
        // Redirect to Google OAuth
        window.location.href = '/api/auth/google?next=/teacher/dashboard';
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-5 py-12">
            <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-lg">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">🧠 MathMind</h1>
                    <p className="text-gray-600 text-sm">Teacher Login</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        {error}
                    </div>
                )}

                {/* Google SSO Button */}
                <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-medium py-3 px-4 rounded-lg transition-all disabled:opacity-50 mb-6"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign in with Google
                </button>

                <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-gray-500">OR</span>
                    </div>
                </div>

                {/* Traditional Login Form */}
                <form className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="admin"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <input
                            type="password"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="button"
                        className="w-full py-3 bg-gray-700 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
                    >
                        Login with Password
                    </button>
                </form>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-800">
                        <strong>📝 Note:</strong> Use your school Google account to sign in. 
                        Your teacher account must be pre-provisioned in the system.
                    </p>
                </div>
            </div>

            <button
                onClick={() => navigate('/')}
                className="mt-6 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
                ← Back to home
            </button>
        </div>
    );
}
