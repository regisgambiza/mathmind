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
    CREATE TABLE IF NOT EXISTS adaptive_plan_events (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        student_id    INTEGER NOT NULL,
        quiz_code     TEXT,
        topic         TEXT,
        chapter       TEXT,
        subtopics_json TEXT,
        has_history   INTEGER DEFAULT 0,
        fallback_used INTEGER DEFAULT 0,
        mastery_overall REAL,
        recent_accuracy REAL,
        trend         TEXT,
        plan_json     TEXT,
        created_at    TEXT DEFAULT {now_fn},
        FOREIGN KEY (student_id) REFERENCES students(id)
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
    CREATE TABLE IF NOT EXISTS assignment_schedules (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        quiz_code     TEXT NOT NULL,
        class_name    TEXT,
        section_name  TEXT,
        release_at    TEXT,
        close_at      TEXT,
        status        TEXT DEFAULT 'scheduled',
        created_by    TEXT,
        created_at    TEXT DEFAULT {now_fn},
        updated_at    TEXT DEFAULT {now_fn},
        FOREIGN KEY (quiz_code) REFERENCES quizzes(code)
    );
    CREATE TABLE IF NOT EXISTS generated_question_sets (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        quiz_code     TEXT,
        attempt_id    INTEGER,
        student_id    INTEGER,
        questions_json TEXT NOT NULL,
        status        TEXT DEFAULT 'pending',
        reviewer      TEXT,
        notes         TEXT,
        created_at    TEXT DEFAULT {now_fn},
        reviewed_at   TEXT,
        FOREIGN KEY (attempt_id) REFERENCES attempts(id),
        FOREIGN KEY (student_id) REFERENCES students(id)
    );
    CREATE TABLE IF NOT EXISTS manual_overrides (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        attempt_id    INTEGER NOT NULL,
        override_type TEXT NOT NULL,
        old_value_json TEXT,
        new_value_json TEXT,
        reason        TEXT,
        actor         TEXT,
        created_at    TEXT DEFAULT {now_fn},
        FOREIGN KEY (attempt_id) REFERENCES attempts(id)
    );
    CREATE TABLE IF NOT EXISTS parent_contacts (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        student_id    INTEGER NOT NULL,
        parent_name   TEXT NOT NULL,
        email         TEXT,
        phone         TEXT,
        opt_in        INTEGER DEFAULT 1,
        created_at    TEXT DEFAULT {now_fn},
        FOREIGN KEY (student_id) REFERENCES students(id)
    );
    CREATE TABLE IF NOT EXISTS parent_alerts (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        student_id    INTEGER NOT NULL,
        parent_contact_id INTEGER,
        alert_type    TEXT NOT NULL,
        message       TEXT NOT NULL,
        status        TEXT DEFAULT 'queued',
        created_at    TEXT DEFAULT {now_fn},
        sent_at       TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id),
        FOREIGN KEY (parent_contact_id) REFERENCES parent_contacts(id)
    );
    CREATE TABLE IF NOT EXISTS data_requests (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        student_id    INTEGER,
        request_type  TEXT NOT NULL,
        status        TEXT DEFAULT 'pending',
        note          TEXT,
        created_at    TEXT DEFAULT {now_fn},
        resolved_at   TEXT,
        resolved_by   TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id)
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
    CREATE TABLE IF NOT EXISTS audit_logs (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        actor         TEXT,
        action        TEXT NOT NULL,
        target_type   TEXT,
        target_id     TEXT,
        reason        TEXT,
        detail_json   TEXT,
        created_at    TEXT DEFAULT {now_fn}
    );
    CREATE TABLE IF NOT EXISTS system_events (
        id            {"SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"},
        event_type    TEXT NOT NULL,
        level         TEXT DEFAULT 'info',
        message       TEXT,
        path          TEXT,
        status_code   INTEGER,
        latency_ms    REAL,
        detail_json   TEXT,
        created_at    TEXT DEFAULT {now_fn}
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
    '''
    return schema

# Compatibility Layer
class CursorWrapper:
    def __init__(self, cursor, is_postgres=False):
        self.cursor = cursor
        self.is_postgres = is_postgres
        self.lastrowid = None
        if hasattr(cursor, 'lastrowid'):
            self.lastrowid = cursor.lastrowid

    def fetchone(self):
        row = self.cursor.fetchone()
        if row is None: return None
        return dict(row) if self.is_postgres else row

    def fetchall(self):
        rows = self.cursor.fetchall()
        return [dict(r) for r in rows] if self.is_postgres else rows

    def __iter__(self):
        return iter(self.cursor)

    def __getattr__(self, name):
        return getattr(self.cursor, name)

class DBWrapper:
    def __init__(self, conn, is_postgres=False):
        self.conn = conn
        self.is_postgres = is_postgres

    def execute(self, sql, params=()):
        if self.is_postgres:
            # Postgres compatibility
            sql = re.sub(r'\?', r'%s', sql)
            sql = re.sub(r'INSERT OR IGNORE INTO', 'INSERT INTO', sql, flags=re.IGNORECASE)
            
            # Date/Time conversions (SQLite -> Postgres)
            sql = re.sub(r'datetime\(\'now\'\)', 'CURRENT_TIMESTAMP', sql, flags=re.IGNORECASE)
            sql = re.sub(r'date\(\'now\'\)', 'CURRENT_DATE', sql, flags=re.IGNORECASE)
            sql = re.sub(r'date\(\"now\"\)', 'CURRENT_DATE', sql, flags=re.IGNORECASE)
            
            # Complex SQLite datetime modifiers: datetime('now', '-7 day')
            sql = re.sub(r'datetime\(\'now\'\s*,\s*\'(-?\d+)\s+(\w+)\'\)', r"(CURRENT_TIMESTAMP + INTERVAL '\1 \2s')", sql, flags=re.IGNORECASE)
            
            # strftime('%s', 'now') -> EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)
            sql = re.sub(r'strftime\(\'%s\'\s*,\s*\'now\'\)', 'EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)', sql, flags=re.IGNORECASE)
            # strftime('%s', column) -> EXTRACT(EPOCH FROM column::TIMESTAMP)
            sql = re.sub(r'strftime\(\'%s\'\s*,\s*([^)]+)\)', r'EXTRACT(EPOCH FROM (\1)::TIMESTAMP)', sql, flags=re.IGNORECASE)
            
            # datetime(column) -> (column)::TIMESTAMP
            sql = re.sub(r'datetime\(([^)\',]+)\)', r'(\1)::TIMESTAMP', sql, flags=re.IGNORECASE)
            # date(column) -> (column)::DATE
            sql = re.sub(r'date\(([^)\',]+)\)', r'(\1)::DATE', sql, flags=re.IGNORECASE)

            # Add RETURNING id for INSERTs to support lastrowid
            # but only if the table likely has an 'id' column (not admin_settings/feature_flags)
            is_insert = sql.strip().upper().startswith('INSERT') and 'RETURNING' not in sql.upper()
            if is_insert:
                table_name_match = re.search(r'INSERT INTO\s+(\w+)', sql, flags=re.IGNORECASE)
                if table_name_match:
                    table_name = table_name_match.group(1).lower()
                    if table_name not in ['admin_settings', 'feature_flags']:
                        sql += ' RETURNING id'

            cursor = self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            try:
                cursor.execute(sql, params)
                wrapper = CursorWrapper(cursor, is_postgres=True)
                if is_insert:
                    try:
                        res = cursor.fetchone()
                        if res:
                            wrapper.lastrowid = res[0]
                    except:
                        pass
                return wrapper
            except Exception as e:
                logger.error(f"SQL Error: {sql} | Params: {params}")
                self.conn.rollback() # Ensure aborted transactions are cleaned up
                raise e
        else:
            # SQLite
            cursor = self.conn.execute(sql, params)
            return CursorWrapper(cursor, is_postgres=False)

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
    
    # Seeding logic
    def seed_data(sql_sqlite, sql_postgres=None, params=()):
        if is_postgres and sql_postgres:
            db.execute(sql_postgres, params)
        else:
            db.execute(sql_sqlite, params)

    try:
        # Feature Flags
        seed_data(
            "INSERT OR IGNORE INTO feature_flags (flag_key, enabled, rollout_pct, config_json) VALUES (?, ?, ?, ?)",
            "INSERT INTO feature_flags (flag_key, enabled, rollout_pct, config_json) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
            ('adaptive_engine', 1, 100, '{"mode":"mastery"}')
        )
        seed_data(
            "INSERT OR IGNORE INTO feature_flags (flag_key, enabled, rollout_pct, config_json) VALUES (?, ?, ?, ?)",
            "INSERT INTO feature_flags (flag_key, enabled, rollout_pct, config_json) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
            ('content_approval_required', 0, 100, '{"scope":"global"}')
        )

        # Admin Settings
        seed_data(
            "INSERT OR IGNORE INTO admin_settings (setting_key, value_json) VALUES (?, ?)",
            "INSERT INTO admin_settings (setting_key, value_json) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            ('leaderboard_controls', '{"enabled":true,"anonymize":false,"class_only":false}')
        )
        seed_data(
            "INSERT OR IGNORE INTO admin_settings (setting_key, value_json) VALUES (?, ?)",
            "INSERT INTO admin_settings (setting_key, value_json) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            ('data_retention_days', '{"days":365}')
        )

        # Quests
        quests = [
            ('weekly_3_quizzes', 'Weekly Warmup', 'Complete 3 quizzes this week.', 'attempts_weekly', 3, 90, 'Core', 1),
            ('weekly_accuracy_80', 'Accuracy Builder', 'Average 80%+ across at least 3 quizzes this week.', 'avg_pct_weekly', 80, 120, 'Core', 1),
            ('weekly_high_score', 'Ace One', 'Score at least 90% once this week.', 'high_scores_weekly', 1, 70, 'Core', 1)
        ]
        for q in quests:
            seed_data(
                "INSERT OR IGNORE INTO quest_definitions (code, name, description, metric, target_value, reward_xp, season_label, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                "INSERT INTO quest_definitions (code, name, description, metric, target_value, reward_xp, season_label, active) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                q
            )

        # Badges
        badges = [
            ('first_quiz', 'First Steps', 'Complete your first quiz.', 'seed', 'Core', 1, 1),
            ('streak_3', 'Consistent Learner', 'Maintain a 3-day study streak.', 'flame', 'Core', 1, 1),
            ('streak_7', 'Streak Master', 'Maintain a 7-day study streak.', 'fire', 'Core', 1, 1),
            ('perfect_100', 'Perfect Run', 'Score 100% on a quiz.', 'crown', 'Core', 1, 1),
            ('quiz_10', 'Quiz Explorer', 'Complete 10 quizzes.', 'map', 'Core', 1, 1),
            ('quiz_25', 'Math Marathoner', 'Complete 25 quizzes.', 'trophy', 'Core', 1, 1),
            ('high_achiever', 'High Achiever', 'Score 90%+ on 5 quizzes.', 'star', 'Core', 1, 1),
            ('level_5', 'Level Up', 'Reach level 5.', 'rocket', 'Core', 1, 1),
            ('quest_champion', 'Quest Champion', 'Complete every weekly quest.', 'medal', 'Core', 1, 1)
        ]
        for b in badges:
            seed_data(
                "INSERT OR IGNORE INTO badge_definitions (code, name, description, icon, season_label, active, auto_award) VALUES (?, ?, ?, ?, ?, ?, ?)",
                "INSERT INTO badge_definitions (code, name, description, icon, season_label, active, auto_award) VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                b
            )

        # Default Teacher
        seed_data(
            "INSERT OR IGNORE INTO teachers (username, password) VALUES (?, ?)",
            "INSERT INTO teachers (username, password) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            ('admin', 'password123')
        )
        db.commit()
    except Exception as e:
        logger.warning(f"Error seeding database: {e}")

    return db

def close_db():
    if hasattr(_thread_local, 'db'):
        _thread_local.db.close()
        del _thread_local.db

# Auto-init on import
init_db()

