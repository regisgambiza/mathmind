import { useEffect, useState } from 'react';
import api from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';

function formatDateTime(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export default function TeacherAdmin() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeTab, setActiveTab] = useState('overview'); // overview | assignments | gamification | advanced

  const [overview, setOverview] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [quests, setQuests] = useState([]);
  const [badges, setBadges] = useState([]);
  const [flags, setFlags] = useState([]);
  const [settings, setSettings] = useState([]);

  const [assignmentDraft, setAssignmentDraft] = useState({
    quiz_code: '',
    class_name: '',
    section_name: '',
    release_at: '',
    close_at: '',
    status: 'scheduled',
  });

  const [questDraft, setQuestDraft] = useState({
    code: '',
    name: '',
    description: '',
    metric: 'attempts_weekly',
    target_value: 3,
    reward_xp: 80,
    season_label: 'Core',
  });

  const [badgeDraft, setBadgeDraft] = useState({
    code: '',
    name: '',
    description: '',
    icon: 'badge',
    season_label: 'Core',
    auto_award: true,
    criteria_type: 'quizzes_completed',
    target_value: 1,
  });

  const showNotice = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 2200);
  };

  const loadAdmin = async () => {
    setLoading(true);
    setError('');
    const calls = await Promise.allSettled([
      api.get('/api/admin/overview'),
      api.get('/api/admin/assignments'),
      api.get('/api/admin/quests'),
      api.get('/api/admin/badges'),
      api.get('/api/admin/feature-flags'),
      api.get('/api/admin/settings'),
    ]);
    const getData = (idx, fallback) => (calls[idx].status === 'fulfilled' ? calls[idx].value.data : fallback);

    setOverview(getData(0, null));
    setAssignments(getData(1, []));
    setQuests(getData(2, []));
    setBadges(getData(3, []));
    setFlags(getData(4, []));
    setSettings(getData(5, []));

    if (calls[0].status === 'rejected') {
      setError(calls[0].reason?.message || 'Failed to load admin dashboard.');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAdmin().catch((err) => setError(err.message));
  }, []);

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/assignments', {
        ...assignmentDraft,
        quiz_code: String(assignmentDraft.quiz_code || '').toUpperCase(),
        release_at: assignmentDraft.release_at || null,
        close_at: assignmentDraft.close_at || null,
        actor: user?.username || 'admin',
      });
      setAssignmentDraft({
        quiz_code: '',
        class_name: '',
        section_name: '',
        release_at: '',
        close_at: '',
        status: 'scheduled',
      });
      await loadAdmin();
      showNotice('Assignment schedule created.');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create assignment.');
    }
  };

  const handleUpdateAssignment = async (id, status) => {
    try {
      await api.patch(`/api/admin/assignments/${id}`, { status, actor: user?.username || 'admin' });
      await loadAdmin();
      showNotice(`Assignment set to ${status}.`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to update assignment.');
    }
  };

  const handleCreateQuest = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/quests', { ...questDraft, actor: user?.username || 'admin' });
      setQuestDraft({
        code: '',
        name: '',
        description: '',
        metric: 'attempts_weekly',
        target_value: 3,
        reward_xp: 80,
        season_label: 'Core',
      });
      await loadAdmin();
      showNotice('Quest created.');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create quest.');
    }
  };

  const handleToggleQuest = async (quest) => {
    try {
      await api.patch(`/api/admin/quests/${quest.id}`, { active: !Number(quest.active || 0), actor: user?.username || 'admin' });
      await loadAdmin();
      showNotice(`Quest "${quest.code}" updated.`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to update quest.');
    }
  };

  const handleCreateBadge = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/badges', { 
        ...badgeDraft,
        actor: user?.username || 'admin'
      });
      setBadgeDraft({ 
        code: '', 
        name: '', 
        description: '', 
        icon: 'badge', 
        season_label: 'Core', 
        auto_award: true,
        criteria_type: 'quizzes_completed',
        target_value: 1,
      });
      await loadAdmin();
      showNotice('Badge created.');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create badge.');
    }
  };

  const handleToggleBadge = async (badge) => {
    try {
      await api.patch(`/api/admin/badges/${badge.id}`, { active: !Number(badge.active || 0), actor: user?.username || 'admin' });
      await loadAdmin();
      showNotice(`Badge "${badge.code}" updated.`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to update badge.');
    }
  };

  const handleToggleFlag = async (flagKey, payload) => {
    try {
      await api.patch(`/api/admin/feature-flags/${flagKey}`, { ...payload, actor: user?.username || 'admin' });
      await loadAdmin();
      showNotice(`Feature flag "${flagKey}" updated.`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to update feature flag.');
    }
  };

  if (loading && !overview) {
    return <div className="p-8 font-dm text-muted">Loading admin dashboard...</div>;
  }

  const adaptive = overview?.adaptive_engine_status || {};
  const atRisk = overview?.at_risk_learner_alerts || [];
  const integrity = overview?.integrity_dashboard || { suspicious_attempts: [], tab_switch_spikes: [], rapid_guessing_attempts: [] };
  const interventions = overview?.intervention_queue || [];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 animate-fadeUp">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-syne font-800 text-2xl md:text-3xl text-ink">⚙️ Admin Control Center</h1>
          <p className="font-dm text-sm text-muted mt-1">Manage assignments, gamification, and system settings.</p>
        </div>
        <button
          onClick={loadAdmin}
          className="px-4 py-2 rounded-xl border border-border bg-card font-syne font-700 text-sm text-ink hover:border-accent2"
        >
          Refresh
        </button>
      </header>

      {notice && <div className="p-3 rounded-xl border border-accent2/30 bg-accent2/10 font-dm text-sm text-accent2">{notice}</div>}
      {error && <div className="p-3 rounded-xl border border-red-200 bg-red-50 font-dm text-sm text-wrong">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'assignments', label: 'Assignments' },
          { id: 'gamification', label: 'Gamification' },
          { id: 'advanced', label: 'Advanced' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-syne font-700 text-sm transition-colors ${
              activeTab === tab.id
                ? 'text-accent border-b-2 border-accent'
                : 'text-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="font-dm text-[11px] uppercase text-muted">Adaptive Engine</p>
              <p className={`font-syne font-800 text-xl ${adaptive.enabled ? 'text-accent2' : 'text-wrong'}`}>{adaptive.enabled ? 'ON' : 'OFF'}</p>
              <p className="font-dm text-xs text-muted mt-1">Fallback: {Number(adaptive.fallback_rate_7d_pct || 0).toFixed(1)}%</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="font-dm text-[11px] uppercase text-muted">Plans (7d)</p>
              <p className="font-syne font-800 text-xl text-ink">{Number(adaptive.total_plans_7d || 0)}</p>
              <p className="font-dm text-xs text-muted mt-1">{formatDateTime(adaptive.last_plan_generated)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="font-dm text-[11px] uppercase text-muted">At-Risk Learners</p>
              <p className="font-syne font-800 text-xl text-wrong">{atRisk.length}</p>
              <p className="font-dm text-xs text-muted mt-1">Need intervention</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="font-dm text-[11px] uppercase text-muted">Integrity Flags</p>
              <p className="font-syne font-800 text-xl text-ink">{integrity.suspicious_attempts?.length || 0}</p>
              <p className="font-dm text-xs text-muted mt-1">Suspicious attempts</p>
            </div>
          </section>

          {interventions.length > 0 && (
            <section className="bg-card border border-border rounded-2xl p-5">
              <h2 className="font-syne font-700 text-lg text-ink mb-3">Intervention Queue</h2>
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {interventions.slice(0, 10).map((i, idx) => (
                  <div key={`${i.type}-${i.name}-${idx}`} className="border border-border rounded-lg p-3">
                    <p className="font-syne font-700 text-sm text-ink">{i.name || 'Unknown student'} ({i.type})</p>
                    <p className="font-dm text-xs text-muted mt-1">{Array.isArray(i.reasons) ? i.reasons.join(', ') : ''}</p>
                    <p className="font-dm text-xs text-muted mt-1">{i.recommended_action}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Assignments Tab */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          <section className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-syne font-700 text-lg text-ink mb-4">Schedule New Assignment</h2>
            <form onSubmit={handleCreateAssignment} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                placeholder="Quiz Code (e.g. MTH1)"
                value={assignmentDraft.quiz_code}
                onChange={(e) => setAssignmentDraft((p) => ({ ...p, quiz_code: e.target.value.toUpperCase() }))}
                required
              />
              <input
                className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                placeholder="Class Name"
                value={assignmentDraft.class_name}
                onChange={(e) => setAssignmentDraft((p) => ({ ...p, class_name: e.target.value }))}
              />
              <input
                className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                placeholder="Section Name"
                value={assignmentDraft.section_name}
                onChange={(e) => setAssignmentDraft((p) => ({ ...p, section_name: e.target.value }))}
              />
              <select
                className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                value={assignmentDraft.status}
                onChange={(e) => setAssignmentDraft((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="closed">Closed</option>
              </select>
              <input
                type="datetime-local"
                className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                value={assignmentDraft.release_at}
                onChange={(e) => setAssignmentDraft((p) => ({ ...p, release_at: e.target.value }))}
              />
              <input
                type="datetime-local"
                className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                value={assignmentDraft.close_at}
                onChange={(e) => setAssignmentDraft((p) => ({ ...p, close_at: e.target.value }))}
              />
              <button
                type="submit"
                className="col-span-1 md:col-span-2 py-3 rounded-xl bg-accent text-white font-syne font-700 text-sm hover:bg-accent/90"
              >
                Create Assignment
              </button>
            </form>
          </section>

          <section className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-syne font-700 text-lg text-ink mb-4">Scheduled Assignments</h2>
            {assignments.length === 0 ? (
              <p className="font-dm text-sm text-muted">No scheduled assignments.</p>
            ) : (
              <div className="space-y-2">
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 border border-border rounded-xl">
                    <div>
                      <p className="font-syne font-700 text-sm text-ink">{a.quiz_code} - {a.class_name} {a.section_name}</p>
                      <p className="font-dm text-xs text-muted">
                        Status: <span className="font-syne font-600 text-accent2">{a.status}</span>
                        {a.release_at && ` • Opens: ${formatDateTime(a.release_at)}`}
                        {a.close_at && ` • Closes: ${formatDateTime(a.close_at)}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {a.status !== 'active' && (
                        <button
                          onClick={() => handleUpdateAssignment(a.id, 'active')}
                          className="px-3 py-1.5 rounded-lg border border-border bg-card font-syne font-700 text-[10px] text-accent hover:bg-accent hover:text-white"
                        >
                          Activate
                        </button>
                      )}
                      {a.status !== 'paused' && (
                        <button
                          onClick={() => handleUpdateAssignment(a.id, 'paused')}
                          className="px-3 py-1.5 rounded-lg border border-border bg-card font-syne font-700 text-[10px] text-yellow-600 hover:bg-yellow-500 hover:text-white"
                        >
                          Pause
                        </button>
                      )}
                      {a.status !== 'closed' && (
                        <button
                          onClick={() => handleUpdateAssignment(a.id, 'closed')}
                          className="px-3 py-1.5 rounded-lg border border-border bg-card font-syne font-700 text-[10px] text-wrong hover:bg-wrong hover:text-white"
                        >
                          Close
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Gamification Tab */}
      {activeTab === 'gamification' && (
        <div className="space-y-6">
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Quests */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="font-syne font-700 text-lg text-ink mb-4">Create Quest</h2>
              <form onSubmit={handleCreateQuest} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                    placeholder="Quest Code (e.g. weekly_3_quizzes)"
                    value={questDraft.code}
                    onChange={(e) => setQuestDraft((p) => ({ ...p, code: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                    required
                  />
                  <input
                    className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                    placeholder="Season (e.g. Core, Season 1)"
                    value={questDraft.season_label}
                    onChange={(e) => setQuestDraft((p) => ({ ...p, season_label: e.target.value }))}
                  />
                </div>
                <input
                  className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                  placeholder="Quest Name (e.g. Weekly Warmup)"
                  value={questDraft.name}
                  onChange={(e) => setQuestDraft((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <input
                  className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                  placeholder="Description (e.g. Complete 3 quizzes this week)"
                  value={questDraft.description}
                  onChange={(e) => setQuestDraft((p) => ({ ...p, description: e.target.value }))}
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-dm text-xs text-muted mb-1">Metric</label>
                    <select
                      className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                      value={questDraft.metric}
                      onChange={(e) => setQuestDraft((p) => ({ ...p, metric: e.target.value }))}
                    >
                      <option value="attempts_weekly">Quizzes/Week</option>
                      <option value="avg_pct_weekly">Avg Score %</option>
                      <option value="high_scores_weekly">High Scores 90%+</option>
                      <option value="streak_days">Streak Days</option>
                      <option value="total_correct">Total Correct</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-dm text-xs text-muted mb-1">Target</label>
                    <input
                      type="number"
                      className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                      placeholder="3"
                      value={questDraft.target_value}
                      onChange={(e) => setQuestDraft((p) => ({ ...p, target_value: Number(e.target.value) }))}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-dm text-xs text-muted mb-1">Reward XP</label>
                  <input
                    type="number"
                    className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                    placeholder="80"
                    value={questDraft.reward_xp}
                    onChange={(e) => setQuestDraft((p) => ({ ...p, reward_xp: Number(e.target.value) }))}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-accent2 text-white font-syne font-700 text-sm hover:bg-accent2/90"
                >
                  Create Quest
                </button>
              </form>

              <h3 className="font-syne font-700 text-sm text-ink mt-6 mb-3">Active Quests</h3>
              <div className="space-y-2 max-h-64 overflow-auto">
                {quests.slice(0, 8).map((q) => (
                  <button
                    key={q.id}
                    onClick={() => handleToggleQuest(q)}
                    className="w-full flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/5"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-dm text-xs text-ink font-700">{q.code}</p>
                        <span className={`text-[9px] font-syne font-700 px-1.5 py-0.5 rounded-full ${
                          Number(q.active) ? 'bg-accent2/10 text-accent2' : 'bg-muted text-muted'
                        }`}>
                          {Number(q.active) ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="font-dm text-[10px] text-muted">{q.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] font-syne font-600 text-accent2">
                          Target: {q.target_value} ({q.metric.replace('_weekly', '')})
                        </span>
                        <span className="text-[9px] font-syne font-600 text-ink">
                          +{q.reward_xp} XP
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Badges */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="font-syne font-700 text-lg text-ink mb-4">Create Badge</h2>
              <form onSubmit={handleCreateBadge} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                    placeholder="Badge Code (e.g. first_quiz)"
                    value={badgeDraft.code}
                    onChange={(e) => setBadgeDraft((p) => ({ ...p, code: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                    required
                  />
                  <input
                    className="p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                    placeholder="Season (e.g. Core, Beginner)"
                    value={badgeDraft.season_label}
                    onChange={(e) => setBadgeDraft((p) => ({ ...p, season_label: e.target.value }))}
                  />
                </div>
                <input
                  className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                  placeholder="Badge Name (e.g. First Steps)"
                  value={badgeDraft.name}
                  onChange={(e) => setBadgeDraft((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <input
                  className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                  placeholder="Description (e.g. Complete your first quiz)"
                  value={badgeDraft.description}
                  onChange={(e) => setBadgeDraft((p) => ({ ...p, description: e.target.value }))}
                  required
                />
                <div>
                  <label className="block font-dm text-xs text-muted mb-1">Icon</label>
                  <select
                    className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                    value={badgeDraft.icon}
                    onChange={(e) => setBadgeDraft((p) => ({ ...p, icon: e.target.value }))}
                  >
                    <option value="badge">🎖️ Medal</option>
                    <option value="star">⭐ Star</option>
                    <option value="trophy">🏆 Trophy</option>
                    <option value="flame">🔥 Flame</option>
                    <option value="crown">👑 Crown</option>
                    <option value="rocket">🚀 Rocket</option>
                    <option value="map">🧭 Map</option>
                    <option value="fire">🔥 Fire</option>
                    <option value="seed">🌱 Seed</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-dm text-xs text-muted mb-1">Criteria Type</label>
                    <select
                      className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                      value={badgeDraft.criteria_type}
                      onChange={(e) => setBadgeDraft((p) => ({ ...p, criteria_type: e.target.value }))}
                    >
                      <option value="quizzes_completed">Quizzes Completed</option>
                      <option value="score_percent">Score Percentage</option>
                      <option value="streak_days">Streak Days</option>
                      <option value="level_reached">Level Reached</option>
                      <option value="correct_answers">Correct Answers</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-dm text-xs text-muted mb-1">Target Value</label>
                    <input
                      type="number"
                      className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                      placeholder="10"
                      value={badgeDraft.target_value}
                      onChange={(e) => setBadgeDraft((p) => ({ ...p, target_value: Number(e.target.value) }))}
                      required
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-paper">
                  <input
                    type="checkbox"
                    id="auto_award"
                    className="w-4 h-4 accent-accent2"
                    checked={badgeDraft.auto_award}
                    onChange={(e) => setBadgeDraft((p) => ({ ...p, auto_award: e.target.checked }))}
                  />
                  <label htmlFor="auto_award" className="font-dm text-sm text-ink">
                    Auto-award when criteria met
                  </label>
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-accent text-white font-syne font-700 text-sm hover:bg-accent/90"
                >
                  Create Badge
                </button>
              </form>

              <h3 className="font-syne font-700 text-sm text-ink mt-6 mb-3">Active Badges</h3>
              <div className="space-y-2 max-h-64 overflow-auto">
                {badges.slice(0, 8).map((b) => {
                  const iconMap = {
                    badge: '🎖️',
                    star: '⭐',
                    trophy: '🏆',
                    flame: '🔥',
                    crown: '👑',
                    rocket: '🚀',
                    map: '🧭',
                    fire: '🔥',
                    seed: '🌱',
                  };
                  const criteriaLabels = {
                    quizzes_completed: 'Quizzes',
                    score_percent: 'Score %',
                    streak_days: 'Streak Days',
                    level_reached: 'Level',
                    correct_answers: 'Correct Answers',
                  };
                  return (
                    <button
                      key={b.id}
                      onClick={() => handleToggleBadge(b)}
                      className="w-full flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{iconMap[b.icon] || '🎖️'}</span>
                        <div className="text-left">
                          <p className="font-dm text-xs text-ink font-700">{b.code}</p>
                          <p className="font-dm text-[10px] text-muted">{b.name}</p>
                          <p className="font-dm text-[9px] text-accent2 mt-0.5">
                            {criteriaLabels[b.criteria_type] || 'Quizzes'}: {b.target_value}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {Number(b.auto_award) && (
                          <span className="text-[9px] font-syne font-700 px-1.5 py-0.5 rounded bg-accent2/10 text-accent2">
                            Auto
                          </span>
                        )}
                        <span className={`text-[10px] font-syne font-700 px-2 py-0.5 rounded-full ${
                          Number(b.active) ? 'bg-accent/10 text-accent' : 'bg-muted text-muted'
                        }`}>
                          {Number(b.active) ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Advanced Tab */}
      {activeTab === 'advanced' && (
        <div className="space-y-6">
          <section className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-syne font-700 text-lg text-ink mb-4">Feature Flags</h2>
            <div className="space-y-3">
              {flags.map((flag) => (
                <div key={flag.key} className="flex items-center justify-between p-3 border border-border rounded-xl">
                  <div>
                    <p className="font-syne font-700 text-sm text-ink">{flag.key}</p>
                    <p className="font-dm text-xs text-muted">{flag.description || 'No description'}</p>
                  </div>
                  <button
                    onClick={() => handleToggleFlag(flag.key, { enabled: !flag.enabled })}
                    className={`px-4 py-2 rounded-lg font-syne font-700 text-sm transition-colors ${
                      flag.enabled
                        ? 'bg-accent2 text-white'
                        : 'bg-muted text-muted'
                    }`}
                  >
                    {flag.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-syne font-700 text-lg text-ink mb-4">System Settings</h2>
            <div className="space-y-3">
              {settings.slice(0, 10).map((setting) => (
                <div key={setting.key} className="flex items-center justify-between p-3 border border-border rounded-xl">
                  <div>
                    <p className="font-syne font-700 text-sm text-ink">{setting.key}</p>
                    <p className="font-dm text-xs text-muted">{typeof setting.value === 'object' ? JSON.stringify(setting.value) : String(setting.value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-syne font-700 text-lg text-ink mb-4">Developer Notes</h2>
            <div className="space-y-3 font-dm text-sm text-muted">
              <p>This section contains advanced features for system administration.</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Feature flags control experimental functionality</li>
                <li>System settings affect platform-wide behavior</li>
                <li>Use caution when modifying these settings</li>
              </ul>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
