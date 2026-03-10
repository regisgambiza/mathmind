import requests

# Test login
r = requests.post('http://localhost:4001/api/auth/login', json={'username':'admin','password':'admin123'})
print(f'Login: {r.status_code} - {r.text}')

# Test quiz creation
r = requests.post('http://localhost:4001/api/quiz/', json={
    'code': 'TEST456',
    'topic': 'Algebra',
    'grade': '7',
    'question_types': ['multiple_choice'],
    'q_count': 5
})
print(f'Create Quiz: {r.status_code} - {r.text}')

# Test admin overview
r = requests.get('http://localhost:4001/api/admin/overview')
print(f'Admin Overview: {r.status_code} - {r.text}')
