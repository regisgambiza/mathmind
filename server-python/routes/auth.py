from flask import Blueprint, request, jsonify, redirect, url_for, session
import db
import os
import json
from datetime import datetime, timedelta
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
import logging

logger = logging.getLogger(__name__)

router = Blueprint('auth', __name__)

# Google OAuth configuration
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
FRONTEND_URL = 'http://localhost:5173'
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost:5000')

# OAuth scopes for Classroom integration (requested for ALL teacher logins)
SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.topics',
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/classroom.coursework.me',
    'https://www.googleapis.com/auth/classroom.rosters.readonly'
]


@router.route('/google/login', methods=['POST', 'OPTIONS'])
def google_login():
    """Handle Google OAuth login for teachers (with Classroom scopes)"""
    if request.method == 'OPTIONS':
        return '', 204

    data = request.get_json()
    code = data.get('code')
    user_type = data.get('user_type')  # 'teacher' or 'student'

    if not code:
        return jsonify({'error': 'Authorization code is required'}), 400

    if not user_type or user_type not in ['teacher', 'student']:
        return jsonify({'error': 'Invalid user type. Must be "teacher" or "student"'}), 400

    try:
        if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
            return jsonify({'error': 'Google OAuth not configured on server'}), 500

        # Exchange code for tokens
        flow = Flow.from_client_config({
            'web': {
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        }, scopes=SCOPES)

        flow.redirect_uri = f'{BACKEND_URL}/api/auth/google/login/callback'
        flow.fetch_token(code=code)
        credentials = flow.credentials

        # Get user info from credentials
        from googleapiclient.discovery import build
        userinfo_service = build('oauth2', 'v2', credentials=credentials)
        userinfo = userinfo_service.userinfo().get().execute()

        google_id = userinfo['id']
        email = userinfo.get('email', '')
        name = userinfo.get('name', 'Unknown User')
        picture = userinfo.get('picture', '')

        conn = db.get_db()

        if user_type == 'teacher':
            # Check if teacher exists with this Google ID
            teacher = conn.execute(
                'SELECT * FROM teachers WHERE google_id = ?',
                (google_id,)
            ).fetchone()

            if not teacher:
                # Check if teacher exists with this email
                teacher = conn.execute(
                    'SELECT * FROM teachers WHERE email = ?',
                    (email,)
                ).fetchone()

                if teacher:
                    # Update existing teacher with Google ID and tokens
                    expires_at = credentials.expiry.isoformat() if credentials.expiry else None
                    conn.execute(
                        '''UPDATE teachers 
                           SET google_id = ?, name = ?, 
                               google_refresh_token = ?,
                               google_access_token = ?,
                               google_token_expires_at = ?
                           WHERE id = ?''',
                        (google_id, name, credentials.refresh_token, credentials.token, expires_at, teacher['id'])
                    )
                    conn.commit()
                else:
                    # Create new teacher with tokens
                    expires_at = credentials.expiry.isoformat() if credentials.expiry else None
                    cursor = conn.execute(
                        '''INSERT INTO teachers (username, google_id, email, name, password,
                               google_refresh_token, google_access_token, google_token_expires_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                        (email.split('@')[0], google_id, email, name, '',
                         credentials.refresh_token, credentials.token, expires_at)
                    )
                    conn.commit()
                    teacher = conn.execute(
                        'SELECT * FROM teachers WHERE id = ?',
                        (cursor.lastrowid,)
                    ).fetchone()
            else:
                # Update tokens for existing teacher
                expires_at = credentials.expiry.isoformat() if credentials.expiry else None
                conn.execute(
                    '''UPDATE teachers 
                       SET google_refresh_token = ?,
                           google_access_token = ?,
                           google_token_expires_at = ?
                       WHERE id = ?''',
                    (credentials.refresh_token, credentials.token, expires_at, teacher['id'])
                )
                conn.commit()

            return jsonify({
                'success': True,
                'user_type': 'teacher',
                'user': {
                    'id': teacher['id'],
                    'name': teacher['name'] or name,
                    'email': teacher['email'] or email,
                    'google_id': google_id
                },
                'token': 'google-jwt-token'
            })

        else:  # student
            # Students don't need Classroom tokens
            student = conn.execute(
                'SELECT * FROM students WHERE google_id = ?',
                (google_id,)
            ).fetchone()

            if not student:
                # Check if student exists with this email
                student = conn.execute(
                    'SELECT * FROM students WHERE email = ?',
                    (email,)
                ).fetchone()

                if student:
                    # Update existing student with Google ID
                    conn.execute(
                        'UPDATE students SET google_id = ?, name = ? WHERE id = ?',
                        (google_id, name, student['id'])
                    )
                    conn.commit()
                else:
                    # Create new student
                    student_name = name if name else email.split('@')[0]
                    cursor = conn.execute(
                        '''INSERT INTO students (name, google_id, email, pin, last_login_at)
                           VALUES (?, ?, ?, ?, datetime('now'))''',
                        (student_name, google_id, email, '')
                    )
                    conn.commit()
                    student = conn.execute(
                        'SELECT * FROM students WHERE id = ?',
                        (cursor.lastrowid,)
                    ).fetchone()

            return jsonify({
                'success': True,
                'user_type': 'student',
                'student': {
                    'id': student['id'],
                    'name': student['name'] or name,
                    'email': student['email'] or email,
                    'google_id': google_id
                },
                'token': 'google-jwt-token'
            })

    except ValueError as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Invalid Google credential: {str(e)}'}), 401
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@router.route('/google/login/callback', methods=['GET', 'OPTIONS'])
def google_login_callback():
    """Handle OAuth callback for login (stores tokens and redirects to frontend)"""
    if request.method == 'OPTIONS':
        return '', 204

    try:
        code = request.args.get('code')
        state = request.args.get('state')

        if not code or not state:
            return redirect(f'{FRONTEND_URL}/?error=missing_code')

        # Verify state matches
        if session.get('oauth_state') != state:
            return redirect(f'{FRONTEND_URL}/?error=invalid_state')

        user_type = session.get('oauth_user_type', 'teacher')
        
        logger.info(f"Login callback - code: {'yes' if code else 'no'}, state: {'yes' if state else 'no'}, user_type: {user_type}")

        # Exchange code for tokens
        flow = Flow.from_client_config({
            'web': {
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        }, scopes=SCOPES)

        flow.redirect_uri = f'{BACKEND_URL}/api/auth/google/login/callback'
        flow.fetch_token(code=code)
        credentials = flow.credentials

        logger.info(f"Tokens received, refresh_token: {'yes' if credentials.refresh_token else 'no'}")

        # Get user info
        from googleapiclient.discovery import build
        userinfo_service = build('oauth2', 'v2', credentials=credentials)
        userinfo = userinfo_service.userinfo().get().execute()

        google_id = userinfo['id']
        email = userinfo.get('email', '')
        name = userinfo.get('name', 'Unknown User')

        conn = db.get_db()
        expires_at = credentials.expiry.isoformat() if credentials.expiry else None

        if user_type == 'teacher':
            # Upsert teacher with tokens
            teacher = conn.execute(
                'SELECT * FROM teachers WHERE google_id = ?',
                (google_id,)
            ).fetchone()

            if not teacher:
                teacher = conn.execute(
                    'SELECT * FROM teachers WHERE email = ?',
                    (email,)
                ).fetchone()

                if teacher:
                    conn.execute(
                        '''UPDATE teachers 
                           SET google_id = ?, name = ?, 
                               google_refresh_token = ?,
                               google_access_token = ?,
                               google_token_expires_at = ?
                           WHERE id = ?''',
                        (google_id, name, credentials.refresh_token, credentials.token, expires_at, teacher['id'])
                    )
                    conn.commit()
                else:
                    cursor = conn.execute(
                        '''INSERT INTO teachers (username, google_id, email, name, password,
                               google_refresh_token, google_access_token, google_token_expires_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                        (email.split('@')[0], google_id, email, name, '',
                         credentials.refresh_token, credentials.token, expires_at)
                    )
                    conn.commit()
                    teacher = conn.execute(
                        'SELECT * FROM teachers WHERE id = ?',
                        (cursor.lastrowid,)
                    ).fetchone()
            else:
                conn.execute(
                    '''UPDATE teachers 
                       SET google_refresh_token = ?,
                           google_access_token = ?,
                           google_token_expires_at = ?
                       WHERE id = ?''',
                    (credentials.refresh_token, credentials.token, expires_at, teacher['id'])
                )
                conn.commit()

            # Redirect to frontend with user data in URL (for localStorage)
            user_data = {
                'id': teacher['id'],
                'name': teacher['name'] or name,
                'email': teacher['email'] or email,
                'google_id': google_id
            }
            import urllib.parse
            user_json = urllib.parse.quote(json.dumps(user_data))
            return redirect(f'{FRONTEND_URL}/?login_success=true&user_type=teacher&user_data={user_json}')

        else:
            # Student login (no tokens needed)
            student = conn.execute(
                'SELECT * FROM students WHERE google_id = ?',
                (google_id,)
            ).fetchone()

            if not student:
                student = conn.execute(
                    'SELECT * FROM students WHERE email = ?',
                    (email,)
                ).fetchone()

                if student:
                    conn.execute(
                        'UPDATE students SET google_id = ?, name = ? WHERE id = ?',
                        (google_id, name, student['id'])
                    )
                    conn.commit()
                else:
                    # Check if name already exists (UNIQUE constraint)
                    student_name = name if name else email.split('@')[0]
                    existing_by_name = conn.execute(
                        'SELECT * FROM students WHERE name = ?',
                        (student_name,)
                    ).fetchone()

                    if existing_by_name:
                        # Use existing student with this name
                        conn.execute(
                            'UPDATE students SET google_id = ?, email = ? WHERE id = ?',
                            (google_id, email, existing_by_name['id'])
                        )
                        conn.commit()
                        student = existing_by_name
                    else:
                        # Create new student
                        cursor = conn.execute(
                            '''INSERT INTO students (name, google_id, email, pin, last_login_at)
                               VALUES (?, ?, ?, ?, datetime('now'))''',
                            (student_name, google_id, email, '')
                        )
                        conn.commit()
                        student = conn.execute(
                            'SELECT * FROM students WHERE id = ?',
                            (cursor.lastrowid,)
                        ).fetchone()

            user_data = {
                'id': student['id'],
                'name': student['name'] or name,
                'email': student['email'] or email,
                'google_id': google_id
            }
            import urllib.parse
            user_json = urllib.parse.quote(json.dumps(user_data))
            return redirect(f'{FRONTEND_URL}/?login_success=true&user_type=student&user_data={user_json}')

    except Exception as e:
        logger.error(f"Login callback error: {e}")
        return redirect(f'{FRONTEND_URL}/?error=' + str(e))


@router.route('/google/authorize', methods=['GET', 'OPTIONS'])
def google_authorize():
    """Initiate OAuth flow for login with Classroom scopes"""
    if request.method == 'OPTIONS':
        return '', 204

    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return redirect(f'{FRONTEND_URL}/?error=oauth_not_configured')

    user_type = request.args.get('user_type', 'teacher')
    state = request.args.get('state')

    if not state:
        return redirect(f'{FRONTEND_URL}/?error=missing_state')

    try:
        # Create OAuth flow
        flow = Flow.from_client_config({
            'web': {
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        }, scopes=SCOPES)

        flow.redirect_uri = f'{BACKEND_URL}/api/auth/google/login/callback'

        # Generate authorization URL
        authorization_url, oauth_state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent'
        )

        # Store state and user_type in session
        session['oauth_state'] = oauth_state
        session['oauth_user_type'] = user_type

        logger.info(f"OAuth authorize initiated for {user_type}, state: {oauth_state}")
        return redirect(authorization_url)

    except Exception as e:
        logger.error(f"Error creating OAuth flow: {e}")
        return redirect(f'{FRONTEND_URL}/?error=' + str(e))


@router.route('/google/classroom', methods=['GET', 'OPTIONS'])
def google_classroom_auth():
    """Initiate OAuth flow for Classroom API access (teacher)"""
    if request.method == 'OPTIONS':
        return '', 204
    
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return jsonify({'error': 'Google OAuth not configured'}), 500
    
    teacher_id = request.args.get('teacher_id')
    if not teacher_id:
        return jsonify({'error': 'teacher_id is required'}), 400
    
    try:
        # Create OAuth flow
        flow = Flow.from_client_config({
            'web': {
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        }, scopes=SCOPES)
        
        flow.redirect_uri = f'{BACKEND_URL}/api/auth/google/callback'
        
        # Generate authorization URL
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent select_account'  # Force fresh consent to get new scopes
        )
        
        # Store state and teacher_id in session
        session['oauth_state'] = state
        session['teacher_id'] = teacher_id
        
        return jsonify({'authorization_url': authorization_url})
    except Exception as e:
        logger.error(f"Error creating OAuth flow: {e}")
        return jsonify({'error': str(e)}), 500


@router.route('/google/callback', methods=['GET', 'OPTIONS'])
def google_callback():
    """Handle OAuth callback from Google"""
    if request.method == 'OPTIONS':
        return '', 204

    try:
        code = request.args.get('code')
        state = request.args.get('state')

        logger.info(f"OAuth callback received - code: {'yes' if code else 'no'}, state: {'yes' if state else 'no'}")
        logger.info(f"Session data: {dict(session)}")

        if not code or not state:
            logger.error("Missing code or state")
            return redirect(f'{FRONTEND_URL}/teacher/connect-classroom?error=missing_code')

        # Verify state matches
        if session.get('oauth_state') != state:
            logger.error(f"State mismatch - session: {session.get('oauth_state')}, received: {state}")
            return redirect(f'{FRONTEND_URL}/teacher/connect-classroom?error=invalid_state')

        teacher_id = session.get('teacher_id')
        if not teacher_id:
            logger.error("No teacher_id in session")
            return redirect(f'{FRONTEND_URL}/teacher/connect-classroom?error=no_teacher_id')

        logger.info(f"Exchanging code for tokens, teacher_id: {teacher_id}")

        # Exchange code for tokens
        flow = Flow.from_client_config({
            'web': {
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        }, scopes=SCOPES)

        flow.redirect_uri = f'{BACKEND_URL}/api/auth/google/callback'
        flow.fetch_token(code=code)

        credentials = flow.credentials

        logger.info(f"Tokens received, refresh_token: {'yes' if credentials.refresh_token else 'no'}")

        # Store tokens in database
        conn = db.get_db()
        expires_at = credentials.expiry.isoformat() if credentials.expiry else None

        conn.execute('''
            UPDATE teachers
            SET google_refresh_token = ?,
                google_access_token = ?,
                google_token_expires_at = ?
            WHERE id = ?
        ''', (credentials.refresh_token, credentials.token, expires_at, teacher_id))
        conn.commit()

        logger.info(f"Tokens stored for teacher {teacher_id}")
        
        # Verify teacher was updated
        teacher = conn.execute('SELECT * FROM teachers WHERE id = ?', (teacher_id,)).fetchone()
        if not teacher:
            return redirect(f'{FRONTEND_URL}/teacher/connect-classroom?error=teacher_not_found')
        
        # Redirect to dashboard with success
        return redirect(f'{FRONTEND_URL}/teacher/connect-classroom?success=true')
        
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        return redirect(f'{FRONTEND_URL}/teacher/connect-classroom?error=' + str(e))


@router.route('/google/status', methods=['GET', 'OPTIONS'])
def google_status():
    """Check if teacher has connected Google Classroom"""
    if request.method == 'OPTIONS':
        return '', 204
    
    teacher_id = request.args.get('teacher_id')
    if not teacher_id:
        return jsonify({'error': 'teacher_id required'}), 400
    
    try:
        conn = db.get_db()
        teacher = conn.execute(
            'SELECT google_refresh_token, google_token_expires_at, email FROM teachers WHERE id = ?',
            (teacher_id,)
        ).fetchone()
        
        if not teacher:
            return jsonify({'connected': False, 'error': 'Teacher not found'})
        
        if not teacher['google_refresh_token']:
            return jsonify({'connected': False, 'message': 'Google not connected'})
        
        # Check if token is expired
        expires_at = teacher.get('google_token_expires_at')
        if expires_at:
            try:
                expires_dt = datetime.fromisoformat(expires_at)
                if expires_dt < datetime.utcnow():
                    return jsonify({
                        'connected': False,
                        'message': 'Token expired',
                        'email': teacher['email']
                    })
            except:
                pass
        
        return jsonify({
            'connected': True,
            'email': teacher['email'],
            'has_refresh_token': bool(teacher['google_refresh_token'])
        })
    except Exception as e:
        logger.error(f"Error checking Google status: {e}")
        return jsonify({'connected': False, 'error': str(e)})


@router.route('/logout', methods=['POST', 'OPTIONS'])
def logout():
    """Clear session"""
    if request.method == 'OPTIONS':
        return '', 204
    
    session.clear()
    return jsonify({'success': True})
