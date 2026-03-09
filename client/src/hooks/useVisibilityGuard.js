import { useEffect, useRef, useState } from 'react';

export function useVisibilityGuard({ onViolation, maxViolations = 3, onExceed }) {
  const [violations, setViolations] = useState(0);
  const [lastLeft, setLastLeft] = useState(null);
  const leftAtRef = useRef(null);
  const violationsRef = useRef(0);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        leftAtRef.current = new Date().toISOString();
        setLastLeft(leftAtRef.current);
      } else {
        if (!leftAtRef.current) return;
        const returnedAt = new Date().toISOString();
        const awayMs = new Date(returnedAt) - new Date(leftAtRef.current);
        const awaySeconds = Math.round(awayMs / 1000);

        violationsRef.current += 1;
        const count = violationsRef.current;
        setViolations(count);

        onViolation?.(count, {
          leftAt: leftAtRef.current,
          returnedAt,
          awaySeconds,
        });

        if (count >= maxViolations) {
          onExceed?.();
        }

        leftAtRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [onViolation, maxViolations, onExceed]);

  return { violations, lastLeft };
}
