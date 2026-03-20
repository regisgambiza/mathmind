import os
import sqlite3
import logging
from datetime import datetime
from threading import local
import re

# Conditional import for Postgres support
try:
    import psycopg2
    import psycopg2.extras
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    HAS_POSTGRES = True
except ImportError:
    HAS_POSTGRES = False

# Logger setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('db')

DATABASE_URL = os.environ.get('DATABASE_URL')
DB_PATH = os.path.join(os.path.dirname(__file__), 'mathmind.db')

_thread_local = local()

# Final schema version (Postgres compatible)
def get_schema(is_postgres=False):
    auto_inc = "SERIAL" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"
    pk_id = f"id {auto_inc}" if is_postgres else f"id {auto_inc}"
    now_fn = "CURRENT_TIMESTAMP" if is_postgres else "(datetime('now'))"
    text_type = "TEXT"
    bool_type = "INTEGER" # Keep as integer for both to avoid type issues

    # Note: Using %s placeholders for schema definitions here for clarity
    schema = f'''
    CREATE TABLE IF NOT EXISTS quizzes (
        id          {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
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
        release_at  TEXT,
        close_at    TEXT,
        extra_instructions TEXT,
        class_name  TEXT,
        section_name TEXT,
        adaptive_level TEXT DEFAULT 'max',
        course_id   TEXT,
        topic_id    TEXT,
        coursework_id TEXT,
        posted_to_classroom INTEGER DEFAULT 0,
        created_by  TEXT,
        created_at  TEXT DEFAULT {now_fn}
    );
    CREATE TABLE IF NOT EXISTS students (
        id                {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        name              TEXT,
        pin               TEXT,
        google_id         TEXT,
        email             TEXT,
        xp                INTEGER DEFAULT 0,
        level             INTEGER DEFAULT 1,
        streak_days       INTEGER DEFAULT 0,
        best_streak_days  INTEGER DEFAULT 0,
        total_quizzes     INTEGER DEFAULT 0,
        leaderboard_opt_in INTEGER DEFAULT 1,
        consent_opt_in    INTEGER DEFAULT 1,
        last_activity_date TEXT,
        last_login_at     TEXT,
        created_at        TEXT DEFAULT {now_fn}
    );
    CREATE TABLE IF NOT EXISTS attempts (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        quiz_code     TEXT NOT NULL,
        student_id    INTEGER,
        student_name  TEXT NOT NULL,
        started_at    TEXT DEFAULT {now_fn},
        completed_at  TEXT,
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
        last_activity_at TEXT,
        socket_id     TEXT,
        FOREIGN KEY (quiz_code) REFERENCES quizzes(code),
        FOREIGN KEY (student_id) REFERENCES students(id)
    );
    CREATE TABLE IF NOT EXISTS answers (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        attempt_id    INTEGER NOT NULL,
        q_index       INTEGER NOT NULL,
        q_type        TEXT NOT NULL,
        skill_tag     TEXT,
        difficulty    TEXT,
        excluded      INTEGER DEFAULT 0,
        question_text TEXT,
        student_answer TEXT,
        correct_answer TEXT,
        is_correct    INTEGER,
        time_taken_s  INTEGER,
        FOREIGN KEY (attempt_id) REFERENCES attempts(id)
    );
    CREATE TABLE IF NOT EXISTS violations (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        attempt_id    INTEGER NOT NULL,
        quiz_code     TEXT NOT NULL,
        student_name  TEXT NOT NULL,
        violation_num INTEGER NOT NULL,
        left_at       TEXT NOT NULL,
        returned_at   TEXT,
        away_seconds  INTEGER,
        FOREIGN KEY (attempt_id) REFERENCES attempts(id)
    );
    CREATE TABLE IF NOT EXISTS teachers (
        id                     {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        username               TEXT UNIQUE NOT NULL,
        password               TEXT,
        google_id              TEXT,
        email                  TEXT,
        name                   TEXT,
        google_refresh_token   TEXT,
        google_access_token    TEXT,
        google_token_expires_at TEXT
    );
    CREATE TABLE IF NOT EXISTS student_badges (
        id          {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        student_id  INTEGER NOT NULL,
        badge_code  TEXT NOT NULL,
        unlocked_at TEXT DEFAULT {now_fn},
        UNIQUE(student_id, badge_code),
        FOREIGN KEY (student_id) REFERENCES students(id)
    );
    CREATE TABLE IF NOT EXISTS student_quest_claims (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        student_id    INTEGER NOT NULL,
        quest_code    TEXT NOT NULL,
        week_start    TEXT NOT NULL,
        points_awarded INTEGER NOT NULL,
        claimed_at    TEXT DEFAULT {now_fn},
        UNIQUE(student_id, quest_code, week_start),
        FOREIGN KEY (student_id) REFERENCES students(id)
    );
    CREATE TABLE IF NOT EXISTS gamification_events (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        student_id    INTEGER NOT NULL,
        attempt_id    INTEGER,
        event_type    TEXT NOT NULL,
        points        INTEGER NOT NULL,
        detail_json   TEXT,
        created_at    TEXT DEFAULT {now_fn},
        FOREIGN KEY (student_id) REFERENCES students(id),
        FOREIGN KEY (attempt_id) REFERENCES attempts(id)
    );
    CREATE TABLE IF NOT EXISTS admin_settings (
        setting_key   TEXT PRIMARY KEY,
        value_json    TEXT NOT NULL,
        updated_by    TEXT,
        updated_at    TEXT DEFAULT {now_fn}
    );
    CREATE TABLE IF NOT EXISTS feature_flags (
        flag_key      TEXT PRIMARY KEY,
        enabled       INTEGER DEFAULT 1,
        rollout_pct   INTEGER DEFAULT 100,
        config_json   TEXT,
        updated_by    TEXT,
        updated_at    TEXT DEFAULT {now_fn}
    );
    CREATE TABLE IF NOT EXISTS grade_sync_queue (
        id              {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        course_id       TEXT NOT NULL,
        coursework_id   TEXT NOT NULL,
        student_email   TEXT NOT NULL,
        percentage      REAL NOT NULL,
        status          TEXT DEFAULT 'pending',
        retry_count     INTEGER DEFAULT 0,
        error_message   TEXT,
        created_at      TEXT DEFAULT {now_fn},
        synced_at       TEXT
    );
    CREATE TABLE IF NOT EXISTS quest_definitions (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        code          TEXT UNIQUE NOT NULL,
        name          TEXT NOT NULL,
        description   TEXT NOT NULL,
        metric        TEXT NOT NULL,
        target_value  REAL NOT NULL,
        reward_xp     INTEGER NOT NULL,
        season_label  TEXT,
        active        INTEGER DEFAULT 1,
        created_at    TEXT DEFAULT {now_fn},
        updated_at    TEXT DEFAULT {now_fn}
    );
    CREATE TABLE IF NOT EXISTS badge_definitions (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        code          TEXT UNIQUE NOT NULL,
        name          TEXT NOT NULL,
        description   TEXT,
        icon          TEXT,
        season_label  TEXT,
        active        INTEGER DEFAULT 1,
        auto_award    INTEGER DEFAULT 1,
        criteria_type TEXT DEFAULT 'quizzes_completed',
        target_value  INTEGER DEFAULT 1,
        created_at    TEXT DEFAULT {now_fn},
        updated_at    TEXT DEFAULT {now_fn}
    );
    '''
    return schema

# Compatibility Layer
class DBWrapper:
    def __init__(self, conn, is_postgres=False):
        self._conn = conn
        self.is_postgres = is_postgres

    def execute(self, sql, params=()):
        if self.is_postgres:
            # Simple conversion from ? to %s for Postgres
            if '?' in sql:
                sql = sql.replace('?', '%s')
            
            # Handle SQLite specific dialect stuff
            sql = re.sub(r'INSERT OR IGNORE INTO', 'INSERT INTO', sql, flags=re.IGNORECASE)
            if 'INSERT INTO' in sql.upper() and 'ON CONFLICT' not in sql.upper():
                # Note: Adding ON CONFLICT is complex globally, so we rely on routes being Postgres-aware if needed
                # or we just let it fail if it's a conflict and not handled.
                pass
            
            # Date conversions
            sql = re.sub(r'datetime\(\'now\'\)', 'CURRENT_TIMESTAMP', sql, flags=re.IGNORECASE)
            sql = re.sub(r'date\(\"now\"\)', 'CURRENT_DATE', sql, flags=re.IGNORECASE)

            cursor = self._conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            try:
                cursor.execute(sql, params)
                return cursor
            except Exception as e:
                logger.error(f"SQL Error: {sql} | Params: {params}")
                raise e
        else:
            return self._conn.execute(sql, params)

    def commit(self):
        self._conn.commit()

    def fetchall(self, sql, params=()):
        cur = self.execute(sql, params)
        return cur.fetchall()

    def fetchone(self, sql, params=()):
        cur = self.execute(sql, params)
        return cur.fetchone()

    def close(self):
        self._conn.close()

def get_db():
    if not hasattr(_thread_local, 'db'):
        if DATABASE_URL and HAS_POSTGRES:
            logger.info("Using PostgreSQL Backend")
            # Connect to Postgres
            conn = psycopg2.connect(DATABASE_URL)
            _thread_local.db = DBWrapper(conn, is_postgres=True)
        else:
            logger.info("Using SQLite Backend")
            conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute('PRAGMA journal_mode=WAL')
            _thread_local.db = DBWrapper(conn, is_postgres=False)
    return _thread_local.db

def init_db():
    db = get_db()
    is_postgres = db.is_postgres
    schema = get_schema(is_postgres)
    
    statements = schema.split(';')
    for stmt in statements:
        stmt = stmt.strip()
        if stmt:
            try:
                db.execute(stmt)
            except Exception as e:
                # Ignore duplicate table/column errors in Postgres/SQLite
                if 'already exists' in str(e).lower() or 'duplicate' in str(e).lower():
                    continue
                logger.warning(f"Error initializing DB statement: {stmt} | Error: {e}")
    
    db.commit()
    
    # Simple seed for default users if empty
    try:
        if is_postgres:
            db.execute("INSERT INTO teachers (username, password) SELECT 'admin', 'password123' WHERE NOT EXISTS (SELECT 1 FROM teachers WHERE username = 'admin')")
        else:
            db.execute("INSERT OR IGNORE INTO teachers (username, password) VALUES (?, ?)", ('admin', 'password123'))
        db.commit()
    except:
        pass

    return db

def close_db():
    if hasattr(_thread_local, 'db'):
        _thread_local.db.close()
        del _thread_local.db

# Auto-init on import
init_db()

