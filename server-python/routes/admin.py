from flask import Blueprint, request, jsonify
import db
import json
from datetime import datetime

router = Blueprint('admin', __name__)


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


def safe_parse_json(value, fallback=None):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except:
        return fallback


def safe_string(value, fallback=''):
    return str(value if value is not None else fallback).strip()


def pct(part, total):
    if not total:
        return 0
    return round((part / total) * 1000) / 10


def get_setting(conn, key, fallback=None):
    row = conn.execute('SELECT value_json FROM admin_settings WHERE setting_key = ?', (key,)).fetchone()
    if not row:
        return fallback
    parsed = safe_parse_json(row['value_json'], fallback)
    return fallback if parsed is None else parsed


def set_setting(conn, key, value, updated_by='admin'):
    conn.execute('''
        INSERT INTO admin_settings (setting_key, value_json, updated_by, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(setting_key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_by = excluded.updated_by,
            updated_at = datetime('now')
    ''', (key, json.dumps(value), updated_by))
    conn.commit()


def list_feature_flags(conn):
    rows = conn.execute('''
        SELECT flag_key, enabled, rollout_pct, config_json, updated_by, updated_at
        FROM feature_flags
        ORDER BY flag_key ASC
    ''').fetchall()

    result = []
    for row in rows:
        result.append({
            'key': row['flag_key'],
            'enabled': to_int(row['enabled'], 0) == 1,
            'rollout_pct': to_int(row['rollout_pct'], 100),
            'config': safe_parse_json(row['config_json'], {}),
            'updated_by': row['updated_by'],
            'updated_at': row['updated_at'],
        })
    return result


def get_feature_flag(conn, flag_key):
    return conn.execute('''
        SELECT flag_key, enabled, rollout_pct, config_json, updated_by, updated_at
        FROM feature_flags
        WHERE flag_key = ?
    ''', (flag_key,)).fetchone()


def set_feature_flag(conn, key, payload, actor='admin'):
    existing = get_feature_flag(conn, key)

    next_enabled = payload.get('enabled', to_int(existing['enabled'], 1) == 1 if existing else True)
    next_enabled = 1 if next_enabled else 0

    existing_rollout = to_int(existing['rollout_pct'], 100) if existing else 100
    next_rollout = max(0, min(100, to_int(payload.get('rollout_pct'), existing_rollout)))

    existing_config = safe_parse_json(existing['config_json'], {}) if existing else {}
    next_config = payload.get('config', existing_config) if isinstance(payload.get('config'), dict) else existing_config

    conn.execute('''
        INSERT INTO feature_flags (flag_key, enabled, rollout_pct, config_json, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(flag_key) DO UPDATE SET
            enabled = excluded.enabled,
            rollout_pct = excluded.rollout_pct,
            config_json = excluded.config_json,
            updated_by = excluded.updated_by,
            updated_at = datetime('now')
    ''', (key, next_enabled, next_rollout, json.dumps(next_config), actor))
    conn.commit()

    return {
        'key': key,
        'enabled': next_enabled == 1,
        'rollout_pct': next_rollout,
        'config': next_config,
    }


def log_audit(conn, actor='admin', action='', target_type=None, target_id=None, reason='', detail=None):
    conn.execute('''
        INSERT INTO audit_logs (actor, action, target_type, target_id, reason, detail_json)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (
        actor,
        action,
        target_type,
        str(target_id) if target_id is not None else None,
        reason or None,
        json.dumps(detail) if detail else None,
    ))
    conn.commit()


def group_by(items, key_fn):
    result = {}
    for item in items:
        key = key_fn(item)
        if key not in result:
            result[key] = []
        result[key].append(item)
    return result


def build_admin_overview(conn, uptime_seconds=None):
    flags = list_feature_flags(conn)
    adaptive_flag = next((f for f in flags if f['key'] == 'adaptive_engine'), {'enabled': True, 'rollout_pct': 100})

    # Plan stats
    plan_stats_row = conn.execute('''
        SELECT
            COUNT(*) as total_7d,
            SUM(CASE WHEN fallback_used = 1 THEN 1 ELSE 0 END) as fallback_7d,
            MAX(created_at) as last_plan_generated
        FROM adaptive_plan_events
        WHERE datetime(created_at) >= datetime('now', '-7 day')
    ''').fetchone()
    plan_stats = dict(plan_stats_row) if plan_stats_row else {}

    # Low mastery students
    low_mastery_rows = conn.execute('''
        SELECT
            s.id as student_id,
            s.name,
            s.streak_days,
            s.best_streak_days,
            AVG(CASE WHEN ans.is_correct = 1 THEN 1.0 ELSE 0.0 END) * 100 as mastery_pct,
            MAX(a.completed_at) as last_completed_at
        FROM students s
        LEFT JOIN attempts a ON a.student_id = s.id AND a.completed_at IS NOT NULL
        LEFT JOIN answers ans ON ans.attempt_id = a.id AND COALESCE(ans.excluded, 0) = 0
        GROUP BY s.id
        HAVING COUNT(ans.id) > 0
    ''').fetchall()

    # Latest trend rows
    latest_trend_rows = conn.execute('''
        SELECT ape.student_id, ape.trend, ape.mastery_overall, ape.recent_accuracy, ape.created_at
        FROM adaptive_plan_events ape
        INNER JOIN (
            SELECT student_id, MAX(created_at) as max_created
            FROM adaptive_plan_events
            GROUP BY student_id
        ) t ON t.student_id = ape.student_id AND t.max_created = ape.created_at
    ''').fetchall()

    # Convert sqlite3.Row to dict so .get() works downstream
    trend_map = {r['student_id']: dict(r) for r in latest_trend_rows}

    # At-risk alerts
    at_risk_alerts = []
    for row in low_mastery_rows:
        trend = trend_map.get(row['student_id'])
        reasons = []
        mastery = to_float(row['mastery_pct'], 0)
        streak = to_int(row['streak_days'], 0)
        best_streak = to_int(row['best_streak_days'], 0)

        if mastery < 55:
            reasons.append('low_mastery')
        if trend and trend.get('trend') == 'declining':
            reasons.append('declining_trend')
        if best_streak >= 3 and streak <= 1:
            reasons.append('streak_drop')

        if reasons:
            if mastery < 55:
                recommended_action = 'Assign foundation remediation and schedule teacher check-in.'
            elif 'streak_drop' in reasons:
                recommended_action = 'Send re-engagement reminder and assign short warmup set.'
            else:
                recommended_action = 'Monitor and assign targeted practice on weak skills.'

            at_risk_alerts.append({
                'student_id': row['student_id'],
                'name': row['name'],
                'mastery_pct': round(mastery),
                'streak_days': streak,
                'trend': trend.get('trend', 'unknown') if trend else 'unknown',
                'reasons': reasons,
                'recommended_action': recommended_action,
            })

    # Heatmap rows
    heatmap_rows = conn.execute('''
        SELECT
            COALESCE(q.class_name, q.code) as class_name,
            COALESCE(q.section_name, q.grade) as section_name,
            COALESCE(q.topic, 'General') as topic,
            COALESCE(NULLIF(TRIM(ans.skill_tag), ''), COALESCE(q.chapter, q.topic, 'General')) as skill_tag,
            AVG(CASE WHEN ans.is_correct = 1 THEN 1.0 ELSE 0.0 END) * 100 as mastery_pct,
            COUNT(*) as samples
        FROM answers ans
        INNER JOIN attempts a ON a.id = ans.attempt_id
        LEFT JOIN quizzes q ON q.code = a.quiz_code
        WHERE a.completed_at IS NOT NULL
          AND COALESCE(ans.excluded, 0) = 0
        GROUP BY COALESCE(q.class_name, q.code), COALESCE(q.section_name, q.grade), COALESCE(q.topic, 'General'),
                 COALESCE(NULLIF(TRIM(ans.skill_tag), ''), COALESCE(q.chapter, q.topic, 'General'))
        ORDER BY samples DESC
        LIMIT 300
    ''').fetchall()

    heatmap_list = []
    for r in heatmap_rows:
        heatmap_list.append({
            'class_name': r['class_name'],
            'section_name': r['section_name'],
            'topic': r['topic'],
            'skill_tag': r['skill_tag'],
            'mastery_pct': round(to_float(r['mastery_pct'], 0)),
            'samples': to_int(r['samples'], 0),
        })

    # Difficulty distribution rows
    diff_rows = conn.execute('''
        SELECT
            COALESCE(q.class_name, q.code) as class_name,
            q.code as quiz_code,
            SUM(CASE WHEN lower(COALESCE(ans.difficulty, 'core')) = 'foundation' THEN 1 ELSE 0 END) as foundation_count,
            SUM(CASE WHEN lower(COALESCE(ans.difficulty, 'core')) = 'core' THEN 1 ELSE 0 END) as core_count,
            SUM(CASE WHEN lower(COALESCE(ans.difficulty, 'core')) = 'advanced' THEN 1 ELSE 0 END) as advanced_count,
            COUNT(*) as total_answers
        FROM answers ans
        INNER JOIN attempts a ON a.id = ans.attempt_id
        LEFT JOIN quizzes q ON q.code = a.quiz_code
        WHERE a.completed_at IS NOT NULL
          AND COALESCE(ans.excluded, 0) = 0
        GROUP BY COALESCE(q.class_name, q.code), q.code
        ORDER BY total_answers DESC
        LIMIT 120
    ''').fetchall()

    diff_list = []
    for r in diff_rows:
        total = to_int(r['total_answers'], 0)
        diff_list.append({
            'class_name': r['class_name'],
            'quiz_code': r['quiz_code'],
            'total_answers': total,
            'foundation_count': to_int(r['foundation_count'], 0),
            'core_count': to_int(r['core_count'], 0),
            'advanced_count': to_int(r['advanced_count'], 0),
            'foundation_pct': pct(to_int(r['foundation_count'], 0), total),
            'core_pct': pct(to_int(r['core_count'], 0), total),
            'advanced_pct': pct(to_int(r['advanced_count'], 0), total),
        })

    # Question quality analysis
    question_rows = conn.execute('''
        SELECT
            q.code as quiz_code,
            ans.question_text,
            lower(COALESCE(ans.difficulty, 'core')) as difficulty,
            ans.is_correct,
            a.percentage as attempt_pct
        FROM answers ans
        INNER JOIN attempts a ON a.id = ans.attempt_id
        LEFT JOIN quizzes q ON q.code = a.quiz_code
        WHERE a.completed_at IS NOT NULL
          AND COALESCE(ans.excluded, 0) = 0
          AND ans.question_text IS NOT NULL
        ORDER BY datetime(a.completed_at) DESC
        LIMIT 5000
    ''').fetchall()

    by_question = group_by(list(question_rows), lambda r: f"{r['quiz_code'] or 'UNKNOWN'}::{safe_string(r['question_text'])}")
    question_quality = []

    for _, rows in by_question.items():
        if not rows:
            continue
        quiz_code = rows[0]['quiz_code'] or 'UNKNOWN'
        question_text = rows[0]['question_text']
        difficulty = rows[0]['difficulty'] or 'core'
        total = len(rows)
        correct = sum(1 for r in rows if to_int(r['is_correct'], 0) == 1)

        high_rows = [r for r in rows if to_float(r['attempt_pct'], 0) >= 75]
        low_rows = [r for r in rows if to_float(r['attempt_pct'], 0) <= 50]

        high_acc = sum(1 for r in high_rows if to_int(r['is_correct'], 0) == 1) / len(high_rows) if high_rows else None
        low_acc = sum(1 for r in low_rows if to_int(r['is_correct'], 0) == 1) / len(low_rows) if low_rows else None

        discrimination = None
        if high_acc is not None and low_acc is not None:
            discrimination = round((high_acc - low_acc) * 100)

        acc = correct / total if total > 0 else 0
        if difficulty == 'foundation':
            calibration_status = 'too_hard' if acc < 0.55 else ('too_easy' if acc > 0.9 else 'ok')
        elif difficulty == 'advanced':
            calibration_status = 'too_easy' if acc > 0.7 else ('too_hard' if acc < 0.2 else 'ok')
        else:
            calibration_status = 'too_hard' if acc < 0.35 else ('too_easy' if acc > 0.85 else 'ok')

        question_quality.append({
            'quiz_code': quiz_code,
            'question_text': question_text,
            'difficulty': difficulty,
            'attempts': total,
            'error_rate_pct': round((1 - acc) * 100),
            'discrimination': discrimination,
            'calibration_status': calibration_status,
        })

    question_quality.sort(key=lambda x: (-x['error_rate_pct'], -x['attempts']))

    # Integrity dashboard
    integrity_rows = conn.execute('''
        SELECT
            a.id as attempt_id,
            a.quiz_code,
            a.student_name,
            a.status,
            a.started_at,
            a.completed_at,
            a.percentage,
            COUNT(DISTINCT v.id) as violation_count,
            AVG(CASE WHEN ans.time_taken_s IS NOT NULL THEN ans.time_taken_s END) as avg_answer_time_s,
            COUNT(ans.id) as answers_count
        FROM attempts a
        LEFT JOIN violations v ON v.attempt_id = a.id
        LEFT JOIN answers ans ON ans.attempt_id = a.id
        GROUP BY a.id, a.quiz_code, a.student_name, a.status, a.started_at, a.completed_at, a.percentage
        ORDER BY datetime(a.started_at) DESC
        LIMIT 300
    ''').fetchall()

    integrity_list = []
    for r in integrity_rows:
        avg_time = to_float(r['avg_answer_time_s'], 0)
        violations = to_int(r['violation_count'], 0)
        answers_count = to_int(r['answers_count'], 0)
        rapid_guessing = answers_count >= 5 and avg_time > 0 and avg_time < 8
        suspicious_score = (violations * 2) + (3 if rapid_guessing else 0) + (2 if r['status'] == 'force_submitted' else 0)

        integrity_list.append({
            'attempt_id': r['attempt_id'],
            'quiz_code': r['quiz_code'],
            'student_name': r['student_name'],
            'status': r['status'],
            'percentage': to_float(r['percentage'], 0),
            'violation_count': violations,
            'avg_answer_time_s': round(avg_time),
            'rapid_guessing': rapid_guessing,
            'suspicious_score': suspicious_score,
            'flagged': suspicious_score >= 4,
        })

    suspicious_attempts = [r for r in integrity_list if r['flagged']][:50]

    # Intervention queue
    intervention_queue = []
    for a in at_risk_alerts:
        intervention_queue.append({
            'type': 'academic',
            **a,
        })

    for s in suspicious_attempts:
        intervention_queue.append({
            'type': 'integrity',
            'student_id': None,
            'name': s['student_name'],
            'mastery_pct': None,
            'streak_days': None,
            'trend': 'n/a',
            'reasons': [
                'rapid_guessing' if s['rapid_guessing'] else None,
                'tab_switch_spike' if s['violation_count'] >= 3 else None,
                'forced_submission' if s['status'] == 'force_submitted' else None,
            ],
            'recommended_action': 'Review attempt details, verify integrity, and schedule follow-up.',
            'attempt_id': s['attempt_id'],
            'quiz_code': s['quiz_code'],
            'suspicious_score': s['suspicious_score'],
        })

    intervention_queue.sort(key=lambda x: -to_int(x.get('suspicious_score'), 0))

    # Schedules
    schedules = conn.execute('''
        SELECT s.*, q.topic, q.grade
        FROM assignment_schedules s
        LEFT JOIN quizzes q ON q.code = s.quiz_code
        ORDER BY datetime(s.release_at) DESC, datetime(s.created_at) DESC
        LIMIT 100
    ''').fetchall()

    schedules_list = [dict(s) for s in schedules]

    # Live class monitor
    live_rows = conn.execute('''
        SELECT
            q.code as quiz_code,
            q.topic,
            q.time_limit_mins,
            COUNT(a.id) as started_count,
            SUM(CASE WHEN a.completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed_count,
            AVG(
                CASE
                    WHEN a.completed_at IS NULL THEN (strftime('%s', 'now') - strftime('%s', a.started_at))
                    ELSE a.time_taken_s
                END
            ) as avg_elapsed_s
        FROM quizzes q
        LEFT JOIN attempts a ON a.quiz_code = q.code
          AND datetime(a.started_at) >= datetime('now', '-2 day')
        GROUP BY q.code
        ORDER BY datetime(q.created_at) DESC
        LIMIT 60
    ''').fetchall()

    live_classes = []
    pacing_alerts = []
    for r in live_rows:
        started = to_int(r['started_count'], 0)
        completed = to_int(r['completed_count'], 0)
        completion_rate = pct(completed, max(started, 1))
        avg_elapsed = round(to_float(r['avg_elapsed_s'], 0))
        limit_sec = max(0, to_int(r['time_limit_mins'], 0) * 60)
        pacing_alert = limit_sec > 0 and avg_elapsed > (limit_sec * 0.85) and completion_rate < 60

        live_entry = {
            'quiz_code': r['quiz_code'],
            'topic': r['topic'],
            'started_count': started,
            'completed_count': completed,
            'completion_rate_pct': completion_rate,
            'avg_elapsed_s': avg_elapsed,
            'pacing_alert': pacing_alert,
        }
        live_classes.append(live_entry)
        if pacing_alert:
            pacing_alerts.append(live_entry)

    # Cohort comparison
    cohort_current = conn.execute('''
        SELECT
            COALESCE(q.class_name, q.code) as class_name,
            COALESCE(q.section_name, q.grade) as section_name,
            q.grade,
            AVG(a.percentage) as avg_pct,
            COUNT(*) as attempts
        FROM attempts a
        LEFT JOIN quizzes q ON q.code = a.quiz_code
        WHERE a.completed_at IS NOT NULL
          AND datetime(a.completed_at) >= datetime('now', '-30 day')
        GROUP BY COALESCE(q.class_name, q.code), COALESCE(q.section_name, q.grade), q.grade
    ''').fetchall()

    cohort_prev = conn.execute('''
        SELECT
            COALESCE(q.class_name, q.code) as class_name,
            COALESCE(q.section_name, q.grade) as section_name,
            q.grade,
            AVG(a.percentage) as avg_pct,
            COUNT(*) as attempts
        FROM attempts a
        LEFT JOIN quizzes q ON q.code = a.quiz_code
        WHERE a.completed_at IS NOT NULL
          AND datetime(a.completed_at) >= datetime('now', '-60 day')
          AND datetime(a.completed_at) < datetime('now', '-30 day')
        GROUP BY COALESCE(q.class_name, q.code), COALESCE(q.section_name, q.grade), q.grade
    ''').fetchall()

    prev_map = {f"{r['class_name']}::{r['section_name']}::{r['grade']}": r for r in cohort_prev}

    cohort_comparison = []
    for r in cohort_current:
        key = f"{r['class_name']}::{r['section_name']}::{r['grade']}"
        prev = prev_map.get(key)
        current_avg = to_float(r['avg_pct'], 0)
        prev_avg = to_float(prev['avg_pct'], 0) if prev else 0

        cohort_comparison.append({
            'class_name': r['class_name'],
            'section_name': r['section_name'],
            'grade': r['grade'],
            'current_avg_pct': round(current_avg),
            'previous_avg_pct': round(prev_avg),
            'delta_pct': round((current_avg - prev_avg) * 10) / 10,
            'attempts_current': to_int(r['attempts'], 0),
            'attempts_previous': to_int(prev['attempts'], 0) if prev else 0,
        })

    # Quests and badges
    quests = conn.execute('''
        SELECT id, code, name, description, metric, target_value, reward_xp, season_label, active, updated_at
        FROM quest_definitions
        ORDER BY active DESC, updated_at DESC
    ''').fetchall()

    badges = conn.execute('''
        SELECT b.id, b.code, b.name, b.description, b.icon, b.season_label, b.active, b.auto_award,
               COUNT(sb.id) as unlocked_count
        FROM badge_definitions b
        LEFT JOIN student_badges sb ON sb.badge_code = b.code
        GROUP BY b.id
        ORDER BY b.active DESC, unlocked_count DESC, b.name ASC
    ''').fetchall()

    # Leaderboard controls
    leaderboard_controls = get_setting(conn, 'leaderboard_controls', {
        'enabled': True,
        'anonymize': False,
        'class_only': False,
    })

    # Content stats
    content_stats_row = conn.execute('''
        SELECT
            COUNT(*) as total_sets,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_sets,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_sets,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_sets,
            MAX(created_at) as last_submitted_at
        FROM generated_question_sets
    ''').fetchone()
    content_stats = dict(content_stats_row) if content_stats_row else {}

    # Recent overrides
    recent_overrides = conn.execute('''
        SELECT *
        FROM manual_overrides
        ORDER BY datetime(created_at) DESC
        LIMIT 30
    ''').fetchall()

    # Parent stats
    parent_stats_row = conn.execute('''
        SELECT
            (SELECT COUNT(*) FROM parent_contacts) as contacts_count,
            (SELECT COUNT(*) FROM parent_alerts WHERE status = 'queued') as queued_alerts,
            (SELECT COUNT(*) FROM parent_alerts WHERE status = 'sent') as sent_alerts
        ''').fetchone()
    parent_stats = dict(parent_stats_row) if parent_stats_row else {}

    recent_parent_alerts = conn.execute('''
        SELECT pa.id, pa.student_id, s.name as student_name, pa.alert_type, pa.message, pa.status, pa.created_at
        FROM parent_alerts pa
        LEFT JOIN students s ON s.id = pa.student_id
        ORDER BY datetime(pa.created_at) DESC
        LIMIT 30
    ''').fetchall()

    # Recent audit logs
    recent_audit = conn.execute('''
        SELECT *
        FROM audit_logs
        ORDER BY datetime(created_at) DESC
        LIMIT 100
    ''').fetchall()

    # System health
    system_24h_row = conn.execute('''
        SELECT
            COUNT(*) as total_events,
            AVG(CASE WHEN latency_ms IS NOT NULL THEN latency_ms END) as avg_latency_ms,
            SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_errors,
            SUM(CASE WHEN event_type = 'generation_error' THEN 1 ELSE 0 END) as generation_errors
        FROM system_events
        WHERE datetime(created_at) >= datetime('now', '-24 hour')
    ''').fetchone()
    system_24h = dict(system_24h_row) if system_24h_row else {}

    service_status = {
        'uptime_s': round(uptime_seconds) if uptime_seconds is not None else None,
        'total_events_24h': to_int(system_24h['total_events'], 0),
        'avg_latency_ms_24h': round(to_float(system_24h['avg_latency_ms'], 0)),
        'server_errors_24h': to_int(system_24h['server_errors'], 0),
        'generation_errors_24h': to_int(system_24h['generation_errors'], 0),
    }

    # Data governance
    retention = get_setting(conn, 'data_retention_days', {'days': 365})
    pending_data_requests = conn.execute('''
        SELECT dr.*, s.name as student_name
        FROM data_requests dr
        LEFT JOIN students s ON s.id = dr.student_id
        WHERE dr.status = 'pending'
        ORDER BY datetime(dr.created_at) DESC
        LIMIT 100
    ''').fetchall()

    consent_stats_row = conn.execute('''
        SELECT
            SUM(CASE WHEN consent_opt_in = 1 THEN 1 ELSE 0 END) as opted_in,
            SUM(CASE WHEN consent_opt_in = 0 THEN 1 ELSE 0 END) as opted_out,
            COUNT(*) as total_students
        FROM students
    ''').fetchone()
    consent_stats = dict(consent_stats_row) if consent_stats_row else {}

    return {
        'adaptive_engine_status': {
            'enabled': adaptive_flag['enabled'],
            'rollout_pct': adaptive_flag['rollout_pct'],
            'last_plan_generated': plan_stats.get('last_plan_generated'),
            'total_plans_7d': to_int(plan_stats.get('total_7d'), 0),
            'fallback_rate_7d_pct': pct(to_int(plan_stats.get('fallback_7d'), 0), max(to_int(plan_stats.get('total_7d'), 0), 1)),
        },
        'at_risk_learner_alerts': at_risk_alerts[:100],
        'mastery_heatmap': heatmap_list,
        'difficulty_distribution_monitor': diff_list,
        'question_quality_analytics': {
            'items': question_quality[:120],
            'calibration_summary': {
                'too_easy': sum(1 for q in question_quality if q['calibration_status'] == 'too_easy'),
                'too_hard': sum(1 for q in question_quality if q['calibration_status'] == 'too_hard'),
                'ok': sum(1 for q in question_quality if q['calibration_status'] == 'ok'),
            },
        },
        'integrity_dashboard': {
            'suspicious_attempts': suspicious_attempts,
            'tab_switch_spikes': [r for r in integrity_list if r['violation_count'] >= 3][:60],
            'rapid_guessing_attempts': [r for r in integrity_list if r['rapid_guessing']][:60],
        },
        'intervention_queue': intervention_queue[:120],
        'assignment_scheduler_release_controls': schedules_list,
        'live_class_monitor': {
            'classes': live_classes,
            'pacing_alerts': pacing_alerts,
        },
        'cohort_comparison': cohort_comparison,
        'badge_quest_management': {
            'quests': [dict(q) for q in quests],
            'badges': [dict(b) for b in badges],
        },
        'leaderboard_controls': leaderboard_controls,
        'content_approval_workflow': {
            'total_sets': to_int(content_stats.get('total_sets'), 0),
            'pending_sets': to_int(content_stats.get('pending_sets'), 0),
            'approved_sets': to_int(content_stats.get('approved_sets'), 0),
            'rejected_sets': to_int(content_stats.get('rejected_sets'), 0),
            'last_submitted_at': content_stats.get('last_submitted_at'),
        },
        'manual_override_tools': {
            'recent_overrides': [dict(o) for o in recent_overrides],
        },
        'parent_communication_center': {
            'contacts_count': to_int(parent_stats.get('contacts_count'), 0),
            'queued_alerts': to_int(parent_stats.get('queued_alerts'), 0),
            'sent_alerts': to_int(parent_stats.get('sent_alerts'), 0),
            'recent_alerts': [dict(a) for a in recent_parent_alerts],
        },
        'report_builder': {
            'available_groupings': ['skill', 'student', 'quiz', 'class', 'section', 'grade', 'date', 'activity_type'],
            'available_time_windows': ['7d', '30d', '90d', 'custom'],
        },
        'audit_trail': [dict(a) for a in recent_audit],
        'system_health_observability': service_status,
        'data_governance_tools': {
            'retention_days': to_int(retention.get('days'), 365),
            'pending_requests': [dict(r) for r in pending_data_requests],
            'consent_stats': {
                'opted_in': to_int(consent_stats.get('opted_in'), 0),
                'opted_out': to_int(consent_stats.get('opted_out'), 0),
                'total_students': to_int(consent_stats.get('total_students'), 0),
            },
        },
        'feature_flags_console': flags,
    }


@router.route('/overview', methods=['GET'])
def get_overview():
    try:
        conn = db.get_db()
        uptime = datetime.utcnow().timestamp()  # Simplified uptime
        overview = build_admin_overview(conn, uptime)
        return jsonify(overview)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/feature-flags', methods=['GET'])
def get_feature_flags():
    try:
        conn = db.get_db()
        flags = list_feature_flags(conn)
        return jsonify(flags)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/feature-flags/<key>', methods=['PATCH'])
def update_feature_flag(key):
    data = request.get_json()
    try:
        conn = db.get_db()
        actor = safe_string(data.get('actor', 'admin'))
        updated = set_feature_flag(conn, key, data or {}, actor)
        log_audit(conn,
            actor=actor,
            action='feature_flag.update',
            target_type='feature_flag',
            target_id=key,
            reason=safe_string(data.get('reason')),
            detail=updated,
        )
        return jsonify({'success': True, 'flag': updated})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/settings', methods=['GET'])
def get_settings():
    try:
        conn = db.get_db()
        rows = conn.execute('''
            SELECT setting_key, value_json, updated_by, updated_at
            FROM admin_settings ORDER BY setting_key
        ''').fetchall()

        result = []
        for r in rows:
            result.append({
                'key': r['setting_key'],
                'value': safe_parse_json(r['value_json']),
                'updated_by': r['updated_by'],
                'updated_at': r['updated_at'],
            })

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/settings/<key>', methods=['PATCH'])
def update_setting(key):
    data = request.get_json()
    value = data.get('value')

    if value is None:
        return jsonify({'error': 'Missing value'}), 400

    try:
        conn = db.get_db()
        actor = safe_string(data.get('actor', 'admin'))
        set_setting(conn, key, value, actor)
        log_audit(conn,
            actor=actor,
            action='admin_setting.update',
            target_type='admin_setting',
            target_id=key,
            reason=safe_string(data.get('reason')),
            detail={'value': value},
        )
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/assignments', methods=['GET'])
def get_assignments():
    try:
        conn = db.get_db()
        rows = conn.execute('''
            SELECT s.*, q.topic, q.grade
            FROM assignment_schedules s
            LEFT JOIN quizzes q ON q.code = s.quiz_code
            ORDER BY datetime(s.release_at) DESC
        ''').fetchall()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/assignments', methods=['POST'])
def create_assignment():
    data = request.get_json()
    try:
        conn = db.get_db()
        quiz_code = data.get('quiz_code', '').upper()
        class_name = data.get('class_name')
        section_name = data.get('section_name')
        release_at = data.get('release_at')
        close_at = data.get('close_at')
        status = data.get('status', 'scheduled')
        created_by = data.get('created_by', 'admin')

        # Verify quiz exists
        quiz = conn.execute('SELECT code FROM quizzes WHERE code = ?', (quiz_code,)).fetchone()
        if not quiz:
            return jsonify({'error': 'Quiz not found'}), 404

        cursor = conn.execute('''
            INSERT INTO assignment_schedules (quiz_code, class_name, section_name, release_at, close_at, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (quiz_code, class_name, section_name, release_at, close_at, status, created_by))
        conn.commit()

        log_audit(conn,
            actor=created_by,
            action='assignment_schedule.create',
            target_type='assignment_schedule',
            target_id=cursor.lastrowid,
            detail={'quiz_code': quiz_code, 'class_name': class_name, 'section_name': section_name},
        )

        return jsonify({'success': True, 'id': cursor.lastrowid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/assignments/<id>', methods=['PATCH'])
def update_assignment(id):
    data = request.get_json()
    try:
        conn = db.get_db()
        actor = safe_string(data.get('actor', 'admin'))

        fields = []
        values = []
        for field in ['status', 'release_at', 'close_at', 'class_name', 'section_name']:
            if field in data:
                fields.append(f'{field} = ?')
                values.append(data[field])

        if not fields:
            return jsonify({'error': 'No fields to update'}), 400

        values.append(id)
        conn.execute(f'''
            UPDATE assignment_schedules
            SET {', '.join(fields)}, updated_at = datetime('now')
            WHERE id = ?
        ''', values)
        conn.commit()

        log_audit(conn,
            actor=actor,
            action='assignment_schedule.update',
            target_type='assignment_schedule',
            target_id=id,
            detail=data,
        )

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ADDED: Question sets endpoints for AI-generated content
@router.route('/content/question-sets', methods=['POST'])
def create_question_set():
    data = request.get_json()
    try:
        conn = db.get_db()
        questions = data.get('questions') if isinstance(data.get('questions'), list) else None
        
        if not questions or len(questions) == 0:
            return jsonify({'error': 'questions is required'}), 400
        
        quiz_code = safe_string(data.get('quiz_code', '')).upper() if data.get('quiz_code') else None
        attempt_id = data.get('attempt_id')
        student_id = data.get('student_id')
        
        cursor = conn.execute('''
            INSERT INTO generated_question_sets (quiz_code, attempt_id, student_id, questions_json, status)
            VALUES (?, ?, ?, ?, 'pending')
        ''', (quiz_code, attempt_id, student_id, json.dumps(questions)))
        conn.commit()
        
        return jsonify({'success': True, 'id': cursor.lastrowid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/content/question-sets', methods=['GET'])
def get_question_sets():
    try:
        conn = db.get_db()
        status = request.args.get('status', '')
        
        if status:
            rows = conn.execute('''
                SELECT * FROM generated_question_sets
                WHERE status = ?
                ORDER BY datetime(created_at) DESC
                LIMIT 300
            ''', (status,)).fetchall()
        else:
            rows = conn.execute('''
                SELECT * FROM generated_question_sets
                ORDER BY datetime(created_at) DESC
                LIMIT 300
            ''').fetchall()
        
        result = []
        for r in rows:
            row_dict = dict(r)
            try:
                row_dict['questions'] = json.loads(r['questions_json']) if r['questions_json'] else []
            except:
                row_dict['questions'] = []
            result.append(row_dict)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/content/question-sets/<id>', methods=['PATCH'])
def update_question_set(id):
    data = request.get_json()
    try:
        conn = db.get_db()
        question_id = to_int(id, 0)
        status = safe_string(data.get('status', ''))
        
        if status not in ['approved', 'rejected', 'pending']:
            return jsonify({'error': 'status must be approved/rejected/pending'}), 400
        
        reviewer = safe_string(data.get('reviewer', 'admin'))
        notes = safe_string(data.get('notes')) if data.get('notes') else None
        
        conn.execute('''
            UPDATE generated_question_sets
            SET status = ?, reviewer = ?, notes = ?, 
                reviewed_at = CASE WHEN ? IN ('approved', 'rejected') THEN datetime('now') ELSE reviewed_at END
            WHERE id = ?
        ''', (status, reviewer, notes, status, question_id))
        conn.commit()
        
        log_audit(conn,
            actor=reviewer,
            action='content_review.update',
            target_type='generated_question_set',
            target_id=question_id,
            detail={'status': status},
        )
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/system/events', methods=['POST'])
def create_system_event():
    """ADDED: System events endpoint for error logging"""
    data = request.get_json()
    try:
        conn = db.get_db()
        conn.execute('''
            INSERT INTO system_events (event_type, level, message, path, detail_json)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            data.get('event_type', 'unknown'),
            data.get('level', 'info'),
            data.get('message', ''),
            data.get('path', ''),
            json.dumps(data.get('detail', {}))
        ))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/audit-logs', methods=['GET'])
def get_audit_logs():
    try:
        conn = db.get_db()
        limit = min(to_int(request.args.get('limit', 100), 100), 500)
        rows = conn.execute('''
            SELECT * FROM audit_logs
            ORDER BY datetime(created_at) DESC
            LIMIT ?
        ''', (limit,)).fetchall()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        return jsonify({'error': str(e)}), 500
