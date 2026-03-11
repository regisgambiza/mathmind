from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
import db
from datetime import datetime
import json
import os
import logging

# Setup debug logging
from debug_logging import get_logger, log_request, log_function_call

logger = get_logger('server')

# FIXED: Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'mathmind-secret-key')
app.url_map.strict_slashes = False

logger.info("=" * 60)
logger.info("MathMind Python Server Starting...")
logger.info(f"Secret key configured: {bool(os.environ.get('SECRET_KEY'))}")
logger.info(f"Database path: {db.DB_PATH}")

# FIXED: CORS for localhost:5173 and 127.0.0.1:5173 (frontend dev server)
# Allow all methods including OPTIONS for preflight
CORS(app,
     resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173", "*"]}},
     supports_credentials=True,
     methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet', logger=True, engineio_logger=True)

# Store socketio instance in app for route access
app.socketio = socketio

# Initialize database
logger.info("Initializing database...")
db.init_db()
logger.info("Database initialized successfully")

# ============== Socket.IO Event Handlers ==============

socket_logger = get_logger('socketio')

@socketio.on('connect')
def handle_connect():
    socket_logger.info(f"✅ Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    socket_logger.info(f"❌ Client disconnected: {request.sid}")

@socketio.on('join_quiz')
def handle_join_quiz(code):
    socket_logger.debug(f"join_quiz event received: code={code}")
    if code:
        quiz_code = code.upper()
        join_room(quiz_code)
        # Store quiz code in socket session
        from flask_socketio import sessions
        try:
            sessions[request.sid] = {'quiz_code': quiz_code}
        except Exception as e:
            socket_logger.warning(f"Failed to store session: {e}")
        socket_logger.info(f"📚 Student joined quiz: {quiz_code}, Socket: {request.sid}")

        # FIXED: Emit consistent student_joined event shape matching Node.js attempt/start
        # Note: This is for socket-based join, attempt/start emits the full shape with attempt_id
        socketio.emit('student_joined', {
            'socket_id': request.sid,
            'joined_at': datetime.utcnow().isoformat(),
            'quiz_code': quiz_code,
        }, room=quiz_code)
        socket_logger.debug(f"Emitted student_joined event to room {quiz_code}")

@socketio.on('student_progress')
def handle_student_progress(data):
    socket_logger.debug(f"student_progress event: {data}")
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
            socket_logger.debug(f"Updated attempt {attempt_id} progress: question={question_index}")
        except Exception as e:
            socket_logger.error(f'Error updating progress: {e}')

        # Broadcast to teacher
        socketio.emit('student_progress', {
            'attempt_id': attempt_id,
            'student_name': student_name,
            'question_index': question_index,
            'time_on_question': time_on_question,
            'timestamp': datetime.utcnow().isoformat(),
        }, room=quiz_code)
        socket_logger.debug(f"Broadcasted student_progress to room {quiz_code}")

@socketio.on('student_violation')
def handle_student_violation(data):
    socket_logger.warning(f"student_violation event: {data}")
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
        socket_logger.info(f"Broadcasted student_violation to room {quiz_code}")

@socketio.on('student_completed')
def handle_student_completed(data):
    socket_logger.info(f"student_completed event: {data}")
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
            socket_logger.debug(f"Updated attempt {attempt_id} as completed: score={score}/{total}")
        except Exception as e:
            socket_logger.error(f'Error updating completion: {e}')

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
        socket_logger.info(f"Broadcasted student_completed to room {quiz_code}")

@socketio.on('teacher_message')
def handle_teacher_message(data):
    socket_logger.debug(f"teacher_message event: {data}")
    student_socket_id = data.get('student_socket_id')
    message = data.get('message')
    quiz_code = data.get('quiz_code')

    if student_socket_id and message:
        socketio.emit('teacher_message', {
            'message': message,
            'quiz_code': quiz_code,
            'timestamp': datetime.utcnow().isoformat(),
        }, room=student_socket_id)
        socket_logger.info(f"📨 Teacher message sent to: {student_socket_id}")

@socketio.on('teacher_warning')
def handle_teacher_warning(data):
    socket_logger.debug(f"teacher_warning event: {data}")
    student_socket_id = data.get('student_socket_id')
    quiz_code = data.get('quiz_code')

    if student_socket_id:
        socketio.emit('teacher_warning', {
            'message': '⚠️ Teacher is watching. Stay focused!',
            'quiz_code': quiz_code,
            'timestamp': datetime.utcnow().isoformat(),
        }, room=student_socket_id)
        socket_logger.info(f"⚠️ Teacher warning sent to: {student_socket_id}")

@socketio.on('teacher_broadcast')
def handle_teacher_broadcast(data):
    socket_logger.info(f"teacher_broadcast event: {data}")
    quiz_code = data.get('quiz_code')
    message = data.get('message')

    if quiz_code and message:
        socketio.emit('teacher_broadcast', {
            'message': message,
            'timestamp': datetime.utcnow().isoformat(),
        }, room=quiz_code.upper())
        socket_logger.info(f"📢 Teacher broadcast to quiz: {quiz_code}")


# ============== Request Logging Middleware ==============

http_logger = get_logger('http')

@app.before_request
def log_request():
    request.start_time = datetime.utcnow()
    http_logger.debug(f"▶️  {request.method} {request.path}")
    if request.is_json:
        try:
            json_data = request.get_json(silent=True)
            json_str = str(json_data)
            if len(json_str) > 500:
                json_str = json_str[:500] + '...'
            http_logger.debug(f"   JSON: {json_str}")
        except:
            pass

@app.after_request
def log_response(response):
    if hasattr(request, 'start_time'):
        latency = int((datetime.utcnow() - request.start_time).total_seconds() * 1000)
        log_level = logging.ERROR if response.status_code >= 500 else (logging.WARNING if response.status_code >= 400 else logging.DEBUG)
        http_logger.log(log_level, f"◀️  {response.status_code} {request.method} {request.path} ({latency}ms)")
        
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
            http_logger.warning(f"Failed to log request to DB: {e}")
    return response


# ============== Health Check ==============

@app.route('/health', methods=['GET'])
def health():
    http_logger.debug("Health check requested")
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

http_logger.info("All routes registered")


if __name__ == '__main__':
    # Use PORT environment variable or default to 5000 for Python server
    # Use PYTHON_PORT to run on a different port if needed
    port = int(os.environ.get('PYTHON_PORT', os.environ.get('PORT', 5000)))
    logger.info("=" * 60)
    logger.info(f"🚀 MathMind Python server starting on port {port}")
    logger.info(f"   Host: 0.0.0.0")
    logger.info(f"   Debug mode: False")
    logger.info(f"   CORS enabled for: http://localhost:5173")
    logger.info("=" * 60)
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
