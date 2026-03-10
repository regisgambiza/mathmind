"""
Gamification service for Python server.
Provides badge and quest tracking functionality.
"""
import json
from datetime import datetime, timedelta


def get_student_badges(conn, student_id):
    """Get all badges unlocked by a student."""
    badges = conn.execute('''
        SELECT bd.code, bd.name, bd.description, bd.icon, bd.season_label, sb.unlocked_at
        FROM student_badges sb
        JOIN badge_definitions bd ON bd.code = sb.badge_code
        WHERE sb.student_id = ?
        ORDER BY sb.unlocked_at DESC
    ''', (student_id,)).fetchall()
    return [dict(b) for b in badges]


def compute_quest_states(conn, student_id, week_start):
    """Compute quest progress for a student for the given week."""
    quests = conn.execute('''
        SELECT id, code, name, description, metric, target_value, reward_xp, active
        FROM quest_definitions
        WHERE active = 1
    ''').fetchall()

    result = []
    for quest in quests:
        progress = _get_quest_progress(conn, student_id, quest['code'], quest['metric'], week_start)
        result.append({
            'code': quest['code'],
            'name': quest['name'],
            'description': quest['description'],
            'metric': quest['metric'],
            'target_value': quest['target_value'],
            'reward_xp': quest['reward_xp'],
            'progress': progress,
            'completed': progress >= quest['target_value'],
        })

    return result


def _get_quest_progress(conn, student_id, quest_code, metric, week_start):
    """Get progress for a specific quest."""
    try:
        week_start_dt = datetime.fromisoformat(week_start.replace('Z', '+00:00'))
        week_end_dt = week_start_dt + timedelta(days=7)
        week_start_str = week_start_dt.strftime('%Y-%m-%d')
        week_end_str = week_end_dt.strftime('%Y-%m-%d')
    except:
        week_start_str = datetime.utcnow().strftime('%Y-%m-%d')
        week_end_str = (datetime.utcnow() + timedelta(days=7)).strftime('%Y-%m-%d')

    if metric == 'attempts_weekly' or metric == 'quizzes_completed':
        row = conn.execute('''
            SELECT COUNT(*) as count FROM attempts
            WHERE student_id = ? AND completed_at IS NOT NULL
              AND date(completed_at) >= ? AND date(completed_at) < ?
        ''', (student_id, week_start_str, week_end_str)).fetchone()
        return row['count'] if row else 0

    elif metric == 'avg_pct_weekly':
        row = conn.execute('''
            SELECT AVG(percentage) as avg FROM attempts
            WHERE student_id = ? AND percentage IS NOT NULL AND completed_at IS NOT NULL
              AND date(completed_at) >= ? AND date(completed_at) < ?
        ''', (student_id, week_start_str, week_end_str)).fetchone()
        return round(row['avg']) if row and row['avg'] else 0

    elif metric == 'high_scores_weekly':
        row = conn.execute('''
            SELECT COUNT(*) as count FROM attempts
            WHERE student_id = ? AND percentage >= 90 AND completed_at IS NOT NULL
              AND date(completed_at) >= ? AND date(completed_at) < ?
        ''', (student_id, week_start_str, week_end_str)).fetchone()
        return row['count'] if row else 0

    elif metric == 'perfect_scores':
        row = conn.execute('''
            SELECT COUNT(*) as count FROM attempts
            WHERE student_id = ? AND percentage = 100 AND completed_at IS NOT NULL
              AND date(completed_at) >= ? AND date(completed_at) < ?
        ''', (student_id, week_start_str, week_end_str)).fetchone()
        return row['count'] if row else 0

    elif metric == 'streak_days':
        student = conn.execute('SELECT streak_days FROM students WHERE id = ?', (student_id,)).fetchone()
        return student['streak_days'] if student else 0

    return 0


def apply_gamification_for_attempt(conn, student_id, attempt_id, quiz_code, percentage, total_questions, time_taken_seconds):
    """Apply gamification rewards for a completed attempt."""
    rewards = {
        'xp_gained': 0,
        'level_before': 0,
        'level_after': 0,
        'streak_before': 0,
        'streak_after': 0,
        'badges_earned': [],
    }

    # Get student info
    student = conn.execute('''
        SELECT xp, level, streak_days, best_streak_days, total_quizzes FROM students WHERE id = ?
    ''', (student_id,)).fetchone()

    if not student:
        return None

    rewards['level_before'] = student['level']
    rewards['streak_before'] = student['streak_days']

    # Calculate XP based on performance
    base_xp = 10
    performance_bonus = 0

    if percentage >= 100:
        performance_bonus = 20
    elif percentage >= 80:
        performance_bonus = 10
    elif percentage >= 60:
        performance_bonus = 5

    completion_bonus = 5 if percentage > 0 else 0
    speed_bonus = 5 if time_taken_seconds and time_taken_seconds < 300 else 0

    total_xp = base_xp + performance_bonus + completion_bonus + speed_bonus
    rewards['xp_gained'] = total_xp

    # Update student
    new_xp = student['xp'] + total_xp
    new_level = (new_xp // 100) + 1

    # Calculate streak
    student_row = conn.execute('SELECT last_activity_date FROM students WHERE id = ?', (student_id,)).fetchone()
    last_activity = student_row['last_activity_date'] if student_row else None
    
    new_streak = student['streak_days']
    if last_activity:
        try:
            last_date = datetime.strptime(last_activity, '%Y-%m-%d').date()
            today = datetime.utcnow().date()
            days_diff = (today - last_date).days
            if days_diff == 1:
                new_streak = student['streak_days'] + 1
            elif days_diff > 1:
                new_streak = 1
        except:
            new_streak = 1
    else:
        new_streak = 1

    best_streak = max(student['best_streak_days'], new_streak)

    conn.execute('''
        UPDATE students
        SET xp = ?, level = ?, streak_days = ?, best_streak_days = ?, total_quizzes = total_quizzes + 1, last_activity_date = date('now')
        WHERE id = ?
    ''', (new_xp, new_level, new_streak, best_streak, student_id))
    conn.commit()

    rewards['level_after'] = new_level
    rewards['streak_after'] = new_streak

    # Check for level up
    if new_level > rewards['level_before']:
        conn.execute('''
            INSERT INTO gamification_events (student_id, attempt_id, event_type, points, detail_json)
            VALUES (?, ?, 'level_up', ?, ?)
        ''', (student_id, attempt_id, 0, json.dumps({'level': new_level})))

    # Check for badges
    badges_earned = []

    # First quiz badge
    total_quizzes = conn.execute('''
        SELECT COUNT(*) as count FROM attempts
        WHERE student_id = ? AND completed_at IS NOT NULL
    ''', (student_id,)).fetchone()['count']

    if total_quizzes == 1:
        if _try_award_badge(conn, student_id, 'first_quiz'):
            badges_earned.append('first_quiz')

    # Perfect score badge
    if percentage == 100 and total_questions >= 5:
        if _try_award_badge(conn, student_id, 'perfect_100'):
            badges_earned.append('perfect_100')

    # Streak badges
    if new_streak >= 3:
        if _try_award_badge(conn, student_id, 'streak_3'):
            badges_earned.append('streak_3')
    if new_streak >= 7:
        if _try_award_badge(conn, student_id, 'streak_7'):
            badges_earned.append('streak_7')

    conn.commit()

    # Get updated badges
    rewards['badges_earned'] = get_student_badges(conn, student_id)

    return rewards


def _try_award_badge(conn, student_id, badge_code):
    """Try to award a badge to a student if they haven't earned it yet."""
    existing = conn.execute('''
        SELECT id FROM student_badges WHERE student_id = ? AND badge_code = ?
    ''', (student_id, badge_code)).fetchone()

    if not existing:
        conn.execute('''
            INSERT INTO student_badges (student_id, badge_code, unlocked_at)
            VALUES (?, ?, datetime('now'))
        ''', (student_id, badge_code))

        conn.execute('''
            INSERT INTO gamification_events (student_id, event_type, points, detail_json)
            VALUES (?, 'badge_earned', 0, ?)
        ''', (student_id, json.dumps({'badge_code': badge_code})))
        return True
    return False


def start_of_iso_week(date_str):
    """Get the Monday of the ISO week for a given date."""
    try:
        dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except:
        dt = datetime.utcnow()

    # Get Monday of this week
    monday = dt - timedelta(days=dt.weekday())
    return monday.strftime('%Y-%m-%d')
