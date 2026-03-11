"""
Google OAuth Authentication Service

Handles OAuth 2.0 flow for Google Classroom integration.
"""

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
import os
from datetime import datetime

# Google OAuth configuration
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
GOOGLE_REDIRECT_URI = os.environ.get('GOOGLE_REDIRECT_URI', 'http://localhost:5000/api/auth/google/callback')

# OAuth scopes for Google Classroom
SCOPES = [
    'https://www.googleapis.com/auth/classroom/courses',
    'https://www.googleapis.com/auth/classroom/coursework.me',
    'https://www.googleapis.com/auth/classroom/student-submissions.me',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
]


def get_oauth_flow():
    """
    Create OAuth flow for Google authentication.
    
    Returns:
        Flow: Google OAuth flow object
    """
    return Flow.from_client_config(
        {
            'web': {
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
                'redirect_uris': [GOOGLE_REDIRECT_URI],
            }
        },
        scopes=SCOPES
    )


def get_authorization_url():
    """
    Generate Google OAuth authorization URL.
    
    Returns:
        tuple: (authorization_url, state)
    """
    flow = get_oauth_flow()
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent',
    )
    return authorization_url, state


def exchange_code(code):
    """
    Exchange authorization code for tokens.
    
    Args:
        code (str): Authorization code from Google callback
        
    Returns:
        Credentials: OAuth credentials object
    """
    flow = get_oauth_flow()
    flow.fetch_token(code=code)
    return flow.credentials


def get_user_info(credentials):
    """
    Get user profile information from Google.
    
    Args:
        credentials (Credentials): OAuth credentials
        
    Returns:
        dict: User profile information
    """
    service = build('oauth2', 'v2', credentials=credentials)
    return service.userinfo().get().execute()


def get_classroom_service(credentials):
    """
    Build Google Classroom API service.
    
    Args:
        credentials (Credentials): OAuth credentials
        
    Returns:
        Resource: Classroom API service object
    """
    return build('classroom', 'v1', credentials=credentials)


def refresh_credentials(refresh_token):
    """
    Refresh expired access token using refresh token.
    
    Args:
        refresh_token (str): OAuth refresh token
        
    Returns:
        Credentials: Refreshed OAuth credentials
    """
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri='https://oauth2.googleapis.com/token',
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
    )
    creds.refresh(Request())
    return creds


def validate_token(credentials):
    """
    Check if token is valid and refresh if needed.
    
    Args:
        credentials (Credentials): OAuth credentials
        
    Returns:
        bool: True if token is valid
    """
    if not credentials.valid:
        if credentials.refresh_token:
            try:
                creds = refresh_credentials(credentials.refresh_token)
                return creds.valid
            except Exception:
                return False
        return False
    return True


def get_user_courses(credentials):
    """
    Get list of user's Google Classroom courses.
    
    Args:
        credentials (Credentials): OAuth credentials
        
    Returns:
        list: List of course objects
    """
    service = get_classroom_service(credentials)
    results = service.courses().list().execute()
    return results.get('courses', [])


def get_course_topics(credentials, course_id):
    """
    Get topics for a specific course.
    
    Args:
        credentials (Credentials): OAuth credentials
        course_id (str): Google Classroom course ID
        
    Returns:
        list: List of topic objects
    """
    service = get_classroom_service(credentials)
    results = service.courses().topics().list(courseId=course_id).execute()
    return results.get('topic', [])


def create_course_topic(credentials, course_id, topic_name):
    """
    Create a new topic in a course.
    
    Args:
        credentials (Credentials): OAuth credentials
        course_id (str): Google Classroom course ID
        topic_name (str): Name of the topic to create
        
    Returns:
        dict: Created topic object
    """
    service = get_classroom_service(credentials)
    topic = service.courses().topics().create(
        courseId=course_id,
        body={'name': topic_name}
    ).execute()
    return topic


def create_coursework(credentials, course_id, coursework_body):
    """
    Create coursework (assignment) in a course.
    
    Args:
        credentials (Credentials): OAuth credentials
        course_id (str): Google Classroom course ID
        coursework_body (dict): Coursework definition
        
    Returns:
        dict: Created coursework object
    """
    service = get_classroom_service(credentials)
    coursework = service.courses().courseWork().create(
        courseId=course_id,
        body=coursework_body
    ).execute()
    return coursework


def get_student_submission(credentials, course_id, coursework_id, student_email):
    """
    Get student's submission for a coursework.
    
    Args:
        credentials (Credentials): OAuth credentials
        course_id (str): Google Classroom course ID
        coursework_id (str): Coursework ID
        student_email (str): Student's email address
        
    Returns:
        dict: Student submission object or None
    """
    service = get_classroom_service(credentials)
    
    try:
        submissions = service.courses().courseWork().studentSubmissions().list(
            courseId=course_id,
            courseWorkId=coursework_id,
            userId=student_email
        ).execute()
        
        student_submissions = submissions.get('studentSubmissions', [])
        return student_submissions[0] if student_submissions else None
    except Exception:
        return None


def update_student_grade(credentials, course_id, coursework_id, submission_id, grade):
    """
    Update student's grade for a submission.
    
    Args:
        credentials (Credentials): OAuth credentials
        course_id (str): Google Classroom course ID
        coursework_id (str): Coursework ID
        submission_id (str): Student submission ID
        grade (float): Grade to assign (0-100)
        
    Returns:
        dict: Updated submission object
    """
    service = get_classroom_service(credentials)
    
    submission = service.courses().courseWork().studentSubmissions().patch(
        courseId=course_id,
        courseWorkId=coursework_id,
        id=submission_id,
        body={
            'assignedGrade': grade,
            'draftGrade': None  # Auto-publish grade
        }
    ).execute()
    
    return submission
