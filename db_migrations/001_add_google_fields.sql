-- Google Classroom Integration - Schema Migration
-- Created: 2026-03-12
-- Branch: feature/google-classroom
-- Description: Add Google OAuth and Classroom tracking fields

-- ============================================
-- TEACHERS TABLE
-- ============================================

-- Google account fields (without UNIQUE constraint initially)
ALTER TABLE teachers ADD COLUMN google_id TEXT;
ALTER TABLE teachers ADD COLUMN google_email TEXT;
ALTER TABLE teachers ADD COLUMN google_refresh_token TEXT;
ALTER TABLE teachers ADD COLUMN google_access_token TEXT;
ALTER TABLE teachers ADD COLUMN google_token_expiry TEXT;
ALTER TABLE teachers ADD COLUMN classroom_connected INTEGER DEFAULT 0;
ALTER TABLE teachers ADD COLUMN active INTEGER DEFAULT 1;

-- ============================================
-- STUDENTS TABLE
-- ============================================

-- Google account fields (without UNIQUE constraint initially)
ALTER TABLE students ADD COLUMN google_email TEXT;
ALTER TABLE students ADD COLUMN classroom_roster_id TEXT;
ALTER TABLE students ADD COLUMN classroom_profile_json TEXT;

-- ============================================
-- QUIZZES TABLE
-- ============================================

-- Google Classroom tracking
ALTER TABLE quizzes ADD COLUMN classroom_course_id TEXT;
ALTER TABLE quizzes ADD COLUMN classroom_coursework_id TEXT;
ALTER TABLE quizzes ADD COLUMN classroom_topic_id TEXT;
ALTER TABLE quizzes ADD COLUMN classroom_topic_name TEXT;
ALTER TABLE quizzes ADD COLUMN teacher_id INTEGER;
ALTER TABLE quizzes ADD COLUMN created_by TEXT;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_teachers_google_email ON teachers(google_email);
CREATE INDEX IF NOT EXISTS idx_teachers_active ON teachers(active);
CREATE INDEX IF NOT EXISTS idx_students_google_email ON students(google_email);
CREATE INDEX IF NOT EXISTS idx_quizzes_classroom_course ON quizzes(classroom_course_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_classroom_coursework ON quizzes(classroom_coursework_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_code ON quizzes(code);

-- ============================================
-- SEED DATA (Optional - for testing)
-- ============================================

-- Add test teacher (update with real email)
-- INSERT OR IGNORE INTO teachers (username, google_email, password, active) 
-- VALUES ('test_teacher', 'test@yourschool.edu', 'temp_password', 1);

-- ============================================
-- VERIFICATION QUERY
-- ============================================

-- Run this to verify migration:
-- SELECT name FROM sqlite_master WHERE type='table' AND name IN ('teachers', 'students', 'quizzes');
-- PRAGMA table_info(teachers);
-- PRAGMA table_info(students);
-- PRAGMA table_info(quizzes);
