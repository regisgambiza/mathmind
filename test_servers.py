import requests
import json

API_BASE = 'http://localhost:4000'

print("=" * 50)
print("Testing MathMind Python Server")
print("=" * 50)

# Test 1: Health check
print("\n[1] Health Check...")
try:
    r = requests.get(f'{API_BASE}/health', timeout=5)
    print(f"    Status: {r.status_code} - {r.json()}")
except Exception as e:
    print(f"    FAILED: {e}")

# Test 2: Teacher Login
print("\n[2] Teacher Login (admin/admin123)...")
try:
    r = requests.post(f'{API_BASE}/api/auth/login', json={
        'username': 'admin',
        'password': 'admin123'
    }, timeout=5)
    print(f"    Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"    Response: token={data.get('token')[:20]}..., user={data.get('user')}")
    else:
        print(f"    Response: {r.text[:200]}")
except Exception as e:
    print(f"    FAILED: {e}")

# Test 3: Student Register
print("\n[3] Student Register (TestStudent/1234)...")
try:
    r = requests.post(f'{API_BASE}/api/student/register', json={
        'name': 'TestStudent',
        'pin': '1234'
    }, timeout=5)
    print(f"    Status: {r.status_code}")
    print(f"    Response: {r.json() if r.status_code == 200 else r.text[:200]}")
except Exception as e:
    print(f"    FAILED: {e}")

# Test 4: Student Login
print("\n[4] Student Login (TestStudent/1234)...")
try:
    r = requests.post(f'{API_BASE}/api/student/login', json={
        'name': 'TestStudent',
        'pin': '1234'
    }, timeout=5)
    print(f"    Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        student = data.get('student', {})
        print(f"    Student ID: {student.get('id')}")
        print(f"    Name: {student.get('name')}")
    else:
        print(f"    Response: {r.text[:200]}")
except Exception as e:
    print(f"    FAILED: {e}")

# Test 5: Get Student Profile
print("\n[5] Get Student Profile...")
try:
    r = requests.post(f'{API_BASE}/api/student/login', json={
        'name': 'TestStudent',
        'pin': '1234'
    }, timeout=5)
    if r.status_code == 200:
        student_id = r.json().get('student', {}).get('id')
        r = requests.get(f'{API_BASE}/api/student/{student_id}/profile', timeout=5)
        print(f"    Status: {r.status_code}")
        if r.status_code == 200:
            print(f"    Response: {json.dumps(r.json(), indent=2)[:500]}")
        else:
            print(f"    Response: {r.text[:200]}")
except Exception as e:
    print(f"    FAILED: {e}")

# Test 6: Create Quiz
print("\n[6] Create Quiz...")
try:
    r = requests.post(f'{API_BASE}/api/auth/login', json={
        'username': 'admin',
        'password': 'admin123'
    }, timeout=5)
    if r.status_code == 200:
        token = r.json().get('token')
        headers = {'Authorization': f'Bearer {token}'}
        r = requests.post(f'{API_BASE}/api/quiz/', json={
            'code': 'TEST123',
            'topic': 'Algebra',
            'grade': '8',
            'question_types': ['multiple_choice'],
            'q_count': 5
        }, headers=headers, timeout=5)
        print(f"    Status: {r.status_code}")
        print(f"    Response: {r.json() if r.status_code == 200 else r.text[:200]}")
except Exception as e:
    print(f"    FAILED: {e}")

print("\n" + "=" * 50)
print("Tests Complete!")
print("=" * 50)
