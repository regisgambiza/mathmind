# Quick Start: Google Classroom Integration

## 1. Install Dependencies

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

## 2. Configure Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable these APIs:
   - Google Classroom API
   - Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized origins: `http://localhost:5173`
6. Add redirect URIs: `http://localhost:5173`, `http://localhost:5173/api/auth/google/callback`
7. Copy Client ID and Client Secret

## 3. Set Environment Variables

### Backend (`server-python/.env`)
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
SECRET_KEY=mathmind-secret-key-change-in-production
PORT=5000
```

### Frontend (`client/.env`)
```env
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

## 4. Run the Servers

### Terminal 1 - Backend
```bash
cd server-python
python server.py
```

### Terminal 2 - Frontend
```bash
cd client
npm run dev
```

## 5. Connect Google Classroom

1. Open `http://localhost:5173`
2. Log in as a teacher
3. Click **Classroom** in sidebar
4. Click **Sign in with Google**
5. Grant permissions
6. ✅ Connected!

## 6. Test the Integration

### Create Quiz with Classroom
1. Go to **Create Quiz**
2. Fill in quiz details
3. Toggle **Google Classroom** ON
4. Select a course
5. Click **Create Activity**
6. Check Google Classroom for the assignment

### Student View
1. Log out
2. Log in as a student (or create student account)
3. Go to **Join Quiz**
4. Enter the quiz code
5. System validates enrollment
6. Take the quiz

## Troubleshooting

### "Google OAuth not configured"
- Check `.env` files
- Restart servers

### "No courses found"
- Make sure you're logged in as the course owner/co-teacher
- Check Classroom API is enabled

### "Student not found in roster"
- Verify student email matches exactly
- Check student is enrolled in the course

## Next Steps

- See [GOOGLE_CLASSROOM_SETUP.md](GOOGLE_CLASSROOM_SETUP.md) for detailed setup
- See [CLASSROOM_INTEGRATION_SUMMARY.md](CLASSROOM_INTEGRATION_SUMMARY.md) for technical details
