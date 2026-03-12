from flask import Blueprint, request, jsonify
import db
import os
import json
from datetime import datetime
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

router = Blueprint('auth', __name__)


@router.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    try:
        conn = db.get_db()
        teacher = conn.execute(
            'SELECT * FROM teachers WHERE username = ? AND password = ?',
            (username, password)
        ).fetchone()

        if teacher:
            return jsonify({
                'success': True,
                'user': {'id': teacher['id'], 'username': teacher['username']},
                'token': 'fake-jwt-token'
            })
        else:
            return jsonify({'error': 'Invalid username or password'}), 401
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@router.route('/google/login', methods=['POST', 'OPTIONS'])
def google_login():
    """Handle Google OAuth login for both teachers and students"""
    if request.method == 'OPTIONS':
        return '', 204
    
    data = request.get_json()
    credential = data.get('credential')
    user_type = data.get('user_type')  # 'teacher' or 'student'

    if not credential:
        return jsonify({'error': 'Google credential is required'}), 400

    if not user_type or user_type not in ['teacher', 'student']:
        return jsonify({'error': 'Invalid user type. Must be "teacher" or "student"'}), 400

    try:
        # Verify Google token
        CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
        if not CLIENT_ID:
            return jsonify({'error': 'Google OAuth not configured on server'}), 500

        idinfo = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            CLIENT_ID
        )

        google_id = idinfo['sub']
        email = idinfo.get('email', '')
        name = idinfo.get('name', 'Unknown User')
        picture = idinfo.get('picture', '')

        conn = db.get_db()

        if user_type == 'teacher':
            # Check if teacher exists with this Google ID
            teacher = conn.execute(
                'SELECT * FROM teachers WHERE google_id = ?',
                (google_id,)
            ).fetchone()

            if not teacher:
                # Check if teacher exists with this email
                teacher = conn.execute(
                    'SELECT * FROM teachers WHERE email = ?',
                    (email,)
                ).fetchone()

                if teacher:
                    # Update existing teacher with Google ID
                    conn.execute(
                        'UPDATE teachers SET google_id = ?, name = ? WHERE id = ?',
                        (google_id, name, teacher['id'])
                    )
                    conn.commit()
                else:
                    # Create new teacher
                    cursor = conn.execute(
                        '''INSERT INTO teachers (username, google_id, email, name, password)
                           VALUES (?, ?, ?, ?, ?)''',
                        (email.split('@')[0], google_id, email, name, '')
                    )
                    conn.commit()
                    teacher = conn.execute(
                        'SELECT * FROM teachers WHERE id = ?',
                        (cursor.lastrowid,)
                    ).fetchone()

            return jsonify({
                'success': True,
                'user_type': 'teacher',
                'user': {
                    'id': teacher['id'],
                    'name': teacher['name'] or name,
                    'email': teacher['email'] or email,
                    'google_id': google_id
                },
                'token': 'google-jwt-token'
            })

        else:  # student
            # Check if student exists with this Google ID
            student = conn.execute(
                'SELECT * FROM students WHERE google_id = ?',
                (google_id,)
            ).fetchone()

            if not student:
                # Check if student exists with this email
                student = conn.execute(
                    'SELECT * FROM students WHERE email = ?',
                    (email,)
                ).fetchone()

                if student:
                    # Update existing student with Google ID
                    conn.execute(
                        'UPDATE students SET google_id = ?, name = ? WHERE id = ?',
                        (google_id, name, student['id'])
                    )
                    conn.commit()
                else:
                    # Create new student - use email as name if no name provided
                    student_name = name if name else email.split('@')[0]
                    cursor = conn.execute(
                        '''INSERT INTO students (name, google_id, email, pin, last_login_at)
                           VALUES (?, ?, ?, ?, datetime('now'))''',
                        (student_name, google_id, email, '')
                    )
                    conn.commit()
                    student = conn.execute(
                        'SELECT * FROM students WHERE id = ?',
                        (cursor.lastrowid,)
                    ).fetchone()

            return jsonify({
                'success': True,
                'user_type': 'student',
                'student': {
                    'id': student['id'],
                    'name': student['name'] or name,
                    'email': student['email'] or email,
                    'google_id': google_id
                },
                'token': 'google-jwt-token'
            })

    except ValueError as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Invalid Google credential: {str(e)}'}), 401
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
