"""
Authentication Routes

Handles user authentication including:
- Traditional username/password login
- Google OAuth login
- Logout
"""

from flask import Blueprint, request, jsonify, session, redirect, current_app
from services import google_auth
import db
import os
from datetime import datetime

router = Blueprint('auth', __name__)


@router.route('/google', methods=['GET'])
def google_login():
    """
    Initiate Google OAuth login flow.
    
    Query Parameters:
        next (str): URL to redirect to after successful login
        
    Returns:
        redirect: Google OAuth authorization page
    """
    try:
        authorization_url, state = google_auth.get_authorization_url()
        
        # Store state for verification in callback
        session['oauth_state'] = state
        session['oauth_next'] = request.args.get('next', '/dashboard')
        
        return redirect(authorization_url)
        
    except Exception as e:
        current_app.logger.error(f'Google OAuth error: {e}')
        return redirect(f'/login?error=oauth_init_failed')


@router.route('/google/callback', methods=['GET'])
def google_callback():
    """
    Handle Google OAuth callback.
    
    This endpoint is called by Google after user authentication.
    
    Returns:
        redirect: Dashboard or error page
    """
    try:
        # Verify OAuth state to prevent CSRF attacks
        state = session.get('oauth_state')
        if not state or state != request.args.get('state'):
            current_app.logger.warning('OAuth state mismatch')
            return redirect('/login?error=invalid_state')
        
        # Exchange authorization code for tokens
        credentials = google_auth.exchange_code(request.args.get('code'))
        
        # Get user information from Google
        user_info = google_auth.get_user_info(credentials)
        email = user_info.get('email')
        google_id = user_info.get('id')
        name = user_info.get('name', email.split('@')[0])
        
        if not email:
            current_app.logger.error('No email in Google response')
            return redirect('/login?error=no_email')
        
        # Validate email domain
        if not validate_school_email(email):
            current_app.logger.warning(f'Invalid domain: {email}')
            return redirect('/login?error=invalid_domain')
        
        conn = db.get_db()
        
        # Check if user is a teacher (pre-provisioned)
        teacher = conn.execute(
            'SELECT * FROM teachers WHERE google_email = ? AND active = 1',
            (email,)
        ).fetchone()
        
        if teacher:
            # Update teacher's OAuth tokens
            conn.execute('''
                UPDATE teachers 
                SET google_refresh_token = ?,
                    google_access_token = ?,
                    google_token_expiry = ?,
                    google_id = ?,
                    classroom_connected = 1
                WHERE id = ?
            ''', (
                credentials.refresh_token,
                credentials.token,
                credentials.expiry.isoformat() if credentials.expiry else None,
                google_id,
                teacher['id']
            ))
            conn.commit()
            
            # Create session
            session['user_id'] = teacher['id']
            session['role'] = 'teacher'
            session['email'] = email
            session['user_name'] = name
            
            current_app.logger.info(f'Teacher logged in: {email}')
            
            next_url = session.pop('oauth_next', '/teacher/dashboard')
            return redirect(next_url)
        
        # Check if user is a student
        student = conn.execute(
            'SELECT * FROM students WHERE google_email = ?',
            (email,)
        ).fetchone()
        
        if student:
            # Create session for student
            session['user_id'] = student['id']
            session['role'] = 'student'
            session['email'] = email
            session['user_name'] = name
            
            current_app.logger.info(f'Student logged in: {email}')
            
            next_url = session.pop('oauth_next', '/student/dashboard')
            return redirect(next_url)
        
        # New user - check if they exist in any Classroom roster
        roster_match = check_classroom_rosters(credentials, email)
        
        if roster_match:
            # Auto-create student account
            cursor = conn.execute('''
                INSERT INTO students (name, google_email, classroom_roster_id, classroom_profile_json)
                VALUES (?, ?, ?, ?)
            ''', (
                name,
                email,
                roster_match['roster_id'],
                roster_match['profile_json']
            ))
            conn.commit()
            
            session['user_id'] = cursor.lastrowid
            session['role'] = 'student'
            session['email'] = email
            session['user_name'] = name
            
            current_app.logger.info(f'New student created from roster: {email}')
            
            next_url = session.pop('oauth_next', '/student/dashboard')
            return redirect(next_url)
        
        # Unknown user - not in any roster
        current_app.logger.warning(f'Unknown user attempted login: {email}')
        return redirect('/access-denied?reason=unknown_user')
        
    except Exception as e:
        current_app.logger.error(f'OAuth callback error: {e}', exc_info=True)
        return redirect('/login?error=oauth_callback_failed')


@router.route('/logout', methods=['POST'])
def logout():
    """
    Logout user and clear session.
    
    Returns:
        json: Success response
    """
    session.clear()
    return jsonify({'success': True})


@router.route('/me', methods=['GET'])
def get_current_user():
    """
    Get current logged-in user information.
    
    Returns:
        json: User information or 401 if not logged in
    """
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    return jsonify({
        'success': True,
        'user': {
            'id': session['user_id'],
            'email': session.get('email'),
            'name': session.get('user_name'),
            'role': session.get('role')
        }
    })


def validate_school_email(email):
    """
    Validate if email is from allowed school domain.
    
    Args:
        email (str): Email address to validate
        
    Returns:
        bool: True if email is from allowed domain
    """
    allowed_domains = os.environ.get('ALLOWED_EMAIL_DOMAINS', '')
    if not allowed_domains:
        # If no domains configured, allow all (development mode)
        return '@' in email
    
    domains = [d.strip() for d in allowed_domains.split(',')]
    email_domain = email.split('@')[1] if '@' in email else ''
    
    return email_domain in domains


def check_classroom_rosters(credentials, email):
    """
    Check if email exists in any Google Classroom roster.
    
    Args:
        credentials (Credentials): OAuth credentials
        email (str): User's email address
        
    Returns:
        dict: Roster match info or None
    """
    try:
        service = google_auth.get_classroom_service(credentials)
        
        # Get all courses for this user
        courses = service.courses().list().execute().get('courses', [])
        
        for course in courses:
            course_id = course['id']
            
            # Try to get student info for this course
            try:
                student = service.courses().students().get(
                    courseId=course_id,
                    userId=email
                ).execute()
                
                # Found student in roster
                profile_data = {
                    'course_id': course_id,
                    'course_name': course.get('name', ''),
                    'student_id': student.get('profile', {}).get('id', ''),
                    'name': student.get('profile', {}).get('name', {}).get('fullName', '')
                }
                
                return {
                    'roster_id': f"{course_id}_{student.get('id', '')}",
                    'course_id': course_id,
                    'course_name': course.get('name', ''),
                    'profile_json': str(profile_data)
                }
                
            except Exception:
                # Not a student in this course, continue checking
                continue
        
        return None
        
    except Exception as e:
        current_app.logger.error(f'Error checking rosters: {e}')
        return None


# Role-based access control decorators
from functools import wraps

def teacher_required(f):
    """
    Decorator to require teacher role for endpoint.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'role' not in session or session.get('role') != 'teacher':
            return jsonify({'error': 'Teacher access required'}), 403
        return f(*args, **kwargs)
    return decorated_function


def student_required(f):
    """
    Decorator to require student role for endpoint.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'role' not in session or session.get('role') != 'student':
            return jsonify({'error': 'Student access required'}), 403
        return f(*args, **kwargs)
    return decorated_function


def login_required(f):
    """
    Decorator to require authentication for endpoint.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function
