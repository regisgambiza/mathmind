import os
import logging
from datetime import datetime
from threading import local
import json
import psycopg2
import psycopg2.extras
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# Logger setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('db')

DATABASE_URL = os.environ.get('DATABASE_URL')

_thread_local = local()

def get_schema():
    """Returns the PostgreSQL schema."""
    schema = '''
    CREATE TABLE IF NOT EXISTS quizzes (
        id          SERIAL PRIMARY KEY,
        code        TEXT UNIQUE NOT NULL,
        topic       TEXT NOT NULL,
        chapter     TEXT,
        subtopic    TEXT,
        activity_type TEXT DEFAULT 'class_activity',
        grade       TEXT NOT NULL,
        difficulty  TEXT DEFAULT 'core',
        question_types TEXT NOT NULL,
        type_weights TEXT,
        q_count     INTEGER NOT NULL,
        time_limit_mins INTEGER DEFAULT 0,
        release_at  TIMESTAMP,
        close_at    TIMESTAMP,
        extra_instructions TEXT,
        class_name  TEXT,
        section_name TEXT,
        adaptive_level TEXT DEFAULT 'max',
        course_id   TEXT,
        topic_id    TEXT,
        coursework_id TEXT,
        posted_to_classroom BOOLEAN DEFAULT FALSE,
        created_by  TEXT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS students (
        id                SERIAL PRIMARY KEY,
        name              TEXT,
        pin               TEXT,
        google_id         TEXT,
        email             TEXT,
        xp                INTEGER DEFAULT 0,
        level             INTEGER DEFAULT 1,
        streak_days       INTEGER DEFAULT 0,
        best_streak_days  INTEGER DEFAULT 0,
        total_quizzes     INTEGER DEFAULT 0,
        leaderboard_opt_in BOOLEAN DEFAULT TRUE,
        consent_opt_in    BOOLEAN DEFAULT TRUE,
        last_activity_date DATE,
        last_login_at     TIMESTAMP,
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS attempts (
        id            SERIAL PRIMARY KEY,
        quiz_code     TEXT NOT NULL REFERENCES quizzes(code),
        student_id    INTEGER REFERENCES students(id),
        student_name  TEXT NOT NULL,
        started_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at  TIMESTAMP,
        score         INTEGER,
        total         INTEGER,
        percentage    REAL,
        time_taken_s  INTEGER,
        xp_earned     INTEGER DEFAULT 0,
        level_after   INTEGER,
        streak_after  INTEGER,
        rewards_json  TEXT,
        status        TEXT DEFAULT 'in_progress',
        current_question INTEGER DEFAULT 0,
        last_activity_at TIMESTAMP,
        socket_id     TEXT
    );
    CREATE TABLE IF NOT EXISTS answers (
        id            SERIAL PRIMARY KEY,
        attempt_id    INTEGER NOT NULL REFERENCES attempts(id),
        q_index       INTEGER NOT NULL,
        q_type        TEXT NOT NULL,
        skill_tag     TEXT,
        difficulty    TEXT,
        excluded      BOOLEAN DEFAULT FALSE,
        question_text TEXT,
        student_answer TEXT,
        correct_answer TEXT,
        is_correct    INTEGER,
        time_taken_s  INTEGER
    );
    CREATE TABLE IF NOT EXISTS violations (
        id            SERIAL PRIMARY KEY,
        attempt_id    INTEGER NOT NULL REFERENCES attempts(id),
        quiz_code     TEXT NOT NULL,
        student_name  TEXT NOT NULL,
        violation_num INTEGER NOT NULL,
        left_at       TIMESTAMP NOT NULL,
        returned_at   TIMESTAMP,
        away_seconds  INTEGER
    );
    CREATE TABLE IF NOT EXISTS teachers (
        id                     SERIAL PRIMARY KEY,
        username               TEXT UNIQUE NOT NULL,
        password               TEXT,
        google_id              TEXT,
        email                  TEXT,
        name                   TEXT,
        google_refresh_token   TEXT,
        google_access_token    TEXT,
        google_token_expires_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS student_badges (
        id          SERIAL PRIMARY KEY,
        student_id  INTEGER NOT NULL REFERENCES students(id),
        badge_code  TEXT NOT NULL,
        unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, badge_code)
    );
    CREATE TABLE IF NOT EXISTS student_quest_claims (
        id            SERIAL PRIMARY KEY,
        student_id    INTEGER NOT NULL REFERENCES students(id),
        quest_code    TEXT NOT NULL,
        week_start    DATE NOT NULL,
        points_awarded INTEGER NOT NULL,
        claimed_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, quest_code, week_start)
    );
    CREATE TABLE IF NOT EXISTS gamification_events (
        id            SERIAL PRIMARY KEY,
        student_id    INTEGER NOT NULL REFERENCES students(id),
        attempt_id    INTEGER REFERENCES attempts(id),
        event_type    TEXT NOT NULL,
        points        INTEGER NOT NULL,
        detail_json   TEXT,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS adaptive_plan_events (
        id            SERIAL PRIMARY KEY,
        student_id    INTEGER NOT NULL REFERENCES students(id),
        quiz_code     TEXT,
        topic         TEXT,
        chapter       TEXT,
        subtopics_json TEXT,
        has_history   BOOLEAN DEFAULT FALSE,
        fallback_used BOOLEAN DEFAULT FALSE,
        mastery_overall REAL,
        recent_accuracy REAL,
        trend         TEXT,
        plan_json     TEXT,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS admin_settings (
        setting_key   TEXT PRIMARY KEY,
        value_json    TEXT NOT NULL,
        updated_by    TEXT,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS feature_flags (
        flag_key      TEXT PRIMARY KEY,
        enabled       BOOLEAN DEFAULT TRUE,
        rollout_pct   INTEGER DEFAULT 100,
        config_json   TEXT,
        updated_by    TEXT,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS assignment_schedules (
        id            SERIAL PRIMARY KEY,
        quiz_code     TEXT NOT NULL REFERENCES quizzes(code),
        class_name    TEXT,
        section_name  TEXT,
        release_at    TIMESTAMP,
        close_at      TIMESTAMP,
        status        TEXT DEFAULT 'scheduled',
        created_by    TEXT,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS generated_question_sets (
        id            SERIAL PRIMARY KEY,
        quiz_code     TEXT,
        attempt_id    INTEGER REFERENCES attempts(id),
        student_id    INTEGER REFERENCES students(id),
        questions_json TEXT NOT NULL,
        status        TEXT DEFAULT 'pending',
        reviewer      TEXT,
        notes         TEXT,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at   TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS manual_overrides (
        id            SERIAL PRIMARY KEY,
        attempt_id    INTEGER NOT NULL REFERENCES attempts(id),
        override_type TEXT NOT NULL,
        old_value_json TEXT,
        new_value_json TEXT,
        reason        TEXT,
        actor         TEXT,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS parent_contacts (
        id            SERIAL PRIMARY KEY,
        student_id    INTEGER NOT NULL REFERENCES students(id),
        parent_name   TEXT NOT NULL,
        email         TEXT,
        phone         TEXT,
        opt_in        BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS parent_alerts (
        id            SERIAL PRIMARY KEY,
        student_id    INTEGER NOT NULL REFERENCES students(id),
        parent_contact_id INTEGER REFERENCES parent_contacts(id),
        alert_type    TEXT NOT NULL,
        message       TEXT NOT NULL,
        status        TEXT DEFAULT 'queued',
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at       TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS data_requests (
        id            SERIAL PRIMARY KEY,
        student_id    INTEGER REFERENCES students(id),
        request_type  TEXT NOT NULL,
        status        TEXT DEFAULT 'pending',
        note          TEXT,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at   TIMESTAMP,
        resolved_by   TEXT
    );
    CREATE TABLE IF NOT EXISTS quest_definitions (
        id            SERIAL PRIMARY KEY,
        code          TEXT UNIQUE NOT NULL,
        name          TEXT NOT NULL,
        description   TEXT NOT NULL,
        metric        TEXT NOT NULL,
        target_value  REAL NOT NULL,
        reward_xp     INTEGER NOT NULL,
        season_label  TEXT,
        active        BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS badge_definitions (
        id            SERIAL PRIMARY KEY,
        code          TEXT UNIQUE NOT NULL,
        name          TEXT NOT NULL,
        description   TEXT,
        icon          TEXT,
        season_label  TEXT,
        active        BOOLEAN DEFAULT TRUE,
        auto_award    BOOLEAN DEFAULT TRUE,
        criteria_type TEXT DEFAULT 'quizzes_completed',
        target_value  INTEGER DEFAULT 1,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
        id            SERIAL PRIMARY KEY,
        actor         TEXT,
        action        TEXT NOT NULL,
        target_type   TEXT,
        target_id     TEXT,
        reason        TEXT,
        detail_json   TEXT,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS system_events (
        id            SERIAL PRIMARY KEY,
        event_type    TEXT NOT NULL,
        level         TEXT DEFAULT 'info',
        message       TEXT,
        path          TEXT,
        status_code   INTEGER,
        latency_ms    REAL,
        detail_json   TEXT,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS grade_sync_queue (
        id              SERIAL PRIMARY KEY,
        course_id       TEXT NOT NULL,
        coursework_id   TEXT NOT NULL,
        student_email   TEXT NOT NULL,
        percentage      REAL NOT NULL,
        status          TEXT DEFAULT 'pending',
        retry_count     INTEGER DEFAULT 0,
        error_message   TEXT,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        synced_at       TIMESTAMP
    );
    '''
    return schema

class CursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor
        self.lastrowid = None

    def fetchone(self):
        row = self.cursor.fetchone()
        return dict(row) if row else None

    def fetchall(self):
        rows = self.cursor.fetchall()
        return [dict(r) for r in rows]

    def __iter__(self):
        for row in self.cursor:
            yield dict(row)

    def __getattr__(self, name):
        return getattr(self.cursor, name)

class DBWrapper:
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql, params=()):
        """Execute a PostgreSQL query. Handles some basic compatibility for legacy code."""
        # Legacy placeholder compatibility: ? -> %s
        if '?' in sql:
            sql = sql.replace('?', '%s')
            
        # SQLite compatibility for INSERT OR IGNORE
        if 'INSERT OR IGNORE' in sql.upper():
            sql = sql.replace('INSERT OR IGNORE INTO', 'INSERT INTO')
            if 'ON CONFLICT' not in sql.upper():
                sql += ' ON CONFLICT DO NOTHING'

        # Auto-append RETURNING id for inserts if not present and likely needed
        is_insert = sql.strip().upper().startswith('INSERT') and 'RETURNING' not in sql.upper()
        if is_insert:
            sql += ' RETURNING id'

        cursor = self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        try:
            cursor.execute(sql, params)
            wrapper = CursorWrapper(cursor)
            if is_insert:
                try:
                    res = cursor.fetchone()
                    if res:
                        wrapper.lastrowid = res[0]
                except:
                    pass
            return wrapper
        except Exception as e:
            logger.error(f"PostgreSQL Error: {e} | SQL: {sql} | Params: {params}")
            self.conn.rollback()
            raise e

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def fetchall(self, sql, params=()):
        cur = self.execute(sql, params)
        return cur.fetchall()

    def fetchone(self, sql, params=()):
        cur = self.execute(sql, params)
        return cur.fetchone()

    def close(self):
        self.conn.close()

def get_db():
    if not hasattr(_thread_local, 'db'):
        if not DATABASE_URL:
            # Fallback to a local postgres if not set (for docker-compose)
            db_url = "postgresql://postgres:postgres@localhost:5432/mathmind"
            logger.warning(f"DATABASE_URL not set, using default: {db_url}")
        else:
            db_url = DATABASE_URL
            
        try:
            conn = psycopg2.connect(db_url)
            _thread_local.db = DBWrapper(conn)
            logger.info("Connected to PostgreSQL")
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}")
            raise e
            
    return _thread_local.db

def init_db():
    db = get_db()
    schema = get_schema()
    
    # Execute each statement
    # Pre-split to handle large blocks
    for stmt in schema.split(';'):
        stmt = stmt.strip()
        if stmt:
            try:
                db.execute(stmt)
            except Exception as e:
                # Table already exists is fine
                if 'already exists' in str(e).lower():
                    continue
                logger.warning(f"Schema error: {e}")
    
    db.commit()
    
    # Seeding
    try:
        # Feature Flags
        db.execute("INSERT INTO feature_flags (flag_key, enabled, config_json) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", ('adaptive_engine', True, '{"mode":"mastery"}'))
        db.execute("INSERT INTO feature_flags (flag_key, enabled, config_json) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", ('content_approval_required', False, '{"scope":"global"}'))

        # Admin Settings
        db.execute("INSERT INTO admin_settings (setting_key, value_json) VALUES (%s, %s) ON CONFLICT DO NOTHING", ('leaderboard_controls', '{"enabled":true,"anonymize":false,"class_only":false}'))
        db.execute("INSERT INTO admin_settings (setting_key, value_json) VALUES (%s, %s) ON CONFLICT DO NOTHING", ('data_retention_days', '{"days":365}'))

        # Quests
        quests = [
            ('weekly_3_quizzes', 'Weekly Warmup', 'Complete 3 quizzes this week.', 'attempts_weekly', 3, 90),
            ('weekly_accuracy_80', 'Accuracy Builder', 'Average 80%+ across at least 3 quizzes this week.', 'avg_pct_weekly', 80, 120),
            ('weekly_high_score', 'Ace One', 'Score at least 90% once this week.', 'high_scores_weekly', 1, 70)
        ]
        for q in quests:
            db.execute("INSERT INTO quest_definitions (code, name, description, metric, target_value, reward_xp) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING", q)

        # Badges
        badges = [
            ('first_quiz', 'First Steps', 'Complete your first quiz.', 'seed'),
            ('streak_3', 'Consistent Learner', 'Maintain a 3-day study streak.', 'flame'),
            ('streak_7', 'Streak Master', 'Maintain a 7-day study streak.', 'fire'),
            ('perfect_100', 'Perfect Run', 'Score 100% on a quiz.', 'crown'),
            ('quiz_10', 'Quiz Explorer', 'Complete 10 quizzes.', 'map'),
            ('quiz_25', 'Math Marathoner', 'Complete 25 quizzes.', 'trophy'),
            ('high_achiever', 'High Achiever', 'Score 90%+ on 5 quizzes.', 'star'),
            ('level_5', 'Level Up', 'Reach level 5.', 'rocket'),
            ('quest_champion', 'Quest Champion', 'Complete every weekly quest.', 'medal')
        ]
        for b in badges:
            db.execute("INSERT INTO badge_definitions (code, name, description, icon) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", b)

        # Default Teacher
        db.execute("INSERT INTO teachers (username, password) VALUES (%s, %s) ON CONFLICT DO NOTHING", ('admin', 'password123'))
        
        db.commit()
        logger.info("Database seeded successfully")
    except Exception as e:
        logger.warning(f"Error seeding database: {e}")

    return db

def close_db():
    if hasattr(_thread_local, 'db'):
        _thread_local.db.close()
        del _thread_local.db

# Initialize on import
try:
    init_db()
except:
    logger.warning("Auto-init failed (likely no DB connection)")
