const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'mathmind.db');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS quizzes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at  TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS attempts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_code     TEXT NOT NULL,
    student_id    INTEGER,
    student_name  TEXT NOT NULL,
    started_at    TEXT DEFAULT (datetime('now')),
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
    FOREIGN KEY (quiz_code) REFERENCES quizzes(code),
    FOREIGN KEY (student_id) REFERENCES students(id)
  );
  CREATE TABLE IF NOT EXISTS answers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT UNIQUE NOT NULL,
    password  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS students (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT UNIQUE NOT NULL,
    pin               TEXT NOT NULL,
    xp                INTEGER DEFAULT 0,
    level             INTEGER DEFAULT 1,
    streak_days       INTEGER DEFAULT 0,
    best_streak_days  INTEGER DEFAULT 0,
    total_quizzes     INTEGER DEFAULT 0,
    leaderboard_opt_in INTEGER DEFAULT 1,
    consent_opt_in    INTEGER DEFAULT 1,
    last_activity_date TEXT,
    last_login_at     TEXT,
    created_at        TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS student_badges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  INTEGER NOT NULL,
    badge_code  TEXT NOT NULL,
    unlocked_at TEXT DEFAULT (datetime('now')),
    UNIQUE(student_id, badge_code),
    FOREIGN KEY (student_id) REFERENCES students(id)
  );
  CREATE TABLE IF NOT EXISTS student_quest_claims (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id    INTEGER NOT NULL,
    quest_code    TEXT NOT NULL,
    week_start    TEXT NOT NULL,
    points_awarded INTEGER NOT NULL,
    claimed_at    TEXT DEFAULT (datetime('now')),
    UNIQUE(student_id, quest_code, week_start),
    FOREIGN KEY (student_id) REFERENCES students(id)
  );
  CREATE TABLE IF NOT EXISTS gamification_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id    INTEGER NOT NULL,
    attempt_id    INTEGER,
    event_type    TEXT NOT NULL,
    points        INTEGER NOT NULL,
    detail_json   TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (attempt_id) REFERENCES attempts(id)
  );
  CREATE TABLE IF NOT EXISTS adaptive_plan_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id)
  );
  CREATE TABLE IF NOT EXISTS admin_settings (
    setting_key   TEXT PRIMARY KEY,
    value_json    TEXT NOT NULL,
    updated_by    TEXT,
    updated_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS feature_flags (
    flag_key      TEXT PRIMARY KEY,
    enabled       INTEGER DEFAULT 1,
    rollout_pct   INTEGER DEFAULT 100,
    config_json   TEXT,
    updated_by    TEXT,
    updated_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS assignment_schedules (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_code     TEXT NOT NULL,
    class_name    TEXT,
    section_name  TEXT,
    release_at    TEXT,
    close_at      TEXT,
    status        TEXT DEFAULT 'scheduled',
    created_by    TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (quiz_code) REFERENCES quizzes(code)
  );
  CREATE TABLE IF NOT EXISTS generated_question_sets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_code     TEXT,
    attempt_id    INTEGER,
    student_id    INTEGER,
    questions_json TEXT NOT NULL,
    status        TEXT DEFAULT 'pending',
    reviewer      TEXT,
    notes         TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    reviewed_at   TEXT,
    FOREIGN KEY (attempt_id) REFERENCES attempts(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
  );
  CREATE TABLE IF NOT EXISTS manual_overrides (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id    INTEGER NOT NULL,
    override_type TEXT NOT NULL,
    old_value_json TEXT,
    new_value_json TEXT,
    reason        TEXT,
    actor         TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (attempt_id) REFERENCES attempts(id)
  );
  CREATE TABLE IF NOT EXISTS parent_contacts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id    INTEGER NOT NULL,
    parent_name   TEXT NOT NULL,
    email         TEXT,
    phone         TEXT,
    opt_in        INTEGER DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id)
  );
  CREATE TABLE IF NOT EXISTS parent_alerts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id    INTEGER NOT NULL,
    parent_contact_id INTEGER,
    alert_type    TEXT NOT NULL,
    message       TEXT NOT NULL,
    status        TEXT DEFAULT 'queued',
    created_at    TEXT DEFAULT (datetime('now')),
    sent_at       TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (parent_contact_id) REFERENCES parent_contacts(id)
  );
  CREATE TABLE IF NOT EXISTS data_requests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id    INTEGER,
    request_type  TEXT NOT NULL,
    status        TEXT DEFAULT 'pending',
    note          TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    resolved_at   TEXT,
    resolved_by   TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id)
  );
  CREATE TABLE IF NOT EXISTS quest_definitions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL,
    metric        TEXT NOT NULL,
    target_value  REAL NOT NULL,
    reward_xp     INTEGER NOT NULL,
    season_label  TEXT,
    active        INTEGER DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS badge_definitions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    icon          TEXT,
    season_label  TEXT,
    active        INTEGER DEFAULT 1,
    auto_award    INTEGER DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    actor         TEXT,
    action        TEXT NOT NULL,
    target_type   TEXT,
    target_id     TEXT,
    reason        TEXT,
    detail_json   TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS system_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type    TEXT NOT NULL,
    level         TEXT DEFAULT 'info',
    message       TEXT,
    path          TEXT,
    status_code   INTEGER,
    latency_ms    REAL,
    detail_json   TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );
`;

class DB {
  constructor(sqlJs) {
    if (fs.existsSync(DB_PATH)) {
      const buf = fs.readFileSync(DB_PATH);
      this.db = new sqlJs.Database(buf);
    } else {
      this.db = new sqlJs.Database();
    }
    this.db.run(SCHEMA);
    try {
      this.db.run('ALTER TABLE quizzes ADD COLUMN time_limit_mins INTEGER DEFAULT 0');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE quizzes ADD COLUMN class_name TEXT');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE quizzes ADD COLUMN section_name TEXT');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE quizzes ADD COLUMN release_at TEXT');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE quizzes ADD COLUMN close_at TEXT');
    } catch (e) { }
    try {
      this.db.run("ALTER TABLE quizzes ADD COLUMN activity_type TEXT DEFAULT 'class_activity'");
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE attempts ADD COLUMN student_id INTEGER');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE attempts ADD COLUMN xp_earned INTEGER DEFAULT 0');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE attempts ADD COLUMN level_after INTEGER');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE attempts ADD COLUMN streak_after INTEGER');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE attempts ADD COLUMN rewards_json TEXT');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE answers ADD COLUMN skill_tag TEXT');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE answers ADD COLUMN difficulty TEXT');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE answers ADD COLUMN excluded INTEGER DEFAULT 0');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE students ADD COLUMN leaderboard_opt_in INTEGER DEFAULT 1');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE students ADD COLUMN consent_opt_in INTEGER DEFAULT 1');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE students ADD COLUMN total_quizzes INTEGER DEFAULT 0');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE students ADD COLUMN best_streak_days INTEGER DEFAULT 0');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE students ADD COLUMN last_activity_date TEXT');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE students ADD COLUMN last_login_at TEXT');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE quizzes ADD COLUMN difficulty TEXT DEFAULT \'core\'');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE badge_definitions ADD COLUMN criteria_type TEXT DEFAULT \'quizzes_completed\'');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE badge_definitions ADD COLUMN target_value INTEGER DEFAULT 1');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE attempts ADD COLUMN current_question INTEGER DEFAULT 0');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE attempts ADD COLUMN last_activity_at TEXT');
    } catch (e) { }
    try {
      this.db.run('ALTER TABLE attempts ADD COLUMN socket_id TEXT');
    } catch (e) { }

    this.db.run(`
      UPDATE quizzes
      SET activity_type = 'class_activity'
      WHERE activity_type IS NULL OR trim(activity_type) = ''
    `);

    // seed default feature flags/settings
    this.db.run(`
      INSERT OR IGNORE INTO feature_flags (flag_key, enabled, rollout_pct, config_json)
      VALUES
        ('adaptive_engine', 1, 100, '{"mode":"mastery"}'),
        ('adaptive_experiment_a', 0, 10, '{"group":"A"}'),
        ('content_approval_required', 0, 100, '{"scope":"global"}')
    `);
    this.db.run(`
      INSERT OR IGNORE INTO admin_settings (setting_key, value_json)
      VALUES
        ('leaderboard_controls', '{"enabled":true,"anonymize":false,"class_only":false}'),
        ('data_retention_days', '{"days":365}'),
        ('adaptive_engine', '{"enabled":true}')
    `);

    // seed quest definitions from baseline defaults
    this.db.run(`
      INSERT OR IGNORE INTO quest_definitions (code, name, description, metric, target_value, reward_xp, season_label, active)
      VALUES
        ('weekly_3_quizzes', 'Weekly Warmup', 'Complete 3 quizzes this week.', 'attempts_weekly', 3, 90, 'Core', 1),
        ('weekly_accuracy_80', 'Accuracy Builder', 'Average 80%+ across at least 3 quizzes this week.', 'avg_pct_weekly', 80, 120, 'Core', 1),
        ('weekly_high_score', 'Ace One', 'Score at least 90% once this week.', 'high_scores_weekly', 1, 70, 'Core', 1)
    `);
    this.db.run(`
      INSERT OR IGNORE INTO badge_definitions (code, name, description, icon, season_label, active, auto_award)
      VALUES
        ('first_quiz', 'First Steps', 'Complete your first quiz.', 'seed', 'Core', 1, 1),
        ('streak_3', 'Consistent Learner', 'Maintain a 3-day study streak.', 'flame', 'Core', 1, 1),
        ('streak_7', 'Streak Master', 'Maintain a 7-day study streak.', 'fire', 'Core', 1, 1),
        ('perfect_100', 'Perfect Run', 'Score 100% on a quiz.', 'crown', 'Core', 1, 1),
        ('quiz_10', 'Quiz Explorer', 'Complete 10 quizzes.', 'map', 'Core', 1, 1),
        ('quiz_25', 'Math Marathoner', 'Complete 25 quizzes.', 'trophy', 'Core', 1, 1),
        ('high_achiever', 'High Achiever', 'Score 90%+ on 5 quizzes.', 'star', 'Core', 1, 1),
        ('level_5', 'Level Up', 'Reach level 5.', 'rocket', 'Core', 1, 1),
        ('quest_champion', 'Quest Champion', 'Complete every weekly quest.', 'medal', 'Core', 1, 1)
    `);

    // Insert default admin if none exists
    const admin = this.db.prepare('SELECT * FROM teachers WHERE username = ?');
    admin.bind(['admin']);
    if (!admin.step()) {
      this.db.run('INSERT INTO teachers (username, password) VALUES (?, ?)', ['admin', 'password123']);
    }
    admin.free();

    this._persist();
  }

  _persist() {
    const data = this.db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }

  prepare(sql) {
    const self = this;
    return {
      get(...params) {
        const stmt = self.db.prepare(sql);
        stmt.bind(params);
        const row = stmt.step() ? stmt.getAsObject() : undefined;
        stmt.free();
        return row;
      },
      all(...params) {
        const rows = [];
        const stmt = self.db.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
      },
      run(...params) {
        self.db.run(sql, params);
        const res = self.db.exec('SELECT last_insert_rowid() as id');
        const lastInsertRowid = res[0]?.values[0][0] ?? null;
        self._persist();
        return { lastInsertRowid };
      },
    };
  }

  exec(sql) {
    this.db.run(sql);
    this._persist();
  }

  transaction(fn) {
    const self = this;
    return function (...args) {
      fn(...args);
      self._persist();
    };
  }
}

let instance = null;

async function getDb() {
  if (instance) return instance;
  const SQL = await initSqlJs();
  instance = new DB(SQL);
  return instance;
}

module.exports = { getDb };
