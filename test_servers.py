#!/usr/bin/env python3
import requests

# Test backend
try:
    r = requests.get('http://localhost:5000/health')
    print(f'Backend (5000): {r.status_code} - {r.json()}')
except Exception as e:
    print(f'Backend (5000): ERROR - {e}')

# Test frontend
try:
    r = requests.get('http://localhost:5173')
    print(f'Frontend (5173): {r.status_code} - OK')
except Exception as e:
    print(f'Frontend (5173): ERROR - {e}')
