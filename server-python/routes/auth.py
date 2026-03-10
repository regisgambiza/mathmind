from flask import Blueprint, request, jsonify
import db

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
