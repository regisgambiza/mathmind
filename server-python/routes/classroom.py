"""
Google Classroom API Routes
Handles courses, topics, assignments, roster validation, and grade sync
"""

from flask import Blueprint, request, jsonify
import db
import os
import logging
from services import classroom

logger = logging.getLogger(__name__)

router = Blueprint('classroom', __name__)


@router.route('/courses', methods=['GET', 'OPTIONS'])
def get_courses():
    """Get all courses for a teacher"""
    if request.method == 'OPTIONS':
        return '', 204
    
    teacher_id = request.args.get('teacher_id')
    if not teacher_id:
        return jsonify({'error': 'teacher_id is required'}), 400
    
    try:
        result = classroom.get_courses(teacher_id)
        
        if 'error' in result:
            status_code = 401 if 'Authentication' in result['error'] else 400
            return jsonify(result), status_code
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error fetching courses: {e}")
        return jsonify({'error': str(e)}), 500


@router.route('/courses/<course_id>/topics', methods=['GET', 'OPTIONS'])
def get_course_topics(course_id):
    """Get topics for a specific course"""
    if request.method == 'OPTIONS':
        return '', 204
    
    teacher_id = request.args.get('teacher_id')
    if not teacher_id:
        return jsonify({'error': 'teacher_id is required'}), 400
    
    try:
        result = classroom.get_course_topics(teacher_id, course_id)
        
        if 'error' in result:
            status_code = 401 if 'Authentication' in result['error'] else 400
            return jsonify(result), status_code
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error fetching topics: {e}")
        return jsonify({'error': str(e)}), 500


@router.route('/courses/<course_id>/topics', methods=['POST', 'OPTIONS'])
def create_topic(course_id):
    """Create a new topic in a course"""
    if request.method == 'OPTIONS':
        return '', 204
    
    data = request.get_json()
    teacher_id = data.get('teacher_id')
    topic_name = data.get('name')
    
    if not teacher_id:
        return jsonify({'error': 'teacher_id is required'}), 400
    
    if not topic_name:
        return jsonify({'error': 'Topic name is required'}), 400
    
    try:
        result = classroom.create_topic(teacher_id, course_id, topic_name)
        
        if 'error' in result:
            status_code = 401 if 'Authentication' in result['error'] else 400
            return jsonify(result), status_code
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error creating topic: {e}")
        return jsonify({'error': str(e)}), 500


@router.route('/courses/<course_id>/assignments', methods=['POST', 'OPTIONS'])
def create_assignment(course_id):
    """Create an assignment in a course"""
    if request.method == 'OPTIONS':
        return '', 204
    
    data = request.get_json()
    teacher_id = data.get('teacher_id')
    
    if not teacher_id:
        return jsonify({'error': 'teacher_id is required'}), 400
    
    quiz_data = {
        'title': data.get('title', 'MathMind Quiz'),
        'description': data.get('description', ''),
        'quiz_code': data.get('quiz_code'),
        'quiz_link': data.get('quiz_link', f'https://mathmind.app/quiz/{data.get("quiz_code")}'),
        'due_date': data.get('due_date'),
        'topic_id': data.get('topic_id'),
        'points': data.get('points', 100)
    }
    
    try:
        result = classroom.create_assignment(teacher_id, course_id, quiz_data)
        
        if 'error' in result:
            status_code = 401 if 'Authentication' in result['error'] else 400
            return jsonify(result), status_code
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error creating assignment: {e}")
        return jsonify({'error': str(e)}), 500


@router.route('/courses/<course_id>/roster', methods=['GET', 'OPTIONS'])
def get_course_roster(course_id):
    """Get student roster for a course"""
    if request.method == 'OPTIONS':
        return '', 204
    
    teacher_id = request.args.get('teacher_id')
    if not teacher_id:
        return jsonify({'error': 'teacher_id is required'}), 400
    
    try:
        result = classroom.get_course_roster(teacher_id, course_id)
        
        if 'error' in result:
            status_code = 401 if 'Authentication' in result['error'] else 400
            return jsonify(result), status_code
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error fetching roster: {e}")
        return jsonify({'error': str(e)}), 500


@router.route('/validate-student', methods=['POST', 'OPTIONS'])
def validate_student():
    """Validate if a student is in a course roster"""
    if request.method == 'OPTIONS':
        return '', 204
    
    data = request.get_json()
    course_id = data.get('course_id')
    student_email = data.get('student_email')
    
    if not course_id:
        return jsonify({'error': 'course_id is required'}), 400
    
    if not student_email:
        return jsonify({'error': 'student_email is required'}), 400
    
    try:
        result = classroom.validate_student_in_course(course_id, student_email)
        
        if not result.get('valid'):
            return jsonify(result), 403
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error validating student: {e}")
        return jsonify({'valid': False, 'error': str(e)}), 500


@router.route('/sync-grade', methods=['POST', 'OPTIONS'])
def sync_grade():
    """Sync a grade to Google Classroom"""
    if request.method == 'OPTIONS':
        return '', 204
    
    data = request.get_json()
    teacher_id = data.get('teacher_id')
    course_id = data.get('course_id')
    coursework_id = data.get('coursework_id')
    student_user_id = data.get('student_user_id')
    percentage = data.get('percentage')
    
    if not teacher_id:
        return jsonify({'error': 'teacher_id is required'}), 400
    
    if not course_id or not coursework_id:
        return jsonify({'error': 'course_id and coursework_id are required'}), 400
    
    if not student_user_id:
        return jsonify({'error': 'student_user_id is required'}), 400
    
    if percentage is None:
        return jsonify({'error': 'percentage is required'}), 400
    
    try:
        result = classroom.sync_grade(teacher_id, course_id, coursework_id, student_user_id, percentage)
        
        if 'error' in result:
            status_code = 401 if 'Authentication' in result['error'] else 400
            return jsonify(result), status_code
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error syncing grade: {e}")
        return jsonify({'error': str(e)}), 500


@router.route('/sync-grade/queue', methods=['POST', 'OPTIONS'])
def queue_grade_sync_route():
    """Add a grade to the sync queue"""
    if request.method == 'OPTIONS':
        return '', 204
    
    data = request.get_json()
    course_id = data.get('course_id')
    coursework_id = data.get('coursework_id')
    student_email = data.get('student_email')
    percentage = data.get('percentage')
    
    if not course_id or not coursework_id:
        return jsonify({'error': 'course_id and coursework_id are required'}), 400
    
    if not student_email:
        return jsonify({'error': 'student_email is required'}), 400
    
    if percentage is None:
        return jsonify({'error': 'percentage is required'}), 400
    
    try:
        queue_id = classroom.queue_grade_sync(course_id, coursework_id, student_email, percentage)
        return jsonify({'success': True, 'queue_id': queue_id})
    except Exception as e:
        logger.error(f"Error queueing grade sync: {e}")
        return jsonify({'error': str(e)}), 500


@router.route('/sync-grade/process', methods=['POST', 'OPTIONS'])
def process_grade_sync_queue_route():
    """Process pending grade syncs from the queue"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        results = classroom.process_grade_sync_queue()
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error processing grade sync queue: {e}")
        return jsonify({'error': str(e)}), 500
