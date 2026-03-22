from flask import Blueprint, request, jsonify, current_app
import db
import json
from datetime import datetime
from services.gamification import apply_gamification_for_attempt
from services import classroom
import logging

logger = logging.getLogger(__name__)

router = Blueprint('attempt', __name__)


def to_int(value, fallback=0):
    try:
        n = int(value)
        return n
    except (TypeError, ValueError):
        return fallback


def to_float(value, fallback=0):
    try:
        n = float(value)
        return n
    except (TypeError, ValueError):
        return fallback


def normalize_difficulty(value):
    raw = str(value or '').strip().lower()
    if raw == 'foundation' or raw == 'easy':
        return 'foundation'
    if raw == 'advanced' or raw == 'hard':
        return 'advanced'
    return 'core'


def parse_date_ms(value):
    if not value:
        return None
    try:
        # Try ISO format first
        if 'T' in str(value):
            return int(datetime.fromisoformat(str(value).replace('Z', '+00:00')).timestamp() * 1000)
        # Try other formats
        return int(datetime.strptime(str(value), '%Y-%m-%d %H:%M:%S').timestamp() * 1000)
    except:
        return None


def validate_release_window(release_at, close_at):
    now_ms = datetime.utcnow().timestamp() * 1000
    release_ms = parse_date_ms(release_at)
    close_ms = parse_date_ms(close_at)

    if release_ms is not None and now_ms < release_ms:
        return {
            'status': 403,
            'code': 'not_open_yet',
            'message': 'This quiz is not open yet.',
            'release_at': release_at,
        }
    if close_ms is not None and now_ms > close_ms:
        return {
            'status': 403,
            'code': 'closed',
            'message': 'This quiz is closed.',
            'close_at': close_at,
        }
    return None


@router.route('/start', methods=['POST'])
def start_attempt():
    data = request.get_json()
    quiz_code = data.get('quiz_code')
    student_name = data.get('student_name')
    student_id = data.get('student_id')
    student_email = data.get('student_email')
    student_user_id = None

    if not quiz_code:
        return jsonify({'error': 'Missing quiz_code'}), 400

    try:
        conn = db.get_db()
        quiz = conn.execute('''
            SELECT id, code, class_name, section_name, release_at, close_at,
                   course_id, posted_to_classroom
            FROM quizzes WHERE code = %s
        ''', (quiz_code.upper(),)).fetchone()

        if not quiz:
            return jsonify({'error': 'Quiz not found'}), 404

        # Validate release window
        quiz_window_error = validate_release_window(quiz['release_at'], quiz['close_at'])
        if quiz_window_error:
            return jsonify(quiz_window_error), quiz_window_error['status']

        # Check assignment schedule
        schedule = conn.execute('''
            SELECT *
            FROM assignment_schedules
            WHERE quiz_code = %s
            ORDER BY
                CASE
                    WHEN COALESCE(class_name, '') = COALESCE(%s, '')
                     AND COALESCE(section_name, '') = COALESCE(%s, '') THEN 0
                    ELSE 1
                END,
                updated_at DESC,
                id DESC
            LIMIT 1
        ''', (quiz['code'], quiz['class_name'] or '', quiz['section_name'] or '')).fetchone()

        if schedule:
            status = str(schedule['status'] or '').lower()
            if status == 'paused':
                return jsonify({
                    'error': 'This assignment is currently paused by an administrator.',
                    'code': 'assignment_paused',
                }), 423
            if status == 'closed':
                return jsonify({
                    'error': 'This assignment is closed.',
                    'code': 'assignment_closed',
                }), 403

            # Validate schedule release window
            schedule_window_error = validate_release_window(schedule['release_at'], schedule['close_at'])
            if schedule_window_error:
                return jsonify(schedule_window_error), schedule_window_error['status']

        # Resolve student
        resolved_student_id = None
        resolved_student_name = str(student_name or '').strip()

        if student_id:
            student = conn.execute('SELECT id, name FROM students WHERE id = %s', (student_id,)).fetchone()
            if not student:
                return jsonify({'error': 'Student account not found'}), 404
            resolved_student_id = student['id']
            resolved_student_name = student['name']

        if not resolved_student_name:
            return jsonify({'error': 'Missing student_name or valid student_id'}), 400

        # Create attempt
        cursor = conn.execute('''
            INSERT INTO attempts (quiz_code, student_id, student_name, last_activity_at, completed_at, status)
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP, NULL, 'in_progress')
        ''', (quiz_code.upper(), resolved_student_id, resolved_student_name))
        conn.commit()
        attempt_id = cursor.lastrowid

        # Emit event for teacher dashboard
        socketio = current_app.socketio
        socketio.emit('student_joined', {
            'attempt_id': attempt_id,
            'student_name': resolved_student_name,
            'student_id': resolved_student_id,
            'student_email': student_email,
            'started_at': datetime.utcnow().isoformat(),
            'is_active': True,
            'is_completed': False,
            'current_question': 0,
            'progress_percent': 0,
            'violation_count': 0,
        }, room=quiz_code.upper())

        return jsonify({
            'attempt_id': attempt_id,
            'student_user_id': student_user_id if quiz['posted_to_classroom'] else None
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<id>/complete', methods=['PATCH'])
def complete_attempt(id):
    data = request.get_json()
    score = to_int(data.get('score'), 0)
    total = max(1, to_int(data.get('total'), 1))
    percentage = max(0, min(100, to_float(data.get('percentage'), 0)))
    time_taken_s = max(0, to_int(data.get('time_taken_s'), 0))
    status = data.get('status', 'completed')
    answers = data.get('answers', [])
    student_email = data.get('student_email')

    try:
        conn = db.get_db()
        existing = conn.execute('SELECT * FROM attempts WHERE id = %s', (id,)).fetchone()
        if not existing:
            return jsonify({'error': 'Attempt not found'}), 404

        completion_status = str(existing.get('status') or '').lower()
        is_final_status = completion_status in ('completed', 'force_submitted', 'time_expired')
        if existing['completed_at'] and is_final_status:
            # Parse existing rewards
            parsed_rewards = None
            if existing['rewards_json']:
                try:
                    parsed_rewards = json.loads(existing['rewards_json'])
                except:
                    pass
            return jsonify({'success': True, 'already_completed': True, 'rewards': parsed_rewards})

        # Get quiz details for grade sync
        quiz = conn.execute('''
            SELECT code, course_id, coursework_id, posted_to_classroom
            FROM quizzes WHERE code = %s
        ''', (existing['quiz_code'],)).fetchone()

        # Update attempt
        conn.execute('''
            UPDATE attempts
            SET completed_at=CURRENT_TIMESTAMP, score=%s, total=%s, percentage=%s, time_taken_s=%s, status=%s
            WHERE id=%s
        ''', (score, total, percentage, time_taken_s, status, id))
        conn.commit()

        # Emit event for teacher dashboard
        socketio = current_app.socketio
        socketio.emit('student_completed', {
            'attempt_id': int(id),
            'student_name': existing['student_name'],
            'student_email': student_email,
            'score': score,
            'total': total,
            'percentage': percentage,
            'time_taken': time_taken_s,
            'timestamp': datetime.utcnow().isoformat(),
        }, room=existing['quiz_code'].upper())

        # Delete existing answers and save new ones
        conn.execute('DELETE FROM answers WHERE attempt_id = %s', (id,))
        normalized_answers = [a for a in (answers or []) if a]

        for a in normalized_answers:
            student_answer = a.get('student_answer')
            correct_answer = a.get('correct_answer')
            is_correct = a.get('is_correct')

            if isinstance(student_answer, str):
                student_answer_str = student_answer
            else:
                student_answer_str = json.dumps(student_answer if student_answer is not None else '')

            if isinstance(correct_answer, str):
                correct_answer_str = correct_answer
            else:
                correct_answer_str = json.dumps(correct_answer if correct_answer is not None else '')

            conn.execute('''
                INSERT INTO answers
                (attempt_id, q_index, q_type, skill_tag, difficulty, question_text, student_answer, correct_answer, is_correct, time_taken_s)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ''', (
                id,
                to_int(a.get('q_index'), 0),
                a.get('q_type', 'unknown'),
                str(a.get('skill_tag', '')).strip(),
                normalize_difficulty(a.get('difficulty')),
                a.get('question_text', ''),
                student_answer_str,
                correct_answer_str,
                to_int(is_correct) if is_correct is not None else None,
                to_int(a.get('time_taken_s'), 0)
            ))
        conn.commit()

        # Apply gamification
        rewards = None
        if existing['student_id']:
            rewards = apply_gamification_for_attempt(
                conn,
                existing['student_id'],
                to_int(id, 0),
                existing['quiz_code'],
                percentage,
                total,
                time_taken_s
            )

            if rewards:
                conn.execute('''
                    UPDATE attempts
                    SET xp_earned = %s, level_after = %s, streak_after = %s, rewards_json = %s
                    WHERE id = %s
                ''', (
                    to_int(rewards.get('xp_gained', 0), 0),
                    to_int(rewards.get('level_after', 1), 1),
                    to_int(rewards.get('streak_after', 0), 0),
                    json.dumps(rewards),
                    id
                ))
                conn.commit()

        # Resolve student email for Classroom sync (frontend payload or DB fallback).
        resolved_student_email = str(student_email or '').strip().lower()
        if not resolved_student_email and existing.get('student_id'):
            student_row = conn.execute(
                'SELECT email FROM students WHERE id = %s',
                (existing['student_id'],)
            ).fetchone()
            if student_row and student_row.get('email'):
                resolved_student_email = str(student_row['email']).strip().lower()

        # Sync grade to Classroom if quiz is posted
        logger.info(f"DEBUG: quiz={quiz}, student_email={resolved_student_email}")
        if quiz and quiz['posted_to_classroom'] and quiz['course_id'] and quiz['coursework_id']:
            logger.info(f"DEBUG: Quiz has classroom settings, checking student_email")
            if resolved_student_email:
                logger.info(f"Queueing grade sync for quiz {quiz['code']} coursework {quiz['coursework_id']} email {resolved_student_email} pct={percentage}")
                try:
                    classroom.queue_grade_sync(
                        quiz['course_id'],
                        quiz['coursework_id'],
                        resolved_student_email,
                        percentage
                    )
                    results = classroom.process_grade_sync_queue()
                    logger.info(f"Grade sync queue processed: {results}")
                except Exception as sync_err:
                    current_app.logger.error(f"Grade sync queue processing failed: {sync_err}", exc_info=True)
            else:
                logger.warning(f"Grade sync skipped: missing student_email for attempt {id}")
        else:
            logger.info(f"Grade sync not triggered: quiz={quiz}, posted_to_classroom={quiz['posted_to_classroom'] if quiz else None}, course_id={quiz['course_id'] if quiz else None}, coursework_id={quiz['coursework_id'] if quiz else None}")

        return jsonify({'success': True, 'rewards': rewards})
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        logger.exception(f"Error completing attempt {id}: {e}\n{error_traceback}")
        return jsonify({'error': str(e), 'traceback': error_traceback}), 500


@router.route('/<id>', methods=['GET'])
def get_attempt(id):
    try:
        conn = db.get_db()
        attempt = conn.execute('SELECT * FROM attempts WHERE id = %s', (id,)).fetchone()
        if not attempt:
            return jsonify({'error': 'Attempt not found'}), 404

        answers = conn.execute('SELECT * FROM answers WHERE attempt_id = %s ORDER BY q_index', (id,)).fetchall()
        result = dict(attempt)
        result['answers'] = [dict(a) for a in answers]
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
