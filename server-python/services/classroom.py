"""
Google Classroom API Service
Handles all Classroom API interactions: courses, topics, assignments, roster, grade sync
"""

import os
import json
import logging
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import google.auth.transport.requests as google_requests
import db

logger = logging.getLogger(__name__)

# Google Classroom API Scopes
CLASSROOM_SCOPES = [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.topics',
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/classroom.coursework.me',
    'https://www.googleapis.com/auth/classroom.rosters.readonly'
]


def get_teacher_credentials(teacher_id):
    """Get OAuth credentials for a teacher"""
    try:
        teacher_id = int(teacher_id)
    except (ValueError, TypeError):
        return None
        
    conn = db.get_db()
    teacher = conn.execute(
        'SELECT * FROM teachers WHERE id = %s',
        (teacher_id,)
    ).fetchone()
    
    if not teacher or not teacher['google_refresh_token']:
        return None
    
    # Check if access token is still valid (sqlite3.Row uses [] not .get())
    try:
        expires_at = teacher['google_token_expires_at']
    except (KeyError, IndexError):
        expires_at = None

    if expires_at:
        try:
            if isinstance(expires_at, str):
                expires_dt = datetime.fromisoformat(expires_at)
            elif isinstance(expires_at, datetime):
                expires_dt = expires_at
            else:
                expires_dt = None
                
            if expires_dt and expires_dt > datetime.utcnow():
                # Token still valid
                return Credentials(
                    token=teacher['google_access_token'],
                    refresh_token=teacher['google_refresh_token'],
                    token_uri='https://oauth2.googleapis.com/token',
                    client_id=os.environ.get('GOOGLE_CLIENT_ID'),
                    client_secret=os.environ.get('GOOGLE_CLIENT_SECRET'),
                    scopes=CLASSROOM_SCOPES
                )
        except Exception as e:
            logger.error(f"Error parsing token expiry: {e}")

    # Token expired or missing — return credentials to allow refresh
    return Credentials(
        token=teacher['google_access_token'],
        refresh_token=teacher['google_refresh_token'],
        token_uri='https://oauth2.googleapis.com/token',
        client_id=os.environ.get('GOOGLE_CLIENT_ID'),
        client_secret=os.environ.get('GOOGLE_CLIENT_SECRET'),
        scopes=CLASSROOM_SCOPES
    )


def refresh_teacher_tokens(teacher_id, credentials):
    """Refresh and store new tokens for a teacher"""
    try:
        teacher_id = int(teacher_id)
        credentials.refresh(google_requests.Request())
        
        conn = db.get_db()
        expires_at = datetime.utcnow() + timedelta(hours=1)
        
        conn.execute('''
            UPDATE teachers 
            SET google_access_token = %s, 
                google_token_expires_at = %s
            WHERE id = %s
        ''', (credentials.token, expires_at.isoformat(), teacher_id))
        conn.commit()
        
        return credentials
    except Exception as e:
        logger.error(f"Failed to refresh tokens: {e}")
        return None


def get_classroom_service(teacher_id):
    """Get authenticated Classroom API service for a teacher"""
    import google.auth.transport.requests as google_requests
    
    credentials = get_teacher_credentials(teacher_id)
    if not credentials:
        return None
    
    # Check if token needs refresh
    if credentials.expired and credentials.refresh_token:
        try:
            credentials.refresh(google_requests.Request())
            # Store updated tokens
            conn = db.get_db()
            expires_at = credentials.expiry.isoformat() if credentials.expiry else None
            conn.execute('''
                UPDATE teachers 
                SET google_access_token = %s, 
                    google_token_expires_at = %s
                WHERE id = %s
            ''', (credentials.token, expires_at, teacher_id))
            conn.commit()
        except Exception as e:
            logger.error(f"Token refresh failed: {e}")
            return None
    
    try:
        service = build('classroom', 'v1', credentials=credentials)
        return service
    except Exception as e:
        logger.error(f"Failed to build Classroom service: {e}")
        return None


def get_courses(teacher_id):
    """Fetch all courses for a teacher"""
    service = get_classroom_service(teacher_id)
    if not service:
        return {'error': 'Teacher not connected to Google Classroom'}
    
    try:
        courses = []
        page_token = None
        
        while True:
            response = service.courses().list(
                pageSize=100,
                pageToken=page_token
            ).execute()
            
            courses.extend(response.get('courses', []))
            page_token = response.get('nextPageToken')
            
            if not page_token:
                break
        
        # Format for frontend
        formatted = []
        for course in courses:
            formatted.append({
                'id': course['id'],
                'name': course['name'],
                'section': course.get('section', ''),
                'ownerId': course.get('ownerId', ''),
            })
        
        return {'courses': formatted}
    except HttpError as e:
        logger.error(f"Classroom API error: {e}")
        if e.resp.status == 401:
            return {'error': 'Authentication expired. Please reconnect Google Classroom.'}
        return {'error': str(e)}
    except Exception as e:
        logger.error(f"Unexpected error fetching courses: {e}")
        return {'error': str(e)}


def get_course_topics(teacher_id, course_id):
    """Fetch topics for a specific course"""
    service = get_classroom_service(teacher_id)
    if not service:
        return {'error': 'Teacher not connected to Google Classroom'}
    
    try:
        topics = []
        page_token = None

        while True:
            response = service.courses().topics().list(
                courseId=course_id,
                pageSize=100,
                pageToken=page_token
            ).execute()
            
            # API returns field name 'topic' (singular) in list response
            topics.extend(response.get('topic', []) or response.get('topics', []))
            page_token = response.get('nextPageToken')
            
            if not page_token:
                break

        formatted = []
        for topic in topics:
            formatted.append({
                'id': topic['topicId'],
                'name': topic['name'],
            })
        
        return {'topics': formatted}
    except HttpError as e:
        logger.error(f"Classroom API error fetching topics: {e}")
        if e.resp.status == 401:
            return {'error': 'Authentication expired. Please reconnect Google Classroom.'}
        return {'error': str(e)}
    except Exception as e:
        logger.error(f"Unexpected error fetching topics: {e}")
        return {'error': str(e)}


def create_topic(teacher_id, course_id, topic_name):
    """Create a new topic in a course"""
    service = get_classroom_service(teacher_id)
    if not service:
        return {'error': 'Teacher not connected to Google Classroom'}
    
    try:
        topic = {
            'name': topic_name
        }
        
        response = service.courses().topics().create(
            courseId=course_id,
            body=topic
        ).execute()
        
        return {
            'id': response['topicId'],
            'name': response['name']
        }
    except HttpError as e:
        logger.error(f"Classroom API error creating topic: {e}")
        if e.resp.status == 401:
            return {'error': 'Authentication expired. Please reconnect Google Classroom.'}
        return {'error': str(e)}
    except Exception as e:
        logger.error(f"Unexpected error creating topic: {e}")
        return {'error': str(e)}


def create_assignment(teacher_id, course_id, quiz_data):
    """
    Create a Classroom assignment for a quiz
    
    quiz_data should contain:
    - title: Quiz title
    - description: Quiz description with link
    - quiz_code: MathMind quiz code
    - due_date: Optional due date
    - topic_id: Optional topic ID to categorize
    - points: Max points (default 100)
    """
    service = get_classroom_service(teacher_id)
    if not service:
        return {'error': 'Teacher not connected to Google Classroom'}
    
    try:
        # Build payload using fields accepted by Classroom courseWork.create
        assignment = {
            'title': quiz_data.get('title', 'MathMind Quiz'),
            'description': quiz_data.get('description', ''),
            'state': 'PUBLISHED',
            'workType': 'ASSIGNMENT',
            'maxPoints': int(quiz_data.get('points', 100)),
        }

        # Only include dueDate when provided; Classroom rejects null/invalid shapes
        if quiz_data.get('due_date'):
            assignment['dueDate'] = quiz_data['due_date']
        
        # Add topic if provided
        if quiz_data.get('topic_id'):
            assignment['topicId'] = quiz_data['topic_id']
        
        # Add materials (quiz link)
        quiz_link = quiz_data.get('quiz_link', '')
        if quiz_link:
            assignment['materials'] = [
                {
                    'link': {
                        'url': quiz_link,
                        'title': 'Take Quiz on MathMind'
                    }
                }
            ]
        
        response = service.courses().courseWork().create(
            courseId=course_id,
            body=assignment
        ).execute()
        
        return {
            'coursework_id': response['id'],
            'title': response['title'],
            'link': response.get('alternateLink', '')
        }
    except HttpError as e:
        logger.error(f"Classroom API error creating assignment: {e}")
        if e.resp.status == 401:
            return {'error': 'Authentication expired. Please reconnect Google Classroom.'}
        return {'error': str(e)}
    except Exception as e:
        logger.error(f"Unexpected error creating assignment: {e}")
        return {'error': str(e)}


def get_course_roster(teacher_id, course_id):
    """
    Get student roster for a course
    Returns list of students with email and userId
    """
    service = get_classroom_service(teacher_id)
    if not service:
        return {'error': 'Teacher not connected to Google Classroom'}
    
    try:
        students = []
        page_token = None
        
        while True:
            response = service.courses().students().list(
                courseId=course_id,
                pageSize=100,
                pageToken=page_token
            ).execute()
            
            students.extend(response.get('students', []))
            page_token = response.get('nextPageToken')
            
            if not page_token:
                break
        
        # Format for easy lookup
        roster = []
        for student in students:
            profile = student.get('profile', {})
            roster.append({
                'userId': student.get('userId', ''),
                'email': profile.get('emailAddress', ''),
                'name': profile.get('name', {}).get('fullName', ''),
            })
        
        return {'roster': roster}
    except HttpError as e:
        logger.error(f"Classroom API error fetching roster: {e}")
        if e.resp.status == 401:
            return {'error': 'Authentication expired. Please reconnect Google Classroom.'}
        return {'error': str(e)}
    except Exception as e:
        logger.error(f"Unexpected error fetching roster: {e}")
        return {'error': str(e)}


def validate_student_in_course(course_id, student_email):
    """
    Validate if a student email is in the course roster
    This is called when student tries to access a quiz
    """
    # We need to find which teacher owns this course
    # For now, we'll need to check all connected teachers
    conn = db.get_db()
    teachers = conn.execute(
        'SELECT id FROM teachers WHERE google_refresh_token IS NOT NULL'
    ).fetchall()
    
    for teacher in teachers:
        roster_result = get_course_roster(teacher['id'], course_id)
        if 'error' in roster_result:
            continue
        
        # Fetch the student's Google ID from MathMind database
        student_record = conn.execute(
            'SELECT google_id FROM students WHERE email = %s', (student_email,)
        ).fetchone()
        target_google_id = student_record['google_id'] if student_record else None

        roster = roster_result.get('roster', [])
        for student in roster:
            if target_google_id and student['userId'] == target_google_id:
                return {
                    'valid': True,
                    'userId': student['userId'],
                    'name': student['name'],
                    'email': student['email'] or student_email
                }
            elif student['email'] and student['email'].lower() == student_email.lower():
                return {
                    'valid': True,
                    'userId': student['userId'],
                    'name': student['name'],
                    'email': student['email']
                }
    
    return {'valid': False, 'error': 'Student not found in course roster'}


def sync_grade(teacher_id, course_id, coursework_id, student_user_id, percentage):
    """
    Sync a grade to Google Classroom
    
    percentage: 0-100
    """
    service = get_classroom_service(teacher_id)
    if not service:
        return {'error': 'Teacher not connected to Google Classroom'}
    
    try:
        # First get the student's specific submission ID for this coursework
        submissions_response = service.courses().courseWork().studentSubmissions().list(
            courseId=course_id,
            courseWorkId=coursework_id,
            userId=student_user_id
        ).execute()

        submissions = submissions_response.get('studentSubmissions', [])
        if not submissions:
            return {'error': 'No submission found for this student'}
            
        submission_id = submissions[0]['id']

        # Calculate points earned based on the assignment's max points
        assignment = service.courses().courseWork().get(
            courseId=course_id,
            id=coursework_id
        ).execute()
        
        max_points = assignment.get('maxPoints', 100)
        earned_points = (percentage / 100) * max_points
        
        # Submit grade
        submission = {
            'assignedGrade': round(earned_points, 2),
            'draftGrade': round(earned_points, 2)
        }
        
        service.courses().courseWork().studentSubmissions().patch(
            courseId=course_id,
            courseWorkId=coursework_id,
            id=submission_id,
            body=submission,
            updateMask='assignedGrade,draftGrade'
        ).execute()
        
        return {'success': True, 'grade': earned_points}
    except HttpError as e:
        logger.error(f"Classroom API error syncing grade: {e}")
        if e.resp.status == 401:
            return {'error': 'Authentication expired. Please reconnect Google Classroom.'}
        return {'error': str(e)}
    except Exception as e:
        logger.error(f"Unexpected error syncing grade: {e}")
        return {'error': str(e)}


def queue_grade_sync(course_id, coursework_id, student_email, percentage):
    """Add grade to sync queue for later retry if needed"""
    conn = db.get_db()
    cursor = conn.execute('''
        INSERT INTO grade_sync_queue (course_id, coursework_id, student_email, percentage, status)
        VALUES (%s, %s, %s, %s, 'pending')
    ''', (course_id, coursework_id, student_email, percentage))
    conn.commit()
    logger.info(f"Enqueued grade sync course={course_id} coursework={coursework_id} student={student_email} pct={percentage}")
    return cursor.lastrowid


def process_grade_sync_queue():
    """Process pending grade syncs from the queue"""
    conn = db.get_db()
    pending = conn.execute('''
        SELECT * FROM grade_sync_queue 
        WHERE status = 'pending' AND retry_count < 3
        ORDER BY created_at
        LIMIT 10
    ''').fetchall()
    
    results = {'synced': 0, 'failed': 0, 'retried': 0}
    if not pending:
        logger.info("Grade sync queue empty")
    
    for item in pending:
        # Find teacher who owns this course
        # For now, try all connected teachers
        teachers = conn.execute(
            'SELECT id FROM teachers WHERE google_refresh_token IS NOT NULL'
        ).fetchall()
        
        synced = False
        for teacher in teachers:
            # Get student userId from roster
            roster_result = get_course_roster(teacher['id'], item['course_id'])
            if 'error' in roster_result:
                logger.warning(f"Roster fetch failed for teacher {teacher['id']}: {roster_result['error']}")
                continue
            
            student_user_id = None
            
            # Fetch the student's Google ID from MathMind database
            student_record = conn.execute(
                'SELECT google_id FROM students WHERE email = %s', (item['student_email'],)
            ).fetchone()
            target_google_id = student_record['google_id'] if student_record else None

            for student in roster_result.get('roster', []):
                # Primary match via strict Google Account ID mapping (ignores email privacy restrictions)
                if target_google_id and student['userId'] == target_google_id:
                    student_user_id = student['userId']
                    break
                # Fallback to email match if available
                elif student['email'] and item['student_email'] and student['email'].lower() == item['student_email'].lower():
                    student_user_id = student['userId']
                    break
            
            if not student_user_id:
                logger.warning(f"Student {item['student_email']} not found in roster for course {item['course_id']} (teacher {teacher['id']})")
                continue
            
            # Sync grade
            result = sync_grade(
                teacher['id'],
                item['course_id'],
                item['coursework_id'],
                student_user_id,
                item['percentage']
            )
            
            if 'error' not in result:
                # Success - update queue
                conn.execute('''
                    UPDATE grade_sync_queue 
                    SET status = 'synced', synced_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                ''', (item['id'],))
                conn.commit()
                results['synced'] += 1
                synced = True
                logger.info(f"Grade synced for {item['student_email']} coursework {item['coursework_id']} with teacher {teacher['id']}")
                break
        
        if not synced:
            # Failed - increment retry count
            conn.execute('''
                UPDATE grade_sync_queue 
                SET retry_count = retry_count + 1,
                    error_message = %s
                WHERE id = %s
            ''', ('Failed to sync - teacher disconnected or student not found', item['id']))
            conn.commit()
            results['retried'] += 1
            logger.warning(f"Grade sync retry queued for {item['student_email']} coursework {item['coursework_id']}")
    
    return results
