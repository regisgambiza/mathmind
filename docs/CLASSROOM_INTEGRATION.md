# Google Classroom Integration

**Branch:** `feature/google-classroom`  
**Created:** March 12, 2026  
**Status:** In Development

## Overview

This feature enables MathMind to integrate with Google Classroom, allowing:
- Teachers to sign in with Google SSO
- Import classes and student rosters from Google Classroom
- Auto-post quizzes as assignments in Google Classroom
- Automatic grade sync back to Classroom gradebook

## Features

### Teacher Flow
1. Sign in with school Google account
2. Select Google Classroom class
3. Create quiz in MathMind
4. Quiz auto-posts to Google Classroom under selected topic
5. Grades sync back automatically when students complete

### Student Flow
1. Click quiz link in Google Classroom
2. Auto-logged into MathMind (SSO)
3. Take quiz
4. Grade appears in both MathMind and Classroom

## Setup Instructions

### For Administrators

See: [CLASSROOM_SETUP.md](./CLASSROOM_SETUP.md)

### Quick Start

1. **Google Cloud Setup**
   - Create Google Cloud project
   - Enable Classroom API
   - Create OAuth 2.0 credentials
   - Configure OAuth consent screen

2. **Environment Variables**
   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
   ALLOWED_EMAIL_DOMAINS=yourschool.edu
   ```

3. **Database Migration**
   ```bash
   sqlite3 mathmind.db < db_migrations/001_add_google_fields.sql
   ```

4. **Install Dependencies**
   ```bash
   pip install -r server-python/requirements.txt
   ```

## Development Progress

- [x] Phase 1: Setup & Preparation
- [ ] Phase 2: Google OAuth Authentication
- [ ] Phase 3: Google Classroom API Integration
- [ ] Phase 4: Quiz Creation & Posting
- [ ] Phase 5: Grade Sync & Testing
- [ ] Phase 6: Merge & Deploy

## API Endpoints

### Authentication
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - OAuth callback
- `POST /api/auth/logout` - Logout

### Classroom
- `GET /api/classroom/courses` - Get teacher's courses
- `GET /api/classroom/courses/:id/topics` - Get course topics
- `POST /api/classroom/courses/:id/topics` - Create new topic

### Quiz
- `POST /api/quiz/create` - Create quiz (with Classroom posting)

### Attempt
- `POST /api/attempt/complete` - Complete quiz + grade sync

## Database Changes

New/modified tables:
- `teachers` - Add Google OAuth fields
- `students` - Add Google email, roster linking
- `quizzes` - Add Classroom course/workshop/topic IDs
- `topic_mappings` - Track topic hierarchy (optional)

See migration: `db_migrations/001_add_google_fields.sql`

## Testing Checklist

- [ ] Teacher can log in with Google
- [ ] Student can log in with Google
- [ ] Teacher can see their Classroom courses
- [ ] Teacher can create topics in Classroom
- [ ] Quiz creation posts to Classroom
- [ ] Student can launch quiz from Classroom
- [ ] Grade sync works on completion

## Troubleshooting

### Common Issues

**"Google account not connected"**
- Teacher needs to re-authorize in settings
- Check OAuth tokens are being stored

**"Grade sync failed"**
- Verify student email matches Classroom roster
- Check teacher's OAuth token hasn't expired

**"Course not found"**
- Ensure teacher is owner/co-teacher of the course
- Check Classroom API permissions

## Resources

- [Google Classroom API Docs](https://developers.google.com/classroom)
- [Google OAuth 2.0 Guide](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)

---

**Next Steps:** Complete Google Cloud setup (see CLASSROOM_SETUP.md)
