# Google Classroom Integration Setup Guide

This guide walks you through setting up Google Classroom integration for MathMind.

## Prerequisites

- Google Cloud Platform account
- Admin access to enable APIs
- MathMind server running

---

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a Project** → **New Project**
3. Name it "MathMind" (or your preferred name)
4. Click **Create**

---

## Step 2: Enable Required APIs

1. In Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for and enable these APIs:
   - **Google Classroom API**
   - **Google+ API** (for user info)
   - **Google People API** (optional, for roster access)

---

## Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** for User Type
3. Fill in:
   - **App name**: MathMind
   - **User support email**: your-email@gmail.com
   - **Developer contact email**: your-email@gmail.com
4. Click **Save and Continue**
5. **Scopes**: Skip for now (click **Save and Continue**)
6. **Test users**: Skip (click **Save and Continue**)

---

## Step 4: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. **Name**: MathMind Web Client
5. **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - (Add your production domain when deploying)
6. **Authorized redirect URIs**:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - `http://localhost:5173/api/auth/google/callback`
   - `http://127.0.0.1:5173/api/auth/google/callback`
7. Click **Create**
8. Copy your **Client ID** and **Client Secret**

---

## Step 5: Configure Environment Variables

### Backend (.env)

Create or update `server-python/.env`:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Server Configuration
PORT=5000
SECRET_KEY=mathmind-secret-key-change-in-production
```

### Frontend (.env)

Create or update `client/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

---

## Step 6: Install Dependencies

### Backend

```bash
cd server-python
pip install -r requirements.txt
```

### Frontend

```bash
cd client
npm install
```

---

## Step 7: Run the Application

### Start Backend

```bash
cd server-python
python server.py
```

### Start Frontend

```bash
cd client
npm run dev
```

---

## Step 8: Connect Google Classroom

1. Open MathMind in your browser (`http://localhost:5173`)
2. Log in as a teacher
3. Go to **Classroom** in the sidebar (or `/teacher/connect-classroom`)
4. Click **Sign in with Google**
5. Select your Google account
6. Grant Classroom permissions
7. You should see "✅ Google Classroom connected"

---

## Step 9: Create a Quiz with Classroom Integration

1. Go to **Create Quiz** (`/teacher/setup`)
2. Fill in quiz details (topic, grade, questions, etc.)
3. Toggle **📚 Google Classroom** to ON
4. Select a course from the dropdown
5. Optionally select a topic
6. Click **Create Activity**
7. The quiz will be created and posted as an assignment in Classroom

---

## Step 10: Student Flow

### For Classroom Assignments:

1. Students see the assignment in their Google Classroom stream
2. Click the assignment link
3. Students log in with Google (if not already)
4. System validates student is enrolled in the course
5. Student takes the quiz
6. Score is automatically synced to Classroom

### For Code-Only Quizzes (No Classroom):

1. Teacher shares quiz code (e.g., `ABC123`)
2. Student goes to `/student/join`
3. Enters quiz code
4. Student takes the quiz
5. No grade sync (local only)

---

## API Reference

### Teacher Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/google/status` | GET | Check Google connection status |
| `/api/auth/google/classroom` | GET | Initiate Classroom OAuth flow |
| `/api/auth/google/callback` | GET | OAuth callback handler |
| `/api/classroom/courses` | GET | Fetch teacher's courses |
| `/api/classroom/courses/{id}/topics` | GET | Fetch course topics |
| `/api/classroom/courses/{id}/topics` | POST | Create new topic |
| `/api/classroom/courses/{id}/assignments` | POST | Create assignment |

### Student Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/classroom/validate-student` | POST | Validate student in course |
| `/api/attempt/start` | POST | Start quiz attempt (with email) |

### Grade Sync

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/classroom/sync-grade` | POST | Sync grade to Classroom |
| `/api/classroom/sync-grade/queue` | POST | Queue grade for sync |
| `/api/classroom/sync-grade/process` | POST | Process sync queue |

---

## Troubleshooting

### "Google OAuth not configured"

- Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`
- Restart the Python server after changing `.env`

### "Authentication expired"

- Teacher's OAuth token has expired
- Go to `/teacher/connect-classroom` and reconnect

### "Student not found in course roster"

- Student email doesn't match Classroom roster
- Ensure student is enrolled in the selected course

### "Failed to create assignment"

- Check teacher has Classroom API permissions
- Verify course ID is valid
- Check Classroom API is enabled

### Rate Limit Errors

- Google Classroom API has rate limits
- Wait a few minutes and retry
- Consider caching course/topic data

---

## Database Schema Changes

The following tables/columns were added:

### teachers
- `google_refresh_token` - OAuth refresh token
- `google_access_token` - OAuth access token
- `google_token_expires_at` - Token expiry timestamp

### quizzes
- `course_id` - Google Classroom course ID
- `topic_id` - Classroom topic ID
- `coursework_id` - Classroom assignment ID
- `posted_to_classroom` - Boolean flag
- `created_by` - Teacher ID

### grade_sync_queue
- `id` - Primary key
- `course_id` - Classroom course ID
- `coursework_id` - Classroom assignment ID
- `student_email` - Student's email
- `percentage` - Score percentage
- `status` - pending/synced/failed
- `retry_count` - Number of retry attempts
- `created_at` - Timestamp
- `synced_at` - When successfully synced

---

## Security Notes

- Never commit `.env` files to version control
- Use different OAuth credentials for dev and production
- In production, use HTTPS only
- Set proper CORS origins
- Store refresh tokens securely (consider encryption in production)

---

## Production Deployment

1. Update OAuth consent screen with production domain
2. Add production URLs to authorized origins and redirect URIs
3. Enable HTTPS (required for Google OAuth)
4. Use environment variables for secrets
5. Consider using a secrets manager for tokens

---

## Support

- [Google Classroom API Docs](https://developers.google.com/classroom)
- [Google OAuth 2.0 Guide](https://developers.google.com/identity/protocols/oauth2)
- [MathMind Issues](https://github.com/your-repo/mathmind/issues)
