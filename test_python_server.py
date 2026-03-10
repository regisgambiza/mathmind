import requests
import json

url = 'http://localhost:4001/api/quiz/'
data = {
    'code': 'TEST123',
    'topic': 'Fractions',
    'grade': '7',
    'question_types': ['multiple_choice'],
    'q_count': 5
}

response = requests.post(url, json=data)
print(f'Status: {response.status_code}')
print(f'Response: {response.text}')
