# Google OAuth Setup Guide for MathMind

This guide will help you configure Google OAuth login for both teachers and students.

## Overview

The home landing page now features Google login buttons for both Teacher and Student roles. After authentication, users are redirected directly to their respective dashboards:
- **Teachers** → `/teacher/dashboard-home`
- **Students** → `/student/dashboard`

## Prerequisites

- A Google Cloud Platform account
- Admin access to create OAuth 2.0 credentials

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Name it something like "MathMind"

## Step 2: Enable Google+ API (Optional but Recommended)

1. In the Google Cloud Console, go to **APIs & Services** > **Library**
2. Search for "Google+ API"
3. Click on it and press **Enable**

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. If prompted, configure the **OAuth consent screen**:
   - Choose **External** for User Type
   - Fill in:
     - **App name**: MathMind
     - **User support email**: your-email@gmail.com
     - **Developer contact email**: your-email@gmail.com
   - Click **Save and Continue**
   - Skip Scopes (click **Save and Continue**)
   - Skip Test users (click **Save and Continue**)

4. Create **OAuth client ID**:
   - **Application type**: Web application
   - **Name**: MathMind Web Client
   - **Authorized JavaScript origins**:
     - `http://localhost:5173`
     - `http://127.0.0.1:5173`
   - **Authorized redirect URIs**:
     - `http://localhost:5173`
     - `http://127.0.0.1:5173`
   - Click **Create**

5. Copy your **Client ID** (looks like: `xxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com`)

## Step 4: Configure Environment Variables

### Backend (.env file)

Create or update `server-python/.env`:

```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
PORT=5000
SECRET_KEY=mathmind-secret-key-change-in-production
```

### Frontend (.env file)

Create or update `client/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

Replace `your-google-client-id.apps.googleusercontent.com` with your actual Client ID.

## Step 5: Install Dependencies

The Python backend requires these additional packages (already in requirements.txt):

```bash
pip install -r server-python/requirements.txt
```

## Step 6: Run the Application

### Start the Backend Server

```bash
cd server-python
python server.py
```

The backend will run on `http://localhost:5000`

### Start the Frontend

```bash
cd client
npm run dev
```

The frontend will run on `http://localhost:5173`

## Step 7: Test Google Login

1. Open `http://localhost:5173` in your browser
2. You should see two login cards: **Teacher** and **Student**
3. Click **"Sign in with Google"** button on either card
4. Select your Google account
5. After authentication:
   - Teachers are redirected to `/teacher/dashboard-home`
   - Students are redirected to `/student/dashboard`

## Database Changes

The system automatically adds these columns to support Google OAuth:

### Teachers Table
- `google_id` - Google's unique user ID
- `email` - User's Google email
- `name` - User's display name from Google

### Students Table
- `google_id` - Google's unique user ID
- `email` - User's Google email

**Note:** Existing teachers and students can still log in with their credentials. Google login creates new accounts or links to existing accounts by email.

## How It Works

### Teacher Login Flow
1. User clicks "Sign in with Google" on Teacher card
2. Google authentication popup appears
3. User selects Google account
4. Backend verifies Google token
5. System checks if teacher exists by `google_id` or `email`
6. If exists: updates record with Google ID
7. If new: creates new teacher account
8. Redirects to `/teacher/dashboard-home`

### Student Login Flow
1. User clicks "Sign in with Google" on Student card
2. Google authentication popup appears
3. User selects Google account
4. Backend verifies Google token
5. System checks if student exists by `google_id` or `email`
6. If exists: updates record with Google ID
7. If new: creates new student account (no PIN required)
8. Redirects to `/student/dashboard`

## Troubleshooting

### "Google OAuth not configured on server"
- Make sure `GOOGLE_CLIENT_ID` is set in `server-python/.env`
- Restart the Python server after adding the variable

### "Invalid Google credential"
- Verify your Client ID is correct in both frontend and backend
- Ensure the authorized origins and redirect URIs match exactly
- Check that you're running on `localhost:5173` (not a different port)

### Button not showing
- Check browser console for errors
- Verify `VITE_GOOGLE_CLIENT_ID` is set in `client/.env`
- Clear browser cache and reload
- Make sure the Google script is loading: check Network tab

### Login succeeds but redirect fails
- Verify the routes exist in `App.jsx`
- Check that user context is being set properly
- Look for errors in browser console

## Security Notes

- Never commit `.env` files to version control
- Use different Client IDs for development and production
- In production, use HTTPS only
- Set proper CORS origins for production
- Consider implementing JWT tokens for session management

## Production Deployment

For production deployment:

1. Update authorized origins and redirect URIs in Google Cloud Console
2. Use production domain in environment variables
3. Enable HTTPS (required for Google OAuth)
4. Set secure CORS origins
5. Use a strong `SECRET_KEY`
6. Consider implementing proper JWT token authentication

## Support

For issues with Google OAuth:
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)
- [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
