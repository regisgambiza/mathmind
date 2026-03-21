from flask import Blueprint, request, jsonify, current_app
import db
import json
from datetime import datetime
from services.adaptive import build_adaptive_plan, build_default_plan
from services.curriculum_loader import build_curriculum_context

router = Blueprint('practice', __name__)


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


def sanitize_text(value):
    return str(value or '').strip()[:200]


def normalize_difficulty(value):
    raw = str(value or '').strip().lower()
    if raw == 'foundation' or raw == 'easy':
        return 'foundation'
    if raw == 'advanced' or raw == 'hard':
        return 'advanced'
    return 'core'


def allocate_distribution(total_count, distribution_pct):
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


@router.route('/start', methods=['POST'])
def start_practice():
    import traceback as tb
    data = request.get_json()
    student_id = data.get('student_id')
    mode = data.get('mode', 'skill')
    skill = data.get('skill')
    topic = data.get('topic')
    quiz_code = data.get('quiz_code')
    count = data.get('count', 5)
    difficulty_focus = data.get('difficulty_focus', 'adaptive')

    if not student_id:
        return jsonify({'error': 'student_id is required'}), 400

    if mode == 'skill' and not skill:
        return jsonify({'error': 'skill is required for skill mode'}), 400

    if mode == 'topic' and not topic:
        return jsonify({'error': 'topic is required for topic mode'}), 400

    if mode == 'quiz_prep' and not quiz_code:
        return jsonify({'error': 'quiz_code is required for quiz_prep mode'}), 400

    try:
        conn = db.get_db()

        # Verify student exists
        student = conn.execute('SELECT id, name FROM students WHERE id = %s', (student_id,)).fetchone()
        if not student:
            return jsonify({'error': 'Student not found'}), 404

        # Get quiz info for quiz_prep mode
        quiz_info = None
        target_topic = topic or skill
        target_chapter = None
        target_subtopics = []

        if mode == 'quiz_prep':
            quiz_info = conn.execute('SELECT * FROM quizzes WHERE code = %s', (quiz_code.upper(),)).fetchone()
            if not quiz_info:
                return jsonify({'error': 'Quiz not found'}), 404
            target_topic = quiz_info['topic']
            target_chapter = quiz_info['chapter']
            if quiz_info['subtopic']:
                try:
                    target_subtopics = json.loads(quiz_info['subtopic'])
                except:
                    pass

        # Build adaptive plan based on mode
        plan = None
        if difficulty_focus == 'adaptive':
            plan = build_adaptive_plan(
                conn, student_id, target_topic, target_chapter,
                target_subtopics if target_subtopics else ([skill] if skill else []),
                count
            )
        else:
            # Fixed difficulty distribution
            distribution_pct = {
                'foundation': 80, 'core': 15, 'advanced': 5
            } if difficulty_focus == 'foundation' else (
                { 'foundation': 20, 'core': 60, 'advanced': 20 }
                if difficulty_focus == 'core' else (
                    { 'foundation': 10, 'core': 30, 'advanced': 60 }
                    if difficulty_focus == 'advanced' else
                    { 'foundation': 35, 'core': 50, 'advanced': 15 }
                )
            )

            plan = build_default_plan(target_topic, target_chapter, [skill] if skill else target_subtopics, count)
            plan['difficulty_distribution_pct'] = distribution_pct
            plan['difficulty_distribution_count'] = allocate_distribution(count, distribution_pct)

        # Create practice session record
        practice_code = f"PRACTICE-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')[:17].upper()}"

        # Insert a quiz record for tracking
        conn.execute('''
            INSERT INTO quizzes (
                code, topic, chapter, subtopic, activity_type, grade,
                question_types, q_count, extra_instructions
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ''', (
            practice_code,
            target_topic or 'Practice',
            target_chapter,
            json.dumps([skill]) if skill else (json.dumps(target_subtopics) if target_subtopics else None),
            'practice',
            quiz_info['grade'] if quiz_info else '7',
            json.dumps(['multiple_choice', 'true_false', 'numeric_response']),
            count,
            json.dumps({
                'mode': mode,
                'original_quiz_code': quiz_code,
                'target_skill': skill,
                'is_practice': True,
            })
        ))
        conn.commit()

        # Create attempt for this practice session
        cursor = conn.execute('''
            INSERT INTO attempts (quiz_code, student_id, student_name, status)
            VALUES (%s, %s, %s, 'practice')
        ''', (practice_code, student_id, student['name']))
        conn.commit()

        return jsonify({
            'success': True,
            'practice_session': {
                'attempt_id': cursor.lastrowid,
                'practice_code': practice_code,
                'mode': mode,
                'skill': skill,
                'topic': target_topic,
                'quiz_code': quiz_code.upper() if quiz_code else None,
                'question_count': count,
                'difficulty_focus': difficulty_focus,
                'plan': plan,
            },
        })
    except Exception as e:
        # FIXED: Log full error traceback for debugging
        print(f"[PRACTICE ERROR] {e}")
        print(tb.format_exc())
        return jsonify({'error': str(e), 'type': type(e).__name__}), 500


@router.route('/next-question', methods=['POST'])
def get_next_adaptive_question():
    """
    FIXED: Generate next question based on real-time performance.
    Works for ALL quiz types: practice, class activities, topic quizzes.
    
    ADAPTIVE LEVELS:
    - Level 0 (none): No adaptation, questions stay as generated
    - Level 1 (light): Show encouragement/warning messages only, no difficulty change
    - Level 2 (medium): Adjust after 3+ consecutive same performance, subtle changes
    - Level 3 (max): Full adaptation, adjust after 2 wrong or 3 correct (current behavior)
    """
    import traceback as tb
    data = request.get_json()
    attempt_id = data.get('attempt_id')
    previous_correct = data.get('previous_correct', True)
    consecutive_wrong = data.get('consecutive_wrong', 0)
    consecutive_correct = data.get('consecutive_correct', 0)
    current_difficulty = data.get('current_difficulty', 'core')
    skill_tag = data.get('skill_tag')
    topic = data.get('topic')
    chapter = data.get('chapter')
    question_types = data.get('question_types', ['multiple_choice'])
    adaptive_level = data.get('adaptive_level', 'max')  # none, light, medium, max
    
    try:
        conn = db.get_db()
        
        # Get attempt info
        attempt = conn.execute('''
            SELECT a.*, q.topic, q.chapter, q.grade, q.question_types
            FROM attempts a
            LEFT JOIN quizzes q ON q.code = a.quiz_code
            WHERE a.id = %s
        ''', (attempt_id,)).fetchone()
        
        if not attempt:
            return jsonify({'error': 'Attempt not found'}), 404
        
        # ADAPTIVE LEVEL 0: No adaptation
        if adaptive_level == 'none':
            return jsonify({
                'success': True,
                'next_difficulty': current_difficulty,
                'adjustment_reason': 'none',
                'adjustment_message': '',
                'prompt': None,  # No new question generation
                'question_type': None,
                'adaptive_level': 'none',
                'context': {
                    'topic': topic or attempt['topic'],
                    'chapter': chapter or attempt['chapter'],
                    'skill': skill_tag,
                    'consecutive_correct': consecutive_correct,
                    'consecutive_wrong': consecutive_wrong,
                    'grade': attempt['grade'],
                }
            })
        
        # Determine next difficulty based on adaptive level
        next_difficulty = current_difficulty
        adjustment_reason = 'none'
        adjustment_msg = ''
        should_generate = False
        
        if adaptive_level == 'light':
            # Level 1: Messages only, no difficulty change
            if consecutive_wrong >= 3:
                adjustment_msg = "Take your time. Review each question carefully."
                adjustment_reason = 'encouragement'
            elif consecutive_correct >= 5:
                adjustment_msg = "Excellent work! Keep it up!"
                adjustment_reason = 'praise'
            # No difficulty change, no new question generation
        
        elif adaptive_level == 'medium':
            # Level 2: Adjust after 3+ consecutive same performance
            if consecutive_wrong >= 3:
                next_difficulty = 'foundation'
                adjustment_reason = 'consecutive_wrong'
                adjustment_msg = "Let's review the basics. Next question will be simpler."
                should_generate = True
            elif consecutive_correct >= 4:
                next_difficulty = 'advanced' if current_difficulty != 'advanced' else current_difficulty
                adjustment_reason = 'consecutive_correct'
                adjustment_msg = "Great job! Ready for a challenge?"
                should_generate = True
        
        elif adaptive_level == 'max':
            # Level 3: Full adaptation (current behavior)
            if consecutive_wrong >= 2:
                next_difficulty = 'foundation'
                adjustment_reason = 'consecutive_wrong'
                adjustment_msg = "Let's focus on the fundamentals."
                should_generate = True
            elif consecutive_correct >= 3:
                next_difficulty = 'advanced'
                adjustment_reason = 'consecutive_correct'
                adjustment_msg = "You're crushing it! Time for a challenge."
                should_generate = True
            elif not previous_correct:
                next_difficulty = 'foundation' if current_difficulty == 'advanced' else current_difficulty
                adjustment_reason = 'last_wrong'
                adjustment_msg = "Let's review this concept."
                should_generate = next_difficulty != current_difficulty
            elif previous_correct:
                next_difficulty = 'advanced' if current_difficulty == 'foundation' else current_difficulty
                adjustment_reason = 'last_correct'
                adjustment_msg = "Great work! Let's build on that."
                should_generate = next_difficulty != current_difficulty
        
        # Parse question types from database
        db_question_types = attempt['question_types']
        if db_question_types:
            try:
                parsed_types = json.loads(db_question_types)
                if isinstance(parsed_types, list) and len(parsed_types) > 0:
                    question_types = parsed_types
            except:
                pass
        
        # Select random question type from available types
        import random
        selected_type = random.choice(question_types) if question_types and should_generate else 'multiple_choice'
        
        # Build prompt for AI to generate adaptive question (only if should_generate)
        prompt = None
        if should_generate and next_difficulty != current_difficulty:
            # Get curriculum context for better question alignment
            grade_level = attempt['grade'] or '7'
            curriculum_ctx = build_curriculum_context(
                grade=int(grade_level) if grade_level.isdigit() else 7,
                topic_name=topic or attempt['topic'],
                chapter=chapter or attempt['chapter'],
                subtopic=skill_tag
            )
            
            prompt = f"""{curriculum_ctx}

GENERATION TASK:
Generate a {next_difficulty} difficulty math question aligned with the curriculum above.

Question Type: {selected_type}

Student Performance Context:
- Consecutive correct: {consecutive_correct}
- Consecutive wrong: {consecutive_wrong}
- Previous difficulty: {current_difficulty}
- Adjustment: {adjustment_reason} ({adjustment_msg})

Return ONLY a valid JSON object matching this structure for type "{selected_type}":

For multiple_choice:
{{
  "type": "multiple_choice",
  "question": "What is...?",
  "options": ["A. option1", "B. option2", "C. option3", "D. option4"],
  "answer": "B",
  "difficulty": "{next_difficulty}",
  "skill_tag": "{skill_tag or 'General'}",
  "explanation": "Why this is correct",
  "hint": "Helpful hint"
}}

For true_false:
{{
  "type": "true_false",
  "question": "Statement here...",
  "answer": "True",
  "difficulty": "{next_difficulty}",
  "skill_tag": "{skill_tag or 'General'}",
  "explanation": "Why this is correct",
  "hint": "Helpful hint"
}}

For numeric_response:
{{
  "type": "numeric_response",
  "question": "Calculate...",
  "answers": ["5"],
  "tolerance": 0,
  "unit": "",
  "difficulty": "{next_difficulty}",
  "skill_tag": "{skill_tag or 'General'}",
  "explanation": "Why this is correct",
  "hint": "Helpful hint"
}}

For matching:
{{
  "type": "matching",
  "question": "Match each item with its answer:",
  "pairs": [{{"left": "Item 1", "right": "Answer 1"}}, {{"left": "Item 2", "right": "Answer 2"}}],
  "difficulty": "{next_difficulty}",
  "skill_tag": "{skill_tag or 'General'}",
  "explanation": "Why this is correct",
  "hint": "Helpful hint"
}}

For multi_select:
{{
  "type": "multi_select",
  "question": "Select all that apply...",
  "options": ["A. option1", "B. option2", "C. option3", "D. option4"],
  "correct_answers": ["A", "C"],
  "difficulty": "{next_difficulty}",
  "skill_tag": "{skill_tag or 'General'}",
  "explanation": "Why these are correct",
  "hint": "Helpful hint"
}}

For open_ended:
{{
  "type": "open_ended",
  "question": "Explain or solve...",
  "sample_answer": "Sample solution here",
  "keywords": ["key", "words"],
  "difficulty": "{next_difficulty}",
  "skill_tag": "{skill_tag or 'General'}",
  "explanation": "Sample explanation",
  "hint": "Helpful hint"
}}

For fill_blank:
{{
  "type": "fill_blank",
  "question": "Complete: The answer is ___.",
  "answers": [["five", "5"], ["ten", "10"]],
  "difficulty": "{next_difficulty}",
  "skill_tag": "{skill_tag or 'General'}",
  "explanation": "Why this is correct",
  "hint": "Helpful hint"
}}

For ordering:
{{
  "type": "ordering",
  "question": "Arrange in order...",
  "items": ["item1", "item2", "item3"],
  "correct_order": ["item2", "item1", "item3"],
  "difficulty": "{next_difficulty}",
  "skill_tag": "{skill_tag or 'General'}",
  "explanation": "Why this order is correct",
  "hint": "Helpful hint"
}}

For error_analysis:
{{
  "type": "error_analysis",
  "question": "Find the error in this solution...",
  "incorrect_solution": "2 + 2 = 5",
  "error_description": "What went wrong",
  "correction": "2 + 2 = 4",
  "keywords": ["addition", "correct"],
  "difficulty": "{next_difficulty}",
  "skill_tag": "{skill_tag or 'General'}",
  "explanation": "Why this is the error",
  "hint": "Helpful hint"
}}

Do NOT include markdown code blocks. Return raw JSON only."""
        
        return jsonify({
            'success': True,
            'next_difficulty': next_difficulty,
            'adjustment_reason': adjustment_reason,
            'adjustment_message': adjustment_msg,
            'prompt': prompt,
            'question_type': selected_type if should_generate else None,
            'should_generate': should_generate,
            'adaptive_level': adaptive_level,
            'context': {
                'topic': topic or attempt['topic'],
                'chapter': chapter or attempt['chapter'],
                'skill': skill_tag,
                'consecutive_correct': consecutive_correct,
                'consecutive_wrong': consecutive_wrong,
                'grade': attempt['grade'],
            }
        })
        
    except Exception as e:
        print(f"[ADAPTIVE NEXT QUESTION ERROR] {e}")
        print(tb.format_exc())
        return jsonify({'error': str(e), 'type': type(e).__name__}), 500


@router.route('/submit', methods=['POST'])
def submit_practice():
    data = request.get_json()
    attempt_id = data.get('attempt_id')
    q_index = data.get('q_index')
    student_answer = data.get('student_answer')
    correct_answer = data.get('correct_answer')
    skill_tag = data.get('skill_tag')
    difficulty = data.get('difficulty')
    question_text = data.get('question_text')
    q_type = data.get('q_type', 'multiple_choice')
    time_taken_s = data.get('time_taken_s', 0)

    if attempt_id is None or q_index is None or student_answer is None or correct_answer is None:
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        conn = db.get_db()

        # Verify attempt exists and is a practice session
        attempt = conn.execute('''
            SELECT a.*, q.activity_type
            FROM attempts a
            LEFT JOIN quizzes q ON q.code = a.quiz_code
            WHERE a.id = %s
        ''', (attempt_id,)).fetchone()

        if not attempt:
            return jsonify({'error': 'Attempt not found'}), 404

        if attempt['activity_type'] != 'practice':
            return jsonify({'error': 'This is not a practice attempt'}), 400

        # Determine if answer is correct
        is_correct = False
        if isinstance(student_answer, str) and isinstance(correct_answer, str):
            is_correct = student_answer.strip().lower() == correct_answer.strip().lower()
        else:
            is_correct = json.dumps(student_answer) == json.dumps(correct_answer)

        # Save the answer
        conn.execute('''
            INSERT INTO answers
            (attempt_id, q_index, q_type, skill_tag, difficulty, question_text, student_answer, correct_answer, is_correct, time_taken_s)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ''', (
            attempt_id,
            q_index,
            q_type,
            sanitize_text(skill_tag) or 'Practice',
            normalize_difficulty(difficulty),
            question_text or '',
            student_answer if isinstance(student_answer, str) else json.dumps(student_answer),
            correct_answer if isinstance(correct_answer, str) else json.dumps(correct_answer),
            1 if is_correct else 0,
            to_int(time_taken_s, 0)
        ))
        conn.commit()

        # Get updated attempt stats
        answers = conn.execute('SELECT * FROM answers WHERE attempt_id = %s', (attempt_id,)).fetchall()
        correct_count = sum(1 for a in answers if a['is_correct'] == 1)
        total_count = len(answers)
        percentage = round((correct_count / total_count) * 100) if total_count > 0 else 0

        # Update attempt progress
        conn.execute('''
            UPDATE attempts
            SET score = %s, total = %s, percentage = %s
            WHERE id = %s
        ''', (correct_count, total_count, percentage, attempt_id))
        conn.commit()

        return jsonify({
            'success': True,
            'is_correct': is_correct,
            'correct_answer': correct_answer,
            'student_answer': student_answer,
            'progress': {
                'answered': total_count,
                'correct': correct_count,
                'percentage': percentage,
            },
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/complete', methods=['POST'])
def complete_practice():
    data = request.get_json()
    attempt_id = data.get('attempt_id')

    if not attempt_id:
        return jsonify({'error': 'attempt_id is required'}), 400

    try:
        conn = db.get_db()

        attempt = conn.execute('''
            SELECT a.*, q.activity_type, q.topic, q.chapter
            FROM attempts a
            LEFT JOIN quizzes q ON q.code = a.quiz_code
            WHERE a.id = %s
        ''', (attempt_id,)).fetchone()

        if not attempt:
            return jsonify({'error': 'Attempt not found'}), 404

        if attempt['activity_type'] != 'practice':
            return jsonify({'error': 'This is not a practice attempt'}), 400

        # Mark as completed
        conn.execute('''
            UPDATE attempts
            SET status = 'completed', completed_at = CURRENT_TIMESTAMP
            WHERE id = %s
        ''', (attempt_id,))
        conn.commit()

        # Award small XP for practice completion
        xp_earned = 15 if attempt['percentage'] >= 80 else (10 if attempt['percentage'] >= 60 else 5)

        conn.execute('''
            UPDATE students
            SET xp = xp + %s, total_quizzes = total_quizzes + 1, last_activity_date = CURRENT_DATE
            WHERE id = %s
        ''', (xp_earned, attempt['student_id']))
        conn.commit()

        # Log gamification event
        conn.execute('''
            INSERT INTO gamification_events (student_id, attempt_id, event_type, points, detail_json)
            VALUES (%s, %s, 'practice_complete', %s, %s)
        ''', (
            attempt['student_id'],
            attempt_id,
            xp_earned,
            json.dumps({'percentage': attempt['percentage'], 'topic': attempt['topic']})
        ))
        conn.commit()

        return jsonify({
            'success': True,
            'xp_earned': xp_earned,
            'final_percentage': attempt['percentage'],
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<student_id>/recommendations', methods=['GET'])
def get_recommendations(student_id):
    student_id = to_int(student_id, 0)

    if not student_id:
        return jsonify({'error': 'Invalid student_id'}), 400

    try:
        conn = db.get_db()

        # Get student's mastery data
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
            WHERE a.student_id = %s AND a.completed_at IS NOT NULL
            GROUP BY COALESCE(NULLIF(TRIM(ans.skill_tag), ''), COALESCE(q.chapter, q.topic, 'General'))
            HAVING COUNT(*) >= 1
            ORDER BY accuracy_ratio ASC, questions_answered DESC
            LIMIT 20
        ''', (student_id,)).fetchall()

        # Get upcoming quizzes
        upcoming_quizzes = conn.execute('''
            SELECT DISTINCT q.code, q.topic, q.chapter, q.release_at, q.close_at
            FROM quizzes q
            WHERE q.activity_type = 'class_activity'
              AND (q.release_at IS NULL OR q.release_at::timestamptz <= CURRENT_TIMESTAMP)
              AND (q.close_at IS NULL OR q.close_at::timestamptz > CURRENT_TIMESTAMP)
            LIMIT 5
        ''').fetchall()

        # Build recommendations
        weak_skills = []
        for m in mastery:
            if m['accuracy_ratio'] < 0.6:
                weak_skills.append({
                    'skill': m['topic'],
                    'mastery': round(m['accuracy_ratio'] * 100),
                    'questions_answered': m['questions_answered'],
                    'priority': 'high',
                    'reason': 'Low accuracy - needs reinforcement',
                })

        recommended_topics = []

        # Add weak skill recommendations
        for weak in weak_skills[:3]:
            recommended_topics.append({
                **weak,
                'mode': 'skill',
                'suggested_count': 5,
            })

        # Add quiz prep recommendations
        for quiz in upcoming_quizzes:
            quiz_mastery = None
            for m in mastery:
                if m['topic'].lower() == quiz['topic'].lower() or m['topic'].lower() == (quiz['chapter'] or '').lower():
                    quiz_mastery = m
                    break

            if not quiz_mastery or quiz_mastery['accuracy_ratio'] < 0.75:
                recommended_topics.append({
                    'skill': quiz['topic'],
                    'topic': quiz['topic'],
                    'chapter': quiz['chapter'],
                    'mastery': round(quiz_mastery['accuracy_ratio'] * 100) if quiz_mastery else 0,
                    'priority': 'medium' if quiz_mastery else 'high',
                    'reason': f"Prepare for quiz: {quiz['code']}" if quiz_mastery else f"New topic - upcoming quiz {quiz['code']}",
                    'mode': 'quiz_prep',
                    'quiz_code': quiz['code'],
                    'suggested_count': 10,
                })

        return jsonify({
            'student_id': student_id,
            'recommendations': recommended_topics[:10],
            'weak_skills': weak_skills,
            'upcoming_quizzes': [dict(q) for q in upcoming_quizzes],
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/quiz/<code>/practice', methods=['GET'])
def get_quiz_practice(code):
    try:
        conn = db.get_db()
        quiz = conn.execute('SELECT * FROM quizzes WHERE code = %s', (code.upper(),)).fetchone()

        if not quiz:
            return jsonify({'error': 'Quiz not found'}), 404

        subtopics = []
        if quiz['subtopic']:
            try:
                subtopics = json.loads(quiz['subtopic'])
            except:
                pass

        return jsonify({
            'success': True,
            'practice_config': {
                'quiz_code': code.upper(),
                'topic': quiz['topic'],
                'chapter': quiz['chapter'],
                'subtopics': subtopics,
                'grade': quiz['grade'],
                'question_types': json.loads(quiz['question_types']) if quiz['question_types'] else ['multiple_choice'],
                'suggested_count': quiz['q_count'] or 10,
                'difficulty': quiz['difficulty'] or 'core',
            },
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
