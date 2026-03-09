import { useNavigate } from 'react-router-dom';

export default function TopBar({ title, showBack, onBack, role }) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  return (
    <header className="sticky top-0 z-40 bg-paper border-b border-border px-4 py-3 flex items-center justify-between">
      <div className="w-16">
        {showBack && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-muted hover:text-ink transition-colors font-dm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">Back</span>
          </button>
        )}
      </div>

      <div className="flex flex-col items-center">
        <span className="font-syne font-800 text-lg tracking-tight leading-none">
          Math<span className="text-accent">Mind</span>
        </span>
        {title && <span className="font-dm text-xs text-muted mt-0.5">{title}</span>}
      </div>

      <div className="w-16 flex justify-end">
        {role === 'teacher' && (
          <span className="text-xs font-syne font-600 bg-accent text-white px-3 py-1 rounded-full">
            Teacher
          </span>
        )}
        {role === 'student' && (
          <span className="text-xs font-syne font-600 bg-accent2 text-white px-3 py-1 rounded-full">
            Student
          </span>
        )}
      </div>
    </header>
  );
}
