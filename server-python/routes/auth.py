from flask import Blueprint, request, jsonify, redirect, url_for, session
import db
import os
import json
import time
import urllib.parse
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
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
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

DEFAULT_GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token'
FALLBACK_GOOGLE_TOKEN_URI = 'https://www.googleapis.com/oauth2/v4/token'


def _safe_int_env(key, fallback):
    try:
        return int(os.environ.get(key, fallback))
    except (TypeError, ValueError):
        return fallback


def _safe_float_env(key, fallback):
    try:
        return float(os.environ.get(key, fallback))
    except (TypeError, ValueError):
        return fallback


GOOGLE_TOKEN_FETCH_RETRIES = max(_safe_int_env('GOOGLE_TOKEN_FETCH_RETRIES', 3), 1)
GOOGLE_TOKEN_FETCH_TIMEOUT_SECONDS = max(_safe_int_env('GOOGLE_TOKEN_FETCH_TIMEOUT_SECONDS', 20), 5)
GOOGLE_TOKEN_FETCH_BACKOFF_SECONDS = max(_safe_float_env('GOOGLE_TOKEN_FETCH_BACKOFF_SECONDS', 1.0), 0.1)

TRANSIENT_NETWORK_ERROR_MARKERS = (
    'lookup timed out',
    'temporary failure in name resolution',
    'name or service not known',
    'failed to establish a new connection',
    'max retries exceeded',
    'connection reset',
    'connection aborted',
    'timed out',
    '[errno -3]',
)

DNS_ERROR_MARKERS = (
    'lookup timed out',
    'name or service not known',
    'temporary failure in name resolution',
    '[errno -3]',
)


def _is_transient_network_error(exc):
    message = str(exc).lower()
    return any(marker in message for marker in TRANSIENT_NETWORK_ERROR_MARKERS)


def _is_dns_resolution_error(exc):
    message = str(exc).lower()
    return any(marker in message for marker in DNS_ERROR_MARKERS)


def _build_google_oauth_flow(redirect_uri, token_uri=DEFAULT_GOOGLE_TOKEN_URI):
    flow = Flow.from_client_config({
        'web': {
            'client_id': GOOGLE_CLIENT_ID,
            'client_secret': GOOGLE_CLIENT_SECRET,
            'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
            'token_uri': token_uri,
        }
    }, scopes=SCOPES)
    flow.redirect_uri = redirect_uri
    return flow


def _exchange_code_for_tokens(code, redirect_uri):
    token_uris = [DEFAULT_GOOGLE_TOKEN_URI]
    if FALLBACK_GOOGLE_TOKEN_URI not in token_uris:
        token_uris.append(FALLBACK_GOOGLE_TOKEN_URI)

    last_error = None

    for token_uri in token_uris:
        for attempt in range(1, GOOGLE_TOKEN_FETCH_RETRIES + 1):
            flow = _build_google_oauth_flow(redirect_uri, token_uri=token_uri)
            try:
                flow.fetch_token(code=code, timeout=GOOGLE_TOKEN_FETCH_TIMEOUT_SECONDS)
                if token_uri != DEFAULT_GOOGLE_TOKEN_URI:
                    logger.warning("OAuth token exchange succeeded via fallback token endpoint.")
                return flow.credentials
            except Exception as exc:
                last_error = exc
                transient = _is_transient_network_error(exc)
                logger.warning(
                    "OAuth token exchange failed (endpoint=%s attempt=%s/%s transient=%s): %s",
                    token_uri,
                    attempt,
                    GOOGLE_TOKEN_FETCH_RETRIES,
                    transient,
                    exc
                )

                if not transient:
                    raise

                if attempt < GOOGLE_TOKEN_FETCH_RETRIES:
                    time.sleep(GOOGLE_TOKEN_FETCH_BACKOFF_SECONDS * attempt)

        # Only try alternate token endpoint when failure looks DNS-related.
        if not _is_dns_resolution_error(last_error):
            break

        logger.warning("OAuth DNS resolution issue detected; retrying against fallback token endpoint.")

    raise last_error


def _user_facing_oauth_error(exc):
    if _is_transient_network_error(exc):
        return 'Could not reach Google OAuth service (temporary network/DNS issue). Please try again in 30-60 seconds.'
    if isinstance(exc, ValueError):
        return f'Invalid Google credential: {exc}'
    return 'Google login failed. Please try again.'


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

        credentials = _exchange_code_for_tokens(
            code=code,
            redirect_uri=f'{BACKEND_URL}/api/auth/google/login/callback'
        )

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
                'SELECT * FROM teachers WHERE google_id = %s',
                (google_id,)
            ).fetchone()

            if not teacher:
                # Check if teacher exists with this email
                teacher = conn.execute(
                    'SELECT * FROM teachers WHERE email = %s',
                    (email,)
                ).fetchone()

                if teacher:
                    # Update existing teacher with Google ID and tokens
                    expires_at = credentials.expiry.isoformat() if credentials.expiry else None
                    conn.execute(
                        '''UPDATE teachers 
                           SET google_id = %s, name = %s, 
                               google_refresh_token = %s,
                               google_access_token = %s,
                               google_token_expires_at = %s
                           WHERE id = %s''',
                        (google_id, name, credentials.refresh_token, credentials.token, expires_at, teacher['id'])
                    )
                    conn.commit()
                else:
                    # Create new teacher with tokens
                    expires_at = credentials.expiry.isoformat() if credentials.expiry else None
                    cursor = conn.execute(
                        '''INSERT INTO teachers (username, google_id, email, name, password,
                               google_refresh_token, google_access_token, google_token_expires_at)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)''',
                        (email.split('@')[0], google_id, email, name, '',
                         credentials.refresh_token, credentials.token, expires_at)
                    )
                    conn.commit()
                    teacher = conn.execute(
                        'SELECT * FROM teachers WHERE id = %s',
                        (cursor.lastrowid,)
                    ).fetchone()
            else:
                # Update tokens for existing teacher
                expires_at = credentials.expiry.isoformat() if credentials.expiry else None
                conn.execute(
                    '''UPDATE teachers 
                       SET google_refresh_token = %s,
                           google_access_token = %s,
                           google_token_expires_at = %s
                       WHERE id = %s''',
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
                'SELECT * FROM students WHERE google_id = %s',
                (google_id,)
            ).fetchone()

            if not student:
                # Check if student exists with this email
                student = conn.execute(
                    'SELECT * FROM students WHERE email = %s',
                    (email,)
                ).fetchone()

                if student:
                    # Update existing student with Google ID
                    conn.execute(
                        'UPDATE students SET google_id = %s, name = %s WHERE id = %s',
                        (google_id, name, student['id'])
                    )
                    conn.commit()
                else:
                    # Create new student
                    student_name = name if name else email.split('@')[0]
                    cursor = conn.execute(
                        '''INSERT INTO students (name, google_id, email, pin, last_login_at)
                           VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)''',
                        (student_name, google_id, email, '')
                    )
                    conn.commit()
                    student = conn.execute(
                        'SELECT * FROM students WHERE id = %s',
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
        error_message = _user_facing_oauth_error(e)
        status_code = 503 if _is_transient_network_error(e) else 500
        return jsonify({'error': error_message}), status_code


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

        # Parse combined state (format: frontend_state:user_type)
        # The user_type is encoded in the state parameter, so we don't rely on server session
        state_parts = state.split(':')
        if len(state_parts) >= 2:
            user_type = state_parts[-1]  # Last part is user_type
        else:
            user_type = 'teacher'  # Default fallback
        
        logger.info(f"Login callback - code: {'yes' if code else 'no'}, state: {state}, user_type: {user_type}")

        credentials = _exchange_code_for_tokens(
            code=code,
            redirect_uri=f'{BACKEND_URL}/api/auth/google/login/callback'
        )

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
                'SELECT * FROM teachers WHERE google_id = %s',
                (google_id,)
            ).fetchone()

            if not teacher:
                teacher = conn.execute(
                    'SELECT * FROM teachers WHERE email = %s',
                    (email,)
                ).fetchone()

                if teacher:
                    conn.execute(
                        '''UPDATE teachers 
                           SET google_id = %s, name = %s, 
                               google_refresh_token = %s,
                               google_access_token = %s,
                               google_token_expires_at = %s
                           WHERE id = %s''',
                        (google_id, name, credentials.refresh_token, credentials.token, expires_at, teacher['id'])
                    )
                    conn.commit()
                else:
                    cursor = conn.execute(
                        '''INSERT INTO teachers (username, google_id, email, name, password,
                               google_refresh_token, google_access_token, google_token_expires_at)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)''',
                        (email.split('@')[0], google_id, email, name, '',
                         credentials.refresh_token, credentials.token, expires_at)
                    )
                    conn.commit()
                    teacher = conn.execute(
                        'SELECT * FROM teachers WHERE id = %s',
                        (cursor.lastrowid,)
                    ).fetchone()
            else:
                conn.execute(
                    '''UPDATE teachers 
                       SET google_refresh_token = %s,
                           google_access_token = %s,
                           google_token_expires_at = %s
                       WHERE id = %s''',
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
            user_json = urllib.parse.quote(json.dumps(user_data))
            return redirect(f'{FRONTEND_URL}/?login_success=true&user_type=teacher&user_data={user_json}')

        else:
            # Student login (no tokens needed)
            student = conn.execute(
                'SELECT * FROM students WHERE google_id = %s',
                (google_id,)
            ).fetchone()

            if not student:
                student = conn.execute(
                    'SELECT * FROM students WHERE email = %s',
                    (email,)
                ).fetchone()

                if student:
                    conn.execute(
                        'UPDATE students SET google_id = %s, name = %s WHERE id = %s',
                        (google_id, name, student['id'])
                    )
                    conn.commit()
                else:
                    # Check if name already exists (UNIQUE constraint)
                    student_name = name if name else email.split('@')[0]
                    existing_by_name = conn.execute(
                        'SELECT * FROM students WHERE name = %s',
                        (student_name,)
                    ).fetchone()

                    if existing_by_name:
                        # Use existing student with this name
                        conn.execute(
                            'UPDATE students SET google_id = %s, email = %s WHERE id = %s',
                            (google_id, email, existing_by_name['id'])
                        )
                        conn.commit()
                        student = existing_by_name
                    else:
                        # Create new student
                        cursor = conn.execute(
                            '''INSERT INTO students (name, google_id, email, pin, last_login_at)
                               VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)''',
                            (student_name, google_id, email, '')
                        )
                        conn.commit()
                        student = conn.execute(
                            'SELECT * FROM students WHERE id = %s',
                            (cursor.lastrowid,)
                        ).fetchone()

            user_data = {
                'id': student['id'],
                'name': student['name'] or name,
                'email': student['email'] or email,
                'google_id': google_id
            }
            user_json = urllib.parse.quote(json.dumps(user_data))
            return redirect(f'{FRONTEND_URL}/?login_success=true&user_type=student&user_data={user_json}')

    except Exception as e:
        logger.exception("Login callback error")
        safe_error = urllib.parse.quote(_user_facing_oauth_error(e))
        return redirect(f'{FRONTEND_URL}/?error={safe_error}')


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
        flow = _build_google_oauth_flow(f'{BACKEND_URL}/api/auth/google/login/callback')

        # Encode user_type into the state parameter (Google will echo it back)
        # Format: frontend_state:user_type
        combined_state = f"{state}:{user_type}"

        # Generate authorization URL
        authorization_url, oauth_state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent',
            state=combined_state
        )

        # Store the original state for verification (in case Google returns it unchanged)
        session['oauth_state'] = state
        session['oauth_user_type'] = user_type

        logger.info(f"OAuth authorize initiated for {user_type}, state: {combined_state}")
        return redirect(authorization_url)

    except Exception as e:
        logger.error(f"Error creating OAuth flow: {e}")
        safe_error = urllib.parse.quote(_user_facing_oauth_error(e))
        return redirect(f'{FRONTEND_URL}/?error={safe_error}')


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
        flow = _build_google_oauth_flow(f'{BACKEND_URL}/api/auth/google/callback')
        
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
        return jsonify({'error': _user_facing_oauth_error(e)}), 500


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
            
        # State can be teacher_id in some flows, or a random string. 
        # If it's a teacher_id, we need to cast it.
        try:
            teacher_id = int(teacher_id)
        except:
            pass
            
        logger.info(f"Exchanging code for tokens, teacher_id: {teacher_id}")

        credentials = _exchange_code_for_tokens(
            code=code,
            redirect_uri=f'{BACKEND_URL}/api/auth/google/callback'
        )

        logger.info(f"Tokens received, refresh_token: {'yes' if credentials.refresh_token else 'no'}")

        # Store tokens in database
        conn = db.get_db()
        expires_at = credentials.expiry.isoformat() if credentials.expiry else None

        conn.execute('''
            UPDATE teachers
            SET google_refresh_token = %s,
                google_access_token = %s,
                google_token_expires_at = %s
            WHERE id = %s
        ''', (credentials.refresh_token, credentials.token, expires_at, teacher_id))
        conn.commit()

        logger.info(f"Tokens stored for teacher {teacher_id}")
        
        # Verify teacher was updated
        teacher = conn.execute('SELECT * FROM teachers WHERE id = %s', (teacher_id,)).fetchone()
        if not teacher:
            return redirect(f'{FRONTEND_URL}/teacher/connect-classroom?error=teacher_not_found')
        
        # Redirect to dashboard with success
        return redirect(f'{FRONTEND_URL}/teacher/connect-classroom?success=true')
        
    except Exception as e:
        logger.exception("OAuth callback error")
        safe_error = urllib.parse.quote(_user_facing_oauth_error(e))
        return redirect(f'{FRONTEND_URL}/teacher/connect-classroom?error={safe_error}')


@router.route('/google/status', methods=['GET', 'OPTIONS'])
def google_status():
    """Check if teacher has connected Google Classroom"""
    if request.method == 'OPTIONS':
        return '', 204
    
    teacher_id = request.args.get('teacher_id')
    if not teacher_id:
        return jsonify({'error': 'teacher_id required'}), 400
    
    try:
        teacher_id = int(teacher_id)
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid teacher_id'}), 400
    
    try:
        conn = db.get_db()
        teacher = conn.execute(
            'SELECT google_refresh_token, google_token_expires_at, email FROM teachers WHERE id = %s',
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
