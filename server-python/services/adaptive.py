"""
Adaptive learning service for Python server.
Provides adaptive question selection based on student performance.
"""
import json


def build_adaptive_plan(db, student_id, topic=None, chapter=None, subtopics=None, question_count=5):
    """
    Build an adaptive learning plan based on student's history.
    Returns a plan with difficulty distribution based on performance.
    """
    subtopics = subtopics or []

    # Get student's performance history
    history = _get_student_history(db, student_id, topic, chapter, subtopics)

    if not history or len(history) < 3:
        # Not enough history, use default plan
        return build_default_plan(topic, chapter, subtopics, question_count)

    # Calculate mastery level
    total_questions = sum(h['total_questions'] for h in history)
    correct_questions = sum(h['correct_questions'] for h in history)

    accuracy = correct_questions / total_questions if total_questions > 0 else 0.5

    # Determine difficulty distribution based on accuracy
    if accuracy >= 0.85:
        # Strong performance - more advanced questions
        distribution = {'foundation': 10, 'core': 30, 'advanced': 60}
        trend = 'improving'
    elif accuracy >= 0.60:
        # Moderate performance - balanced
        distribution = {'foundation': 20, 'core': 60, 'advanced': 20}
        trend = 'stable'
    else:
        # Struggling - more foundation questions
        distribution = {'foundation': 60, 'core': 30, 'advanced': 10}
        trend = 'declining'

    # Allocate questions
    allocated = _allocate_distribution(question_count, distribution)

    # Identify weak areas
    weak_skills = _identify_weak_skills(db, student_id, topic, subtopics)

    return {
        'topic': topic,
        'chapter': chapter,
        'subtopics': subtopics,
        'question_count': question_count,
        'difficulty_distribution_pct': distribution,
        'difficulty_distribution_count': allocated,
        'mastery_overall': round(accuracy * 100),
        'recent_accuracy': round(accuracy * 100),
        'trend': trend,
        'weak_skills': weak_skills[:5],
        'has_history': True,
        'adaptive_enabled': True,
    }


def build_default_plan(topic=None, chapter=None, subtopics=None, question_count=5):
    """Build a default learning plan with balanced difficulty."""
    distribution = {'foundation': 35, 'core': 50, 'advanced': 15}
    allocated = _allocate_distribution(question_count, distribution)

    return {
        'topic': topic,
        'chapter': chapter,
        'subtopics': subtopics or [],
        'question_count': question_count,
        'difficulty_distribution_pct': distribution,
        'difficulty_distribution_count': allocated,
        'mastery_overall': None,
        'recent_accuracy': None,
        'trend': 'unknown',
        'weak_skills': [],
        'has_history': False,
        'adaptive_enabled': False,
    }


def _get_student_history(db, student_id, topic=None, chapter=None, subtopics=None):
    """Get student's answer history for adaptive planning."""
    query = '''
        SELECT
            ans.skill_tag,
            ans.difficulty,
            COUNT(*) as total_questions,
            SUM(CASE WHEN ans.is_correct = 1 THEN 1 ELSE 0 END) as correct_questions
        FROM answers ans
        INNER JOIN attempts a ON a.id = ans.attempt_id
        LEFT JOIN quizzes q ON q.code = a.quiz_code
        WHERE a.student_id = ? AND a.completed_at IS NOT NULL
    '''

    params = [student_id]

    if topic:
        query += ' AND (q.topic = ? OR q.chapter = ?)'
        params.extend([topic, topic])

    if subtopics:
        subtopic_conditions = ' OR '.join(['ans.skill_tag = ?' for _ in subtopics])
        query += f' AND ({subtopic_conditions})'
        params.extend(subtopics)

    query += ' GROUP BY ans.skill_tag, ans.difficulty'

    try:
        results = db.execute(query, params).fetchall()
        return [dict(r) for r in results]
    except:
        return []


def _identify_weak_skills(db, student_id, topic=None, subtopics=None):
    """Identify skills where student needs improvement."""
    query = '''
        SELECT
            COALESCE(NULLIF(TRIM(ans.skill_tag), ''), 'General') as skill,
            COUNT(*) as questions_answered,
            AVG(CASE WHEN ans.is_correct = 1 THEN 1.0 ELSE 0.0 END) as accuracy
        FROM answers ans
        INNER JOIN attempts a ON a.id = ans.attempt_id
        WHERE a.student_id = ?
    '''

    params = [student_id]

    if subtopics:
        subtopic_conditions = ' OR '.join(['ans.skill_tag = ?' for _ in subtopics])
        query += f' AND ({subtopic_conditions})'
        params.extend(subtopics)

    query += '''
        GROUP BY COALESCE(NULLIF(TRIM(ans.skill_tag), ''), 'General')
        HAVING COUNT(*) >= 2
        ORDER BY accuracy ASC
        LIMIT 10
    '''

    try:
        results = db.execute(query, params).fetchall()
        return [
            {
                'skill': r['skill'],
                'questions_answered': r['questions_answered'],
                'accuracy': round(r['accuracy'] * 100),
            }
            for r in results
        ]
    except:
        return []


def _allocate_distribution(total_count, distribution_pct):
    """Allocate question count based on difficulty distribution percentages."""
    keys = ['foundation', 'core', 'advanced']
    raw = [(k, distribution_pct.get(k, 0) * total_count / 100) for k in keys]

    base = {}
    assigned = 0

    for key, value in raw:
        base[key] = int(value)
        assigned += base[key]

    remainder = max(0, total_count - assigned)
    raw.sort(key=lambda x: x[1] - int(x[1]), reverse=True)

    idx = 0
    while remainder > 0 and raw:
        key = raw[idx % len(raw)][0]
        base[key] += 1
        remainder -= 1
        idx += 1

    return base
