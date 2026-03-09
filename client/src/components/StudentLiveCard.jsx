import { memo } from 'react';

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getTimeAgo(timestamp) {
  if (!timestamp) return 'Unknown';
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function nameToColor(name) {
  const colors = [
    'bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
    'bg-red-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
  ];
  const safeName = String(name || 'Unknown');
  let hash = 0;
  for (let i = 0; i < safeName.length; i++) hash = safeName.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const StudentLiveCard = memo(function StudentLiveCard({ student, quizTotalQuestions, onClick, onSendMessage }) {
  const {
    student_name = 'Unknown',
    status,
    current_question = 0,
    progress_percent = 0,
    violation_count = 0,
    started_at,
    last_activity_at,
    is_active,
    is_completed,
    percentage,
    score,
    total,
    time_taken_s,
  } = student;

  const color = nameToColor(student_name);
  const initial = student_name.charAt(0).toUpperCase();
  
  const isWarning = violation_count >= 1 && violation_count < 3;
  const isCritical = violation_count >= 3;
  const isInactive = is_active && last_activity_at && 
    (Date.now() - new Date(last_activity_at).getTime()) > 5 * 60000;

  const getStatusBadge = () => {
    if (is_completed) {
      return (
        <span className="px-2 py-1 rounded-full text-[10px] font-syne font-700 bg-blue-500/20 text-blue-500">
          ✓ Done
        </span>
      );
    }
    if (isCritical) {
      return (
        <span className="px-2 py-1 rounded-full text-[10px] font-syne font-700 bg-red-500/20 text-red-500 animate-pulse">
          ⚠️ {violation_count} violations
        </span>
      );
    }
    if (isWarning) {
      return (
        <span className="px-2 py-1 rounded-full text-[10px] font-syne font-700 bg-yellow-500/20 text-yellow-600">
          ⚠️ {violation_count}
        </span>
      );
    }
    if (isInactive) {
      return (
        <span className="px-2 py-1 rounded-full text-[10px] font-syne font-700 bg-orange-500/20 text-orange-500">
          ⏸ Inactive
        </span>
      );
    }
    return (
      <span className="px-2 py-1 rounded-full text-[10px] font-syne font-700 bg-green-500/20 text-green-500">
        ● Active
      </span>
    );
  };

  const getBorderColor = () => {
    if (isCritical) return 'border-red-500/50 bg-red-500/5';
    if (isWarning) return 'border-yellow-500/30 bg-yellow-500/5';
    if (isInactive) return 'border-orange-500/30 bg-orange-500/5';
    if (is_completed) return 'border-blue-500/30 bg-blue-500/5';
    return 'border-border bg-card';
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border-2 p-4 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] ${getBorderColor()}`}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className={`${color} w-10 h-10 rounded-full flex items-center justify-center text-white font-syne font-700 text-sm flex-shrink-0`}>
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="font-syne font-700 text-ink text-sm truncate">{student_name}</p>
            {getStatusBadge()}
          </div>
          <p className="font-dm text-[10px] text-muted">
            {is_completed 
              ? `Completed • ${formatTime(time_taken_s)}`
              : `Started ${getTimeAgo(started_at)}`
            }
          </p>
        </div>
      </div>

      {is_completed ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-dm text-xs text-muted">Score</span>
            <span className={`font-syne font-700 text-sm ${
              percentage >= 80 ? 'text-correct' :
              percentage >= 60 ? 'text-yellow-600' :
              'text-wrong'
            }`}>{Math.round(percentage)}%</span>
          </div>
          <div className="h-2 bg-paper rounded-full overflow-hidden border border-border">
            <div
              className={`h-full transition-all ${
                percentage >= 80 ? 'bg-correct' :
                percentage >= 60 ? 'bg-yellow-500' :
                'bg-wrong'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="font-dm text-[10px] text-muted text-right">{score}/{total}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-dm text-xs text-muted">Question</span>
            <span className="font-syne font-700 text-sm text-ink">
              {current_question}/{quizTotalQuestions}
            </span>
          </div>
          <div className="h-2 bg-paper rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-accent2 transition-all"
              style={{ width: `${Math.max(5, progress_percent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-dm text-muted">
              Progress: {progress_percent}%
            </span>
            <span className="font-dm text-muted">
              Last active: {getTimeAgo(last_activity_at)}
            </span>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {is_active && (
        <div className="mt-3 pt-3 border-t border-border/50 flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSendMessage(student, 'message');
            }}
            className="flex-1 py-1.5 rounded-lg bg-accent/10 text-accent font-syne font-600 text-[10px] hover:bg-accent/20 transition-colors"
          >
            💬 Message
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSendMessage(student, 'warning');
            }}
            className="flex-1 py-1.5 rounded-lg bg-wrong/10 text-wrong font-syne font-600 text-[10px] hover:bg-wrong/20 transition-colors"
          >
            ⚠️ Warn
          </button>
        </div>
      )}
    </div>
  );
});

export default StudentLiveCard;
