from flask import Blueprint, request, jsonify, current_app
import db
import json
import logging

# Setup debug logging
from routes.debug_logging import get_logger, log_route_call

logger = get_logger('quiz')

router = Blueprint('quiz', __name__)


def normalize_activity_type(value):
    raw = str(value or '').strip().lower()
    if raw == 'topic_quiz' or raw == 'topic quiz':
        return 'topic_quiz'
    return 'class_activity'


def normalize_difficulty(value):
    raw = str(value or '').strip().lower()
    if raw == 'foundation' or raw == 'easy':
        return 'foundation'
    if raw == 'advanced' or raw == 'hard':
        return 'advanced'
    return 'core'


@router.route('/', methods=['POST'])
@log_route_call('quiz')
def create_quiz():
    logger.info("Creating new quiz")
    data = request.get_json()
    logger.debug(f"Request data: {data}")
    
    code = data.get('code')
    topic = data.get('topic')
    grade = data.get('grade')
    question_types = data.get('question_types')
    q_count = data.get('q_count')

    if not code or not topic or not grade or not question_types or not q_count:
        logger.warning(f"Missing required fields. Received: code={code}, topic={topic}, grade={grade}, q_count={q_count}")
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        conn = db.get_db()
        logger.debug(f"Inserting quiz with code: {code}")
        conn.execute('''
            INSERT INTO quizzes (
                code, topic, chapter, subtopic, activity_type, grade,
                difficulty, question_types, type_weights, q_count, time_limit_mins, release_at, close_at,
                extra_instructions, adaptive_level
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ''', (
            code,
            topic,
            data.get('chapter'),
            data.get('subtopic'),
            normalize_activity_type(data.get('activity_type')),
            grade,
            normalize_difficulty(data.get('difficulty')),
            json.dumps(question_types),
            json.dumps(data.get('type_weights')) if data.get('type_weights') else None,
            q_count,
            data.get('time_limit_mins', 0),
            data.get('release_at'),
            data.get('close_at'),
            data.get('extra_instructions'),
            data.get('adaptive_level', 'max')
        ))
        conn.commit()
        logger.info(f"✅ Quiz created successfully: {code}")
        return jsonify({'success': True, 'code': code})
    except Exception as e:
        logger.exception(f"Error creating quiz: {e}")
        if 'UNIQUE' in str(e):
            logger.warning(f"Quiz code already exists: {code}")
            return jsonify({'error': 'Quiz code already exists'}), 409
        return jsonify({'error': str(e)}), 500


@router.route('/stats', methods=['GET'])
@log_route_call('quiz')
def get_stats():
    logger.debug("Getting quiz stats")
    try:
        conn = db.get_db()
        total_quizzes = conn.execute('SELECT COUNT(*) as count FROM quizzes').fetchone()['count']
        total_attempts = conn.execute('SELECT COUNT(*) as count FROM attempts').fetchone()['count']
        avg_score = conn.execute('SELECT AVG(percentage) as avg FROM attempts WHERE status = "completed"').fetchone()['avg'] or 0
        active_today = conn.execute('SELECT COUNT(*) as count FROM quizzes WHERE date(created_at) = date("now")').fetchone()['count']
        class_activities = conn.execute('''
            SELECT COUNT(*) as count FROM quizzes
            WHERE lower(COALESCE(activity_type, 'class_activity')) = 'class_activity'
        ''').fetchone()['count']
        topic_quizzes = conn.execute('''
            SELECT COUNT(*) as count FROM quizzes
            WHERE lower(COALESCE(activity_type, 'class_activity')) = 'topic_quiz'
        ''').fetchone()['count']

        logger.info(f"Stats: {total_quizzes} quizzes, {total_attempts} attempts")
        return jsonify({
            'totalQuizzes': total_quizzes,
            'classActivities': class_activities,
            'topicQuizzes': topic_quizzes,
            'totalAttempts': total_attempts,
            'avgScore': round(avg_score),
            'activeToday': active_today
        })
    except Exception as e:
        logger.exception(f"Error getting stats: {e}")
        return jsonify({'error': str(e)}), 500


@router.route('/<code>', methods=['GET'])
@log_route_call('quiz')
def get_quiz(code):
    logger.info(f"Getting quiz: {code}")
    try:
        conn = db.get_db()
        quiz = conn.execute('SELECT * FROM quizzes WHERE code = ?', (code.upper(),)).fetchone()
        if not quiz:
            logger.warning(f"Quiz not found: {code}")
            return jsonify({'error': 'Quiz not found'}), 404

        quiz_dict = dict(quiz)
        quiz_dict['question_types'] = json.loads(quiz['question_types'])
        try:
            quiz_dict['subtopic'] = json.loads(quiz['subtopic']) if quiz['subtopic'] else None
        except:
            pass
        logger.debug(f"Quiz found: {quiz_dict}")
        return jsonify(quiz_dict)
    except Exception as e:
        logger.exception(f"Error getting quiz: {e}")
        return jsonify({'error': str(e)}), 500


@router.route('/', methods=['GET'])
@log_route_call('quiz')
def get_quizzes():
    logger.debug("Getting all quizzes")
    try:
        conn = db.get_db()
        quizzes = conn.execute('SELECT * FROM quizzes ORDER BY created_at DESC').fetchall()
        result = []
        for q in quizzes:
            q_dict = dict(q)
            q_dict['question_types'] = json.loads(q['question_types'])
            try:
                q_dict['subtopic'] = json.loads(q['subtopic']) if q['subtopic'] else None
            except:
                pass
            result.append(q_dict)
        logger.info(f"Returning {len(result)} quizzes")
        return jsonify(result)
    except Exception as e:
        logger.exception(f"Error getting quizzes: {e}")
        return jsonify({'error': str(e)}), 500


@router.route('/<code>', methods=['PATCH'])
@log_route_call('quiz')
def update_quiz(code):
    logger.info(f"Updating quiz: {code}")
    data = request.get_json()
    logger.debug(f"Update data: {data}")
    try:
        conn = db.get_db()
        conn.execute('''UPDATE quizzes SET
            topic = COALESCE(?, topic),
            chapter = COALESCE(?, chapter),
            subtopic = COALESCE(?, subtopic),
            activity_type = COALESCE(?, activity_type),
            class_name = COALESCE(?, class_name),
            section_name = COALESCE(?, section_name),
            grade = COALESCE(?, grade),
            question_types = COALESCE(?, question_types),
            q_count = COALESCE(?, q_count),
            time_limit_mins = COALESCE(?, time_limit_mins),
            release_at = COALESCE(?, release_at),
            close_at = COALESCE(?, close_at),
            extra_instructions = COALESCE(?, extra_instructions)
            WHERE code = ?''', (
            data.get('topic'),
            data.get('chapter'),
            data.get('subtopic'),
            normalize_activity_type(data.get('activity_type')) if 'activity_type' in data else None,
            data.get('class_name'),
            data.get('section_name'),
            data.get('grade'),
            json.dumps(data['question_types']) if data.get('question_types') else None,
            data.get('q_count'),
            data.get('time_limit_mins'),
            data.get('release_at'),
            data.get('close_at'),
            data.get('extra_instructions'),
            code.upper()
        ))
        conn.commit()
        logger.info(f"✅ Quiz updated: {code}")
        return jsonify({'success': True})
    except Exception as e:
        logger.exception(f"Error updating quiz: {e}")
        return jsonify({'error': str(e)}), 500


@router.route('/<code>', methods=['DELETE'])
@log_route_call('quiz')
def delete_quiz(code):
    logger.info(f"Deleting quiz: {code}")
    try:
        conn = db.get_db()
        code = code.upper()
        attempts = conn.execute('SELECT id FROM attempts WHERE quiz_code = ?', (code,)).fetchall()
        logger.debug(f"Found {len(attempts)} attempts for this quiz")
        for a in attempts:
            conn.execute('DELETE FROM answers WHERE attempt_id = ?', (a['id'],))
            conn.execute('DELETE FROM violations WHERE attempt_id = ?', (a['id'],))
            conn.execute('DELETE FROM gamification_events WHERE attempt_id = ?', (a['id'],))
        conn.execute('DELETE FROM attempts WHERE quiz_code = ?', (code,))
        conn.execute('DELETE FROM quizzes WHERE code = ?', (code,))
        conn.commit()
        logger.info(f"✅ Quiz deleted: {code}")
        return jsonify({'success': True})
    except Exception as e:
        logger.exception(f"Error deleting quiz: {e}")
        return jsonify({'error': str(e)}), 500
