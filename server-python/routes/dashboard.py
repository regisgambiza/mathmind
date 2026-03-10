from flask import Blueprint, request, jsonify, current_app, send_file
import db
import json
import io
from datetime import datetime

router = Blueprint('dashboard', __name__)


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


@router.route('/', methods=['GET'])
def get_dashboard():
    try:
        conn = db.get_db()
        activity_type = request.args.get('activity_type')
        grade = request.args.get('grade')
        topic = request.args.get('topic')
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')

        where = []
        params = []

        if activity_type:
            where.append('lower(COALESCE(activity_type, \'class_activity\')) = ?')
            params.append(activity_type.lower())
        if grade:
            where.append('grade = ?')
            params.append(grade)
        if topic:
            where.append('lower(topic) LIKE ?')
            params.append(f'%{topic.lower()}%')
        if date_from:
            where.append('datetime(created_at) >= datetime(?)')
            params.append(date_from)
        if date_to:
            where.append('datetime(created_at) <= datetime(?)')
            params.append(date_to)

        where_clause = 'WHERE ' + ' AND '.join(where) if where else ''

        quizzes = conn.execute(f'''
            SELECT *,
                (SELECT COUNT(*) FROM attempts WHERE quiz_code = code) as attempt_count,
                (SELECT AVG(percentage) FROM attempts WHERE quiz_code = code AND completed_at IS NOT NULL) as avg_score,
                (SELECT COUNT(*) FROM attempts WHERE quiz_code = code AND completed_at IS NOT NULL) * 100.0 /
                  NULLIF((SELECT COUNT(*) FROM attempts WHERE quiz_code = code), 0) as completion_rate
            FROM quizzes
            {where_clause}
            ORDER BY datetime(created_at) DESC
        ''', params).fetchall()

        result = []
        for q in quizzes:
            result.append({
                **dict(q),
                'attempt_count': to_int(q['attempt_count'], 0),
                'avg_score': round(to_float(q['avg_score'], 0)),
                'completion_rate': round(to_float(q['completion_rate'], 0)),
            })

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<code>', methods=['GET'])
def get_quiz_dashboard(code):
    try:
        conn = db.get_db()
        code = code.upper()

        quiz = conn.execute('''
            SELECT topic, grade, q_count, activity_type
            FROM quizzes WHERE code = ?
        ''', (code,)).fetchone()

        if not quiz:
            return jsonify({'error': 'Quiz not found'}), 404

        students = conn.execute('''
            SELECT a.id as attempt_id, a.student_name, a.status, a.score, a.total, a.percentage,
                   a.time_taken_s, a.started_at, a.completed_at, COUNT(v.id) as violations
            FROM attempts a
            LEFT JOIN violations v ON v.attempt_id = a.id
            WHERE a.quiz_code = ?
            GROUP BY a.id
            ORDER BY a.started_at DESC
        ''', (code,)).fetchall()

        return jsonify({
            'quiz': dict(quiz),
            'students': [dict(s) for s in students],
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<code>/results', methods=['GET'])
def get_results(code):
    try:
        conn = db.get_db()
        code = code.upper()

        attempts = conn.execute('SELECT * FROM attempts WHERE quiz_code = ?', (code,)).fetchall()
        result = []

        for a in attempts:
            answers = conn.execute('SELECT * FROM answers WHERE attempt_id = ?', (a['id'],)).fetchall()
            violations = conn.execute('SELECT * FROM violations WHERE attempt_id = ?', (a['id'],)).fetchall()
            result.append({
                **dict(a),
                'answers': [dict(ans) for ans in answers],
                'violations': [dict(v) for v in violations],
            })

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<code>/export', methods=['GET'])
def export_csv(code):
    try:
        conn = db.get_db()
        code = code.upper()

        quiz = conn.execute('SELECT activity_type FROM quizzes WHERE code = ?', (code,)).fetchone()
        activity_type = quiz['activity_type'] if quiz else 'class_activity'

        students = conn.execute('''
            SELECT a.student_name, a.score, a.total, a.percentage, a.time_taken_s,
                   a.status, a.started_at, a.completed_at, COUNT(v.id) as violations
            FROM attempts a
            LEFT JOIN violations v ON v.attempt_id = a.id
            WHERE a.quiz_code = ?
            GROUP BY a.id
            ORDER BY a.started_at DESC
        ''', (code,)).fetchall()

        # Build CSV
        lines = ['Activity Type,Student Name,Score,Total,Percentage,Time (s),Violations,Status,Started At,Completed At']
        for s in students:
            lines.append(f'"{activity_type}","{s["student_name"]}",{s["score"] or ""},{s["total"] or ""},{s["percentage"] or ""},{s["time_taken_s"] or ""},{s["violations"]},"{s["status"]}","{s["started_at"] or ""}","{s["completed_at"] or ""}"')

        csv_content = '\n'.join(lines)

        return send_file(
            io.BytesIO(csv_content.encode()),
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'mathmind-{code}.csv'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<code>/questions', methods=['GET'])
def get_questions(code):
    """Question-level analytics for a quiz."""
    try:
        conn = db.get_db()
        code = code.upper()

        questions = conn.execute('''
            SELECT
                ans.q_index,
                ans.q_type,
                ans.skill_tag,
                ans.difficulty,
                ans.question_text,
                COUNT(*) as attempts,
                SUM(CASE WHEN ans.is_correct = 1 THEN 1 ELSE 0 END) as correct,
                ROUND(AVG(CASE WHEN ans.is_correct = 1 THEN 100.0 ELSE 0.0 END), 1) as pct_correct
            FROM answers ans
            INNER JOIN attempts a ON a.id = ans.attempt_id
            WHERE a.quiz_code = ?
            GROUP BY ans.q_index, ans.q_type, ans.skill_tag, ans.difficulty, ans.question_text
            ORDER BY ans.q_index
        ''', (code,)).fetchall()

        result = []
        for q in questions:
            result.append({
                'q_index': to_int(q['q_index'], 0) + 1,
                'q_type': q['q_type'],
                'skill_tag': q['skill_tag'] or 'General',
                'difficulty': q['difficulty'] or 'core',
                'question_text': q['question_text'],
                'attempts': to_int(q['attempts'], 0),
                'correct': to_int(q['correct'], 0),
                'pct_correct': round(to_float(q['pct_correct'], 0)),
            })

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<code>/skills', methods=['GET'])
def get_skills(code):
    """Skill breakdown for a quiz."""
    try:
        conn = db.get_db()
        code = code.upper()

        skills = conn.execute('''
            SELECT
                COALESCE(NULLIF(TRIM(ans.skill_tag), ''), 'General') as skill,
                COUNT(*) as questions,
                AVG(CASE WHEN ans.is_correct = 1 THEN 100.0 ELSE 0.0 END) as avg_pct,
                COUNT(DISTINCT a.student_id) as students_attempted,
                SUM(CASE WHEN ans.is_correct = 1 THEN 1 ELSE 0 END) as total_correct
            FROM answers ans
            INNER JOIN attempts a ON a.id = ans.attempt_id
            WHERE a.quiz_code = ?
            GROUP BY COALESCE(NULLIF(TRIM(ans.skill_tag), ''), 'General')
            ORDER BY avg_pct ASC
        ''', (code,)).fetchall()

        result = []
        for s in skills:
            result.append({
                'skill': s['skill'],
                'questions': to_int(s['questions'], 0),
                'avg_pct': round(to_float(s['avg_pct'], 0)),
                'students_attempted': to_int(s['students_attempted'], 0),
                'total_correct': to_int(s['total_correct'], 0),
                'students_below_60': 0,
            })

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/student/<student_id>/growth', methods=['GET'])
def get_student_growth(student_id):
    """Student growth tracking - get all attempts for a student across quizzes."""
    try:
        conn = db.get_db()
        student_id = to_int(student_id, 0)

        attempts = conn.execute('''
            SELECT
                a.quiz_code,
                a.percentage,
                a.completed_at,
                q.topic
            FROM attempts a
            LEFT JOIN quizzes q ON q.code = a.quiz_code
            WHERE a.student_id = ? AND a.completed_at IS NOT NULL
            ORDER BY datetime(a.completed_at) ASC
        ''', (student_id,)).fetchall()

        result = []
        for a in attempts:
            result.append({
                'quiz_code': a['quiz_code'],
                'topic': a['topic'] or 'Unknown',
                'percentage': round(to_float(a['percentage'], 0)),
                'completed_at': a['completed_at'],
            })

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<code>/progress', methods=['GET'])
def get_progress(code):
    """Class progress over time."""
    try:
        conn = db.get_db()
        code = code.upper()

        progress = conn.execute('''
            SELECT
                DATE(a.completed_at) as date,
                AVG(a.percentage) as avg_score,
                COUNT(*) as attempts
            FROM attempts a
            WHERE a.quiz_code = ? AND a.completed_at IS NOT NULL
            GROUP BY DATE(a.completed_at)
            ORDER BY date ASC
        ''', (code,)).fetchall()

        result = []
        for p in progress:
            result.append({
                'date': p['date'],
                'avg_score': round(to_float(p['avg_score'], 0)),
                'attempts': to_int(p['attempts'], 0),
            })

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<code>/live', methods=['GET'])
def get_live(code):
    try:
        conn = db.get_db()
        code = code.upper()

        quiz = conn.execute('SELECT * FROM quizzes WHERE code = ?', (code,)).fetchone()
        if not quiz:
            return jsonify({'error': 'Quiz not found'}), 404

        attempts = conn.execute('''
            SELECT
                a.id as attempt_id,
                a.student_id,
                a.student_name,
                a.status,
                a.score,
                a.total,
                a.percentage,
                a.time_taken_s,
                a.current_question,
                a.started_at,
                a.completed_at,
                a.last_activity_at,
                (SELECT COUNT(*) FROM violations WHERE attempt_id = a.id) as violation_count,
                (SELECT GROUP_CONCAT(json_object('left_at', left_at, 'returned_at', returned_at, 'away_seconds', away_seconds))
                 FROM violations WHERE attempt_id = a.id) as violations_json
            FROM attempts a
            WHERE a.quiz_code = ?
            ORDER BY
                CASE a.status
                    WHEN 'completed' THEN 1
                    WHEN 'force_submitted' THEN 2
                    ELSE 0
                END,
                datetime(a.started_at) ASC
        ''', (code,)).fetchall()

        students = []
        for a in attempts:
            violations = []
            if a['violations_json']:
                try:
                    violations = json.loads(f"[{a['violations_json']}]")
                except:
                    pass

            q_count = quiz['q_count'] or 1
            progress_percent = round((a['current_question'] or 0) / q_count * 100)

            students.append({
                'attempt_id': a['attempt_id'],
                'student_id': a['student_id'],
                'student_name': a['student_name'],
                'status': a['status'],
                'score': a['score'],
                'total': a['total'],
                'percentage': a['percentage'],
                'time_taken_s': a['time_taken_s'],
                'current_question': a['current_question'],
                'started_at': a['started_at'],
                'completed_at': a['completed_at'],
                'last_activity_at': a['last_activity_at'],
                'violation_count': a['violation_count'],
                'violations': violations,
                'is_active': a['status'] in ('in_progress', 'practice'),
                'is_completed': a['status'] in ('completed', 'force_submitted'),
                'progress_percent': progress_percent,
            })

        total = len(students)
        started = sum(1 for s in students if s['status'] != 'in_progress' or s['current_question'] > 0)
        completed = sum(1 for s in students if s['is_completed'])
        active = sum(1 for s in students if s['is_active'])

        avg_progress = round(sum(s['progress_percent'] for s in students) / total) if total > 0 else 0

        time_taken_list = [s['time_taken_s'] for s in students if s['time_taken_s'] and s['time_taken_s'] > 0]
        avg_time = round(sum(time_taken_list) / len(time_taken_list)) if time_taken_list else 0

        current_question_list = [s['current_question'] or 0 for s in students]
        avg_question = round(sum(current_question_list) / total, 1) if total > 0 else 0

        # Get alerts
        alerts = []
        now = datetime.utcnow()
        for s in students:
            if s['violation_count'] >= 3:
                alerts.append({
                    'type': 'violation',
                    'severity': 'critical',
                    'attempt_id': s['attempt_id'],
                    'student_name': s['student_name'],
                    'message': f"{s['student_name']} has {s['violation_count']} violations",
                    'timestamp': now.isoformat(),
                })

            if s['is_active'] and s['last_activity_at']:
                try:
                    last_activity = datetime.fromisoformat(s['last_activity_at'].replace('Z', '+00:00'))
                    minutes_since = int((now - last_activity).total_seconds() / 60)
                    if minutes_since >= 5:
                        alerts.append({
                            'type': 'inactivity',
                            'severity': 'warning',
                            'attempt_id': s['attempt_id'],
                            'student_name': s['student_name'],
                            'message': f"{s['student_name']} inactive for {minutes_since} minutes",
                            'minutes': minutes_since,
                            'timestamp': now.isoformat(),
                        })
                except:
                    pass

        return jsonify({
            'quiz': dict(quiz),
            'students': students,
            'stats': {
                'total': total,
                'started': started,
                'completed': completed,
                'active': active,
                'avg_progress': avg_progress,
                'avg_time_s': avg_time,
                'avg_question': avg_question,
            },
            'alerts': alerts,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<code>/broadcast', methods=['POST'])
def broadcast(code):
    data = request.get_json()
    message = data.get('message')

    if not message:
        return jsonify({'error': 'Message is required'}), 400

    socketio = current_app.socketio
    socketio.emit('teacher_broadcast', {
        'message': message,
        'timestamp': datetime.utcnow().isoformat(),
    }, room=code.upper())

    return jsonify({'success': True, 'sent': True})


@router.route('/<code>/students/<attempt_id>/message', methods=['POST'])
def send_message(code, attempt_id):
    data = request.get_json()
    message = data.get('message')
    warning = data.get('warning')

    if not message and not warning:
        return jsonify({'error': 'Either message or warning is required'}), 400

    try:
        conn = db.get_db()
        attempt = conn.execute('SELECT socket_id, student_name FROM attempts WHERE id = ?', (attempt_id,)).fetchone()

        if not attempt:
            return jsonify({'error': 'Student attempt not found'}), 404

        if not attempt['socket_id']:
            return jsonify({'success': True, 'sent': False, 'reason': 'Student not connected'})

        socketio = current_app.socketio

        if warning:
            socketio.emit('teacher_warning', {
                'message': '⚠️ Teacher is watching. Stay focused!',
                'timestamp': datetime.utcnow().isoformat(),
            }, room=attempt['socket_id'])
        elif message:
            socketio.emit('teacher_message', {
                'message': message,
                'timestamp': datetime.utcnow().isoformat(),
            }, room=attempt['socket_id'])

        return jsonify({'success': True, 'sent': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
