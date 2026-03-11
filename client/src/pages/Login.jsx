import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [userType, setUserType] = useState('teacher'); // 'teacher' or 'student'

    const handleGoogleLogin = () => {
        setLoading(true);
        setError('');
        
        // Redirect to Google OAuth with appropriate next URL
        const nextUrl = userType === 'teacher' ? '/teacher/dashboard' : '/student/dashboard';
        window.location.href = `/api/auth/google?next=${nextUrl}`;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center px-5 py-12">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">🧠 MathMind</h1>
                    <p className="text-gray-600">AI-Powered Math Practice</p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        {error}
                    </div>
                )}

                {/* User Type Selector */}
                <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
                    <button
                        onClick={() => setUserType('teacher')}
                        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                            userType === 'teacher'
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        👨‍🏫 Teacher
                    </button>
                    <button
                        onClick={() => setUserType('student')}
                        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                            userType === 'student'
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        👤 Student
                    </button>
                </div>

                {/* Google SSO Button */}
                <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-medium py-3 px-4 rounded-lg transition-all disabled:opacity-50 mb-4"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign in with Google
                </button>

                <p className="text-xs text-gray-500 text-center mb-6">
                    Use your school email (e.g., your.name@yourschool.edu)
                </p>

                {/* Info Box */}
                <div className={`p-4 rounded-lg mb-6 ${
                    userType === 'teacher' ? 'bg-blue-50' : 'bg-green-50'
                }`}>
                    {userType === 'teacher' ? (
                        <p className="text-xs text-blue-800">
                            <strong>👨‍🏫 Teachers:</strong> Sign in with your school Google account to access 
                            your classes, create quizzes, and view student results.
                        </p>
                    ) : (
                        <p className="text-xs text-green-800">
                            <strong>👤 Students:</strong> Sign in with your school Google account to access 
                            assigned quizzes and practice modes. Your progress is saved automatically.
                        </p>
                    )}
                </div>

                {/* Alternative: Join with Code */}
                {userType === 'student' && (
                    <div className="text-center">
                        <p className="text-sm text-gray-600 mb-3">Don't have a Google account?</p>
                        <button
                            onClick={() => navigate('/student/join')}
                            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                            Join with class code →
                        </button>
                    </div>
                )}
            </div>

            {/* Footer Links */}
            <div className="mt-8 flex gap-6">
                <button
                    onClick={() => navigate('/')}
                    className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                    ← Back to home
                </button>
                <a
                    href="/docs/CLASSROOM_SETUP.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                    Setup Guide
                </a>
            </div>
        </div>
    );
}
