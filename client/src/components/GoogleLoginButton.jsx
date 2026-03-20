import Button from './Button';
import { getBaseURL } from '../hooks/useApi';

/**
 * Google Login Button Component
 * Uses OAuth 2.0 redirect flow for full Classroom API access (teachers)
 *
 * @param {string} user_type - 'teacher' or 'student'
 * @param {function} onSuccess - Callback with user data (not used for teachers - redirect happens)
 * @param {function} onError - Callback with error
 * @param {string} text - Button text
 * @param {boolean} fullWidth - Full width button
 * @param {string} size - Button size: 'sm' | 'md' | 'lg'
 */
export default function GoogleLoginButton({
  user_type,
  onSuccess,
  onError,
  text = 'Sign in with Google',
  fullWidth = false,
  size = 'md',
}) {
  const handleLogin = () => {
    // For teachers, use OAuth redirect flow to get refresh tokens
    if (user_type === 'teacher') {
      const state = Math.random().toString(36).substring(2);
      sessionStorage.setItem('oauth_state', state);
      sessionStorage.setItem('oauth_user_type', user_type);
      
      const apiUrl = getBaseURL();
      const oauthUrl = `${apiUrl}/api/auth/google/authorize?user_type=${user_type}&state=${state}`;
      window.location.href = oauthUrl;
      return;
    }

    // For students, use simple popup login (no Classroom tokens needed)
    if (window.google && window.google.accounts) {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Fallback to redirect flow for students too
          const state = Math.random().toString(36).substring(2);
          sessionStorage.setItem('oauth_state', state);
          sessionStorage.setItem('oauth_user_type', 'student');
          const apiUrl = getBaseURL();
          const oauthUrl = `${apiUrl}/api/auth/google/authorize?user_type=student&state=${state}`;
          window.location.href = oauthUrl;
        }
      });
    } else {
      // Fallback to redirect flow
      const state = Math.random().toString(36).substring(2);
      sessionStorage.setItem('oauth_state', state);
      sessionStorage.setItem('oauth_user_type', user_type);
      const apiUrl = getBaseURL();
      const oauthUrl = `${apiUrl}/api/auth/google/authorize?user_type=${user_type}&state=${state}`;
      window.location.href = oauthUrl;
    }
  };

  return (
    <Button
      variant="primary"
      onClick={handleLogin}
      fullWidth={fullWidth}
      size={size}
      className="bg-white text-gray-800 border-2 border-gray-300 hover:bg-gray-50"
    >
      <div className="flex items-center justify-center gap-2">
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {text === 'Sign in with Google' ? 'Sign in with Google' : text}
      </div>
    </Button>
  );
}
