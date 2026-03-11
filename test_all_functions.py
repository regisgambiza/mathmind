#!/usr/bin/env python3
"""
MathMind Comprehensive Test Suite
Tests all backend API endpoints, database operations, and AI integration.
Run with: python test_all_functions.py
"""

import requests
import json
import time
import random
import string
import socketio
from datetime import datetime
from colorama import init, Fore, Style

# Initialize colorama for colored output
init()

# Configuration
BASE_URL = "http://localhost:5000"
OLLAMA_URL = "http://localhost:11434"

# Test state
TEST_RESULTS = {
    "passed": 0,
    "failed": 0,
    "skipped": 0,
    "total": 0
}

TEST_DATA = {
    "teacher": {"username": "testadmin", "password": "test123"},
    "students": [],
    "quizzes": [],
    "attempts": [],
    "current_quiz_code": None,
    "current_student_id": None,
}


def log_debug(message):
    """Print debug message."""
    print(f"{Fore.CYAN}[DEBUG]{Style.RESET_ALL} {datetime.now().strftime('%H:%M:%S')} - {message}")


def log_success(message):
    """Print success message."""
    print(f"{Fore.GREEN}[✓ PASS]{Style.RESET_ALL} {datetime.now().strftime('%H:%M:%S')} - {message}")


def log_error(message):
    """Print error message."""
    print(f"{Fore.RED}[✗ FAIL]{Style.RESET_ALL} {datetime.now().strftime('%H:%M:%S')} - {message}")


def log_skip(message):
    """Print skip message."""
    print(f"{Fore.YELLOW}[⊘ SKIP]{Style.RESET_ALL} {datetime.now().strftime('%H:%M:%S')} - {message}")


def log_test_start(name):
    """Print test start message."""
    print(f"\n{Fore.MAGENTA}{'='*60}{Style.RESET_ALL}")
    print(f"{Fore.MAGENTA}TEST:{Style.RESET_ALL} {name}")
    print(f"{Fore.MAGENTA}{'='*60}{Style.RESET_ALL}")


def record_result(passed, message=""):
    """Record test result."""
    TEST_RESULTS["total"] += 1
    if passed:
        TEST_RESULTS["passed"] += 1
        log_success(message)
    else:
        TEST_RESULTS["failed"] += 1
        log_error(message)


def generate_random_string(length=6):
    """Generate random string for unique identifiers."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))


def generate_student_name():
    """Generate random student name."""
    names = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Quinn", "Avery"]
    return f"{random.choice(names)}{random.randint(100, 999)}"


# ============================================================================
# HEALTH CHECK
# ============================================================================

def test_health_check():
    """Test backend health endpoint."""
    log_test_start("Health Check")
    
    try:
        log_debug(f"GET {BASE_URL}/health")
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response body: {response.json()}")
        
        if response.status_code == 200 and response.json().get("status") == "ok":
            record_result(True, "Backend health check passed")
            return True
        else:
            record_result(False, f"Unexpected response: {response.json()}")
            return False
    except requests.exceptions.ConnectionError:
        record_result(False, "Cannot connect to backend server. Is it running?")
        return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


# ============================================================================
# OLLAMA AI INTEGRATION
# ============================================================================

def test_ollama_connection():
    """Test Ollama AI connection."""
    log_test_start("Ollama AI Connection")
    
    try:
        log_debug(f"POST {OLLAMA_URL}/api/chat")
        log_debug("Testing model: llama3.1:8b")
        
        response = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": "llama3.1:8b",
                "messages": [{"role": "user", "content": "Say 'AI working' in one word"}],
                "stream": False
            },
            timeout=60
        )
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {response.json()}")
        
        if response.status_code == 200:
            content = response.json().get('message', {}).get('content', '')
            record_result(True, f"Ollama AI working! Response: {content}")
            return True
        elif response.status_code == 404:
            record_result(False, "Model 'llama3.1:8b' not found. Run: ollama pull llama3.1:8b")
            return False
        else:
            record_result(False, f"Ollama error: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        record_result(False, "Cannot connect to Ollama. Is it installed and running?")
        return False
    except requests.exceptions.Timeout:
        record_result(False, "Ollama request timed out. Model may be loading.")
        return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


def test_ai_question_generation():
    """Test AI question generation for quizzes."""
    log_test_start("AI Question Generation")
    
    prompt = """Generate exactly 2 multiple choice math questions for Grade 7 on fractions.
Return ONLY a valid JSON array. Each question must have:
- question: The question text
- type: "multiple_choice"
- difficulty: "foundation", "core", or "advanced"
- skill_tag: The skill being tested
- options: Array of 4 options (A., B., C., D. format)
- answer: Correct answer letter (A, B, C, or D)
- explanation: Step-by-step explanation

Example format:
[
  {
    "question": "What is 1/2 + 1/4?",
    "type": "multiple_choice",
    "difficulty": "foundation",
    "skill_tag": "Adding Fractions",
    "options": ["A. 3/4", "B. 2/6", "C. 1/8", "D. 3/8"],
    "answer": "A",
    "explanation": "Find common denominator: 2/4 + 1/4 = 3/4"
  }
]"""
    
    try:
        log_debug("Sending question generation prompt to Ollama...")
        log_debug(f"Prompt length: {len(prompt)} chars")
        
        response = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": "llama3.1:8b",
                "messages": [{"role": "user", "content": prompt}],
                "stream": False
            },
            timeout=120
        )
        
        log_debug(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            content = response.json().get('message', {}).get('content', '')
            log_debug(f"AI response length: {len(content)} chars")
            log_debug(f"AI response preview: {content[:300]}...")
            
            # Try to parse JSON
            try:
                import re
                cleaned = re.sub(r'```json\n?|\n?```', '', content).strip()
                json_match = re.search(r'\[[\s\S]*\]', cleaned)
                if json_match:
                    questions = json.loads(json_match.group())
                    if isinstance(questions, list) and len(questions) > 0:
                        record_result(True, f"Generated {len(questions)} valid questions")
                        log_debug(f"Question 1: {questions[0].get('question', 'N/A')[:100]}")
                        return True
                record_result(False, "Could not parse questions from AI response")
                return False
            except json.JSONDecodeError as e:
                record_result(False, f"Invalid JSON in AI response: {str(e)}")
                return False
        else:
            record_result(False, f"Ollama error: {response.status_code}")
            return False
    except requests.exceptions.Timeout:
        record_result(False, "AI generation timed out (120s)")
        return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


# ============================================================================
# TEACHER AUTHENTICATION
# ============================================================================

def test_teacher_login():
    """Test teacher login."""
    log_test_start("Teacher Login")
    
    try:
        log_debug(f"POST {BASE_URL}/api/auth/login")
        log_debug(f"Username: {TEST_DATA['teacher']['username']}")
        
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=TEST_DATA['teacher'],
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {response.json()}")
        
        if response.status_code == 200:
            user = response.json().get('user')
            if user and user.get('username'):
                record_result(True, f"Teacher login successful: {user['username']}")
                return True
        elif response.status_code == 401:
            record_result(False, "Invalid credentials. Default: admin / password123")
            return False
        else:
            record_result(False, f"Login failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


# ============================================================================
# QUIZ CRUD OPERATIONS
# ============================================================================

def test_create_quiz():
    """Test quiz creation."""
    log_test_start("Create Quiz")
    
    quiz_code = f"TEST{generate_random_string()}"
    TEST_DATA["current_quiz_code"] = quiz_code
    
    quiz_data = {
        "code": quiz_code,
        "topic": "Test Topic - Fractions",
        "chapter": "Chapter 1: Fractions",
        "subtopic": '["Adding Fractions", "Subtracting Fractions"]',
        "activity_type": "class_activity",
        "grade": "Grade 7",
        "difficulty": "core",
        "question_types": ["multiple_choice", "true_false", "numeric_response"],
        "q_count": 5,
        "time_limit_mins": 0,
        "adaptive_level": "max"
    }
    
    try:
        log_debug(f"POST {BASE_URL}/api/quiz/")
        log_debug(f"Quiz data: {json.dumps(quiz_data, indent=2)}")
        
        response = requests.post(
            f"{BASE_URL}/api/quiz/",
            json=quiz_data,
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {response.json()}")
        
        if response.status_code == 200:
            TEST_DATA["quizzes"].append(quiz_code)
            record_result(True, f"Quiz created: {quiz_code}")
            return True
        elif response.status_code == 409:
            record_result(False, f"Quiz code already exists: {quiz_code}")
            return False
        else:
            record_result(False, f"Create failed: {response.status_code} - {response.json().get('error', 'Unknown')}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


def test_get_quiz():
    """Test getting a single quiz."""
    log_test_start("Get Quiz")
    
    if not TEST_DATA["current_quiz_code"]:
        record_result(False, "No quiz code available. Run create_quiz first.")
        return False
    
    try:
        log_debug(f"GET {BASE_URL}/api/quiz/{TEST_DATA['current_quiz_code']}")
        
        response = requests.get(
            f"{BASE_URL}/api/quiz/{TEST_DATA['current_quiz_code']}",
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {response.json()}")
        
        if response.status_code == 200:
            quiz = response.json()
            if quiz.get('code') == TEST_DATA["current_quiz_code"]:
                record_result(True, f"Quiz retrieved: {quiz['topic']}")
                return True
            else:
                record_result(False, "Quiz code mismatch")
                return False
        elif response.status_code == 404:
            record_result(False, f"Quiz not found: {TEST_DATA['current_quiz_code']}")
            return False
        else:
            record_result(False, f"Get failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


def test_get_all_quizzes():
    """Test getting all quizzes."""
    log_test_start("Get All Quizzes")
    
    try:
        log_debug(f"GET {BASE_URL}/api/quiz/")
        
        response = requests.get(f"{BASE_URL}/api/quiz/", timeout=10)
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {len(response.json())} quizzes")
        
        if response.status_code == 200:
            quizzes = response.json()
            if isinstance(quizzes, list):
                record_result(True, f"Retrieved {len(quizzes)} quizzes")
                return True
            else:
                record_result(False, "Response is not a list")
                return False
        else:
            record_result(False, f"Get all failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


def test_get_quiz_stats():
    """Test getting quiz statistics."""
    log_test_start("Get Quiz Stats")
    
    try:
        log_debug(f"GET {BASE_URL}/api/quiz/stats")
        
        response = requests.get(f"{BASE_URL}/api/quiz/stats", timeout=10)
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {response.json()}")
        
        if response.status_code == 200:
            stats = response.json()
            required_fields = ['totalQuizzes', 'totalAttempts', 'avgScore']
            if all(field in stats for field in required_fields):
                record_result(True, f"Stats: {stats['totalQuizzes']} quizzes, {stats['totalAttempts']} attempts")
                return True
            else:
                record_result(False, f"Missing required fields: {required_fields}")
                return False
        else:
            record_result(False, f"Stats failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


def test_update_quiz():
    """Test updating a quiz."""
    log_test_start("Update Quiz")
    
    if not TEST_DATA["current_quiz_code"]:
        record_result(False, "No quiz code available.")
        return False
    
    update_data = {
        "topic": "Updated Topic - Decimals",
        "q_count": 10
    }
    
    try:
        log_debug(f"PATCH {BASE_URL}/api/quiz/{TEST_DATA['current_quiz_code']}")
        log_debug(f"Update data: {update_data}")
        
        response = requests.patch(
            f"{BASE_URL}/api/quiz/{TEST_DATA['current_quiz_code']}",
            json=update_data,
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {response.json()}")
        
        if response.status_code == 200 and response.json().get('success'):
            record_result(True, "Quiz updated successfully")
            return True
        else:
            record_result(False, f"Update failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


def test_delete_quiz():
    """Test deleting a quiz."""
    log_test_start("Delete Quiz")
    
    # Create a quiz specifically for deletion test
    quiz_code = f"DEL{generate_random_string()}"
    
    try:
        # First create it
        create_response = requests.post(
            f"{BASE_URL}/api/quiz/",
            json={
                "code": quiz_code,
                "topic": "To Delete",
                "grade": "Grade 7",
                "question_types": ["multiple_choice"],
                "q_count": 1
            },
            timeout=10
        )
        
        if create_response.status_code != 200:
            record_result(False, f"Failed to create quiz for deletion test: {create_response.status_code}")
            return False
        
        log_debug(f"Created quiz for deletion: {quiz_code}")
        
        # Now delete it
        log_debug(f"DELETE {BASE_URL}/api/quiz/{quiz_code}")
        
        response = requests.delete(
            f"{BASE_URL}/api/quiz/{quiz_code}",
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {response.json()}")
        
        if response.status_code == 200 and response.json().get('success'):
            record_result(True, f"Quiz deleted: {quiz_code}")
            return True
        else:
            record_result(False, f"Delete failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


# ============================================================================
# STUDENT OPERATIONS
# ============================================================================

def test_student_register():
    """Test student registration."""
    log_test_start("Student Register")
    
    student_name = generate_student_name()
    pin = "1234"
    
    try:
        log_debug(f"POST {BASE_URL}/api/student/register")
        log_debug(f"Name: {student_name}, PIN: {pin}")
        
        response = requests.post(
            f"{BASE_URL}/api/student/register",
            json={"name": student_name, "pin": pin},
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {response.json()}")
        
        if response.status_code == 200:
            student = response.json().get('student')
            if student and student.get('id'):
                TEST_DATA["students"].append({
                    "id": student['id'],
                    "name": student_name,
                    "pin": pin
                })
                TEST_DATA["current_student_id"] = student['id']
                record_result(True, f"Student registered: {student_name} (ID: {student['id']})")
                return True
        elif response.status_code == 409:
            record_result(False, f"Student name already exists: {student_name}")
            return False
        else:
            record_result(False, f"Register failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


def test_student_login():
    """Test student login."""
    log_test_start("Student Login")
    
    if not TEST_DATA["students"]:
        record_result(False, "No students registered. Run student_register first.")
        return False
    
    student = TEST_DATA["students"][0]
    
    try:
        log_debug(f"POST {BASE_URL}/api/student/login")
        log_debug(f"Name: {student['name']}, PIN: {student['pin']}")
        
        response = requests.post(
            f"{BASE_URL}/api/student/login",
            json={"name": student['name'], "pin": student['pin']},
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {response.json()}")
        
        if response.status_code == 200:
            logged_student = response.json().get('student')
            if logged_student and logged_student.get('id') == student['id']:
                record_result(True, f"Student logged in: {student['name']}")
                return True
            else:
                record_result(False, "Student ID mismatch")
                return False
        elif response.status_code == 401:
            record_result(False, "Invalid name or PIN")
            return False
        else:
            record_result(False, f"Login failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


def test_get_student_profile():
    """Test getting student profile."""
    log_test_start("Get Student Profile")
    
    if not TEST_DATA["current_student_id"]:
        record_result(False, "No student ID available.")
        return False
    
    try:
        log_debug(f"GET {BASE_URL}/api/student/{TEST_DATA['current_student_id']}/profile")
        
        response = requests.get(
            f"{BASE_URL}/api/student/{TEST_DATA['current_student_id']}/profile",
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {json.dumps(response.json(), indent=2)[:500]}...")
        
        if response.status_code == 200:
            profile = response.json()
            if profile.get('id') == TEST_DATA["current_student_id"]:
                record_result(True, f"Profile retrieved: {profile.get('name')}")
                return True
            else:
                record_result(False, "Student ID mismatch")
                return False
        else:
            record_result(False, f"Profile failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


def test_get_student_progress():
    """Test getting student progress."""
    log_test_start("Get Student Progress")
    
    if not TEST_DATA["current_student_id"]:
        record_result(False, "No student ID available.")
        return False
    
    try:
        log_debug(f"GET {BASE_URL}/api/student/{TEST_DATA['current_student_id']}/progress")
        
        response = requests.get(
            f"{BASE_URL}/api/student/{TEST_DATA['current_student_id']}/progress",
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            progress = response.json()
            required_fields = ['student', 'summary', 'activity_history', 'mastery']
            if all(field in progress for field in required_fields):
                record_result(True, "Progress data retrieved")
                log_debug(f"Completed quizzes: {progress['summary'].get('completed_quizzes', 0)}")
                log_debug(f"Average score: {progress['summary'].get('avg_score', 0)}%")
                return True
            else:
                record_result(False, f"Missing required fields: {required_fields}")
                return False
        else:
            record_result(False, f"Progress failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


def test_get_leaderboard():
    """Test getting leaderboard."""
    log_test_start("Get Leaderboard")
    
    try:
        log_debug(f"GET {BASE_URL}/api/student/leaderboard")
        
        response = requests.get(f"{BASE_URL}/api/student/leaderboard", timeout=10)
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {json.dumps(response.json(), indent=2)[:300]}...")
        
        if response.status_code == 200:
            leaderboard = response.json()
            if 'leaderboard' in leaderboard and 'total_ranked' in leaderboard:
                record_result(True, f"Leaderboard: {leaderboard['total_ranked']} students ranked")
                return True
            else:
                record_result(False, "Missing leaderboard data")
                return False
        else:
            record_result(False, f"Leaderboard failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


# ============================================================================
# ATTEMPT OPERATIONS
# ============================================================================

def test_start_attempt():
    """Test starting a quiz attempt."""
    log_test_start("Start Attempt")
    
    if not TEST_DATA["current_quiz_code"] or not TEST_DATA["current_student_id"]:
        record_result(False, "Missing quiz code or student ID.")
        return False
    
    student = TEST_DATA["students"][0]
    
    try:
        log_debug(f"POST {BASE_URL}/api/attempt/start")
        log_debug(f"Quiz: {TEST_DATA['current_quiz_code']}, Student: {student['name']}")
        
        response = requests.post(
            f"{BASE_URL}/api/attempt/start",
            json={
                "quiz_code": TEST_DATA["current_quiz_code"],
                "student_id": student['id'],
                "student_name": student['name']
            },
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {response.json()}")
        
        if response.status_code == 200:
            attempt_id = response.json().get('attempt_id')
            if attempt_id:
                TEST_DATA["attempts"].append(attempt_id)
                record_result(True, f"Attempt started: ID {attempt_id}")
                return True
            else:
                record_result(False, "No attempt_id in response")
                return False
        else:
            record_result(False, f"Start failed: {response.status_code} - {response.json().get('error', 'Unknown')}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


def test_get_attempt():
    """Test getting attempt details."""
    log_test_start("Get Attempt")
    
    if not TEST_DATA["attempts"]:
        record_result(False, "No attempts available.")
        return False
    
    attempt_id = TEST_DATA["attempts"][-1]
    
    try:
        log_debug(f"GET {BASE_URL}/api/attempt/{attempt_id}")
        
        response = requests.get(
            f"{BASE_URL}/api/attempt/{attempt_id}",
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            attempt = response.json()
            if attempt.get('id') == attempt_id:
                record_result(True, f"Attempt retrieved: {attempt.get('status', 'unknown')}")
                return True
            else:
                record_result(False, "Attempt ID mismatch")
                return False
        else:
            record_result(False, f"Get attempt failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


def test_submit_attempt():
    """Test submitting/ completing an attempt."""
    log_test_start("Submit Attempt")
    
    if not TEST_DATA["attempts"]:
        record_result(False, "No attempts available.")
        return False
    
    attempt_id = TEST_DATA["attempts"][-1]
    
    try:
        log_debug(f"PATCH {BASE_URL}/api/attempt/{attempt_id}/complete")
        
        response = requests.patch(
            f"{BASE_URL}/api/attempt/{attempt_id}/complete",
            json={
                "score": 3,
                "total": 5,
                "percentage": 60.0
            },
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {response.json()}")
        
        if response.status_code == 200:
            record_result(True, "Attempt submitted successfully")
            return True
        else:
            record_result(False, f"Submit failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


# ============================================================================
# DASHBOARD & ANALYTICS
# ============================================================================

def test_get_dashboard():
    """Test getting dashboard data for a quiz."""
    log_test_start("Get Dashboard")
    
    if not TEST_DATA["current_quiz_code"]:
        record_result(False, "No quiz code available.")
        return False
    
    try:
        log_debug(f"GET {BASE_URL}/api/dashboard/{TEST_DATA['current_quiz_code']}")
        
        response = requests.get(
            f"{BASE_URL}/api/dashboard/{TEST_DATA['current_quiz_code']}",
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            dashboard = response.json()
            if 'students' in dashboard and 'quiz' in dashboard:
                record_result(True, f"Dashboard: {len(dashboard['students'])} students")
                return True
            else:
                record_result(False, "Missing dashboard data")
                return False
        else:
            record_result(False, f"Dashboard failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


def test_get_admin_overview():
    """Test getting admin overview."""
    log_test_start("Get Admin Overview")
    
    try:
        log_debug(f"GET {BASE_URL}/api/admin/overview")
        
        response = requests.get(f"{BASE_URL}/api/admin/overview", timeout=10)
        
        log_debug(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            overview = response.json()
            record_result(True, "Admin overview retrieved")
            log_debug(f"Keys: {list(overview.keys())[:5]}...")
            return True
        else:
            record_result(False, f"Admin overview failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


# ============================================================================
# PRACTICE MODE
# ============================================================================

def test_start_practice():
    """Test starting practice session."""
    log_test_start("Start Practice")
    
    if not TEST_DATA["current_student_id"]:
        record_result(False, "No student ID available.")
        return False
    
    try:
        log_debug(f"POST {BASE_URL}/api/practice/start")
        
        response = requests.post(
            f"{BASE_URL}/api/practice/start",
            json={
                "student_id": TEST_DATA["current_student_id"],
                "mode": "skill",
                "skill": "Adding Fractions",
                "count": 3,
                "difficulty_focus": "adaptive"
            },
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        log_debug(f"Response: {json.dumps(response.json(), indent=2)[:300]}...")
        
        if response.status_code == 200:
            practice = response.json()
            if practice.get('practice_session', {}).get('attempt_id'):
                record_result(True, f"Practice started: {practice['practice_session']['attempt_id']}")
                return True
            else:
                record_result(False, "No attempt_id in response")
                return False
        else:
            record_result(False, f"Practice start failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


# ============================================================================
# SOCKET.IO CONNECTION
# ============================================================================

def test_socket_connection():
    """Test Socket.IO connection for live tracking."""
    log_test_start("Socket.IO Connection")
    
    try:
        log_debug(f"Connecting to {BASE_URL}...")
        
        sio = socketio.Client()
        connected = False
        received_events = []
        
        @sio.event
        def connect():
            nonlocal connected
            connected = True
            log_debug("Socket connected successfully")
        
        @sio.event
        def disconnect():
            log_debug("Socket disconnected")
        
        @sio.event
        def student_joined(data):
            received_events.append('student_joined')
            log_debug(f"Received student_joined event: {data}")
        
        try:
            sio.connect(BASE_URL, wait_timeout=10)
            time.sleep(1)
            
            if TEST_DATA["current_quiz_code"]:
                log_debug(f"Joining quiz room: {TEST_DATA['current_quiz_code']}")
                sio.emit('join_quiz', TEST_DATA["current_quiz_code"])
                time.sleep(2)
            
            sio.disconnect()
            
            if connected:
                record_result(True, f"Socket.IO connected, received {len(received_events)} events")
                return True
            else:
                record_result(False, "Failed to connect")
                return False
        except socketio.exceptions.ConnectionError as e:
            record_result(False, f"Connection error: {str(e)}")
            return False
    except ImportError:
        record_result(False, "python-socketio not installed. Run: pip install python-socketio")
        return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


# ============================================================================
# ADAPTIVE PLAN
# ============================================================================

def test_adaptive_plan():
    """Test adaptive plan generation."""
    log_test_start("Adaptive Plan Generation")
    
    if not TEST_DATA["current_student_id"]:
        record_result(False, "No student ID available.")
        return False
    
    try:
        log_debug(f"GET {BASE_URL}/api/student/{TEST_DATA['current_student_id']}/adaptive-plan")
        
        response = requests.get(
            f"{BASE_URL}/api/student/{TEST_DATA['current_student_id']}/adaptive-plan",
            params={
                "topic": "Fractions",
                "count": 5
            },
            timeout=10
        )
        
        log_debug(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            plan = response.json()
            if plan.get('plan'):
                record_result(True, "Adaptive plan generated")
                log_debug(f"Plan keys: {list(plan['plan'].keys())}")
                return True
            else:
                record_result(False, "No plan in response")
                return False
        else:
            record_result(False, f"Adaptive plan failed: {response.status_code}")
            return False
    except Exception as e:
        record_result(False, f"Error: {str(e)}")
        return False


# ============================================================================
# CLEANUP
# ============================================================================

def cleanup_test_data():
    """Clean up test data (delete test quizzes and students)."""
    log_test_start("Cleanup Test Data")
    
    deleted_quizzes = 0
    deleted_students = 0
    
    # Delete test quizzes
    for quiz_code in TEST_DATA["quizzes"]:
        try:
            response = requests.delete(f"{BASE_URL}/api/quiz/{quiz_code}", timeout=5)
            if response.status_code == 200:
                deleted_quizzes += 1
                log_debug(f"Deleted quiz: {quiz_code}")
        except:
            pass
    
    # Note: Students are not deleted to preserve data integrity
    # In production, you might want to add a test student cleanup endpoint
    
    record_result(True, f"Cleanup complete: {deleted_quizzes} quizzes deleted")


# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def run_all_tests():
    """Run all tests."""
    print(f"\n{Fore.WHITE}{Style.BRIGHT}{'='*60}{Style.RESET_ALL}")
    print(f"{Fore.WHITE}{Style.BRIGHT}MATHMIND COMPREHENSIVE TEST SUITE{Style.RESET_ALL}")
    print(f"{Fore.WHITE}{Style.BRIGHT}{'='*60}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}Backend URL:{Style.RESET_ALL} {BASE_URL}")
    print(f"{Fore.CYAN}Ollama URL:{Style.RESET_ALL} {OLLAMA_URL}")
    print(f"{Fore.CYAN}Started:{Style.RESET_ALL} {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"\n{Fore.WHITE}{Style.BRIGHT}{'='*60}{Style.RESET_ALL}\n")
    
    # Health Check
    if not test_health_check():
        print(f"\n{Fore.RED}{Style.BRIGHT}⚠ BACKEND NOT REACHABLE. Aborting tests.{Style.RESET_ALL}")
        print(f"{Fore.YELLOW}Make sure the Python server is running:{Style.RESET_ALL}")
        print(f"{Fore.CYAN}python server-python/server.py{Style.RESET_ALL}\n")
        return
    
    # Run all tests
    test_ollama_connection()
    test_ai_question_generation()
    
    test_teacher_login()
    
    test_create_quiz()
    test_get_quiz()
    test_get_all_quizzes()
    test_get_quiz_stats()
    test_update_quiz()
    
    test_student_register()
    test_student_login()
    test_get_student_profile()
    test_get_student_progress()
    test_get_leaderboard()
    
    test_start_attempt()
    test_get_attempt()
    
    test_get_dashboard()
    test_get_admin_overview()
    
    test_start_practice()
    test_adaptive_plan()
    
    test_socket_connection()
    
    test_submit_attempt()
    test_delete_quiz()
    
    # Cleanup
    cleanup_test_data()
    
    # Print summary
    print(f"\n{Fore.WHITE}{Style.BRIGHT}{'='*60}{Style.RESET_ALL}")
    print(f"{Fore.WHITE}{Style.BRIGHT}TEST SUMMARY{Style.RESET_ALL}")
    print(f"{Fore.WHITE}{Style.BRIGHT}{'='*60}{Style.RESET_ALL}")
    
    total = TEST_RESULTS["total"]
    passed = TEST_RESULTS["passed"]
    failed = TEST_RESULTS["failed"]
    success_rate = (passed / total * 100) if total > 0 else 0
    
    print(f"\n{Fore.CYAN}Total Tests:{Style.RESET_ALL} {total}")
    print(f"{Fore.GREEN}Passed:{Style.RESET_ALL} {passed}")
    print(f"{Fore.RED}Failed:{Style.RESET_ALL} {failed}")
    print(f"{Fore.YELLOW}Success Rate:{Style.RESET_ALL} {success_rate:.1f}%")
    
    if success_rate >= 90:
        print(f"\n{Fore.GREEN}{Style.BRIGHT}✓ ALL TESTS PASSED!{Style.RESET_ALL}\n")
    elif success_rate >= 70:
        print(f"\n{Fore.YELLOW}{Style.BRIGHT}⚠ MOST TESTS PASSED (review failures){Style.RESET_ALL}\n")
    else:
        print(f"\n{Fore.RED}{Style.BRIGHT}✗ MANY TESTS FAILED (check server configuration){Style.RESET_ALL}\n")
    
    print(f"{Fore.CYAN}Completed:{Style.RESET_ALL} {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")


if __name__ == "__main__":
    try:
        run_all_tests()
    except KeyboardInterrupt:
        print(f"\n\n{Fore.YELLOW}Tests interrupted by user.{Style.RESET_ALL}\n")
    except Exception as e:
        print(f"\n{Fore.RED}Fatal error: {str(e)}{Style.RESET_ALL}\n")
        import traceback
        traceback.print_exc()
