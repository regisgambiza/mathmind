function nameToColor(name) {
  const colors = [
    'bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
    'bg-red-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getPerformanceColor(percentage) {
  if (percentage >= 80) return { bg: 'bg-correct/10', text: 'text-correct', border: 'border-correct/30' };
  if (percentage >= 60) return { bg: 'bg-yellow-500/10', text: 'text-yellow-600', border: 'border-yellow-500/30' };
  return { bg: 'bg-wrong/10', text: 'text-wrong', border: 'border-wrong/30' };
}

function getPerformanceLabel(percentage) {
  if (percentage >= 80) return 'Excellent';
  if (percentage >= 60) return 'Good';
  if (percentage >= 40) return 'Needs Improvement';
  return 'Struggling';
}

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function StudentCard({ student, showDetails = false }) {
  const { student_name, status, score, total, percentage, time_taken_s, violations } = student;
  const color = nameToColor(student_name);
  const initial = student_name.charAt(0).toUpperCase();
  const done = status === 'completed' || status === 'force_submitted';
  const perfColor = getPerformanceColor(percentage || 0);
  const progressPercent = total > 0 ? ((score || 0) / total) * 100 : 0;
  const violationCount = violations || 0;
  const hasManyViolations = violationCount >= 3;

  return (
    <div className={`bg-card rounded-xl border transition-all ${
      hasManyViolations ? 'border-wrong/50 bg-wrong/5' :
      done ? perfColor.border : 'border-border'
    } p-4`}>
      <div className="flex items-start gap-3">
        <div className={`${color} w-12 h-12 rounded-full flex items-center justify-center text-white font-syne font-700 text-xl flex-shrink-0`}>
          {initial}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="font-syne font-700 text-ink text-base truncate">{student_name}</p>
            <div className="flex items-center gap-2">
              {hasManyViolations && (
                <span className="font-syne font-700 text-xs bg-wrong/20 text-wrong px-2 py-1 rounded-full whitespace-nowrap">
                  ⚠️ {violationCount} violations
                </span>
              )}
              {done ? (
                <span className={`font-syne font-700 text-sm px-3 py-1 rounded-full whitespace-nowrap ${perfColor.bg} ${perfColor.text}`}>
                  {Math.round(percentage || 0)}%
                </span>
              ) : (
                <span className="font-syne font-600 text-xs bg-accent2/10 text-accent2 px-3 py-1 rounded-full animate-pulse">
                  In Progress
                </span>
              )}
            </div>
          </div>

          <p className="font-dm text-xs text-muted mb-2">
            {done ? `Completed • ${formatTime(time_taken_s)}` : 'Taking quiz...'}
            {!hasManyViolations && violationCount > 0 && (
              <span className="ml-2 text-yellow-600 font-syne font-600">⚠️ {violationCount} violation{violationCount > 1 ? 's' : ''}</span>
            )}
          </p>

          {done && (
            <>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-dm text-muted">Score: {score || 0}/{total}</span>
                <span className={`font-syne font-600 ${perfColor.text}`}>{getPerformanceLabel(percentage || 0)}</span>
              </div>
              <div className="h-2 bg-paper rounded-full overflow-hidden border border-border">
                <div
                  className={`h-full transition-all duration-500 ${
                    percentage >= 80 ? 'bg-correct' :
                    percentage >= 60 ? 'bg-yellow-500' : 'bg-wrong'
                  }`}
                  style={{ width: `${Math.max(5, progressPercent)}%` }}
                />
              </div>
            </>
          )}

          {!done && (
            <div className="h-1.5 bg-paper rounded-full overflow-hidden border border-border">
              <div className="h-full bg-accent2 animate-progress" style={{ width: '60%' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
