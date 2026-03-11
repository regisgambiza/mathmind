# Google Classroom Integration - Setup Guide

## Prerequisites

- Google Workspace for Education account (your school account)
- Admin access to create Google Cloud projects (or request from IT admin)
- Python 3.8+ with pip
- SQLite database

---

## Step 1: Create Google Cloud Project

### 1.1 Go to Google Cloud Console

1. Visit: https://console.cloud.google.com/
2. Sign in with your **school Google account** (e.g., admin@yourschool.edu)

### 1.2 Create New Project

1. Click the project dropdown at the top of the page
2. Click **"NEW PROJECT"**
3. Enter project name: `mathmind-classroom-integration`
4. Click **"CREATE"**
5. Wait for project creation (10-20 seconds)
6. Select the new project from the dropdown

---

## Step 2: Enable Required APIs

### 2.1 Enable Google Classroom API

1. In the Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for: `Google Classroom API`
3. Click on **"Google Classroom API"**
4. Click **"ENABLE"**
5. Wait for API to be enabled

### 2.2 Enable Google Admin SDK (Optional - for org unit lookup)

1. In the API Library, search for: `Admin SDK`
2. Click on **"Admin SDK API"**
3. Click **"ENABLE"**

### 2.3 Enable Google People API (for user profiles)

1. In the API Library, search for: `Google People API`
2. Click on **"Google People API"**
3. Click **"ENABLE"**

---

## Step 3: Configure OAuth Consent Screen

### 3.1 Create OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **"Internal"** (for your school domain only)
3. Click **"CREATE"**

### 3.2 App Information

Fill in the following:

| Field | Value |
|-------|-------|
| **App name** | MathMind |
| **User support email** | your-email@yourschool.edu |
| **App logo** | (optional) Upload MathMind logo |
| **Application home page** | https://mathmind.yourschool.edu |
| **Authorized domains** | yourschool.edu |
| **Developer contact email** | your-email@yourschool.edu |

Click **"SAVE AND CONTINUE"**

### 3.3 Scopes

Click **"ADD OR REMOVE SCOPES"** and add these:

| Scope | Description |
|-------|-------------|
| `https://www.googleapis.com/auth/classroom/courses` | View and manage Google Classroom courses |
| `https://www.googleapis.com/auth/classroom/coursework.me` | Manage coursework in Google Classroom |
| `https://www.googleapis.com/auth/classroom/student-submissions.me` | Manage student submissions |
| `https://www.googleapis.com/auth/userinfo.profile` | View your basic profile info |
| `https://www.googleapis.com/auth/userinfo.email` | View your email address |

Click **"UPDATE"** → **"SAVE AND CONTINUE"**

### 3.4 Test Users (Skip for Domain-Wide)

Since we're using **Internal** domain, skip this step.

Click **"SAVE AND CONTINUE"**

### 3.5 Summary

Review your settings and click **"BACK TO DASHBOARD"**

---

## Step 4: Create OAuth 2.0 Credentials

### 4.1 Create Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **"CREATE CREDENTIALS"** → **"OAuth client ID"**
3. Application type: **"Web application"**
4. Name: `MathMind Web Client`

### 4.2 Authorized Redirect URIs

Under **"Authorized redirect URIs"**, click **"ADD URI"** and add:

**For Development:**
```
http://localhost:5000/api/auth/google/callback
```

**For Production (add later):**
```
https://mathmind.yourschool.edu/api/auth/google/callback
```

Click **"CREATE"**

### 4.3 Save Credentials

A popup will show your credentials:

```
Your Client ID
your-client-id.apps.googleusercontent.com

Your Client Secret
**************************
```

**IMPORTANT:** Copy both values and save them securely. You'll need them in the next step.

Click **"OK"**

---

## Step 5: Configure Environment Variables

### 5.1 Create `.env` File

In your project root (`C:\MyProjects\mathmind\server-python\.env`), create:

```env
# Google OAuth Credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback

# Allowed School Email Domains
ALLOWED_EMAIL_DOMAINS=yourschool.edu,yourschool.k12.us

# Session Secret (change in production)
SECRET_KEY=mathmind-dev-secret-key-change-in-production

# Database
DATABASE_PATH=mathmind.db
```

**Replace:**
- `your-client-id.apps.googleusercontent.com` with your actual Client ID
- `your-client-secret-here` with your actual Client Secret
- `yourschool.edu` with your school's domain

### 5.2 Update `.env.example`

In `server-python/.env.example`, add:

```env
# Google OAuth (required for Classroom integration)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback

# Allowed school domains (comma-separated)
ALLOWED_EMAIL_DOMAINS=yourschool.edu

# Session secret (change in production)
SECRET_KEY=mathmind-secret-key

# Database path
DATABASE_PATH=mathmind.db
```

---

## Step 6: Verify Setup

### 6.1 Test OAuth Credentials

Visit this URL in your browser (replace YOUR_CLIENT_ID):

```
https://accounts.google.com/o/oauth2/v2/auth?
client_id=YOUR_CLIENT_ID&
redirect_uri=http://localhost:5000/api/auth/google/callback&
response_type=code&
scope=https://www.googleapis.com/auth/classroom/courses
```

You should see a Google sign-in page.

### 6.2 Check API Access

1. Go to **APIs & Services** → **Dashboard**
2. Verify these APIs show as **"Enabled"**:
   - Google Classroom API
   - Google Admin SDK (optional)
   - Google People API

---

## Step 7: Pre-Provision Teachers

Teachers must be added to the database before they can log in.

### 7.1 Add Teachers via SQLite

```bash
cd server-python
sqlite3 mathmind.db
```

```sql
-- Add teacher with Google email
INSERT INTO teachers (username, google_email, password, active) 
VALUES 
    ('mr.smith', 'mr.smith@yourschool.edu', 'temp_password', 1),
    ('ms.jones', 'ms.jones@yourschool.edu', 'temp_password', 1);

-- Verify
SELECT id, username, google_email, active FROM teachers;
```

### 7.2 Or Use Python Script

Create `server-python/scripts/add_teacher.py`:

```python
import sqlite3
import sys

def add_teacher(username, google_email):
    conn = sqlite3.connect('mathmind.db')
    conn.execute('''
        INSERT OR IGNORE INTO teachers (username, google_email, password, active)
        VALUES (?, ?, 'temp', 1)
    ''', (username, google_email))
    conn.commit()
    conn.close()
    print(f'Teacher added: {username} ({google_email})')

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Usage: python add_teacher.py <username> <google_email>')
        sys.exit(1)
    
    add_teacher(sys.argv[1], sys.argv[2])
```

Run:
```bash
python scripts/add_teacher.py mr.smith mr.smith@yourschool.edu
```

---

## Step 8: Next Steps

✅ **Google Cloud Setup Complete!**

Now continue with:

1. **Install Python Dependencies**
   ```bash
   cd server-python
   pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client
   ```

2. **Run Database Migration**
   ```bash
   sqlite3 mathmind.db < ../db_migrations/001_add_google_fields.sql
   ```

3. **Start Development**
   - Phase 2: Implement OAuth authentication
   - Phase 3: Classroom API integration

---

## Troubleshooting

### "Redirect URI Mismatch"
- Ensure redirect URI in Google Cloud Console **exactly matches** your app
- Check for trailing slashes: `http://localhost:5000/api/auth/google/callback` ✓

### "Access Blocked" or "App not verified"
- For internal apps, this is normal during development
- Click **"Advanced"** → **"Go to MathMind (unsafe)"** to proceed
- Once deployed, admin can approve the app for the domain

### "API not enabled"
- Go to Google Cloud Console → APIs & Services → Library
- Enable the missing API

### "Invalid OAuth 2.0 Token"
- Check Client ID and Secret are correct in `.env`
- Ensure no extra spaces or quotes

---

## Resources

- [Google Classroom API Reference](https://developers.google.com/classroom/reference/rest)
- [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
- [Google Cloud Support](https://cloud.google.com/support)

---

**Need Help?** Contact your school's IT administrator or check the troubleshooting section.
