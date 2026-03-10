import requests
import traceback

try:
    r = requests.get('http://localhost:4001/api/admin/overview')
    print(f'Status: {r.status_code}')
    print(f'Response: {r.text}')
except Exception as e:
    print(f'Error: {e}')
    traceback.print_exc()
