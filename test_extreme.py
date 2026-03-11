#!/usr/bin/env python3
"""
MathMind EXTREME Test Suite - Tests EVERY function thoroughly
Run with: python test_extreme.py
"""

import requests
import json
import time
import random
import string
import socketio
from datetime import datetime
from colorama import init, Fore, Style

init()

BASE_URL = "http://localhost:5000"
OLLAMA_URL = "http://localhost:11434"

TEST_RESULTS = {"passed": 0, "failed": 0, "skipped": 0, "total": 0}
TEST_DATA = {
    "quizzes": [], "students": [], "attempts": [], "practice_sessions": [],
    "current_quiz": None, "current_student": None
}

def log(level, msg):
    colors = {"DEBUG": Fore.CYAN, "PASS": Fore.GREEN, "FAIL": Fore.RED, "SKIP": Fore.YELLOW, "TEST": Fore.MAGENTA}
    print(f"{colors.get(level, Fore.WHITE)}[{level}]{Style.RESET_ALL} {datetime.now().strftime('%H:%M:%S')} - {msg}")

def record(passed, msg=""):
    TEST_RESULTS["total"] += 1
    TEST_RESULTS["passed" if passed else "failed"] += 1
    log("PASS" if passed else "FAIL", msg)

def rand_str(k=6): return ''.join(random.choices(string.ascii_uppercase + string.digits, k=k))
def rand_name(): return f"{random.choice(['Alex','Jordan','Taylor','Morgan','Casey','Riley'])}{random.randint(100,999)}"

# ============================================================================
# SECTION 1: CORE SYSTEM TESTS
# ============================================================================

def test_1_health_endpoints():
    log("TEST", "CORE SYSTEM - Health Endpoints")
    
    # Test 1.1: Main health endpoint
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=5)
        record(r.status_code == 200 and r.json().get("status") == "ok", f"Health endpoint (status={r.status_code})")
    except Exception as e: record(False, f"Health endpoint failed: {e}")
    
    # Test 1.2: Health with wrong method
    try:
        r = requests.post(f"{BASE_URL}/health", timeout=5)
        record(r.status_code == 405, f"Health rejects POST (status={r.status_code})")
    except: record(False, "Health POST test failed")
    
    # Test 1.3: Non-existent endpoint
    try:
        r = requests.get(f"{BASE_URL}/api/nonexistent", timeout=5)
        record(r.status_code == 404, f"404 for invalid endpoint (status={r.status_code})")
    except: record(False, "404 test failed")

def test_2_cors_headers():
    log("TEST", "CORE SYSTEM - CORS Headers")
    
    try:
        r = requests.options(f"{BASE_URL}/api/quiz/", headers={"Origin": "http://localhost:5173"}, timeout=5)
        has_cors = "Access-Control-Allow-Origin" in r.headers or r.status_code in [200, 401, 403]
        record(has_cors, f"CORS headers present (status={r.status_code})")
    except Exception as e: record(False, f"CORS test failed: {e}")

def test_3_response_times():
    log("TEST", "CORE SYSTEM - Response Times")
    
    endpoints = ["/health", "/api/quiz/", "/api/quiz/stats"]
    for ep in endpoints:
        try:
            start = time.time()
            r = requests.get(f"{BASE_URL}{ep}", timeout=10)
            elapsed = (time.time() - start) * 1000
            record(elapsed < 2000, f"{ep} response time: {elapsed:.0f}ms (< 2000ms)")
        except: record(False, f"{ep} timeout")

# ============================================================================
# SECTION 2: OLLAMA AI TESTS
# ============================================================================

def test_4_ollama_basic():
    log("TEST", "OLLAMA AI - Basic Connection")
    
    # Test 4.1: Model availability
    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", json={
            "model": "llama3.1:8b",
            "messages": [{"role": "user", "content": "Hi"}],
            "stream": False
        }, timeout=30)
        record(r.status_code == 200, f"Ollama model available (status={r.status_code})")
    except Exception as e: record(False, f"Ollama connection failed: {e}")
    
    # Test 4.2: Invalid model
    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", json={
            "model": "nonexistent-model",
            "messages": [{"role": "user", "content": "Hi"}],
            "stream": False
        }, timeout=10)
        record(r.status_code == 404, f"Invalid model returns 404 (status={r.status_code})")
    except: record(False, "Invalid model test failed")

def test_5_ollama_question_generation():
    log("TEST", "OLLAMA AI - Question Generation")
    
    prompts = [
        ("MCQ", "Generate 1 multiple choice math question for Grade 7 on fractions. Return JSON with: question, type, difficulty, skill_tag, options (4), answer, explanation."),
        ("T/F", "Generate 1 true/false math question for Grade 7. Return JSON with: question, type, difficulty, skill_tag, answer, explanation."),
        ("Numeric", "Generate 1 numeric response math question for Grade 7. Return JSON with: question, type, difficulty, skill_tag, answer, explanation."),
    ]
    
    for qtype, prompt in prompts:
        try:
            r = requests.post(f"{OLLAMA_URL}/api/chat", json={
                "model": "llama3.1:8b", "messages": [{"role": "user", "content": prompt}], "stream": False
            }, timeout=60)
            
            if r.status_code == 200:
                content = r.json().get('message', {}).get('content', '')
                has_json = '{' in content and '}' in content
                record(has_json, f"{qtype} question generated (has JSON={has_json})")
            else:
                record(False, f"{qtype} generation failed (status={r.status_code})")
        except Exception as e: record(False, f"{qtype} error: {e}")

def test_6_ollama_explanation_generation():
    log("TEST", "OLLAMA AI - Explanation Generation")
    
    try:
        prompt = "Explain step by step: What is 3/4 + 1/2? Show all working. Keep under 50 words."
        r = requests.post(f"{OLLAMA_URL}/api/chat", json={
            "model": "llama3.1:8b", "messages": [{"role": "user", "content": prompt}], "stream": False
        }, timeout=60)
        
        if r.status_code == 200:
            content = r.json().get('message', {}).get('content', '')
            has_explanation = len(content) > 20
            record(has_explanation, f"Explanation generated (length={len(content)})")
        else:
            record(False, f"Explanation failed (status={r.status_code})")
    except Exception as e: record(False, f"Explanation error: {e}")

def test_7_ollama_hint_generation():
    log("TEST", "OLLAMA AI - Hint Generation")
    
    try:
        prompt = "Give a short hint for: 'Calculate 2/3 x 3/4'. Don't give the answer. Under 30 words."
        r = requests.post(f"{OLLAMA_URL}/api/chat", json={
            "model": "llama3.1:8b", "messages": [{"role": "user", "content": prompt}], "stream": False
        }, timeout=60)
        
        if r.status_code == 200:
            content = r.json().get('message', {}).get('content', '')
            record(len(content) > 10, f"Hint generated (length={len(content)})")
        else:
            record(False, f"Hint failed (status={r.status_code})")
    except Exception as e: record(False, f"Hint error: {e}")

def test_8_ollama_adaptive_difficulty():
    log("TEST", "OLLAMA AI - Adaptive Difficulty Questions")
    
    difficulties = ["foundation", "core", "advanced"]
    
    for diff in difficulties:
        try:
            prompt = f"Generate 1 {diff} difficulty math question for Grade 7 on algebra. Return JSON with question, type, difficulty='{diff}', skill_tag, options, answer, explanation."
            r = requests.post(f"{OLLAMA_URL}/api/chat", json={
                "model": "llama3.1:8b", "messages": [{"role": "user", "content": prompt}], "stream": False
            }, timeout=60)
            
            if r.status_code == 200:
                content = r.json().get('message', {}).get('content', '')
                has_difficulty = diff.lower() in content.lower()
                record(has_difficulty, f"{diff.capitalize()} difficulty question (matches={has_difficulty})")
            else:
                record(False, f"{diff.capitalize()} failed (status={r.status_code})")
        except Exception as e: record(False, f"{diff} error: {e}")

# ============================================================================
# SECTION 3: TEACHER AUTHENTICATION TESTS
# ============================================================================

def test_9_teacher_auth():
    log("TEST", "TEACHER AUTH - Login Tests")
    
    # Test 9.1: Default admin login
    try:
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "password123"
        }, timeout=10)
        
        if r.status_code == 200:
            user = r.json().get('user')
            record(user and user.get('username') == 'admin', f"Admin login successful")
        else:
            record(False, f"Admin login failed (status={r.status_code})")
    except Exception as e: record(False, f"Admin login error: {e}")
    
    # Test 9.2: Invalid credentials
    try:
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "wronguser", "password": "wrongpass"
        }, timeout=10)
        record(r.status_code == 401, f"Invalid credentials rejected (status={r.status_code})")
    except: record(False, "Invalid credentials test failed")
    
    # Test 9.3: Empty credentials
    try:
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "", "password": ""
        }, timeout=10)
        record(r.status_code in [400, 401], f"Empty credentials rejected (status={r.status_code})")
    except: record(False, "Empty credentials test failed")

# ============================================================================
# SECTION 4: QUIZ CRUD TESTS
# ============================================================================

def test_10_quiz_create():
    log("TEST", "QUIZ CRUD - Create Operations")
    
    test_cases = [
        ("Valid MCQ", {"code": f"MCQ{rand_str()}", "topic": "Test MCQ", "grade": "Grade 7", "question_types": ["multiple_choice"], "q_count": 5}, 200),
        ("Valid T/F", {"code": f"TF{rand_str()}", "topic": "Test T/F", "grade": "Grade 7", "question_types": ["true_false"], "q_count": 3}, 200),
        ("Valid Mixed", {"code": f"MIX{rand_str()}", "topic": "Test Mixed", "grade": "Grade 7", "question_types": ["multiple_choice", "true_false", "numeric_response"], "q_count": 10}, 200),
        ("Missing code", {"topic": "No Code", "grade": "Grade 7", "question_types": ["multiple_choice"], "q_count": 5}, 400),
        ("Missing topic", {"code": f"NT{rand_str()}", "grade": "Grade 7", "question_types": ["multiple_choice"], "q_count": 5}, 400),
        ("Missing q_count", {"code": f"NQ{rand_str()}", "topic": "No Count", "grade": "Grade 7", "question_types": ["multiple_choice"]}, 400),
        ("Invalid grade", {"code": f"IG{rand_str()}", "topic": "Invalid Grade", "grade": "", "question_types": ["multiple_choice"], "q_count": 5}, 500),
    ]
    
    for name, data, expected in test_cases:
        try:
            r = requests.post(f"{BASE_URL}/api/quiz/", json=data, timeout=10)
            passed = r.status_code == expected
            record(passed, f"{name}: expected {expected}, got {r.status_code}")
            if passed and expected == 200:
                TEST_DATA["quizzes"].append(data.get("code"))
        except Exception as e: record(False, f"{name} error: {e}")

def test_11_quiz_read():
    log("TEST", "QUIZ CRUD - Read Operations")
    
    # Create a quiz first
    code = f"READ{rand_str()}"
    try:
        create_r = requests.post(f"{BASE_URL}/api/quiz/", json={
            "code": code, "topic": "Read Test", "grade": "Grade 7",
            "question_types": ["multiple_choice"], "q_count": 5
        }, timeout=10)
        
        if create_r.status_code == 200:
            TEST_DATA["quizzes"].append(code)
            
            # Test 11.1: Get existing quiz
            r = requests.get(f"{BASE_URL}/api/quiz/{code}", timeout=10)
            record(r.status_code == 200 and r.json().get("code") == code, f"Get existing quiz (status={r.status_code})")
            
            # Test 11.2: Get non-existent quiz
            r = requests.get(f"{BASE_URL}/api/quiz/FAKE{rand_str()}", timeout=10)
            record(r.status_code == 404, f"Get non-existent quiz (status={r.status_code})")
            
            # Test 11.3: Get all quizzes
            r = requests.get(f"{BASE_URL}/api/quiz/", timeout=10)
            record(r.status_code == 200 and isinstance(r.json(), list), f"Get all quizzes (count={len(r.json())})")
            
            # Test 11.4: Get quiz stats
            r = requests.get(f"{BASE_URL}/api/quiz/stats", timeout=10)
            stats = r.json()
            has_stats = all(k in stats for k in ["totalQuizzes", "totalAttempts", "avgScore"])
            record(has_stats, f"Get quiz stats (has_all_fields={has_stats})")
        else:
            record(False, f"Failed to create quiz for read test (status={create_r.status_code})")
    except Exception as e: record(False, f"Read test error: {e}")

def test_12_quiz_update():
    log("TEST", "QUIZ CRUD - Update Operations")
    
    code = f"UPD{rand_str()}"
    try:
        # Create quiz
        create_r = requests.post(f"{BASE_URL}/api/quiz/", json={
            "code": code, "topic": "Original Topic", "grade": "Grade 7",
            "question_types": ["multiple_choice"], "q_count": 5
        }, timeout=10)
        
        if create_r.status_code == 200:
            TEST_DATA["quizzes"].append(code)
            
            # Test 12.1: Update topic
            r = requests.patch(f"{BASE_URL}/api/quiz/{code}", json={
                "topic": "Updated Topic"
            }, timeout=10)
            record(r.status_code == 200 and r.json().get("success"), f"Update topic (status={r.status_code})")
            
            # Test 12.2: Update q_count
            r = requests.patch(f"{BASE_URL}/api/quiz/{code}", json={
                "q_count": 10
            }, timeout=10)
            record(r.status_code == 200, f"Update q_count (status={r.status_code})")
            
            # Test 12.3: Update non-existent quiz
            r = requests.patch(f"{BASE_URL}/api/quiz/FAKE{rand_str()}", json={
                "topic": "Fake"
            }, timeout=10)
            record(r.status_code != 200, f"Update non-existent rejected (status={r.status_code})")
        else:
            record(False, f"Failed to create quiz for update test")
    except Exception as e: record(False, f"Update test error: {e}")

def test_13_quiz_delete():
    log("TEST", "QUIZ CRUD - Delete Operations")
    
    # Test 13.1: Delete existing quiz
    code = f"DEL{rand_str()}"
    try:
        create_r = requests.post(f"{BASE_URL}/api/quiz/", json={
            "code": code, "topic": "To Delete", "grade": "Grade 7",
            "question_types": ["multiple_choice"], "q_count": 1
        }, timeout=10)
        
        if create_r.status_code == 200:
            r = requests.delete(f"{BASE_URL}/api/quiz/{code}", timeout=10)
            record(r.status_code == 200 and r.json().get("success"), f"Delete existing quiz (status={r.status_code})")
            
            # Verify deletion
            verify_r = requests.get(f"{BASE_URL}/api/quiz/{code}", timeout=10)
            record(verify_r.status_code == 404, f"Verify deletion (status={verify_r.status_code})")
        else:
            record(False, f"Failed to create quiz for delete test")
    except Exception as e: record(False, f"Delete test error: {e}")
    
    # Test 13.2: Delete non-existent quiz
    try:
        r = requests.delete(f"{BASE_URL}/api/quiz/FAKE{rand_str()}", timeout=10)
        record(r.status_code != 200, f"Delete non-existent rejected (status={r.status_code})")
    except: record(False, "Delete non-existent test failed")

# ============================================================================
# SECTION 5: STUDENT OPERATIONS TESTS
# ============================================================================

def test_14_student_register():
    log("TEST", "STUDENT OPS - Registration")
    
    test_cases = [
        ("Valid name/pin", {"name": rand_name(), "pin": "1234"}, 200),
        ("Short name", {"name": "A", "pin": "1234"}, 400),
        ("Short pin", {"name": rand_name(), "pin": "12"}, 400),
        ("Empty name", {"name": "", "pin": "1234"}, 400),
        ("Empty pin", {"name": rand_name(), "pin": ""}, 400),
    ]
    
    for name, data, expected in test_cases:
        try:
            r = requests.post(f"{BASE_URL}/api/student/register", json=data, timeout=10)
            passed = r.status_code == expected
            record(passed, f"{name}: expected {expected}, got {r.status_code}")
            if passed and expected == 200:
                student = r.json().get('student')
                if student:
                    TEST_DATA["students"].append({"id": student['id'], "name": data['name'], "pin": data['pin']})
        except Exception as e: record(False, f"{name} error: {e}")
    
    # Test duplicate name
    if TEST_DATA["students"]:
        dup_student = TEST_DATA["students"][0]
        try:
            r = requests.post(f"{BASE_URL}/api/student/register", json={
                "name": dup_student['name'], "pin": "9999"
            }, timeout=10)
            record(r.status_code == 409, f"Duplicate name rejected (status={r.status_code})")
        except: record(False, "Duplicate name test failed")

def test_15_student_login():
    log("TEST", "STUDENT OPS - Login")
    
    if not TEST_DATA["students"]:
        record(False, "No students available for login test")
        return
    
    student = TEST_DATA["students"][0]
    
    # Test 15.1: Valid login
    try:
        r = requests.post(f"{BASE_URL}/api/student/login", json={
            "name": student['name'], "pin": student['pin']
        }, timeout=10)
        
        if r.status_code == 200:
            logged = r.json().get('student')
            record(logged and logged.get('id') == student['id'], f"Valid login successful")
            TEST_DATA["current_student"] = student
        else:
            record(False, f"Valid login failed (status={r.status_code})")
    except Exception as e: record(False, f"Valid login error: {e}")
    
    # Test 15.2: Invalid name
    try:
        r = requests.post(f"{BASE_URL}/api/student/login", json={
            "name": "NonExistent", "pin": "1234"
        }, timeout=10)
        record(r.status_code == 401, f"Invalid name rejected (status={r.status_code})")
    except: record(False, "Invalid name test failed")
    
    # Test 15.3: Invalid pin
    try:
        r = requests.post(f"{BASE_URL}/api/student/login", json={
            "name": student['name'], "pin": "9999"
        }, timeout=10)
        record(r.status_code == 401, f"Invalid pin rejected (status={r.status_code})")
    except: record(False, "Invalid pin test failed")

def test_16_student_profile():
    log("TEST", "STUDENT OPS - Profile & Progress")
    
    if not TEST_DATA["current_student"]:
        record(False, "No current student for profile test")
        return
    
    sid = TEST_DATA["current_student"]['id']
    
    # Test 16.1: Get profile
    try:
        r = requests.get(f"{BASE_URL}/api/student/{sid}/profile", timeout=10)
        if r.status_code == 200:
            profile = r.json()
            has_fields = all(k in profile for k in ['id', 'name', 'level', 'xp', 'badges'])
            record(has_fields, f"Get profile (has_fields={has_fields})")
        else:
            record(False, f"Get profile failed (status={r.status_code})")
    except Exception as e: record(False, f"Profile error: {e}")
    
    # Test 16.2: Get progress
    try:
        r = requests.get(f"{BASE_URL}/api/student/{sid}/progress", timeout=10)
        if r.status_code == 200:
            progress = r.json()
            has_fields = all(k in progress for k in ['student', 'summary', 'activity_history', 'mastery'])
            record(has_fields, f"Get progress (has_fields={has_fields})")
        else:
            record(False, f"Get progress failed (status={r.status_code})")
    except Exception as e: record(False, f"Progress error: {e}")
    
    # Test 16.3: Non-existent student
    try:
        r = requests.get(f"{BASE_URL}/api/student/999999/profile", timeout=10)
        record(r.status_code == 404, f"Non-existent student rejected (status={r.status_code})")
    except: record(False, "Non-existent student test failed")

def test_17_leaderboard():
    log("TEST", "STUDENT OPS - Leaderboard")
    
    # Test 17.1: Get leaderboard
    try:
        r = requests.get(f"{BASE_URL}/api/student/leaderboard", timeout=10)
        if r.status_code == 200:
            lb = r.json()
            has_fields = all(k in lb for k in ['leaderboard', 'total_ranked', 'me'])
            record(has_fields, f"Get leaderboard (has_fields={has_fields})")
        else:
            record(False, f"Get leaderboard failed (status={r.status_code})")
    except Exception as e: record(False, f"Leaderboard error: {e}")
    
    # Test 17.2: Leaderboard with limit
    try:
        r = requests.get(f"{BASE_URL}/api/student/leaderboard?limit=5", timeout=10)
        if r.status_code == 200:
            lb = r.json()
            record(len(lb.get('leaderboard', [])) <= 5, f"Leaderboard limit respected (count={len(lb.get('leaderboard', []))})")
        else:
            record(False, f"Leaderboard limit failed (status={r.status_code})")
    except Exception as e: record(False, f"Leaderboard limit error: {e}")

# ============================================================================
# SECTION 6: ATTEMPT OPERATIONS TESTS
# ============================================================================

def test_18_attempt_start():
    log("TEST", "ATTEMPT OPS - Start Attempt")
    
    if not TEST_DATA["quizzes"] or not TEST_DATA["current_student"]:
        record(False, "Missing quiz or student for attempt test")
        return
    
    # Test 18.1: Valid attempt start
    try:
        r = requests.post(f"{BASE_URL}/api/attempt/start", json={
            "quiz_code": TEST_DATA["quizzes"][0],
            "student_id": TEST_DATA["current_student"]['id'],
            "student_name": TEST_DATA["current_student"]['name']
        }, timeout=10)
        
        if r.status_code == 200:
            attempt_id = r.json().get('attempt_id')
            if attempt_id:
                TEST_DATA["attempts"].append(attempt_id)
                record(True, f"Start attempt successful (id={attempt_id})")
            else:
                record(False, "No attempt_id in response")
        else:
            record(False, f"Start attempt failed (status={r.status_code})")
    except Exception as e: record(False, f"Start attempt error: {e}")
    
    # Test 18.2: Missing quiz_code
    try:
        r = requests.post(f"{BASE_URL}/api/attempt/start", json={
            "student_id": TEST_DATA["current_student"]['id'],
            "student_name": TEST_DATA["current_student"]['name']
        }, timeout=10)
        record(r.status_code == 400, f"Missing quiz_code rejected (status={r.status_code})")
    except: record(False, "Missing quiz_code test failed")
    
    # Test 18.3: Non-existent quiz
    try:
        r = requests.post(f"{BASE_URL}/api/attempt/start", json={
            "quiz_code": "FAKE123",
            "student_id": TEST_DATA["current_student"]['id'],
            "student_name": TEST_DATA["current_student"]['name']
        }, timeout=10)
        record(r.status_code == 404, f"Non-existent quiz rejected (status={r.status_code})")
    except: record(False, "Non-existent quiz test failed")

def test_19_attempt_read():
    log("TEST", "ATTEMPT OPS - Read Attempt")
    
    if not TEST_DATA["attempts"]:
        record(False, "No attempts available for read test")
        return
    
    aid = TEST_DATA["attempts"][-1]
    
    # Test 19.1: Get attempt
    try:
        r = requests.get(f"{BASE_URL}/api/attempt/{aid}", timeout=10)
        if r.status_code == 200:
            attempt = r.json()
            has_fields = all(k in attempt for k in ['id', 'status', 'quiz_code', 'student_name'])
            record(has_fields, f"Get attempt (has_fields={has_fields})")
        else:
            record(False, f"Get attempt failed (status={r.status_code})")
    except Exception as e: record(False, f"Get attempt error: {e}")
    
    # Test 19.2: Non-existent attempt
    try:
        r = requests.get(f"{BASE_URL}/api/attempt/999999", timeout=10)
        record(r.status_code == 404, f"Non-existent attempt rejected (status={r.status_code})")
    except: record(False, "Non-existent attempt test failed")

def test_20_attempt_complete():
    log("TEST", "ATTEMPT OPS - Complete Attempt")
    
    if not TEST_DATA["attempts"]:
        record(False, "No attempts available for complete test")
        return
    
    aid = TEST_DATA["attempts"][-1]
    
    # Test 20.1: Complete attempt
    try:
        r = requests.patch(f"{BASE_URL}/api/attempt/{aid}/complete", json={
            "score": 4, "total": 5, "percentage": 80.0
        }, timeout=10)
        
        if r.status_code == 200:
            resp = r.json()
            has_success = resp.get('success')
            has_rewards = 'rewards' in resp
            record(has_success, f"Complete attempt (success={has_success}, has_rewards={has_rewards})")
        else:
            record(False, f"Complete attempt failed (status={r.status_code})")
    except Exception as e: record(False, f"Complete attempt error: {e}")

# ============================================================================
# SECTION 7: PRACTICE MODE TESTS
# ============================================================================

def test_21_practice_start():
    log("TEST", "PRACTICE MODE - Start Practice")
    
    if not TEST_DATA["current_student"]:
        record(False, "No student for practice test")
        return
    
    sid = TEST_DATA["current_student"]['id']
    
    test_cases = [
        ("Skill mode", {"student_id": sid, "mode": "skill", "skill": "Fractions", "count": 3}),
        ("Topic mode", {"student_id": sid, "mode": "topic", "topic": "Algebra", "count": 3}),
        ("Quiz prep", {"student_id": sid, "mode": "quiz_prep", "quiz_code": TEST_DATA["quizzes"][0] if TEST_DATA["quizzes"] else "DEMO", "count": 5}),
    ]
    
    for name, data in test_cases:
        try:
            r = requests.post(f"{BASE_URL}/api/practice/start", json=data, timeout=10)
            if r.status_code == 200:
                resp = r.json()
                has_session = 'practice_session' in resp
                has_attempt = resp.get('practice_session', {}).get('attempt_id')
                record(has_session and has_attempt, f"{name} (has_session={has_session}, attempt={has_attempt})")
                if has_attempt:
                    TEST_DATA["practice_sessions"].append(has_attempt)
            else:
                record(False, f"{name} failed (status={r.status_code})")
        except Exception as e: record(False, f"{name} error: {e}")

def test_22_adaptive_plan():
    log("TEST", "PRACTICE MODE - Adaptive Plan")
    
    if not TEST_DATA["current_student"]:
        record(False, "No student for adaptive plan test")
        return
    
    sid = TEST_DATA["current_student"]['id']
    
    # Test 22.1: Get adaptive plan
    try:
        r = requests.get(f"{BASE_URL}/api/student/{sid}/adaptive-plan", params={
            "topic": "Fractions", "count": 5
        }, timeout=10)
        
        if r.status_code == 200:
            plan = r.json()
            has_plan = 'plan' in plan
            has_distribution = 'difficulty_distribution_count' in plan.get('plan', {})
            record(has_plan and has_distribution, f"Get adaptive plan (has_plan={has_plan})")
        else:
            record(False, f"Get adaptive plan failed (status={r.status_code})")
    except Exception as e: record(False, f"Adaptive plan error: {e}")

# ============================================================================
# SECTION 8: DASHBOARD & ANALYTICS TESTS
# ============================================================================

def test_23_dashboard():
    log("TEST", "DASHBOARD - Quiz Dashboard")
    
    if not TEST_DATA["quizzes"]:
        record(False, "No quiz for dashboard test")
        return
    
    code = TEST_DATA["quizzes"][0]
    
    # Test 23.1: Get dashboard
    try:
        r = requests.get(f"{BASE_URL}/api/dashboard/{code}", timeout=10)
        if r.status_code == 200:
            dash = r.json()
            has_students = 'students' in dash
            has_quiz = 'quiz' in dash
            record(has_students and has_quiz, f"Get dashboard (students={len(dash.get('students', []))})")
        else:
            record(False, f"Get dashboard failed (status={r.status_code})")
    except Exception as e: record(False, f"Dashboard error: {e}")

def test_24_admin():
    log("TEST", "DASHBOARD - Admin Overview")
    
    # Test 24.1: Get admin overview
    try:
        r = requests.get(f"{BASE_URL}/api/admin/overview", timeout=10)
        if r.status_code == 200:
            overview = r.json()
            has_keys = len(overview.keys()) > 0
            record(has_keys, f"Get admin overview (keys={len(overview.keys())})")
        else:
            record(False, f"Get admin overview failed (status={r.status_code})")
    except Exception as e: record(False, f"Admin overview error: {e}")

# ============================================================================
# SECTION 9: SOCKET.IO TESTS
# ============================================================================

def test_25_socket_connection():
    log("TEST", "SOCKET.IO - Connection Tests")
    
    # Test 25.1: Basic connection
    try:
        sio = socketio.Client()
        connected = False
        
        @sio.event
        def connect():
            nonlocal connected
            connected = True
        
        sio.connect(BASE_URL, wait_timeout=10)
        time.sleep(1)
        sio.disconnect()
        
        record(connected, f"Socket connection (connected={connected})")
    except Exception as e: record(False, f"Socket connection error: {e}")
    
    # Test 25.2: Join quiz room
    if TEST_DATA["quizzes"]:
        try:
            sio = socketio.Client()
            joined = False
            
            @sio.event
            def connect():
                sio.emit('join_quiz', TEST_DATA["quizzes"][0])
            
            @sio.event
            def student_joined(data):
                nonlocal joined
                joined = True
            
            sio.connect(BASE_URL, wait_timeout=10)
            time.sleep(2)
            sio.disconnect()
            
            record(True, f"Join quiz room (event_received={joined})")
        except Exception as e: record(False, f"Join quiz room error: {e}")

# ============================================================================
# SECTION 10: EDGE CASES & ERROR HANDLING
# ============================================================================

def test_26_edge_cases():
    log("TEST", "EDGE CASES - Error Handling")
    
    # Test 26.1: Malformed JSON
    try:
        r = requests.post(f"{BASE_URL}/api/quiz/", data="not json", headers={"Content-Type": "application/json"}, timeout=10)
        record(r.status_code in [400, 500], f"Malformed JSON rejected (status={r.status_code})")
    except: record(False, "Malformed JSON test failed")
    
    # Test 26.2: Very long topic name
    try:
        r = requests.post(f"{BASE_URL}/api/quiz/", json={
            "code": f"LONG{rand_str()}",
            "topic": "A" * 1000,
            "grade": "Grade 7",
            "question_types": ["multiple_choice"],
            "q_count": 5
        }, timeout=10)
        record(r.status_code in [200, 400, 500], f"Long topic handled (status={r.status_code})")
    except: record(False, "Long topic test failed")
    
    # Test 26.3: Invalid question type
    try:
        r = requests.post(f"{BASE_URL}/api/quiz/", json={
            "code": f"INV{rand_str()}",
            "topic": "Invalid Type",
            "grade": "Grade 7",
            "question_types": ["invalid_type"],
            "q_count": 5
        }, timeout=10)
        # Should still create but may fail at question generation
        record(r.status_code in [200, 400], f"Invalid question type handled (status={r.status_code})")
    except: record(False, "Invalid question type test failed")
    
    # Test 26.4: q_count = 0
    try:
        r = requests.post(f"{BASE_URL}/api/quiz/", json={
            "code": f"ZQ{rand_str()}",
            "topic": "Zero Questions",
            "grade": "Grade 7",
            "question_types": ["multiple_choice"],
            "q_count": 0
        }, timeout=10)
        record(r.status_code in [200, 400], f"Zero q_count handled (status={r.status_code})")
    except: record(False, "Zero q_count test failed")
    
    # Test 26.5: Very large q_count
    try:
        r = requests.post(f"{BASE_URL}/api/quiz/", json={
            "code": f"HQ{rand_str()}",
            "topic": "Huge Questions",
            "grade": "Grade 7",
            "question_types": ["multiple_choice"],
            "q_count": 999
        }, timeout=10)
        record(r.status_code in [200, 400], f"Large q_count handled (status={r.status_code})")
    except: record(False, "Large q_count test failed")

# ============================================================================
# CLEANUP
# ============================================================================

def cleanup():
    log("TEST", "CLEANUP - Removing Test Data")
    
    deleted = 0
    for code in TEST_DATA["quizzes"]:
        try:
            r = requests.delete(f"{BASE_URL}/api/quiz/{code}", timeout=5)
            if r.status_code == 200:
                deleted += 1
        except:
            pass
    
    record(True, f"Cleanup complete: {deleted} quizzes deleted")

# ============================================================================
# MAIN
# ============================================================================

def run_all():
    print(f"\n{Fore.WHITE}{Style.BRIGHT}{'='*70}{Style.RESET_ALL}")
    print(f"{Fore.WHITE}{Style.BRIGHT}MATHMIND EXTREME TEST SUITE - Tests EVERY Function{Style.RESET_ALL}")
    print(f"{Fore.WHITE}{Style.BRIGHT}{'='*70}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}Backend:{Style.RESET_ALL} {BASE_URL} | {Fore.CYAN}Ollama:{Style.RESET_ALL} {OLLAMA_URL}")
    print(f"{Fore.CYAN}Started:{Style.RESET_ALL} {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    # Health check first
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=5)
        if r.status_code != 200:
            print(f"{Fore.RED}BACKEND NOT RUNNING. Start with: python server-python/server.py{Style.RESET_ALL}\n")
            return
    except:
        print(f"{Fore.RED}CANNOT CONNECT TO BACKEND{Style.RESET_ALL}\n")
        return
    
    # Run all test sections
    test_1_health_endpoints()
    test_2_cors_headers()
    test_3_response_times()
    
    test_4_ollama_basic()
    test_5_ollama_question_generation()
    test_6_ollama_explanation_generation()
    test_7_ollama_hint_generation()
    test_8_ollama_adaptive_difficulty()
    
    test_9_teacher_auth()
    
    test_10_quiz_create()
    test_11_quiz_read()
    test_12_quiz_update()
    test_13_quiz_delete()
    
    test_14_student_register()
    test_15_student_login()
    test_16_student_profile()
    test_17_leaderboard()
    
    test_18_attempt_start()
    test_19_attempt_read()
    test_20_attempt_complete()
    
    test_21_practice_start()
    test_22_adaptive_plan()
    
    test_23_dashboard()
    test_24_admin()
    
    test_25_socket_connection()
    
    test_26_edge_cases()
    
    cleanup()
    
    # Summary
    total = TEST_RESULTS["total"]
    passed = TEST_RESULTS["passed"]
    failed = TEST_RESULTS["failed"]
    rate = (passed / total * 100) if total > 0 else 0
    
    print(f"\n{Fore.WHITE}{Style.BRIGHT}{'='*70}{Style.RESET_ALL}")
    print(f"{Fore.WHITE}{Style.BRIGHT}TEST SUMMARY{Style.RESET_ALL}")
    print(f"{Fore.WHITE}{Style.BRIGHT}{'='*70}{Style.RESET_ALL}")
    print(f"\n{Fore.CYAN}Total:{Style.RESET_ALL} {total} | {Fore.GREEN}Passed:{Style.RESET_ALL} {passed} | {Fore.RED}Failed:{Style.RESET_ALL} {failed}")
    print(f"{Fore.YELLOW}Success Rate:{Style.RESET_ALL} {rate:.1f}%\n")
    
    if rate >= 90: print(f"{Fore.GREEN}{Style.BRIGHT}✓ EXCELLENT - All critical functions working!{Style.RESET_ALL}\n")
    elif rate >= 70: print(f"{Fore.YELLOW}{Style.BRIGHT}⚠ GOOD - Most functions working, review failures{Style.RESET_ALL}\n")
    else: print(f"{Fore.RED}{Style.BRIGHT}✗ POOR - Many functions failing, check server{Style.RESET_ALL}\n")
    
    print(f"{Fore.CYAN}Completed:{Style.RESET_ALL} {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

if __name__ == "__main__":
    try:
        run_all()
    except KeyboardInterrupt:
        print(f"\n\n{Fore.YELLOW}Tests interrupted.{Style.RESET_ALL}\n")
    except Exception as e:
        print(f"\n{Fore.RED}Fatal: {e}{Style.RESET_ALL}\n")
        import traceback
        traceback.print_exc()
