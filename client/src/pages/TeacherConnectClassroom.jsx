import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';
import Button from '../components/Button';
import GoogleLoginButton from '../components/GoogleLoginButton';

export default function TeacherConnectClassroom() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [teacherId, setTeacherId] = useState(null);
  const [googleStatus, setGoogleStatus] = useState({ connected: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Get teacher from localStorage
    const teacher = localStorage.getItem('mathmind_teacher');
    if (teacher) {
      try {
        const teacherData = JSON.parse(teacher);
        setTeacherId(teacherData.id);
        // Sync with AuthContext if not already authenticated
        if (!isAuthenticated) {
          login(teacherData);
        }
        checkStatus(teacherData.id);
      } catch (e) {
        console.error('Failed to parse teacher data');
        setError('Please log in first');
      }
    } else {
      setError('Please log in as a teacher first');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Check for success param from OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setSuccess(true);
      checkStatus(teacherId);
      setTimeout(() => setSuccess(false), 5000);
    }
    const errorMsg = params.get('error');
    if (errorMsg) {
      setError(decodeURIComponent(errorMsg));
    }
  }, [teacherId]);

  const checkStatus = async (tid) => {
    try {
      const res = await api.get(`/api/auth/google/status?teacher_id=${tid}`);
      setGoogleStatus(res.data);
    } catch (e) {
      setGoogleStatus({ connected: false });
    }
  };

  const handleGoogleSuccess = async (data) => {
    console.log('Google login success:', data);
    // Store teacher data in localStorage
    localStorage.setItem('mathmind_teacher', JSON.stringify(data.user));
    setGoogleStatus({ connected: false, email: data.user.email }); // Not connected to Classroom yet

    // Now initiate Classroom OAuth flow
    await initiateClassroomAuth(data.user.id);
  };

  const initiateClassroomAuth = async (tid) => {
    console.log('Initiating Classroom OAuth for teacher:', tid);
    try {
      const res = await api.get(`/api/auth/google/classroom?teacher_id=${tid}`);
      console.log('Classroom auth response:', res.data);
      if (res.data.authorization_url) {
        console.log('Redirecting to:', res.data.authorization_url);
        // Small delay to ensure state is saved
        setTimeout(() => {
          window.location.href = res.data.authorization_url;
        }, 100);
      } else {
        setError('No authorization URL received');
      }
    } catch (e) {
      console.error('Classroom auth error:', e);
      setError(e.response?.data?.error || 'Failed to start Google Classroom connection');
    }
  };

  const handleDisconnect = async () => {
    // This would require backend implementation to clear tokens
    setError('Disconnect not yet implemented');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent2 mx-auto mb-4"></div>
          <p className="text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="font-syne font-800 text-3xl text-ink">📚 Connect Google Classroom</h1>
          <p className="font-dm text-muted mt-1">
            Link your Google account to create assignments and sync grades
          </p>
        </header>

        {success && (
          <div className="p-4 bg-correct/10 border border-correct rounded-xl text-correct">
            ✅ Google Classroom connected successfully!
          </div>
        )}

        {error && (
          <div className="p-4 bg-wrong/10 border border-wrong rounded-xl text-wrong">
            {error}
          </div>
        )}

        <div className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="font-syne font-700 text-xl text-ink mb-4">Connection Status</h2>
          
          {googleStatus.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-correct/10 border border-correct rounded-xl">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-syne font-600 text-ink">Google Connected</p>
                  <p className="font-dm text-sm text-muted">{googleStatus.email}</p>
                </div>
              </div>
              
              <div className="p-4 bg-paper rounded-xl border border-border">
                <h3 className="font-syne font-600 text-sm text-ink mb-2">What you can do:</h3>
                <ul className="space-y-1 font-dm text-sm text-muted">
                  <li>• Create assignments in Google Classroom</li>
                  <li>• Sync quiz grades automatically</li>
                  <li>• Validate student enrollment</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="primary"
                  onClick={() => navigate('/teacher/setup')}
                  fullWidth
                >
                  Create Quiz
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleDisconnect}
                  fullWidth
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-paper rounded-xl border border-border">
                <h3 className="font-syne font-600 text-sm text-ink mb-2">Connect in 2 steps:</h3>
                <ol className="space-y-2 font-dm text-sm text-muted">
                  <li>1. Sign in with your Google account</li>
                  <li>2. Grant Classroom permissions</li>
                </ol>
              </div>

              {!teacherId ? (
                <div className="text-center p-4">
                  <p className="text-muted mb-4">Please log in as a teacher first</p>
                  <Button
                    variant="primary"
                    onClick={() => navigate('/teacher/login')}
                  >
                    Teacher Login
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {!googleStatus.email ? (
                    <div>
                      <p className="text-sm text-muted mb-3 text-center">Step 1: Sign in with Google</p>
                      <GoogleLoginButton
                        user_type="teacher"
                        onSuccess={handleGoogleSuccess}
                        onError={(err) => setError(err)}
                        fullWidth
                      />
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-muted mb-4">Step 2: Grant Classroom access</p>
                      <Button
                        variant="primary"
                        onClick={() => initiateClassroomAuth(teacherId)}
                        fullWidth
                      >
                        Connect Classroom →
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-paper rounded-xl p-4 border border-border">
          <h3 className="font-syne font-600 text-sm text-ink mb-2">ℹ️ How it works</h3>
          <p className="font-dm text-xs text-muted">
            When you create a quiz, you can choose to post it directly to your Google Classroom.
            Students will see the assignment in their Classroom stream, and their scores will be
            automatically synced back to Classroom when they complete the quiz.
          </p>
        </div>
      </div>
    </div>
  );
}
