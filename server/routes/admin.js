const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function toFloat(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeParseJSON(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeString(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

async function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value_json FROM admin_settings WHERE setting_key = ?').get(key);
  if (!row) return fallback;
  const parsed = safeParseJSON(row.value_json, fallback);
  return parsed === null ? fallback : parsed;
}

async function setSetting(db, key, value, updatedBy = 'admin') {
  db.prepare(`
    INSERT INTO admin_settings (setting_key, value_json, updated_by, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(setting_key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).run(key, JSON.stringify(value), updatedBy);
}

async function listFeatureFlags(db) {
  return db.prepare(`
    SELECT flag_key, enabled, rollout_pct, config_json, updated_by, updated_at
    FROM feature_flags
    ORDER BY flag_key ASC
  `).all().map((row) => ({
    key: row.flag_key,
    enabled: toInt(row.enabled, 0) === 1,
    rollout_pct: toInt(row.rollout_pct, 100),
    config: safeParseJSON(row.config_json, {}),
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  }));
}

async function getFeatureFlag(db, flagKey) {
  return db.prepare(`
    SELECT flag_key, enabled, rollout_pct, config_json, updated_by, updated_at
    FROM feature_flags
    WHERE flag_key = ?
  `).get(flagKey);
}

async function setFeatureFlag(db, key, payload, actor = 'admin') {
  const existing = await getFeatureFlag(db, key);
  const next = {
    enabled: typeof payload.enabled === 'boolean' ? payload.enabled : (toInt(existing?.enabled, 1) === 1),
    rollout_pct: Math.max(0, Math.min(100, toInt(payload.rollout_pct, toInt(existing?.rollout_pct, 100)))),
    config: typeof payload.config === 'object' && payload.config !== null
      ? payload.config
      : safeParseJSON(existing?.config_json, {}),
  };

  db.prepare(`
    INSERT INTO feature_flags (flag_key, enabled, rollout_pct, config_json, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(flag_key) DO UPDATE SET
      enabled = excluded.enabled,
      rollout_pct = excluded.rollout_pct,
      config_json = excluded.config_json,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).run(key, next.enabled ? 1 : 0, next.rollout_pct, JSON.stringify(next.config), actor);

  return { key, ...next };
}

function logAudit(db, {
  actor = 'admin',
  action,
  targetType = null,
  targetId = null,
  reason = '',
  detail = null,
}) {
  db.prepare(`
    INSERT INTO audit_logs (actor, action, target_type, target_id, reason, detail_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    actor,
    action,
    targetType,
    targetId == null ? null : String(targetId),
    reason || null,
    detail ? JSON.stringify(detail) : null
  );
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) || [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

async function buildAdminOverview(db, uptimeSeconds = null) {
  const flags = await listFeatureFlags(db);
  const adaptiveFlag = flags.find((f) => f.key === 'adaptive_engine') || { enabled: true, rollout_pct: 100 };

  const planStats = db.prepare(`
    SELECT
      COUNT(*) as total_7d,
      SUM(CASE WHEN fallback_used = 1 THEN 1 ELSE 0 END) as fallback_7d,
      MAX(created_at) as last_plan_generated
    FROM adaptive_plan_events
    WHERE datetime(created_at) >= datetime('now', '-7 day')
  `).get() || {};

  const lowMasteryRows = db.prepare(`
    SELECT
      s.id as student_id,
      s.name,
      s.streak_days,
      s.best_streak_days,
      AVG(CASE WHEN ans.is_correct = 1 THEN 1.0 ELSE 0.0 END) * 100 as mastery_pct,
      MAX(a.completed_at) as last_completed_at
    FROM students s
    LEFT JOIN attempts a ON a.student_id = s.id AND a.completed_at IS NOT NULL
    LEFT JOIN answers ans ON ans.attempt_id = a.id AND COALESCE(ans.excluded, 0) = 0
    GROUP BY s.id
    HAVING COUNT(ans.id) > 0
  `).all();

  const latestTrendRows = db.prepare(`
    SELECT ape.student_id, ape.trend, ape.mastery_overall, ape.recent_accuracy, ape.created_at
    FROM adaptive_plan_events ape
    INNER JOIN (
      SELECT student_id, MAX(created_at) as max_created
      FROM adaptive_plan_events
      GROUP BY student_id
    ) t ON t.student_id = ape.student_id AND t.max_created = ape.created_at
  `).all();
  const trendMap = new Map(latestTrendRows.map((r) => [r.student_id, r]));

  const atRiskAlerts = [];
  for (const row of lowMasteryRows) {
    const trend = trendMap.get(row.student_id);
    const reasons = [];
    const mastery = toFloat(row.mastery_pct, 0);
    const streak = toInt(row.streak_days, 0);
    const bestStreak = toInt(row.best_streak_days, 0);

    if (mastery < 55) reasons.push('low_mastery');
    if (trend?.trend === 'declining') reasons.push('declining_trend');
    if (bestStreak >= 3 && streak <= 1) reasons.push('streak_drop');

    if (reasons.length > 0) {
      atRiskAlerts.push({
        student_id: row.student_id,
        name: row.name,
        mastery_pct: Math.round(mastery),
        streak_days: streak,
        trend: trend?.trend || 'unknown',
        reasons,
        recommended_action: mastery < 55
          ? 'Assign foundation remediation and schedule teacher check-in.'
          : (reasons.includes('streak_drop')
            ? 'Send re-engagement reminder and assign short warmup set.'
            : 'Monitor and assign targeted practice on weak skills.'),
      });
    }
  }

  const heatmapRows = db.prepare(`
    SELECT
      COALESCE(q.class_name, q.code) as class_name,
      COALESCE(q.section_name, q.grade) as section_name,
      COALESCE(q.topic, 'General') as topic,
      COALESCE(NULLIF(TRIM(ans.skill_tag), ''), COALESCE(q.chapter, q.topic, 'General')) as skill_tag,
      AVG(CASE WHEN ans.is_correct = 1 THEN 1.0 ELSE 0.0 END) * 100 as mastery_pct,
      COUNT(*) as samples
    FROM answers ans
    INNER JOIN attempts a ON a.id = ans.attempt_id
    LEFT JOIN quizzes q ON q.code = a.quiz_code
    WHERE a.completed_at IS NOT NULL
      AND COALESCE(ans.excluded, 0) = 0
    GROUP BY COALESCE(q.class_name, q.code), COALESCE(q.section_name, q.grade), COALESCE(q.topic, 'General'),
             COALESCE(NULLIF(TRIM(ans.skill_tag), ''), COALESCE(q.chapter, q.topic, 'General'))
    ORDER BY samples DESC
    LIMIT 300
  `).all().map((r) => ({
    class_name: r.class_name,
    section_name: r.section_name,
    topic: r.topic,
    skill_tag: r.skill_tag,
    mastery_pct: Math.round(toFloat(r.mastery_pct, 0)),
    samples: toInt(r.samples, 0),
  }));

  const diffRows = db.prepare(`
    SELECT
      COALESCE(q.class_name, q.code) as class_name,
      q.code as quiz_code,
      SUM(CASE WHEN lower(COALESCE(ans.difficulty, 'core')) = 'foundation' THEN 1 ELSE 0 END) as foundation_count,
      SUM(CASE WHEN lower(COALESCE(ans.difficulty, 'core')) = 'core' THEN 1 ELSE 0 END) as core_count,
      SUM(CASE WHEN lower(COALESCE(ans.difficulty, 'core')) = 'advanced' THEN 1 ELSE 0 END) as advanced_count,
      COUNT(*) as total_answers
    FROM answers ans
    INNER JOIN attempts a ON a.id = ans.attempt_id
    LEFT JOIN quizzes q ON q.code = a.quiz_code
    WHERE a.completed_at IS NOT NULL
      AND COALESCE(ans.excluded, 0) = 0
    GROUP BY COALESCE(q.class_name, q.code), q.code
    ORDER BY total_answers DESC
    LIMIT 120
  `).all().map((r) => {
    const total = toInt(r.total_answers, 0);
    return {
      class_name: r.class_name,
      quiz_code: r.quiz_code,
      total_answers: total,
      foundation_count: toInt(r.foundation_count, 0),
      core_count: toInt(r.core_count, 0),
      advanced_count: toInt(r.advanced_count, 0),
      foundation_pct: pct(toInt(r.foundation_count, 0), total),
      core_pct: pct(toInt(r.core_count, 0), total),
      advanced_pct: pct(toInt(r.advanced_count, 0), total),
    };
  });

  const questionRows = db.prepare(`
    SELECT
      q.code as quiz_code,
      ans.question_text,
      lower(COALESCE(ans.difficulty, 'core')) as difficulty,
      ans.is_correct,
      a.percentage as attempt_pct
    FROM answers ans
    INNER JOIN attempts a ON a.id = ans.attempt_id
    LEFT JOIN quizzes q ON q.code = a.quiz_code
    WHERE a.completed_at IS NOT NULL
      AND COALESCE(ans.excluded, 0) = 0
      AND ans.question_text IS NOT NULL
    ORDER BY datetime(a.completed_at) DESC
    LIMIT 5000
  `).all();

  const byQuestion = groupBy(questionRows, (r) => `${r.quiz_code || 'UNKNOWN'}::${safeString(r.question_text)}`);
  const questionQuality = [];
  for (const [, rows] of byQuestion.entries()) {
    if (!rows.length) continue;
    const quizCode = rows[0].quiz_code || 'UNKNOWN';
    const questionText = rows[0].question_text;
    const difficulty = rows[0].difficulty || 'core';
    const total = rows.length;
    const correct = rows.reduce((sum, r) => sum + (toInt(r.is_correct, 0) === 1 ? 1 : 0), 0);
    const highRows = rows.filter((r) => toFloat(r.attempt_pct, 0) >= 75);
    const lowRows = rows.filter((r) => toFloat(r.attempt_pct, 0) <= 50);
    const highAcc = highRows.length
      ? highRows.reduce((sum, r) => sum + (toInt(r.is_correct, 0) === 1 ? 1 : 0), 0) / highRows.length
      : null;
    const lowAcc = lowRows.length
      ? lowRows.reduce((sum, r) => sum + (toInt(r.is_correct, 0) === 1 ? 1 : 0), 0) / lowRows.length
      : null;
    const discrimination = highAcc != null && lowAcc != null ? Math.round((highAcc - lowAcc) * 100) : null;

    questionQuality.push({
      quiz_code: quizCode,
      question_text: questionText,
      difficulty,
      attempts: total,
      error_rate_pct: Math.round((1 - correct / total) * 100),
      discrimination,
      calibration_status: (() => {
        const acc = correct / total;
        if (difficulty === 'foundation') return acc < 0.55 ? 'too_hard' : (acc > 0.9 ? 'too_easy' : 'ok');
        if (difficulty === 'advanced') return acc > 0.7 ? 'too_easy' : (acc < 0.2 ? 'too_hard' : 'ok');
        return acc < 0.35 ? 'too_hard' : (acc > 0.85 ? 'too_easy' : 'ok');
      })(),
    });
  }
  questionQuality.sort((a, b) => b.error_rate_pct - a.error_rate_pct || b.attempts - a.attempts);

  const integrityRows = db.prepare(`
    SELECT
      a.id as attempt_id,
      a.quiz_code,
      a.student_name,
      a.status,
      a.started_at,
      a.completed_at,
      a.percentage,
      COUNT(DISTINCT v.id) as violation_count,
      AVG(CASE WHEN ans.time_taken_s IS NOT NULL THEN ans.time_taken_s END) as avg_answer_time_s,
      COUNT(ans.id) as answers_count
    FROM attempts a
    LEFT JOIN violations v ON v.attempt_id = a.id
    LEFT JOIN answers ans ON ans.attempt_id = a.id
    GROUP BY a.id
    ORDER BY datetime(a.started_at) DESC
    LIMIT 300
  `).all().map((r) => {
    const avgTime = toFloat(r.avg_answer_time_s, 0);
    const violations = toInt(r.violation_count, 0);
    const answersCount = toInt(r.answers_count, 0);
    const rapidGuessing = answersCount >= 5 && avgTime > 0 && avgTime < 8;
    const suspiciousScore = (violations * 2) + (rapidGuessing ? 3 : 0) + (r.status === 'force_submitted' ? 2 : 0);
    return {
      attempt_id: r.attempt_id,
      quiz_code: r.quiz_code,
      student_name: r.student_name,
      status: r.status,
      percentage: toFloat(r.percentage, 0),
      violation_count: violations,
      avg_answer_time_s: Math.round(avgTime),
      rapid_guessing: rapidGuessing,
      suspicious_score: suspiciousScore,
      flagged: suspiciousScore >= 4,
    };
  });

  const suspiciousAttempts = integrityRows.filter((r) => r.flagged).slice(0, 50);
  const interventionQueue = atRiskAlerts.map((a) => ({
    type: 'academic',
    ...a,
  }));
  for (const s of suspiciousAttempts) {
    interventionQueue.push({
      type: 'integrity',
      student_id: null,
      name: s.student_name,
      mastery_pct: null,
      streak_days: null,
      trend: 'n/a',
      reasons: [
        s.rapid_guessing ? 'rapid_guessing' : null,
        s.violation_count >= 3 ? 'tab_switch_spike' : null,
        s.status === 'force_submitted' ? 'forced_submission' : null,
      ].filter(Boolean),
      recommended_action: 'Review attempt details, verify integrity, and schedule follow-up.',
      attempt_id: s.attempt_id,
      quiz_code: s.quiz_code,
      suspicious_score: s.suspicious_score,
    });
  }
  interventionQueue.sort((a, b) => toInt(b.suspicious_score, 0) - toInt(a.suspicious_score, 0));

  const schedules = db.prepare(`
    SELECT s.*, q.topic, q.grade
    FROM assignment_schedules s
    LEFT JOIN quizzes q ON q.code = s.quiz_code
    ORDER BY datetime(s.release_at) DESC, datetime(s.created_at) DESC
    LIMIT 100
  `).all();

  const liveRows = db.prepare(`
    SELECT
      q.code as quiz_code,
      q.topic,
      q.time_limit_mins,
      COUNT(a.id) as started_count,
      SUM(CASE WHEN a.completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed_count,
      AVG(
        CASE
          WHEN a.completed_at IS NULL THEN (strftime('%s', 'now') - strftime('%s', a.started_at))
          ELSE a.time_taken_s
        END
      ) as avg_elapsed_s
    FROM quizzes q
    LEFT JOIN attempts a ON a.quiz_code = q.code
      AND datetime(a.started_at) >= datetime('now', '-2 day')
    GROUP BY q.code
    ORDER BY datetime(q.created_at) DESC
    LIMIT 60
  `).all().map((r) => {
    const started = toInt(r.started_count, 0);
    const completed = toInt(r.completed_count, 0);
    const completionRate = pct(completed, Math.max(started, 1));
    const avgElapsed = Math.round(toFloat(r.avg_elapsed_s, 0));
    const limitSec = Math.max(0, toInt(r.time_limit_mins, 0) * 60);
    const pacingAlert = limitSec > 0 && avgElapsed > (limitSec * 0.85) && completionRate < 60;
    return {
      quiz_code: r.quiz_code,
      topic: r.topic,
      started_count: started,
      completed_count: completed,
      completion_rate_pct: completionRate,
      avg_elapsed_s: avgElapsed,
      pacing_alert: pacingAlert,
    };
  });

  const cohortCurrent = db.prepare(`
    SELECT
      COALESCE(q.class_name, q.code) as class_name,
      COALESCE(q.section_name, q.grade) as section_name,
      q.grade,
      AVG(a.percentage) as avg_pct,
      COUNT(*) as attempts
    FROM attempts a
    LEFT JOIN quizzes q ON q.code = a.quiz_code
    WHERE a.completed_at IS NOT NULL
      AND datetime(a.completed_at) >= datetime('now', '-30 day')
    GROUP BY COALESCE(q.class_name, q.code), COALESCE(q.section_name, q.grade), q.grade
  `).all();
  const cohortPrev = db.prepare(`
    SELECT
      COALESCE(q.class_name, q.code) as class_name,
      COALESCE(q.section_name, q.grade) as section_name,
      q.grade,
      AVG(a.percentage) as avg_pct,
      COUNT(*) as attempts
    FROM attempts a
    LEFT JOIN quizzes q ON q.code = a.quiz_code
    WHERE a.completed_at IS NOT NULL
      AND datetime(a.completed_at) >= datetime('now', '-60 day')
      AND datetime(a.completed_at) < datetime('now', '-30 day')
    GROUP BY COALESCE(q.class_name, q.code), COALESCE(q.section_name, q.grade), q.grade
  `).all();
  const prevMap = new Map(cohortPrev.map((r) => [`${r.class_name}::${r.section_name}::${r.grade}`, r]));
  const cohortComparison = cohortCurrent.map((r) => {
    const key = `${r.class_name}::${r.section_name}::${r.grade}`;
    const prev = prevMap.get(key);
    const currentAvg = toFloat(r.avg_pct, 0);
    const prevAvg = toFloat(prev?.avg_pct, 0);
    return {
      class_name: r.class_name,
      section_name: r.section_name,
      grade: r.grade,
      current_avg_pct: Math.round(currentAvg),
      previous_avg_pct: Math.round(prevAvg),
      delta_pct: Math.round((currentAvg - prevAvg) * 10) / 10,
      attempts_current: toInt(r.attempts, 0),
      attempts_previous: toInt(prev?.attempts, 0),
    };
  });

  const quests = db.prepare(`
    SELECT id, code, name, description, metric, target_value, reward_xp, season_label, active, updated_at
    FROM quest_definitions
    ORDER BY active DESC, updated_at DESC
  `).all();
  const badges = db.prepare(`
    SELECT b.id, b.code, b.name, b.description, b.icon, b.season_label, b.active, b.auto_award,
           COUNT(sb.id) as unlocked_count
    FROM badge_definitions b
    LEFT JOIN student_badges sb ON sb.badge_code = b.code
    GROUP BY b.id
    ORDER BY b.active DESC, unlocked_count DESC, b.name ASC
  `).all();

  const leaderboardControls = await getSetting(db, 'leaderboard_controls', {
    enabled: true,
    anonymize: false,
    class_only: false,
  });

  const contentStats = db.prepare(`
    SELECT
      COUNT(*) as total_sets,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_sets,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_sets,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_sets,
      MAX(created_at) as last_submitted_at
    FROM generated_question_sets
  `).get() || {};

  const recentOverrides = db.prepare(`
    SELECT *
    FROM manual_overrides
    ORDER BY datetime(created_at) DESC
    LIMIT 30
  `).all();

  const parentStats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM parent_contacts) as contacts_count,
      (SELECT COUNT(*) FROM parent_alerts WHERE status = 'queued') as queued_alerts,
      (SELECT COUNT(*) FROM parent_alerts WHERE status = 'sent') as sent_alerts
  `).get() || {};
  const recentParentAlerts = db.prepare(`
    SELECT pa.id, pa.student_id, s.name as student_name, pa.alert_type, pa.message, pa.status, pa.created_at
    FROM parent_alerts pa
    LEFT JOIN students s ON s.id = pa.student_id
    ORDER BY datetime(pa.created_at) DESC
    LIMIT 30
  `).all();

  const recentAudit = db.prepare(`
    SELECT *
    FROM audit_logs
    ORDER BY datetime(created_at) DESC
    LIMIT 100
  `).all();

  const system24h = db.prepare(`
    SELECT
      COUNT(*) as total_events,
      AVG(CASE WHEN latency_ms IS NOT NULL THEN latency_ms END) as avg_latency_ms,
      SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_errors,
      SUM(CASE WHEN event_type = 'generation_error' THEN 1 ELSE 0 END) as generation_errors
    FROM system_events
    WHERE datetime(created_at) >= datetime('now', '-24 hour')
  `).get() || {};
  const serviceStatus = {
    uptime_s: uptimeSeconds == null ? null : Math.round(uptimeSeconds),
    total_events_24h: toInt(system24h.total_events, 0),
    avg_latency_ms_24h: Math.round(toFloat(system24h.avg_latency_ms, 0)),
    server_errors_24h: toInt(system24h.server_errors, 0),
    generation_errors_24h: toInt(system24h.generation_errors, 0),
  };

  const retention = await getSetting(db, 'data_retention_days', { days: 365 });
  const pendingDataRequests = db.prepare(`
    SELECT dr.*, s.name as student_name
    FROM data_requests dr
    LEFT JOIN students s ON s.id = dr.student_id
    WHERE dr.status = 'pending'
    ORDER BY datetime(dr.created_at) DESC
    LIMIT 100
  `).all();
  const consentStats = db.prepare(`
    SELECT
      SUM(CASE WHEN consent_opt_in = 1 THEN 1 ELSE 0 END) as opted_in,
      SUM(CASE WHEN consent_opt_in = 0 THEN 1 ELSE 0 END) as opted_out,
      COUNT(*) as total_students
    FROM students
  `).get() || {};

  return {
    adaptive_engine_status: {
      enabled: adaptiveFlag.enabled,
      rollout_pct: adaptiveFlag.rollout_pct,
      last_plan_generated: planStats.last_plan_generated || null,
      total_plans_7d: toInt(planStats.total_7d, 0),
      fallback_rate_7d_pct: pct(toInt(planStats.fallback_7d, 0), Math.max(toInt(planStats.total_7d, 0), 1)),
    },
    at_risk_learner_alerts: atRiskAlerts.slice(0, 100),
    mastery_heatmap: heatmapRows,
    difficulty_distribution_monitor: diffRows,
    question_quality_analytics: {
      items: questionQuality.slice(0, 120),
      calibration_summary: {
        too_easy: questionQuality.filter((q) => q.calibration_status === 'too_easy').length,
        too_hard: questionQuality.filter((q) => q.calibration_status === 'too_hard').length,
        ok: questionQuality.filter((q) => q.calibration_status === 'ok').length,
      },
    },
    integrity_dashboard: {
      suspicious_attempts: suspiciousAttempts,
      tab_switch_spikes: integrityRows.filter((r) => r.violation_count >= 3).slice(0, 60),
      rapid_guessing_attempts: integrityRows.filter((r) => r.rapid_guessing).slice(0, 60),
    },
    intervention_queue: interventionQueue.slice(0, 120),
    assignment_scheduler_release_controls: schedules,
    live_class_monitor: {
      classes: liveRows,
      pacing_alerts: liveRows.filter((r) => r.pacing_alert),
    },
    cohort_comparison: cohortComparison,
    badge_quest_management: {
      quests,
      badges,
    },
    leaderboard_controls: leaderboardControls,
    content_approval_workflow: {
      total_sets: toInt(contentStats.total_sets, 0),
      pending_sets: toInt(contentStats.pending_sets, 0),
      approved_sets: toInt(contentStats.approved_sets, 0),
      rejected_sets: toInt(contentStats.rejected_sets, 0),
      last_submitted_at: contentStats.last_submitted_at || null,
    },
    manual_override_tools: {
      recent_overrides: recentOverrides,
    },
    parent_communication_center: {
      contacts_count: toInt(parentStats.contacts_count, 0),
      queued_alerts: toInt(parentStats.queued_alerts, 0),
      sent_alerts: toInt(parentStats.sent_alerts, 0),
      recent_alerts: recentParentAlerts,
    },
    report_builder: {
      available_groupings: ['skill', 'student', 'quiz', 'class', 'section', 'grade', 'date', 'activity_type'],
      available_time_windows: ['7d', '30d', '90d', 'custom'],
    },
    audit_trail: recentAudit,
    system_health_observability: serviceStatus,
    data_governance_tools: {
      retention_days: toInt(retention.days, 365),
      pending_requests: pendingDataRequests,
      consent_stats: {
        opted_in: toInt(consentStats.opted_in, 0),
        opted_out: toInt(consentStats.opted_out, 0),
        total_students: toInt(consentStats.total_students, 0),
      },
    },
    feature_flags_console: flags,
  };
}

router.get('/overview', async (req, res) => {
  try {
    const db = await getDb();
    const uptime = process.uptime();
    const overview = await buildAdminOverview(db, uptime);
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/feature-flags', async (req, res) => {
  try {
    const db = await getDb();
    const flags = await listFeatureFlags(db);
    res.json(flags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/feature-flags/:key', async (req, res) => {
  try {
    const db = await getDb();
    const actor = safeString(req.body?.actor, 'admin');
    const updated = await setFeatureFlag(db, req.params.key, req.body || {}, actor);
    logAudit(db, {
      actor,
      action: 'feature_flag.update',
      targetType: 'feature_flag',
      targetId: req.params.key,
      reason: safeString(req.body?.reason),
      detail: updated,
    });
    res.json({ success: true, flag: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const db = await getDb();
    const rows = db.prepare(`
      SELECT setting_key, value_json, updated_by, updated_at
      FROM admin_settings
      ORDER BY setting_key
    `).all();
    res.json(rows.map((r) => ({
      key: r.setting_key,
      value: safeParseJSON(r.value_json, null),
      updated_by: r.updated_by,
      updated_at: r.updated_at,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/settings/:key', async (req, res) => {
  try {
    const db = await getDb();
    const key = req.params.key;
    const value = req.body?.value;
    if (typeof value === 'undefined') return res.status(400).json({ error: 'Missing value' });
    const actor = safeString(req.body?.actor, 'admin');
    await setSetting(db, key, value, actor);
    logAudit(db, {
      actor,
      action: 'admin_setting.update',
      targetType: 'admin_setting',
      targetId: key,
      reason: safeString(req.body?.reason),
      detail: { value },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/assignments', async (req, res) => {
  try {
    const db = await getDb();
    const rows = db.prepare(`
      SELECT s.*, q.topic, q.grade
      FROM assignment_schedules s
      LEFT JOIN quizzes q ON q.code = s.quiz_code
      ORDER BY datetime(s.release_at) DESC, datetime(s.created_at) DESC
      LIMIT 300
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/assignments', async (req, res) => {
  try {
    const db = await getDb();
    const quizCode = safeString(req.body?.quiz_code).toUpperCase();
    if (!quizCode) return res.status(400).json({ error: 'quiz_code is required' });
    const quiz = db.prepare('SELECT code FROM quizzes WHERE code = ?').get(quizCode);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const result = db.prepare(`
      INSERT INTO assignment_schedules (quiz_code, class_name, section_name, release_at, close_at, status, created_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      quizCode,
      safeString(req.body?.class_name) || null,
      safeString(req.body?.section_name) || null,
      req.body?.release_at || null,
      req.body?.close_at || null,
      safeString(req.body?.status, 'scheduled'),
      safeString(req.body?.actor, 'admin')
    );

    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'assignment.create',
      targetType: 'assignment',
      targetId: result.lastInsertRowid,
      reason: safeString(req.body?.reason),
      detail: req.body,
    });

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/assignments/:id', async (req, res) => {
  try {
    const db = await getDb();
    const id = toInt(req.params.id, 0);
    const existing = db.prepare('SELECT * FROM assignment_schedules WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Assignment not found' });

    db.prepare(`
      UPDATE assignment_schedules SET
        class_name = COALESCE(?, class_name),
        section_name = COALESCE(?, section_name),
        release_at = COALESCE(?, release_at),
        close_at = COALESCE(?, close_at),
        status = COALESCE(?, status),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      typeof req.body.class_name === 'undefined' ? null : req.body.class_name,
      typeof req.body.section_name === 'undefined' ? null : req.body.section_name,
      typeof req.body.release_at === 'undefined' ? null : req.body.release_at,
      typeof req.body.close_at === 'undefined' ? null : req.body.close_at,
      typeof req.body.status === 'undefined' ? null : req.body.status,
      id
    );

    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'assignment.update',
      targetType: 'assignment',
      targetId: id,
      reason: safeString(req.body?.reason),
      detail: req.body,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/content/question-sets', async (req, res) => {
  try {
    const db = await getDb();
    const questions = Array.isArray(req.body?.questions) ? req.body.questions : null;
    if (!questions || questions.length === 0) return res.status(400).json({ error: 'questions is required' });

    const result = db.prepare(`
      INSERT INTO generated_question_sets (quiz_code, attempt_id, student_id, questions_json, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(
      safeString(req.body?.quiz_code).toUpperCase() || null,
      req.body?.attempt_id || null,
      req.body?.student_id || null,
      JSON.stringify(questions)
    );

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/content/question-sets', async (req, res) => {
  try {
    const db = await getDb();
    const status = safeString(req.query.status);
    const rows = status
      ? db.prepare(`
          SELECT * FROM generated_question_sets
          WHERE status = ?
          ORDER BY datetime(created_at) DESC
          LIMIT 300
        `).all(status)
      : db.prepare(`
          SELECT * FROM generated_question_sets
          ORDER BY datetime(created_at) DESC
          LIMIT 300
        `).all();
    const parsed = rows.map((r) => ({
      ...r,
      questions: safeParseJSON(r.questions_json, []),
    }));
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/content/question-sets/:id', async (req, res) => {
  try {
    const db = await getDb();
    const id = toInt(req.params.id, 0);
    const status = safeString(req.body?.status);
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved/rejected/pending' });
    }
    db.prepare(`
      UPDATE generated_question_sets
      SET status = ?, reviewer = ?, notes = ?, reviewed_at = CASE WHEN ? IN ('approved', 'rejected') THEN datetime('now') ELSE reviewed_at END
      WHERE id = ?
    `).run(status, safeString(req.body?.reviewer, 'admin'), safeString(req.body?.notes) || null, status, id);

    logAudit(db, {
      actor: safeString(req.body?.reviewer, 'admin'),
      action: 'content_review.update',
      targetType: 'generated_question_set',
      targetId: id,
      reason: safeString(req.body?.notes),
      detail: { status },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/manual/regrade', async (req, res) => {
  try {
    const db = await getDb();
    const attemptId = toInt(req.body?.attempt_id, 0);
    if (!attemptId) return res.status(400).json({ error: 'attempt_id is required' });
    const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    const next = {
      score: toInt(req.body?.score, toInt(attempt.score, 0)),
      total: Math.max(1, toInt(req.body?.total, toInt(attempt.total, 1))),
      percentage: Math.max(0, Math.min(100, toFloat(req.body?.percentage, toFloat(attempt.percentage, 0)))),
      status: safeString(req.body?.status, attempt.status || 'completed'),
    };
    db.prepare(`
      UPDATE attempts SET score = ?, total = ?, percentage = ?, status = ?, completed_at = COALESCE(completed_at, datetime('now'))
      WHERE id = ?
    `).run(next.score, next.total, next.percentage, next.status, attemptId);

    db.prepare(`
      INSERT INTO manual_overrides (attempt_id, override_type, old_value_json, new_value_json, reason, actor)
      VALUES (?, 'regrade', ?, ?, ?, ?)
    `).run(
      attemptId,
      JSON.stringify({ score: attempt.score, total: attempt.total, percentage: attempt.percentage, status: attempt.status }),
      JSON.stringify(next),
      safeString(req.body?.reason),
      safeString(req.body?.actor, 'admin')
    );

    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'manual_override.regrade',
      targetType: 'attempt',
      targetId: attemptId,
      reason: safeString(req.body?.reason),
      detail: next,
    });

    res.json({ success: true, updated: next });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/manual/exclude-question', async (req, res) => {
  try {
    const db = await getDb();
    const attemptId = toInt(req.body?.attempt_id, 0);
    const answerId = toInt(req.body?.answer_id, 0);
    const qIndex = typeof req.body?.q_index === 'undefined' ? null : toInt(req.body.q_index, -1);
    if (!attemptId) return res.status(400).json({ error: 'attempt_id is required' });
    const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    if (answerId) {
      db.prepare('UPDATE answers SET excluded = 1 WHERE id = ? AND attempt_id = ?').run(answerId, attemptId);
    } else if (qIndex != null && qIndex >= 0) {
      db.prepare('UPDATE answers SET excluded = 1 WHERE attempt_id = ? AND q_index = ?').run(attemptId, qIndex);
    } else {
      return res.status(400).json({ error: 'answer_id or q_index is required' });
    }

    const rows = db.prepare('SELECT is_correct FROM answers WHERE attempt_id = ? AND COALESCE(excluded, 0) = 0').all(attemptId);
    const total = rows.length;
    const score = rows.reduce((sum, r) => sum + (toInt(r.is_correct, 0) === 1 ? 1 : 0), 0);
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    db.prepare('UPDATE attempts SET score = ?, total = ?, percentage = ? WHERE id = ?').run(score, total, percentage, attemptId);

    db.prepare(`
      INSERT INTO manual_overrides (attempt_id, override_type, old_value_json, new_value_json, reason, actor)
      VALUES (?, 'exclude_question', ?, ?, ?, ?)
    `).run(
      attemptId,
      JSON.stringify({ score: attempt.score, total: attempt.total, percentage: attempt.percentage }),
      JSON.stringify({ score, total, percentage }),
      safeString(req.body?.reason),
      safeString(req.body?.actor, 'admin')
    );

    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'manual_override.exclude_question',
      targetType: 'attempt',
      targetId: attemptId,
      reason: safeString(req.body?.reason),
      detail: { answer_id: answerId || null, q_index: qIndex, score, total, percentage },
    });

    res.json({ success: true, score, total, percentage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/manual/grant-retry', async (req, res) => {
  try {
    const db = await getDb();
    const attemptId = toInt(req.body?.attempt_id, 0);
    if (!attemptId) return res.status(400).json({ error: 'attempt_id is required' });
    const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    const retry = db.prepare(`
      INSERT INTO attempts (quiz_code, student_id, student_name, status)
      VALUES (?, ?, ?, 'in_progress')
    `).run(attempt.quiz_code, attempt.student_id || null, attempt.student_name);

    db.prepare(`
      INSERT INTO manual_overrides (attempt_id, override_type, old_value_json, new_value_json, reason, actor)
      VALUES (?, 'grant_retry', ?, ?, ?, ?)
    `).run(
      attemptId,
      JSON.stringify({ original_attempt_id: attemptId }),
      JSON.stringify({ retry_attempt_id: retry.lastInsertRowid }),
      safeString(req.body?.reason),
      safeString(req.body?.actor, 'admin')
    );

    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'manual_override.grant_retry',
      targetType: 'attempt',
      targetId: attemptId,
      reason: safeString(req.body?.reason),
      detail: { retry_attempt_id: retry.lastInsertRowid },
    });

    res.json({ success: true, retry_attempt_id: retry.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/quests', async (req, res) => {
  try {
    const db = await getDb();
    const rows = db.prepare(`
      SELECT *
      FROM quest_definitions
      ORDER BY active DESC, updated_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/quests', async (req, res) => {
  try {
    const db = await getDb();
    const code = safeString(req.body?.code).toLowerCase();
    if (!code) return res.status(400).json({ error: 'code is required' });

    const result = db.prepare(`
      INSERT INTO quest_definitions (code, name, description, metric, target_value, reward_xp, season_label, active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      code,
      safeString(req.body?.name, code),
      safeString(req.body?.description, ''),
      safeString(req.body?.metric, 'attempts_weekly'),
      toFloat(req.body?.target_value, 1),
      toInt(req.body?.reward_xp, 50),
      safeString(req.body?.season_label, 'Seasonal'),
      req.body?.active === false ? 0 : 1
    );

    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'quest.create',
      targetType: 'quest_definition',
      targetId: result.lastInsertRowid,
      reason: safeString(req.body?.reason),
      detail: req.body,
    });

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Quest code already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/quests/:id', async (req, res) => {
  try {
    const db = await getDb();
    const id = toInt(req.params.id, 0);
    const row = db.prepare('SELECT * FROM quest_definitions WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Quest not found' });
    db.prepare(`
      UPDATE quest_definitions SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        metric = COALESCE(?, metric),
        target_value = COALESCE(?, target_value),
        reward_xp = COALESCE(?, reward_xp),
        season_label = COALESCE(?, season_label),
        active = COALESCE(?, active),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      typeof req.body.name === 'undefined' ? null : req.body.name,
      typeof req.body.description === 'undefined' ? null : req.body.description,
      typeof req.body.metric === 'undefined' ? null : req.body.metric,
      typeof req.body.target_value === 'undefined' ? null : toFloat(req.body.target_value, 1),
      typeof req.body.reward_xp === 'undefined' ? null : toInt(req.body.reward_xp, 50),
      typeof req.body.season_label === 'undefined' ? null : req.body.season_label,
      typeof req.body.active === 'undefined' ? null : (req.body.active ? 1 : 0),
      id
    );

    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'quest.update',
      targetType: 'quest_definition',
      targetId: id,
      reason: safeString(req.body?.reason),
      detail: req.body,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/badges', async (req, res) => {
  try {
    const db = await getDb();
    const rows = db.prepare(`
      SELECT b.*, COUNT(sb.id) as unlocked_count
      FROM badge_definitions b
      LEFT JOIN student_badges sb ON sb.badge_code = b.code
      GROUP BY b.id
      ORDER BY b.active DESC, unlocked_count DESC, b.name ASC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/badges', async (req, res) => {
  try {
    const db = await getDb();
    const code = safeString(req.body?.code).toLowerCase();
    if (!code) return res.status(400).json({ error: 'code is required' });
    const result = db.prepare(`
      INSERT INTO badge_definitions (code, name, description, icon, season_label, active, auto_award, criteria_type, target_value, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      code,
      safeString(req.body?.name, code),
      safeString(req.body?.description, ''),
      safeString(req.body?.icon, 'badge'),
      safeString(req.body?.season_label, 'Seasonal'),
      req.body?.active === false ? 0 : 1,
      req.body?.auto_award === false ? 0 : 1,
      safeString(req.body?.criteria_type, 'quizzes_completed'),
      toInt(req.body?.target_value, 1)
    );
    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'badge.create',
      targetType: 'badge_definition',
      targetId: result.lastInsertRowid,
      reason: safeString(req.body?.reason),
      detail: req.body,
    });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Badge code already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/badges/:id', async (req, res) => {
  try {
    const db = await getDb();
    const id = toInt(req.params.id, 0);
    const row = db.prepare('SELECT * FROM badge_definitions WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Badge not found' });
    db.prepare(`
      UPDATE badge_definitions SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        icon = COALESCE(?, icon),
        season_label = COALESCE(?, season_label),
        active = COALESCE(?, active),
        auto_award = COALESCE(?, auto_award),
        criteria_type = COALESCE(?, criteria_type),
        target_value = COALESCE(?, target_value),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      typeof req.body.name === 'undefined' ? null : req.body.name,
      typeof req.body.description === 'undefined' ? null : req.body.description,
      typeof req.body.icon === 'undefined' ? null : req.body.icon,
      typeof req.body.season_label === 'undefined' ? null : req.body.season_label,
      typeof req.body.active === 'undefined' ? null : (req.body.active ? 1 : 0),
      typeof req.body.auto_award === 'undefined' ? null : (req.body.auto_award ? 1 : 0),
      typeof req.body.criteria_type === 'undefined' ? null : req.body.criteria_type,
      typeof req.body.target_value === 'undefined' ? null : toInt(req.body.target_value, 1),
      id
    );
    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'badge.update',
      targetType: 'badge_definition',
      targetId: id,
      reason: safeString(req.body?.reason),
      detail: req.body,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/badges/award', async (req, res) => {
  try {
    const db = await getDb();
    const studentId = toInt(req.body?.student_id, 0);
    const badgeCode = safeString(req.body?.badge_code).toLowerCase();
    if (!studentId || !badgeCode) return res.status(400).json({ error: 'student_id and badge_code are required' });
    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const badge = db.prepare('SELECT code FROM badge_definitions WHERE code = ?').get(badgeCode);
    if (!badge) return res.status(404).json({ error: 'Badge not found' });
    db.prepare('INSERT OR IGNORE INTO student_badges (student_id, badge_code) VALUES (?, ?)').run(studentId, badgeCode);
    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'badge.manual_award',
      targetType: 'student_badge',
      targetId: `${studentId}:${badgeCode}`,
      reason: safeString(req.body?.reason),
      detail: req.body,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/parents/contacts', async (req, res) => {
  try {
    const db = await getDb();
    const rows = db.prepare(`
      SELECT pc.*, s.name as student_name
      FROM parent_contacts pc
      LEFT JOIN students s ON s.id = pc.student_id
      ORDER BY datetime(pc.created_at) DESC
      LIMIT 300
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/parents/contacts', async (req, res) => {
  try {
    const db = await getDb();
    const studentId = toInt(req.body?.student_id, 0);
    if (!studentId) return res.status(400).json({ error: 'student_id is required' });
    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const result = db.prepare(`
      INSERT INTO parent_contacts (student_id, parent_name, email, phone, opt_in)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      studentId,
      safeString(req.body?.parent_name, 'Parent'),
      safeString(req.body?.email) || null,
      safeString(req.body?.phone) || null,
      req.body?.opt_in === false ? 0 : 1
    );
    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'parent_contact.create',
      targetType: 'parent_contact',
      targetId: result.lastInsertRowid,
      reason: safeString(req.body?.reason),
      detail: req.body,
    });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/parents/alerts', async (req, res) => {
  try {
    const db = await getDb();
    const rows = db.prepare(`
      SELECT pa.*, s.name as student_name, pc.parent_name
      FROM parent_alerts pa
      LEFT JOIN students s ON s.id = pa.student_id
      LEFT JOIN parent_contacts pc ON pc.id = pa.parent_contact_id
      ORDER BY datetime(pa.created_at) DESC
      LIMIT 300
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/parents/alerts', async (req, res) => {
  try {
    const db = await getDb();
    const studentId = toInt(req.body?.student_id, 0);
    if (!studentId) return res.status(400).json({ error: 'student_id is required' });
    const message = safeString(req.body?.message);
    if (!message) return res.status(400).json({ error: 'message is required' });
    const contacts = db.prepare('SELECT id FROM parent_contacts WHERE student_id = ? AND opt_in = 1').all(studentId);
    if (contacts.length === 0) {
      db.prepare(`
        INSERT INTO parent_alerts (student_id, parent_contact_id, alert_type, message, status)
        VALUES (?, NULL, ?, ?, 'queued')
      `).run(studentId, safeString(req.body?.alert_type, 'summary'), message);
    } else {
      for (const c of contacts) {
        db.prepare(`
          INSERT INTO parent_alerts (student_id, parent_contact_id, alert_type, message, status)
          VALUES (?, ?, ?, ?, 'queued')
        `).run(studentId, c.id, safeString(req.body?.alert_type, 'summary'), message);
      }
    }
    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'parent_alert.queue',
      targetType: 'student',
      targetId: studentId,
      reason: safeString(req.body?.reason),
      detail: req.body,
    });
    res.json({ success: true, queued: Math.max(1, contacts.length) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/reports', async (req, res) => {
  try {
    const db = await getDb();
    const from = req.query.from || null;
    const to = req.query.to || null;
    const groupByKey = safeString(req.query.group_by, 'skill');
    const allowed = new Set(['skill', 'student', 'quiz', 'class', 'section', 'grade', 'date', 'activity_type']);
    const groupBySafe = allowed.has(groupByKey) ? groupByKey : 'skill';

    let groupExpr = `COALESCE(NULLIF(TRIM(ans.skill_tag), ''), COALESCE(q.chapter, q.topic, 'General'))`;
    if (groupBySafe === 'student') groupExpr = 'a.student_name';
    else if (groupBySafe === 'quiz') groupExpr = 'a.quiz_code';
    else if (groupBySafe === 'class') groupExpr = 'COALESCE(q.class_name, q.code)';
    else if (groupBySafe === 'section') groupExpr = 'COALESCE(q.section_name, q.grade)';
    else if (groupBySafe === 'grade') groupExpr = 'COALESCE(q.grade, "Unknown")';
    else if (groupBySafe === 'date') groupExpr = 'date(a.completed_at)';
    else if (groupBySafe === 'activity_type') groupExpr = `COALESCE(q.activity_type, 'class_activity')`;

    const whereParts = ['a.completed_at IS NOT NULL'];
    const params = [];
    if (from) { whereParts.push('datetime(a.completed_at) >= datetime(?)'); params.push(from); }
    if (to) { whereParts.push('datetime(a.completed_at) <= datetime(?)'); params.push(to); }

    const sql = `
      SELECT
        ${groupExpr} as group_key,
        COUNT(*) as answer_count,
        AVG(CASE WHEN ans.is_correct = 1 THEN 1.0 ELSE 0.0 END) * 100 as accuracy_pct,
        AVG(ans.time_taken_s) as avg_time_s
      FROM answers ans
      INNER JOIN attempts a ON a.id = ans.attempt_id
      LEFT JOIN quizzes q ON q.code = a.quiz_code
      WHERE ${whereParts.join(' AND ')}
        AND COALESCE(ans.excluded, 0) = 0
      GROUP BY ${groupExpr}
      ORDER BY answer_count DESC
      LIMIT 1000
    `;
    const rows = db.prepare(sql).all(...params).map((r) => ({
      group_key: r.group_key,
      answer_count: toInt(r.answer_count, 0),
      accuracy_pct: Math.round(toFloat(r.accuracy_pct, 0) * 10) / 10,
      avg_time_s: Math.round(toFloat(r.avg_time_s, 0)),
    }));

    res.json({
      group_by: groupBySafe,
      from,
      to,
      rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/audit', async (req, res) => {
  try {
    const db = await getDb();
    const limit = Math.max(1, Math.min(1000, toInt(req.query.limit, 200)));
    const rows = db.prepare(`
      SELECT *
      FROM audit_logs
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `).all(limit);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/system', async (req, res) => {
  try {
    const db = await getDb();
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_events_24h,
        AVG(CASE WHEN latency_ms IS NOT NULL THEN latency_ms END) as avg_latency_ms_24h,
        SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_errors_24h,
        SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as error_events_24h,
        SUM(CASE WHEN event_type = 'generation_error' THEN 1 ELSE 0 END) as generation_errors_24h
      FROM system_events
      WHERE datetime(created_at) >= datetime('now', '-24 hour')
    `).get() || {};
    const recent = db.prepare(`
      SELECT *
      FROM system_events
      ORDER BY datetime(created_at) DESC
      LIMIT 200
    `).all();
    res.json({
      uptime_s: Math.round(process.uptime()),
      total_events_24h: toInt(stats.total_events_24h, 0),
      avg_latency_ms_24h: Math.round(toFloat(stats.avg_latency_ms_24h, 0)),
      server_errors_24h: toInt(stats.server_errors_24h, 0),
      error_events_24h: toInt(stats.error_events_24h, 0),
      generation_errors_24h: toInt(stats.generation_errors_24h, 0),
      recent_events: recent,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/system/events', async (req, res) => {
  try {
    const db = await getDb();
    db.prepare(`
      INSERT INTO system_events (event_type, level, message, path, status_code, latency_ms, detail_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      safeString(req.body?.event_type, 'custom'),
      safeString(req.body?.level, 'info'),
      safeString(req.body?.message, ''),
      safeString(req.body?.path, null),
      typeof req.body?.status_code === 'undefined' ? null : toInt(req.body.status_code, 0),
      typeof req.body?.latency_ms === 'undefined' ? null : toFloat(req.body.latency_ms, 0),
      req.body?.detail ? JSON.stringify(req.body.detail) : null
    );
    res.json({ success: true, at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/data-governance', async (req, res) => {
  try {
    const db = await getDb();
    const retention = await getSetting(db, 'data_retention_days', { days: 365 });
    const pending = db.prepare(`
      SELECT dr.*, s.name as student_name
      FROM data_requests dr
      LEFT JOIN students s ON s.id = dr.student_id
      WHERE dr.status = 'pending'
      ORDER BY datetime(dr.created_at) DESC
      LIMIT 300
    `).all();
    const consent = db.prepare(`
      SELECT
        SUM(CASE WHEN consent_opt_in = 1 THEN 1 ELSE 0 END) as opted_in,
        SUM(CASE WHEN consent_opt_in = 0 THEN 1 ELSE 0 END) as opted_out,
        COUNT(*) as total_students
      FROM students
    `).get() || {};
    res.json({
      retention_days: toInt(retention.days, 365),
      pending_requests: pending,
      consent_stats: {
        opted_in: toInt(consent.opted_in, 0),
        opted_out: toInt(consent.opted_out, 0),
        total_students: toInt(consent.total_students, 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/data-requests', async (req, res) => {
  try {
    const db = await getDb();
    const requestType = safeString(req.body?.request_type, 'deletion');
    if (!requestType) return res.status(400).json({ error: 'request_type is required' });
    const studentId = req.body?.student_id ? toInt(req.body.student_id, 0) : null;
    const result = db.prepare(`
      INSERT INTO data_requests (student_id, request_type, status, note)
      VALUES (?, ?, 'pending', ?)
    `).run(studentId || null, requestType, safeString(req.body?.note, ''));
    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'data_request.create',
      targetType: 'data_request',
      targetId: result.lastInsertRowid,
      reason: safeString(req.body?.note),
      detail: req.body,
    });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/data-requests/:id', async (req, res) => {
  try {
    const db = await getDb();
    const id = toInt(req.params.id, 0);
    const row = db.prepare('SELECT * FROM data_requests WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Data request not found' });
    const status = safeString(req.body?.status, row.status);
    if (!['pending', 'resolved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    db.prepare(`
      UPDATE data_requests SET
        status = ?,
        resolved_at = CASE WHEN ? IN ('resolved', 'rejected') THEN datetime('now') ELSE resolved_at END,
        resolved_by = CASE WHEN ? IN ('resolved', 'rejected') THEN ? ELSE resolved_by END,
        note = COALESCE(?, note)
      WHERE id = ?
    `).run(
      status,
      status,
      status,
      safeString(req.body?.actor, 'admin'),
      typeof req.body.note === 'undefined' ? null : req.body.note,
      id
    );

    if (status === 'resolved' && row.request_type === 'deletion' && row.student_id) {
      const sid = toInt(row.student_id, 0);
      const attemptRows = db.prepare('SELECT id FROM attempts WHERE student_id = ?').all(sid);
      for (const a of attemptRows) {
        db.prepare('DELETE FROM answers WHERE attempt_id = ?').run(a.id);
        db.prepare('DELETE FROM violations WHERE attempt_id = ?').run(a.id);
        db.prepare('DELETE FROM gamification_events WHERE attempt_id = ?').run(a.id);
      }
      db.prepare('DELETE FROM attempts WHERE student_id = ?').run(sid);
      db.prepare('DELETE FROM student_badges WHERE student_id = ?').run(sid);
      db.prepare('DELETE FROM student_quest_claims WHERE student_id = ?').run(sid);
      db.prepare('DELETE FROM gamification_events WHERE student_id = ?').run(sid);
      db.prepare('DELETE FROM parent_contacts WHERE student_id = ?').run(sid);
      db.prepare('DELETE FROM parent_alerts WHERE student_id = ?').run(sid);
      db.prepare('DELETE FROM adaptive_plan_events WHERE student_id = ?').run(sid);
      db.prepare('DELETE FROM students WHERE id = ?').run(sid);
    }

    logAudit(db, {
      actor: safeString(req.body?.actor, 'admin'),
      action: 'data_request.update',
      targetType: 'data_request',
      targetId: id,
      reason: safeString(req.body?.note),
      detail: { status },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/data-retention/run', async (req, res) => {
  try {
    const db = await getDb();
    const setting = await getSetting(db, 'data_retention_days', { days: 365 });
    const days = Math.max(30, toInt(req.body?.days, toInt(setting.days, 365)));
    const dryRun = req.body?.dry_run !== false;

    const oldEvents = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM system_events
      WHERE datetime(created_at) < datetime('now', ?)
    `).get(`-${days} day`);
    const oldAudit = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM audit_logs
      WHERE datetime(created_at) < datetime('now', ?)
    `).get(`-${days} day`);

    if (!dryRun) {
      db.prepare(`DELETE FROM system_events WHERE datetime(created_at) < datetime('now', ?)`).run(`-${days} day`);
      db.prepare(`DELETE FROM audit_logs WHERE datetime(created_at) < datetime('now', ?)`).run(`-${days} day`);
      await setSetting(db, 'data_retention_days', { days }, safeString(req.body?.actor, 'admin'));
      logAudit(db, {
        actor: safeString(req.body?.actor, 'admin'),
        action: 'data_retention.run',
        targetType: 'retention',
        targetId: String(days),
        reason: safeString(req.body?.reason),
        detail: { days, deleted_system_events: toInt(oldEvents?.cnt, 0), deleted_audit_logs: toInt(oldAudit?.cnt, 0) },
      });
    }

    res.json({
      success: true,
      dry_run: dryRun,
      retention_days: days,
      would_delete: {
        system_events: toInt(oldEvents?.cnt, 0),
        audit_logs: toInt(oldAudit?.cnt, 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
