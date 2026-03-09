export default function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
      <div
        className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
