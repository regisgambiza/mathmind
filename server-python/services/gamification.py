"""
Gamification service for Python server.
Provides badge and quest tracking functionality.
FIXED: Match Node.js response structure exactly for frontend compatibility.
"""
import json
import datetime


def to_int(value, fallback=0):
    try:
        n = int(value)
        return n if n == n else fallback  # Handle NaN
    except (TypeError, ValueError):
        return fallback


def to_float(value, fallback=0):
    try:
        n = float(value)
        return n if n == n else fallback  # Handle NaN
    except (TypeError, ValueError):
        return fallback


def iso_date_utc(date_val=None):
    """Get ISO date string (YYYY-MM-DD) in UTC."""
    if date_val is None:
        date_val = datetime.datetime.utcnow()
    if isinstance(date_val, (datetime.datetime, datetime.date)):
        return date_val.strftime('%Y-%m-%d')
    return str(date_val)


def add_days(date_str, delta_days):
    """Add days to a date string."""
    dt = datetime.datetime.strptime(date_str, '%Y-%m-%d')
    dt = dt + datetime.timedelta(days=delta_days)
    return dt.strftime('%Y-%m-%d')


def start_of_iso_week(date_val):
    """Get the Monday of the ISO week for a given date."""
    if isinstance(date_val, str):
        try:
            dt = datetime.datetime.strptime(date_val, '%Y-%m-%d')
        except:
            dt = datetime.datetime.utcnow()
    elif isinstance(date_val, (datetime.datetime, datetime.date)):
        dt = date_val
    else:
        dt = datetime.datetime.utcnow()
    
    # Get Monday of this week (Monday=0)
    monday = dt - datetime.timedelta(days=dt.weekday())
    # Return as string for consistency with existing calls
    if isinstance(monday, datetime.datetime):
        return monday.strftime('%Y-%m-%d')
    return monday.strftime('%Y-%m-%d')


def level_from_xp(xp):
    """Calculate level from XP (same formula as Node.js)."""
    return int(to_float(xp, 0) // 250) + 1


def get_badge_definition_map(conn):
    """Get all badge definitions from database."""
    badge_map = {}
    
    # Default badges (fallback)
    default_badges = {
        'first_quiz': {'code': 'first_quiz', 'name': 'First Steps', 'description': 'Complete your first quiz.', 'icon': 'seed'},
        'streak_3': {'code': 'streak_3', 'name': 'Consistent Learner', 'description': 'Maintain a 3-day study streak.', 'icon': 'flame'},
        'streak_7': {'code': 'streak_7', 'name': 'Streak Master', 'description': 'Maintain a 7-day study streak.', 'icon': 'fire'},
        'perfect_100': {'code': 'perfect_100', 'name': 'Perfect Run', 'description': 'Score 100% on a quiz.', 'icon': 'crown'},
        'quiz_10': {'code': 'quiz_10', 'name': 'Quiz Explorer', 'description': 'Complete 10 quizzes.', 'icon': 'map'},
        'quiz_25': {'code': 'quiz_25', 'name': 'Math Marathoner', 'description': 'Complete 25 quizzes.', 'icon': 'trophy'},
        'high_achiever': {'code': 'high_achiever', 'name': 'High Achiever', 'description': 'Score 90%+ on 5 quizzes.', 'icon': 'star'},
        'level_5': {'code': 'level_5', 'name': 'Level Up', 'description': 'Reach level 5.', 'icon': 'rocket'},
        'quest_champion': {'code': 'quest_champion', 'name': 'Quest Champion', 'description': 'Complete every weekly quest.', 'icon': 'medal'},
    }
    badge_map.update(default_badges)
    
    # Database badges
    try:
        rows = conn.execute('''
            SELECT code, name, description, icon, active
            FROM badge_definitions
        ''').fetchall()
        for row in rows:
            badge_map[row['code']] = {
                'code': row['code'],
                'name': row['name'],
                'description': row['description'] or '',
                'icon': row['icon'] or 'badge',
                'active': bool(row['active']),
            }
    except:
        pass
    
    return badge_map


def get_active_quest_definitions(conn):
    """Get active quest definitions from database."""
    try:
        rows = conn.execute('''
            SELECT code, name, description, metric, target_value, reward_xp
            FROM quest_definitions
            WHERE active = TRUE
            ORDER BY id ASC
        ''').fetchall()
        
        if not rows:
            return None
        
        return [{
            'code': row['code'],
            'name': row['name'],
            'description': row['description'],
            'metric': row['metric'],
            'target': to_int(row['target_value'], 0),
            'reward_xp': to_int(row['reward_xp'], 0),
        } for row in rows]
    except:
        return None


def get_weekly_metrics(conn, student_id, week_start):
    """Get weekly metrics for quest tracking."""
    try:
        row = conn.execute('''
            SELECT
                COUNT(*) as attempts,
                AVG(percentage) as avg_pct,
                SUM(CASE WHEN percentage >= 90 THEN 1 ELSE 0 END) as high_scores,
                SUM(CASE WHEN percentage >= 100 THEN 1 ELSE 0 END) as perfect_scores
            FROM attempts
            WHERE student_id = %s
              AND completed_at IS NOT NULL
              AND completed_at::date >= %s::date
        ''', (student_id, week_start)).fetchone()
        
        return {
            'attempts': to_int(row['attempts'], 0) if row else 0,
            'avg_pct': to_float(row['avg_pct'], 0) if row else 0,
            'high_scores': to_int(row['high_scores'], 0) if row else 0,
            'perfect_scores': to_int(row['perfect_scores'], 0) if row else 0,
        }
    except:
        return {'attempts': 0, 'avg_pct': 0, 'high_scores': 0, 'perfect_scores': 0}


def compute_quest_states(conn, student_id, week_start):
    """Compute quest progress for a student for the given week."""
    metrics = get_weekly_metrics(conn, student_id, week_start)
    dynamic_quests = get_active_quest_definitions(conn)
    
    # Default weekly quests (fallback if no database quests)
    default_quests = [
        {'code': 'weekly_3_quizzes', 'name': 'Weekly Warmup', 'description': 'Complete 3 quizzes this week.', 'reward_xp': 90, 'metric': 'attempts_weekly', 'target': 3},
        {'code': 'weekly_accuracy_80', 'name': 'Accuracy Builder', 'description': 'Average 80%+ across at least 3 quizzes this week.', 'reward_xp': 120, 'metric': 'avg_pct_weekly', 'target': 80, 'min_attempts': 3},
        {'code': 'weekly_high_score', 'name': 'Ace One', 'description': 'Score at least 90% once this week.', 'reward_xp': 70, 'metric': 'high_scores_weekly', 'target': 1},
    ]
    
    if dynamic_quests:
        quests = dynamic_quests
    else:
        quests = default_quests
    
    result = []
    for quest in quests:
        # Check if already claimed
        claimed_row = conn.execute('''
            SELECT id FROM student_quest_claims
            WHERE student_id = %s AND quest_code = %s AND week_start = %s
        ''', (student_id, quest['code'], week_start)).fetchone()
        claimed = claimed_row is not None
        
        # Calculate progress
        progress = 0
        complete = False
        
        if quest['metric'] == 'attempts_weekly':
            progress = metrics['attempts']
            complete = metrics['attempts'] >= to_int(quest.get('target', 0), 0)
        elif quest['metric'] == 'avg_pct_weekly':
            progress = round(metrics['avg_pct'])
            min_attempts = to_int(quest.get('min_attempts', 3), 3)
            complete = metrics['attempts'] >= min_attempts and metrics['avg_pct'] >= to_int(quest.get('target', 0), 0)
        elif quest['metric'] == 'high_scores_weekly':
            progress = metrics['high_scores']
            complete = metrics['high_scores'] >= to_int(quest.get('target', 0), 0)
        elif quest['metric'] == 'perfect_scores_weekly':
            progress = metrics['perfect_scores']
            complete = metrics['perfect_scores'] >= to_int(quest.get('target', 0), 0)
        
        result.append({
            'code': quest['code'],
            'name': quest['name'],
            'description': quest['description'],
            'reward_xp': to_int(quest.get('reward_xp', 0), 0),
            'progress': progress,
            'target': to_int(quest.get('target', 0), 0),
            'complete': complete,
            'claimed': claimed,
        })
    
    return result


def get_student_badges(conn, student_id):
    """Get all badges unlocked by a student."""
    badge_map = get_badge_definition_map(conn)
    
    try:
        rows = conn.execute('''
            SELECT badge_code, unlocked_at
            FROM student_badges
            WHERE student_id = %s
            ORDER BY unlocked_at DESC
        ''', (student_id,)).fetchall()
        
        return [{
            'code': row['badge_code'],
            'name': badge_map.get(row['badge_code'], {}).get('name', row['badge_code']),
            'description': badge_map.get(row['badge_code'], {}).get('description', ''),
            'icon': badge_map.get(row['badge_code'], {}).get('icon', 'badge'),
            'unlocked_at': row['unlocked_at'],
        } for row in rows]
    except:
        return []


def award_badge_if_eligible(conn, student_id, badge_code):
    """Award a badge if student hasn't already earned it."""
    badge_map = get_badge_definition_map(conn)
    badge = badge_map.get(badge_code)
    
    if not badge:
        return None
    
    if not badge.get('active', True):
        return None
    
    # Check if already has badge
    existing = conn.execute('''
        SELECT id FROM student_badges
        WHERE student_id = %s AND badge_code = %s
    ''', (student_id, badge_code)).fetchone()
    
    if existing:
        return None
    
    # Award badge
    conn.execute('''
        INSERT INTO student_badges (student_id, badge_code, unlocked_at)
        VALUES (%s, %s, CURRENT_TIMESTAMP)
    ''', (student_id, badge_code))
    
    # Log event
    conn.execute('''
        INSERT INTO gamification_events (student_id, event_type, points, detail_json)
        VALUES (%s, 'badge_earned', 0, %s)
    ''', (student_id, json.dumps({'badge_code': badge_code})))
    
    return {
        'code': badge_code,
        'name': badge.get('name', badge_code),
        'description': badge.get('description', ''),
        'icon': badge.get('icon', 'badge'),
    }


def apply_gamification_for_attempt(conn, student_id, attempt_id, quiz_code, percentage, total_questions, time_taken_seconds):
    """
    Apply gamification rewards for a completed attempt.
    FIXED: Return structure matches Node.js exactly for frontend compatibility.
    """
    # Get student info
    student = conn.execute('''
        SELECT * FROM students WHERE id = %s
    ''', (student_id,)).fetchone()
    
    if not student:
        return None
    
    pct = max(0, min(100, to_float(percentage, 0)))
    total = max(1, to_int(total_questions, 1))
    time_s = max(0, to_int(time_taken_seconds, 0))
    sec_per_question = time_s / total if total > 0 else 0
    
    today_date = datetime.datetime.utcnow().date()
    yesterday_date = today_date - datetime.timedelta(days=1)
    previous_streak = to_int(student['streak_days'], 0)
    previous_best_streak = to_int(student['best_streak_days'], 0)
    total_quizzes_before = to_int(student['total_quizzes'], 0)
    
    # Calculate streak
    last_activity = student['last_activity_date']
    if not last_activity:
        streak_after = 1
    elif last_activity == today_date:
        streak_after = previous_streak if previous_streak > 0 else 1
    elif last_activity == yesterday_date:
        streak_after = previous_streak + 1
    else:
        streak_after = 1
    
    best_streak_after = max(previous_best_streak, streak_after)
    
    # Calculate improvement from recent attempts
    try:
        prior_rows = conn.execute('''
            SELECT percentage
            FROM attempts
            WHERE student_id = %s
              AND completed_at IS NOT NULL
              AND id <> %s
            ORDER BY completed_at DESC
            LIMIT 5
        ''', (student_id, attempt_id)).fetchall()
        
        if prior_rows:
            prior_avg = sum(to_float(r['percentage'], 0) for r in prior_rows) / len(prior_rows)
        else:
            prior_avg = None
        
        improvement = pct - prior_avg if prior_avg is not None else 0
    except:
        improvement = 0
    
    # Check for anti-farming (same quiz repeated)
    try:
        same_quiz_row = conn.execute('''
            SELECT COUNT(*) as cnt
            FROM attempts
            WHERE student_id = %s
              AND quiz_code = %s
              AND completed_at IS NOT NULL
              AND completed_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'
              AND id <> %s
        ''', (student_id, quiz_code, attempt_id)).fetchone()
        same_quiz_recent_count = to_int(same_quiz_row['cnt'], 0) if same_quiz_row else 0
    except:
        same_quiz_recent_count = 0
    
    anti_farming_multiplier = 1
    if same_quiz_recent_count >= 2:
        anti_farming_multiplier = 0.6
    elif same_quiz_recent_count == 1:
        anti_farming_multiplier = 0.8
    
    # Calculate XP
    base_xp = 35
    accuracy_xp = round(pct * 1.1)
    
    speed_xp = 0
    if 0 < sec_per_question <= 45:
        speed_xp = 30
    elif sec_per_question <= 75:
        speed_xp = 20
    elif sec_per_question <= 120:
        speed_xp = 10
    
    improvement_xp = 0
    if improvement >= 15:
        improvement_xp = 35
    elif improvement >= 8:
        improvement_xp = 20
    elif improvement >= 4:
        improvement_xp = 10
    
    streak_xp = min(30, streak_after * 3)
    
    raw_xp = base_xp + accuracy_xp + speed_xp + improvement_xp + streak_xp
    quiz_xp = max(15, round(raw_xp * anti_farming_multiplier))
    
    # Process quests
    week_start = start_of_iso_week(today_date)
    quest_states = compute_quest_states(conn, student_id, week_start)
    claimed_quests = []
    quest_xp = 0
    
    for quest in quest_states:
        if not quest['complete'] or quest['claimed']:
            continue
        
        conn.execute('''
            INSERT INTO student_quest_claims (student_id, quest_code, week_start, points_awarded)
            VALUES (%s, %s, %s, %s)
        ''', (student_id, quest['code'], week_start, quest['reward_xp']))
        
        quest_xp += to_int(quest.get('reward_xp', 0), 0)
        claimed_quests.append({
            'code': quest['code'],
            'name': quest['name'],
            'reward_xp': quest['reward_xp'],
        })
    
    total_xp_gain = quiz_xp + quest_xp
    xp_before = to_int(student['xp'], 0)
    level_before = max(1, to_int(student['level'], 1))
    total_quizzes_after = total_quizzes_before + 1
    xp_after = xp_before + to_int(total_xp_gain, 0)
    level_after = level_from_xp(xp_after)
    
    # Update student
    conn.execute('''
        UPDATE students
        SET xp = %s, level = %s, streak_days = %s, best_streak_days = %s, total_quizzes = %s, last_activity_date = %s
        WHERE id = %s
    ''', (xp_after, level_after, streak_after, best_streak_after, total_quizzes_after, today_date, student_id))
    
    # Award badges
    unlocked_badges = []
    
    # Count high scores for badge check
    try:
        high_score_row = conn.execute('''
            SELECT COUNT(*) as cnt
            FROM attempts
            WHERE student_id = %s
              AND completed_at IS NOT NULL
              AND percentage >= 90
        ''', (student_id,)).fetchone()
        high_score_count = to_int(high_score_row['cnt'], 0) if high_score_row else 0
    except:
        high_score_count = 0
    
    # Check and award badges
    if total_quizzes_after >= 1:
        badge = award_badge_if_eligible(conn, student_id, 'first_quiz')
        if badge:
            unlocked_badges.append(badge)
    
    if streak_after >= 3:
        badge = award_badge_if_eligible(conn, student_id, 'streak_3')
        if badge:
            unlocked_badges.append(badge)
    
    if streak_after >= 7:
        badge = award_badge_if_eligible(conn, student_id, 'streak_7')
        if badge:
            unlocked_badges.append(badge)
    
    if pct >= 100:
        badge = award_badge_if_eligible(conn, student_id, 'perfect_100')
        if badge:
            unlocked_badges.append(badge)
    
    if total_quizzes_after >= 10:
        badge = award_badge_if_eligible(conn, student_id, 'quiz_10')
        if badge:
            unlocked_badges.append(badge)
    
    if total_quizzes_after >= 25:
        badge = award_badge_if_eligible(conn, student_id, 'quiz_25')
        if badge:
            unlocked_badges.append(badge)
    
    if high_score_count >= 5:
        badge = award_badge_if_eligible(conn, student_id, 'high_achiever')
        if badge:
            unlocked_badges.append(badge)
    
    if level_after >= 5:
        badge = award_badge_if_eligible(conn, student_id, 'level_5')
        if badge:
            unlocked_badges.append(badge)
    
    # Check quest champion badge
    post_claim_states = compute_quest_states(conn, student_id, week_start)
    all_weekly_claimed = len(post_claim_states) > 0 and all(q['claimed'] for q in post_claim_states)
    if all_weekly_claimed:
        badge = award_badge_if_eligible(conn, student_id, 'quest_champion')
        if badge:
            unlocked_badges.append(badge)
    
    # Check database-defined auto-award badges
    hardcoded_badges = {'first_quiz', 'streak_3', 'streak_7', 'perfect_100', 'quiz_10', 'quiz_25', 'high_achiever', 'level_5', 'quest_champion'}
    
    try:
        auto_badges = conn.execute('''
            SELECT code, name, description, icon, auto_award, criteria_type, target_value
            FROM badge_definitions
            WHERE active = TRUE AND auto_award = TRUE
        ''').fetchall()
        
        for badge in auto_badges:
            if badge['code'] in hardcoded_badges:
                continue
            
            # Check if already has badge
            existing = conn.execute('''
                SELECT 1 FROM student_badges
                WHERE student_id = %s AND badge_code = %s
            ''', (student_id, badge['code'])).fetchone()
            if existing:
                continue
            
            # Check criteria
            should_award = False
            criteria_type = badge['criteria_type'] or 'quizzes_completed'
            target_value = badge['target_value'] or 1
            
            if criteria_type == 'quizzes_completed':
                should_award = total_quizzes_after >= target_value
            elif criteria_type == 'score_percent':
                should_award = pct >= target_value
            elif criteria_type == 'streak_days':
                should_award = streak_after >= target_value
            elif criteria_type == 'level_reached':
                should_award = level_after >= target_value
            elif criteria_type == 'correct_answers':
                try:
                    correct_row = conn.execute('''
                        SELECT COUNT(*) as cnt FROM answers ans
                        INNER JOIN attempts a ON a.id = ans.attempt_id
                        WHERE a.student_id = %s AND ans.is_correct = 1
                    ''', (student_id,)).fetchone()
                    should_award = to_int(correct_row['cnt'], 0) >= target_value
                except:
                    pass
            
            if should_award:
                awarded = award_badge_if_eligible(conn, student_id, badge['code'])
                if awarded:
                    unlocked_badges.append(awarded)
    except:
        pass
    
    # Log gamification events
    conn.execute('''
        INSERT INTO gamification_events (student_id, attempt_id, event_type, points, detail_json)
        VALUES (%s, %s, %s, %s, %s)
    ''', (
        student_id,
        attempt_id,
        'quiz_completion',
        quiz_xp,
        json.dumps({
            'percentage': pct,
            'total_questions': total,
            'time_taken_s': time_s,
            'base_xp': base_xp,
            'accuracy_xp': accuracy_xp,
            'speed_xp': speed_xp,
            'improvement_xp': improvement_xp,
            'streak_xp': streak_xp,
            'anti_farming_multiplier': anti_farming_multiplier,
        })
    ))
    
    for quest in claimed_quests:
        conn.execute('''
            INSERT INTO gamification_events (student_id, attempt_id, event_type, points, detail_json)
            VALUES (%s, %s, %s, %s, %s)
        ''', (
            student_id,
            attempt_id,
            'quest_reward',
            quest['reward_xp'],
            json.dumps({
                'quest_code': quest['code'],
                'quest_name': quest['name'],
                'week_start': week_start,
            })
        ))
    
    conn.commit()
    
    # Return rewards structure matching Node.js exactly
    return {
        'xp_gained': total_xp_gain,
        'xp_breakdown': {
            'quiz_xp': quiz_xp,
            'quest_xp': quest_xp,
            'base_xp': base_xp,
            'accuracy_xp': accuracy_xp,
            'speed_xp': speed_xp,
            'improvement_xp': improvement_xp,
            'streak_xp': streak_xp,
            'anti_farming_multiplier': anti_farming_multiplier,
        },
        'level_before': level_before,
        'level_after': level_after,
        'level_up': level_after > level_before,  # FIXED: Added for frontend
        'streak_before': previous_streak,
        'streak_after': streak_after,
        'best_streak_after': best_streak_after,
        'unlocked_badges': unlocked_badges,  # FIXED: was badges_earned
        'completed_quests': claimed_quests,  # FIXED: Added for frontend
        'week_start': week_start,
    }
