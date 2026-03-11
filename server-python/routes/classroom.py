"""
Google Classroom API Routes

Handles interaction with Google Classroom:
- Fetch teacher's courses
- Fetch course topics
- Create topics
- Create coursework
- Grade sync
"""

from flask import Blueprint, request, jsonify, session, current_app
from services import google_auth
from routes.auth import teacher_required
import db

router = Blueprint('classroom', __name__)


@router.route('/courses', methods=['GET'])
@teacher_required
def get_courses():
    """
    Get teacher's Google Classroom courses.
    
    Returns:
        json: List of courses
    """
    try:
        user_id = session.get('user_id')
        conn = db.get_db()
        
        # Get teacher's Google credentials
        teacher = conn.execute(
            'SELECT google_refresh_token FROM teachers WHERE id = ?',
            (user_id,)
        ).fetchone()
        
        if not teacher or not teacher['google_refresh_token']:
            return jsonify({
                'error': 'Google account not connected. Please sign in with Google.'
            }), 400
        
        # Refresh credentials
        credentials = google_auth.refresh_credentials(teacher['google_refresh_token'])
        
        # Fetch courses from Google Classroom
        courses = google_auth.get_user_courses(credentials)
        
        # Format for frontend
        formatted_courses = []
        for course in courses:
            formatted_courses.append({
                'id': course['id'],
                'name': course['name'],
                'section': course.get('section', ''),
                'room': course.get('room', ''),
                'owner_id': course.get('ownerId', ''),
                'course_state': course.get('courseState', 'ACTIVE')
            })
        
        return jsonify({
            'success': True,
            'courses': formatted_courses
        })
        
    except Exception as e:
        current_app.logger.error(f'Error fetching courses: {e}', exc_info=True)
        return jsonify({'error': str(e)}), 500


@router.route('/courses/<course_id>/topics', methods=['GET'])
@teacher_required
def get_course_topics(course_id):
    """
    Get topics from a specific Google Classroom course.
    
    Args:
        course_id (str): Google Classroom course ID
        
    Returns:
        json: List of topics
    """
    try:
        user_id = session.get('user_id')
        conn = db.get_db()
        
        teacher = conn.execute(
            'SELECT google_refresh_token FROM teachers WHERE id = ?',
            (user_id,)
        ).fetchone()
        
        if not teacher or not teacher['google_refresh_token']:
            return jsonify({'error': 'Google account not connected'}), 400
        
        credentials = google_auth.refresh_credentials(teacher['google_refresh_token'])
        topics = google_auth.get_course_topics(credentials, course_id)
        
        return jsonify({
            'success': True,
            'topics': topics
        })
        
    except Exception as e:
        current_app.logger.error(f'Error fetching topics: {e}', exc_info=True)
        return jsonify({'error': str(e)}), 500


@router.route('/courses/<course_id>/topics', methods=['POST'])
@teacher_required
def create_course_topic(course_id):
    """
    Create a new topic in a Google Classroom course.
    
    Args:
        course_id (str): Google Classroom course ID
        
    Request Body:
        name (str): Name of the topic to create
        
    Returns:
        json: Created topic
    """
    try:
        user_id = session.get('user_id')
        data = request.get_json()
        topic_name = data.get('name')
        
        if not topic_name:
            return jsonify({'error': 'Topic name is required'}), 400
        
        conn = db.get_db()
        teacher = conn.execute(
            'SELECT google_refresh_token FROM teachers WHERE id = ?',
            (user_id,)
        ).fetchone()
        
        if not teacher or not teacher['google_refresh_token']:
            return jsonify({'error': 'Google account not connected'}), 400
        
        credentials = google_auth.refresh_credentials(teacher['google_refresh_token'])
        topic = google_auth.create_course_topic(credentials, course_id, topic_name)
        
        return jsonify({
            'success': True,
            'topic': topic
        })
        
    except Exception as e:
        current_app.logger.error(f'Error creating topic: {e}', exc_info=True)
        return jsonify({'error': str(e)}), 500


@router.route('/courses/<course_id>/coursework', methods=['POST'])
@teacher_required
def create_coursework(course_id):
    """
    Create coursework (assignment) in a Google Classroom course.
    
    Args:
        course_id (str): Google Classroom course ID
        
    Request Body:
        title (str): Title of the coursework
        description (str): Description/instructions
        topic_id (str, optional): Topic ID to organize under
        due_date (dict, optional): Due date {year, month, day, hours, minutes}
        max_points (int): Maximum points
        materials (list, optional): Materials/links to include
        
    Returns:
        json: Created coursework
    """
    try:
        user_id = session.get('user_id')
        data = request.get_json()
        
        title = data.get('title')
        if not title:
            return jsonify({'error': 'Title is required'}), 400
        
        conn = db.get_db()
        teacher = conn.execute(
            'SELECT google_refresh_token FROM teachers WHERE id = ?',
            (user_id,)
        ).fetchone()
        
        if not teacher or not teacher['google_refresh_token']:
            return jsonify({'error': 'Google account not connected'}), 400
        
        credentials = google_auth.refresh_credentials(teacher['google_refresh_token'])
        
        # Build coursework body
        coursework_body = {
            'title': title,
            'workType': 'ASSIGNMENT',
            'state': data.get('state', 'PUBLISHED'),
            'maxPoints': data.get('maxPoints', 100),
            'assignment': {
                'workType': 'ASSIGNMENT',
                'studentWorkFolderState': 'INDIVIDUAL_FOLDER',
            }
        }
        
        # Add optional fields
        if data.get('description'):
            coursework_body['description'] = data['description']
        
        if data.get('topicId'):
            coursework_body['topicId'] = data['topicId']
        
        if data.get('dueDate'):
            coursework_body['dueDate'] = data['dueDate']
        
        if data.get('materials'):
            coursework_body['materials'] = data['materials']
        
        # Create coursework via Google API
        coursework = google_auth.create_coursework(credentials, course_id, coursework_body)
        
        return jsonify({
            'success': True,
            'coursework': coursework
        })
        
    except Exception as e:
        current_app.logger.error(f'Error creating coursework: {e}', exc_info=True)
        return jsonify({'error': str(e)}), 500


@router.route('/courses/<course_id>/coursework/<coursework_id>/submissions/<student_id>', methods=['GET'])
@teacher_required
def get_student_submission(course_id, coursework_id, student_id):
    """
    Get a student's submission for a coursework.
    
    Args:
        course_id (str): Course ID
        coursework_id (str): Coursework ID
        student_id (str): Student ID or email
        
    Returns:
        json: Student submission
    """
    try:
        user_id = session.get('user_id')
        conn = db.get_db()
        
        teacher = conn.execute(
            'SELECT google_refresh_token FROM teachers WHERE id = ?',
            (user_id,)
        ).fetchone()
        
        if not teacher or not teacher['google_refresh_token']:
            return jsonify({'error': 'Google account not connected'}), 400
        
        credentials = google_auth.refresh_credentials(teacher['google_refresh_token'])
        submission = google_auth.get_student_submission(
            credentials, course_id, coursework_id, student_id
        )
        
        if submission:
            return jsonify({
                'success': True,
                'submission': submission
            })
        else:
            return jsonify({'error': 'Submission not found'}), 404
        
    except Exception as e:
        current_app.logger.error(f'Error fetching submission: {e}', exc_info=True)
        return jsonify({'error': str(e)}), 500


@router.route('/courses/<course_id>/coursework/<coursework_id>/submissions/<student_id>/grade', methods=['PUT'])
@teacher_required
def update_student_grade(course_id, coursework_id, student_id):
    """
    Update a student's grade for a submission.
    
    Args:
        course_id (str): Course ID
        coursework_id (str): Coursework ID
        student_id (str): Student ID or email
        
    Request Body:
        grade (float): Grade to assign (0-100)
        
    Returns:
        json: Updated submission
    """
    try:
        user_id = session.get('user_id')
        data = request.get_json()
        grade = data.get('grade')
        
        if grade is None:
            return jsonify({'error': 'Grade is required'}), 400
        
        conn = db.get_db()
        teacher = conn.execute(
            'SELECT google_refresh_token FROM teachers WHERE id = ?',
            (user_id,)
        ).fetchone()
        
        if not teacher or not teacher['google_refresh_token']:
            return jsonify({'error': 'Google account not connected'}), 400
        
        credentials = google_auth.refresh_credentials(teacher['google_refresh_token'])
        
        # Get submission first
        submission = google_auth.get_student_submission(
            credentials, course_id, coursework_id, student_id
        )
        
        if not submission:
            return jsonify({'error': 'Submission not found'}), 404
        
        # Update grade
        updated = google_auth.update_student_grade(
            credentials, course_id, coursework_id, submission['id'], grade
        )
        
        return jsonify({
            'success': True,
            'submission': updated
        })
        
    except Exception as e:
        current_app.logger.error(f'Error updating grade: {e}', exc_info=True)
        return jsonify({'error': str(e)}), 500


@router.route('/connect', methods=['POST'])
@teacher_required
def connect_google_account():
    """
    Initiate Google account connection for a teacher.
    
    This is for teachers who logged in traditionally and want to connect
    Google Classroom features.
    
    Returns:
        redirect: Google OAuth page
    """
    try:
        authorization_url, state = google_auth.get_authorization_url()
        session['oauth_state'] = state
        session['oauth_next'] = request.args.get('next', '/settings')
        
        return redirect(authorization_url)
        
    except Exception as e:
        current_app.logger.error(f'Error connecting Google account: {e}')
        return jsonify({'error': str(e)}), 500


@router.route('/connect/callback', methods=['GET'])
def connect_callback():
    """
    Handle Google account connection callback.
    
    Returns:
        redirect: Settings page or error
    """
    try:
        # Verify state
        state = session.get('oauth_state')
        if not state or state != request.args.get('state'):
            return redirect('/settings?error=invalid_state')
        
        # Exchange code
        credentials = google_auth.exchange_code(request.args.get('code'))
        user_info = google_auth.get_user_info(credentials)
        email = user_info.get('email')
        
        if 'user_id' not in session:
            return redirect('/login')
        
        # Update teacher record with Google credentials
        conn = db.get_db()
        conn.execute('''
            UPDATE teachers 
            SET google_refresh_token = ?,
                google_access_token = ?,
                google_token_expiry = ?,
                google_id = ?,
                google_email = ?,
                classroom_connected = 1
            WHERE id = ?
        ''', (
            credentials.refresh_token,
            credentials.token,
            credentials.expiry.isoformat() if credentials.expiry else None,
            user_info.get('id'),
            email,
            session['user_id']
        ))
        conn.commit()
        
        next_url = session.pop('oauth_next', '/settings')
        return redirect(f'{next_url}?success=connected')
        
    except Exception as e:
        current_app.logger.error(f'Connection callback error: {e}', exc_info=True)
        return redirect('/settings?error=connection_failed')
