from flask import Blueprint, request, jsonify, current_app
import db

router = Blueprint('violations', __name__)


@router.route('/', methods=['POST'])
def create_violation():
    data = request.get_json()
    attempt_id = data.get('attempt_id')
    quiz_code = data.get('quiz_code')
    student_name = data.get('student_name')
    violation_num = data.get('violation_num')
    left_at = data.get('left_at')
    returned_at = data.get('returned_at')
    away_seconds = data.get('away_seconds')
    
    try:
        conn = db.get_db()
        conn.execute('''
            INSERT INTO violations (attempt_id, quiz_code, student_name, violation_num, left_at, returned_at, away_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (attempt_id, quiz_code, student_name, violation_num, left_at, returned_at, away_seconds))
        conn.commit()
        
        # Emit event for teacher dashboard
        socketio = current_app.socketio
        socketio.emit('student_violation', {
            'attempt_id': attempt_id,
            'student_name': student_name,
            'violation_num': violation_num,
        }, room=quiz_code.upper())
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/<attempt_id>', methods=['GET'])
def get_violations(attempt_id):
    try:
        conn = db.get_db()
        violations = conn.execute(
            'SELECT * FROM violations WHERE attempt_id = ? ORDER BY violation_num',
            (attempt_id,)
        ).fetchall()
        return jsonify([dict(v) for v in violations])
    except Exception as e:
        return jsonify({'error': str(e)}), 500
