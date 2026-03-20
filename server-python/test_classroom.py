import db
import services.classroom as classroom
from dotenv import load_dotenv
load_dotenv()

conn = db.get_db()

# Try to get roster directly
print("Testing roster fetch...")
roster_result = classroom.get_course_roster(98, '616910379937')
print(f"Roster result: {roster_result}")

if 'roster' in roster_result:
    print(f"\nStudents in roster ({len(roster_result['roster'])}):")
    for s in roster_result['roster'][:5]:
        print(f"  - {s['name']} <{s['email']}> (userId: {s['userId']})")

# Try to sync a grade
print("\n\nTesting grade sync...")
# Find a student in the roster
if 'roster' in roster_result and roster_result['roster']:
    student = roster_result['roster'][0]
    result = classroom.sync_grade(98, '616910379937', '851335179548', student['userId'], 85.0)
    print(f"Sync result: {result}")
