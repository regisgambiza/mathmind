from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
import db
from datetime import datetime
import json
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'mathmind-secret-key'
app.url_map.strict_slashes = False
CORS(app, resources={r"/api/*": {"origins": "*"}})

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Store socketio instance in app for route access
app.socketio = socketio

# Initialize database
db.init_db()

# ============== Socket.IO Event Handlers ==============

@socketio.on('connect')
def handle_connect():
    print(f'[Socket] Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    print(f'[Socket] Client disconnected: {request.sid}')

@socketio.on('join_quiz')
def handle_join_quiz(code):
    if code:
        quiz_code = code.upper()
        join_room(quiz_code)
        # Store quiz code in socket session
        from flask_socketio import sessions
        try:
            sessions[request.sid] = {'quiz_code': quiz_code}
        except:
            pass
        print(f'[Socket] Student joined quiz: {quiz_code}, Socket: {request.sid}')

        # Notify teacher that student joined
        socketio.emit('student_joined', {
            'socket_id': request.sid,
            'joined_at': datetime.utcnow().isoformat(),
        }, room=quiz_code)

@socketio.on('student_progress')
def handle_student_progress(data):
    quiz_code = data.get('quiz_code', '').upper()
    if quiz_code:
        attempt_id = data.get('attempt_id')
        student_name = data.get('student_name')
        question_index = data.get('question_index')
        time_on_question = data.get('time_on_question')

        # Update attempt in database
        try:
            conn = db.get_db()
            conn.execute('''
                UPDATE attempts
                SET current_question = ?, last_activity_at = datetime('now'), socket_id = ?
                WHERE id = ?
            ''', (question_index, request.sid, attempt_id))
            conn.commit()
        except Exception as e:
            print(f'Error updating progress: {e}')

        # Broadcast to teacher
        socketio.emit('student_progress', {
            'attempt_id': attempt_id,
            'student_name': student_name,
            'question_index': question_index,
            'time_on_question': time_on_question,
            'timestamp': datetime.utcnow().isoformat(),
        }, room=quiz_code)

@socketio.on('student_violation')
def handle_student_violation(data):
    quiz_code = data.get('quiz_code', '').upper()
    if quiz_code:
        attempt_id = data.get('attempt_id')
        student_name = data.get('student_name')
        violation_count = data.get('violation_count')
        left_at = data.get('left_at')
        returned_at = data.get('returned_at')
        away_seconds = data.get('away_seconds')

        # Broadcast to teacher
        socketio.emit('student_violation', {
            'attempt_id': attempt_id,
            'student_name': student_name,
            'violation_count': violation_count,
            'left_at': left_at,
            'returned_at': returned_at,
            'away_seconds': away_seconds,
            'timestamp': datetime.utcnow().isoformat(),
            'is_critical': violation_count >= 3,
        }, room=quiz_code)

@socketio.on('student_completed')
def handle_student_completed(data):
    quiz_code = data.get('quiz_code', '').upper()
    if quiz_code:
        attempt_id = data.get('attempt_id')
        student_name = data.get('student_name')
        score = data.get('score')
        total = data.get('total')
        percentage = data.get('percentage')
        time_taken = data.get('time_taken')

        # Update attempt in database
        try:
            conn = db.get_db()
            conn.execute('''
                UPDATE attempts
                SET status = 'completed', completed_at = datetime('now'), score = ?, total = ?, percentage = ?
                WHERE id = ?
            ''', (score, total, percentage, attempt_id))
            conn.commit()
        except Exception as e:
            print(f'Error updating completion: {e}')

        # Broadcast to teacher
        socketio.emit('student_completed', {
            'attempt_id': attempt_id,
            'student_name': student_name,
            'score': score,
            'total': total,
            'percentage': percentage,
            'time_taken': time_taken,
            'timestamp': datetime.utcnow().isoformat(),
        }, room=quiz_code)

@socketio.on('teacher_message')
def handle_teacher_message(data):
    student_socket_id = data.get('student_socket_id')
    message = data.get('message')
    quiz_code = data.get('quiz_code')

    if student_socket_id and message:
        socketio.emit('teacher_message', {
            'message': message,
            'quiz_code': quiz_code,
            'timestamp': datetime.utcnow().isoformat(),
        }, room=student_socket_id)
        print(f'[Socket] Teacher message sent to: {student_socket_id}')

@socketio.on('teacher_warning')
def handle_teacher_warning(data):
    student_socket_id = data.get('student_socket_id')
    quiz_code = data.get('quiz_code')

    if student_socket_id:
        socketio.emit('teacher_warning', {
            'message': '⚠️ Teacher is watching. Stay focused!',
            'quiz_code': quiz_code,
            'timestamp': datetime.utcnow().isoformat(),
        }, room=student_socket_id)
        print(f'[Socket] Teacher warning sent to: {student_socket_id}')

@socketio.on('teacher_broadcast')
def handle_teacher_broadcast(data):
    quiz_code = data.get('quiz_code')
    message = data.get('message')

    if quiz_code and message:
        socketio.emit('teacher_broadcast', {
            'message': message,
            'timestamp': datetime.utcnow().isoformat(),
        }, room=quiz_code.upper())
        print(f'[Socket] Teacher broadcast to quiz: {quiz_code}')


# ============== Request Logging Middleware ==============

@app.before_request
def log_request():
    request.start_time = datetime.utcnow()

@app.after_request
def log_response(response):
    if hasattr(request, 'start_time'):
        latency = int((datetime.utcnow() - request.start_time).total_seconds() * 1000)
        try:
            conn = db.get_db()
            conn.execute('''
                INSERT INTO system_events (event_type, level, message, path, status_code, latency_ms, detail_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                'http_request',
                'error' if response.status_code >= 500 else ('warn' if response.status_code >= 400 else 'info'),
                f'{request.method} {request.path}',
                request.path,
                response.status_code,
                latency,
                json.dumps({'method': request.method})
            ))
            conn.commit()
        except Exception as e:
            pass  # Don't fail request if logging fails
    return response


# ============== Health Check ==============

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


# ============== Import and Register Routes ==============

from routes import quiz, attempt, violations, dashboard, auth, student, admin, practice

app.register_blueprint(quiz.router, url_prefix='/api/quiz')
app.register_blueprint(attempt.router, url_prefix='/api/attempt')
app.register_blueprint(violations.router, url_prefix='/api/violations')
app.register_blueprint(dashboard.router, url_prefix='/api/dashboard')
app.register_blueprint(auth.router, url_prefix='/api/auth')
app.register_blueprint(student.router, url_prefix='/api/student')
app.register_blueprint(admin.router, url_prefix='/api/admin')
app.register_blueprint(practice.router, url_prefix='/api/practice')


if __name__ == '__main__':
    # Use PORT environment variable or default to 4000 (same as Node.js)
    # Use PYTHON_PORT to run on a different port if needed
    port = int(os.environ.get('PYTHON_PORT', os.environ.get('PORT', 4000)))
    print(f'MathMind Python server running on port {port}')
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
