from flask import Blueprint, request, jsonify
import db
import json
from datetime import datetime, timedelta
from services.gamification import get_student_badges, compute_quest_states, start_of_iso_week
from services.adaptive import build_adaptive_plan, build_default_plan

router = Blueprint('student', __name__)


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


def sanitize_name(name):
    return str(name or '').strip().replace('  ', ' ')[:40]


def sanitize_email(email):
    return str(email or '').strip().lower()[:120]


def sanitize_pin(pin):
    return str(pin or '').strip()[:12]


def safe_parse_json(value, fallback=None):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except:
        return fallback


def normalize_activity_type(value):
    raw = str(value or '').strip().lower()
    if raw == 'topic_quiz' or raw == 'topic quiz':
        return 'topic_quiz'
    return 'class_activity'


def obfuscate_name(name):
    str_name = str(name or '').strip()
    if not str_name:
        return 'Student'
    if len(str_name) <= 2:
        return f"{str_name[0]}*"
    return f"{str_name[0]}{'*' * max(1, len(str_name) - 2)}{str_name[-1]}"


def parse_subtopics_input(value):
    if not value:
        return []
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    if not isinstance(value, str):
        return []
    raw = value.strip()
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed if str(x).strip()]
    except:
        pass
    return [x.strip() for x in raw.split(',') if x.strip()]


def get_student_by_id(conn, id):
    row = conn.execute('''
        SELECT id, name, xp, level, streak_days, best_streak_days, total_quizzes, leaderboard_opt_in, created_at, last_login_at
        FROM students
        WHERE id = ?
    ''', (id,)).fetchone()
    return dict(row) if row else None


def build_weekly_trend(history, weeks=8):
    now = datetime.utcnow()
    buckets = {}
    result = []

    for i in range(weeks - 1, -1, -1):
        d = now - timedelta(days=i * 7)
        key = start_of_iso_week(d.strftime('%Y-%m-%d'))
        buckets[key] = {'week_start': key, 'attempts': 0, '_sum': 0}

    for row in history:
        row_dict = dict(row)
        if not row_dict.get('completed_at'):
            continue
        day = str(row_dict['completed_at'])[:10]
        key = start_of_iso_week(day)
        if key not in buckets:
            continue
        bucket = buckets[key]
        bucket['attempts'] += 1
        bucket['_sum'] += to_float(row_dict.get('percentage', 0), 0)

    for entry in buckets.values():
        result.append({
            'week_start': entry['week_start'],
            'attempts': entry['attempts'],
            'avg_score': round(entry['_sum'] / entry['attempts']) if entry['attempts'] > 0 else 0,
        })

    return result


@router.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    email = sanitize_email(data.get('email'))
    name = sanitize_name(data.get('name'))
    pin = sanitize_pin(data.get('pin'))

    if not email or '@' not in email:
        return jsonify({'error': 'A valid email address is required.'}), 400
    if not name or len(name) < 2:
        return jsonify({'error': 'Name must be at least 2 characters.'}), 400
    if not pin or len(pin) < 4:
        return jsonify({'error': 'PIN must be at least 4 characters.'}), 400

    try:
        conn = db.get_db()
        existing = conn.execute('SELECT id FROM students WHERE lower(email) = ?', (email,)).fetchone()
        if existing:
            return jsonify({'error': 'Email is already registered. Please sign in.'}), 409

        cursor = conn.execute('''
            INSERT INTO students (name, email, pin, last_login_at) VALUES (?, ?, ?, datetime('now'))
        ''', (name, email, pin))
        conn.commit()

        student = get_student_by_id(conn, cursor.lastrowid)
        return jsonify({'success': True, 'student': dict(student)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = sanitize_email(data.get('email'))
    pin = sanitize_pin(data.get('pin'))

    if not email or not pin:
        return jsonify({'error': 'Email and PIN are required.'}), 400

    try:
        conn = db.get_db()
        student = conn.execute('''
            SELECT * FROM students WHERE lower(email) = ? AND pin = ?
        ''', (email, pin)).fetchone()

        if not student:
            return jsonify({'error': 'Invalid email or PIN.'}), 401

        conn.execute('UPDATE students SET last_login_at = datetime(\'now\') WHERE id = ?', (student['id'],))
        conn.commit()

        profile = get_student_by_id(conn, student['id'])
        return jsonify({'success': True, 'student': dict(profile)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/google-login', methods=['POST', 'OPTIONS'])
def google_login():
    """Handle Google OAuth login for students"""
    if request.method == 'OPTIONS':
        return '', 204

    import os
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests

    data = request.get_json()
    credential = data.get('credential')

    if not credential:
        return jsonify({'error': 'Google credential is required'}), 400

    try:
        CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
        if not CLIENT_ID:
            return jsonify({'error': 'Google OAuth not configured'}), 500

        idinfo = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            CLIENT_ID
        )

        google_id = idinfo['sub']
        email = idinfo.get('email', '')
        name = idinfo.get('name', email.split('@')[0])

        conn = db.get_db()

        # Find existing student
        student = conn.execute(
            'SELECT * FROM students WHERE google_id = ?', (google_id,)
        ).fetchone()

        if not student:
            student = conn.execute(
                'SELECT * FROM students WHERE email = ?', (email,)
            ).fetchone()

        if not student:
            # Auto-create student
            cursor = conn.execute(
                '''INSERT INTO students (name, google_id, email, pin, last_login_at)
                   VALUES (?, ?, ?, ?, datetime('now'))''',
                (name, google_id, email, '')
            )
            conn.commit()
            student = conn.execute(
                'SELECT * FROM students WHERE id = ?', (cursor.lastrowid,)
            ).fetchone()
        else:
            # Update google_id if missing
            conn.execute(
                'UPDATE students SET google_id = ?, last_login_at = datetime(\'now\') WHERE id = ?',
                (google_id, student['id'])
            )
            conn.commit()

        profile = get_student_by_id(conn, student['id'])
        return jsonify({'success': True, 'student': dict(profile)})

    except ValueError as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Invalid Google credential: {str(e)}'}), 401
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@router.route('/leaderboard', methods=['GET'])
def get_leaderboard():
    try:
        conn = db.get_db()
        limit = max(1, min(100, to_int(request.args.get('limit', 10), 10)))
        student_id = request.args.get('student_id')
        student_id = to_int(student_id, 0) if student_id else None
        quiz_code = request.args.get('quiz_code', '')

        # Get leaderboard controls
        controls_row = conn.execute('SELECT value_json FROM admin_settings WHERE setting_key = ?', ('leaderboard_controls',)).fetchone()
        controls = safe_parse_json(controls_row['value_json'], {'enabled': True, 'anonymize': False, 'class_only': False}) if controls_row else {'enabled': True, 'anonymize': False, 'class_only': False}

        if controls.get('enabled') == False:
            return jsonify({
                'leaderboard': [],
                'me': None,
                'total_ranked': 0,
                'disabled': True,
            })

        if controls.get('class_only'):
            if not quiz_code:
                return jsonify({
                    'leaderboard': [],
                    'me': None,
                    'total_ranked': 0,
                    'class_only': True,
                    'requires_quiz_code': True,
                })

            rows = conn.execute('''
                SELECT s.id, s.name, s.xp, s.level, s.total_quizzes, s.streak_days
                FROM students s
                WHERE s.leaderboard_opt_in = 1
                  AND EXISTS (
                    SELECT 1 FROM attempts a
                    WHERE a.student_id = s.id AND a.quiz_code = ?
                  )
                ORDER BY s.xp DESC, s.total_quizzes DESC, s.name ASC
            ''', (quiz_code.upper(),)).fetchall()
        else:
            rows = conn.execute('''
                SELECT id, name, xp, level, total_quizzes, streak_days
                FROM students
                WHERE leaderboard_opt_in = 1
                ORDER BY xp DESC, total_quizzes DESC, name ASC
            ''').fetchall()

        ranked = []
        for i, row in enumerate(rows):
            ranked.append({
                'rank': i + 1,
                'student_id': row['id'],
                'name': obfuscate_name(row['name']) if controls.get('anonymize') else row['name'],
                'xp': to_int(row['xp'], 0),
                'level': to_int(row['level'], 1),
                'total_quizzes': to_int(row['total_quizzes'], 0),
                'streak_days': to_int(row['streak_days'], 0),
            })

        me = None
        if student_id:
            for r in ranked:
                if r['student_id'] == student_id:
                    me = r
                    break

        return jsonify({
            'leaderboard': ranked[:limit],
            'me': me,
            'total_ranked': len(ranked),
            'class_only': controls.get('class_only', False),
            'anonymized': controls.get('anonymize', False),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<id>/adaptive-plan', methods=['GET'])
def get_adaptive_plan(id):
    try:
        conn = db.get_db()
        student_id = to_int(id, 0)
        student = get_student_by_id(conn, student_id)
        if not student:
            return jsonify({'error': 'Student not found.'}), 404

        topic = request.args.get('topic', '')
        chapter = request.args.get('chapter', '')
        subtopics = parse_subtopics_input(request.args.get('subtopics'))
        question_count = to_int(request.args.get('count', 5), 5)
        quiz_code = request.args.get('quiz_code', '').upper() if request.args.get('quiz_code') else None

        # Check feature flag
        flag_row = conn.execute('''
            SELECT enabled, rollout_pct, config_json
            FROM feature_flags
            WHERE flag_key = 'adaptive_engine'
        ''').fetchone()

        flag_enabled = flag_row['enabled'] == 1 if flag_row else True
        rollout_pct = max(0, min(100, to_int(flag_row['rollout_pct'], 100) if flag_row else 100))
        in_rollout = (student_id % 100) < rollout_pct

        plan = None
        fallback_used = False

        if flag_enabled and in_rollout:
            plan = build_adaptive_plan(conn, student_id, topic, chapter, subtopics, question_count)
            fallback_used = not plan.get('has_history', False)
        else:
            plan = build_default_plan(topic, chapter, subtopics, question_count)
            plan['adaptive_disabled'] = True
            plan['adaptive_disabled_reason'] = 'feature_flag_disabled' if not flag_enabled else f'rollout_{rollout_pct}_percent'
            fallback_used = True

        conn.execute('''
            INSERT INTO adaptive_plan_events (
                student_id, quiz_code, topic, chapter, subtopics_json,
                has_history, fallback_used, mastery_overall, recent_accuracy, trend, plan_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            student_id,
            quiz_code,
            topic,
            chapter,
            json.dumps(subtopics),
            1 if plan.get('has_history') else 0,
            1 if fallback_used else 0,
            plan.get('mastery_overall'),
            plan.get('recent_accuracy'),
            plan.get('trend'),
            json.dumps(plan)
        ))
        conn.commit()

        return jsonify({
            'student_id': student_id,
            'generated_at': datetime.utcnow().isoformat(),
            'adaptive_enabled': flag_enabled,
            'rollout_pct': rollout_pct,
            'rollout_included': in_rollout,
            'plan': plan,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<id>/profile', methods=['GET'])
def get_profile(id):
    try:
        conn = db.get_db()
        student_id = to_int(id, 0)
        student = get_student_by_id(conn, student_id)
        if not student:
            return jsonify({'error': 'Student not found.'}), 404

        stats_row = conn.execute('''
            SELECT
                COUNT(*) as completed_quizzes,
                AVG(percentage) as avg_score,
                SUM(score) as total_correct,
                SUM(total) as total_questions
            FROM attempts
            WHERE student_id = ? AND completed_at IS NOT NULL
        ''', (student_id,)).fetchone()
        stats = dict(stats_row) if stats_row else {}

        badges = get_student_badges(conn, student_id)
        week_start = start_of_iso_week(datetime.utcnow().strftime('%Y-%m-%d'))
        quests = compute_quest_states(conn, student_id, week_start)

        return jsonify({
            **dict(student),
            'completed_quizzes': to_int(stats.get('completed_quizzes'), 0),
            'avg_score': round(to_float(stats.get('avg_score'), 0)),
            'total_correct': to_int(stats.get('total_correct'), 0),
            'total_questions': to_int(stats.get('total_questions'), 0),
            'badges': badges,
            'weekly_quests': quests,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<id>/progress', methods=['GET'])
def get_progress(id):
    try:
        conn = db.get_db()
        student_id = to_int(id, 0)
        student = get_student_by_id(conn, student_id)
        if not student:
            return jsonify({'error': 'Student not found.'}), 404

        summary_row = conn.execute('''
            SELECT
                COUNT(*) as completed_quizzes,
                AVG(a.percentage) as avg_score,
                AVG(a.time_taken_s) as avg_time_s,
                SUM(a.score) as total_correct,
                SUM(a.total) as total_questions,
                SUM(CASE WHEN lower(COALESCE(q.activity_type, 'class_activity')) = 'class_activity' THEN 1 ELSE 0 END) as class_activity_count,
                AVG(CASE WHEN lower(COALESCE(q.activity_type, 'class_activity')) = 'class_activity' THEN a.percentage END) as class_activity_avg,
                SUM(CASE WHEN lower(COALESCE(q.activity_type, 'class_activity')) = 'topic_quiz' THEN 1 ELSE 0 END) as topic_quiz_count,
                AVG(CASE WHEN lower(COALESCE(q.activity_type, 'class_activity')) = 'topic_quiz' THEN a.percentage END) as topic_quiz_avg
            FROM attempts a
            LEFT JOIN quizzes q ON q.code = a.quiz_code
            WHERE a.student_id = ? AND a.completed_at IS NOT NULL
        ''', (student_id,)).fetchone()
        summary = dict(summary_row) if summary_row else {}

        history = conn.execute('''
            SELECT
                a.id as attempt_id,
                a.quiz_code,
                q.topic,
                q.chapter,
                q.grade,
                q.activity_type,
                a.score,
                a.total,
                a.percentage,
                a.time_taken_s,
                a.status,
                a.completed_at,
                a.xp_earned
            FROM attempts a
            LEFT JOIN quizzes q ON q.code = a.quiz_code
            WHERE a.student_id = ? AND a.completed_at IS NOT NULL
            ORDER BY datetime(a.completed_at) DESC
            LIMIT 20
        ''', (student_id,)).fetchall()

        activity_history = []
        for row in history:
            row_dict = dict(row)
            activity_history.append({
                **row_dict,
                'activity_type': normalize_activity_type(row_dict['activity_type']),
            })

        recent_history = activity_history[:20]
        weekly_trend = build_weekly_trend(history, 8)

        mastery = conn.execute('''
            SELECT
                COALESCE(NULLIF(TRIM(ans.skill_tag), ''), COALESCE(q.chapter, q.topic, 'General')) as topic,
                COUNT(*) as questions_answered,
                AVG(CASE WHEN ans.is_correct = 1 THEN 1.0 ELSE 0.0 END) as accuracy_ratio,
                AVG(
                    CASE lower(COALESCE(ans.difficulty, 'core'))
                        WHEN 'foundation' THEN 1
                        WHEN 'advanced' THEN 3
                        ELSE 2
                    END
                ) as avg_difficulty_weight
            FROM answers ans
            INNER JOIN attempts a ON a.id = ans.attempt_id
            LEFT JOIN quizzes q ON q.code = a.quiz_code
            WHERE a.student_id = ? AND a.completed_at IS NOT NULL
            GROUP BY COALESCE(NULLIF(TRIM(ans.skill_tag), ''), COALESCE(q.chapter, q.topic, 'General'))
            HAVING COUNT(*) >= 1
            ORDER BY accuracy_ratio DESC, questions_answered DESC
            LIMIT 30
        ''', (student_id,)).fetchall()

        mastery_list = []
        for m in mastery:
            m_dict = dict(m)
            avg_pct = round(to_float(m_dict['accuracy_ratio'], 0) * 100)
            avg_weight = to_float(m_dict['avg_difficulty_weight'], 2)
            next_target_difficulty = 'advanced' if avg_pct >= 85 else ('core' if avg_pct >= 60 else 'foundation')
            current_band = 'foundation' if avg_weight < 1.5 else ('core' if avg_weight < 2.5 else 'advanced')

            mastery_list.append({
                'topic': m_dict['topic'],
                'attempts': to_int(m_dict['questions_answered'], 0),
                'avg_pct': avg_pct,
                'status': 'strong' if avg_pct >= 80 else ('developing' if avg_pct >= 60 else 'needs_work'),
                'current_band': current_band,
                'next_target_difficulty': next_target_difficulty,
            })

        mistakes = conn.execute('''
            SELECT
                ans.id,
                ans.q_type,
                ans.question_text,
                ans.student_answer,
                ans.correct_answer,
                a.quiz_code,
                q.topic,
                a.completed_at
            FROM answers ans
            INNER JOIN attempts a ON a.id = ans.attempt_id
            LEFT JOIN quizzes q ON q.code = a.quiz_code
            WHERE a.student_id = ?
              AND a.completed_at IS NOT NULL
              AND (ans.is_correct = 0 OR ans.is_correct IS NULL)
            ORDER BY datetime(a.completed_at) DESC
            LIMIT 40
        ''', (student_id,)).fetchall()

        badges = get_student_badges(conn, student_id)
        week_start = start_of_iso_week(datetime.utcnow().strftime('%Y-%m-%d'))
        quests = compute_quest_states(conn, student_id, week_start)

        # Get leaderboard data
        leaderboard_rows = conn.execute('''
            SELECT id, name, xp, level, total_quizzes, streak_days
            FROM students
            WHERE leaderboard_opt_in = 1
            ORDER BY xp DESC, total_quizzes DESC, name ASC
        ''').fetchall()

        ranked = []
        for i, row in enumerate(leaderboard_rows):
            row_dict = dict(row)
            ranked.append({
                'rank': i + 1,
                'student_id': row_dict['id'],
                'name': row_dict['name'],
                'xp': to_int(row_dict['xp'], 0),
                'level': to_int(row_dict['level'], 1),
                'total_quizzes': to_int(row_dict['total_quizzes'], 0),
                'streak_days': to_int(row_dict['streak_days'], 0),
            })

        my_rank = None
        for r in ranked:
            if r['student_id'] == student_id:
                my_rank = r
                break

        # Get gamification events
        events = conn.execute('''
            SELECT id, event_type, points, detail_json, created_at
            FROM gamification_events
            WHERE student_id = ?
            ORDER BY datetime(created_at) DESC
            LIMIT 30
        ''', (student_id,)).fetchall()

        events_list = []
        for evt in events:
            evt_dict = dict(evt)
            detail = None
            if evt_dict['detail_json']:
                try:
                    detail = json.loads(evt_dict['detail_json'])
                except:
                    pass
            events_list.append({
                'id': evt_dict['id'],
                'event_type': evt_dict['event_type'],
                'points': evt_dict['points'],
                'detail': detail,
                'created_at': evt_dict['created_at'],
            })

        # Calculate weighted mastery
        class_activity_count = to_int(summary.get('class_activity_count'), 0)
        class_activity_avg = round(to_float(summary.get('class_activity_avg'), 0))
        topic_quiz_count = to_int(summary.get('topic_quiz_count'), 0)
        topic_quiz_avg = round(to_float(summary.get('topic_quiz_avg'), 0))

        if class_activity_count > 0 and topic_quiz_count > 0:
            weighted_mastery = round((class_activity_avg * 0.35) + (topic_quiz_avg * 0.65))
        elif topic_quiz_count > 0:
            weighted_mastery = topic_quiz_avg
        elif class_activity_count > 0:
            weighted_mastery = class_activity_avg
        else:
            weighted_mastery = round(to_float(summary.get('avg_score'), 0))

        return jsonify({
            'student': dict(student),
            'summary': {
                'completed_quizzes': to_int(summary.get('completed_quizzes'), 0),
                'avg_score': round(to_float(summary.get('avg_score'), 0)),
                'avg_time_s': round(to_float(summary.get('avg_time_s'), 0)),
                'total_correct': to_int(summary.get('total_correct'), 0),
                'total_questions': to_int(summary.get('total_questions'), 0),
                'class_activity_count': class_activity_count,
                'class_activity_avg': class_activity_avg,
                'topic_quiz_count': topic_quiz_count,
                'topic_quiz_avg': topic_quiz_avg,
                'weighted_mastery': weighted_mastery,
            },
            'activity_history': activity_history,
            'recent_history': recent_history,
            'weekly_trend': weekly_trend,
            'mastery': mastery_list,
            'mistakes': [dict(m) for m in mistakes],
            'badges': badges,
            'quests': quests,
            'leaderboard': {
                'enabled': to_int(student.get('leaderboard_opt_in'), 1) == 1,
                'top': ranked[:10],
                'me': my_rank,
            },
            'events': events_list,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<id>/settings', methods=['PATCH'])
def update_settings(id):
    data = request.get_json()
    try:
        conn = db.get_db()
        student_id = to_int(id, 0)
        student = get_student_by_id(conn, student_id)
        if not student:
            return jsonify({'error': 'Student not found.'}), 404

        if 'leaderboard_opt_in' in data:
            opt_in = 1 if data['leaderboard_opt_in'] else 0
            conn.execute('UPDATE students SET leaderboard_opt_in = ? WHERE id = ?', (opt_in, student_id))
            conn.commit()

        updated = get_student_by_id(conn, student_id)
        return jsonify({'success': True, 'student': dict(updated)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
