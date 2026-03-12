import React from 'react';

/**
 * Modern Button Component
 * 
 * @param {React.ReactNode} children - Button content
 * @param {string} variant - Button style: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
 * @param {string} size - Button size: 'sm' | 'md' | 'lg'
 * @param {boolean} disabled - Disabled state
 * @param {boolean} loading - Loading state with spinner
 * @param {string} className - Additional CSS classes
 * @param {function} onClick - Click handler
 * @param {string} type - Button type: 'button' | 'submit' | 'reset'
 * @param {string} ariaLabel - Accessibility label
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  className = '',
  onClick,
  type = 'button',
  ariaLabel,
  ...props
}) {
  const baseStyles = 'font-syne font-700 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 touch-target';
  
  const variants = {
    primary: 'bg-ink text-paper hover:bg-ink/90 disabled:bg-ink/30',
    secondary: 'bg-accent2 text-white hover:bg-accent2/90 disabled:bg-accent2/30',
    outline: 'border-2 border-border bg-card hover:border-accent2 disabled:opacity-50',
    ghost: 'text-muted hover:text-ink hover:bg-paper disabled:opacity-30',
    danger: 'bg-wrong text-white hover:bg-wrong/90 disabled:bg-wrong/30',
    accent: 'bg-accent text-white hover:bg-accent/90 disabled:bg-accent/30',
  };
  
  const sizes = {
    sm: 'px-3 py-2.5 text-sm',
    md: 'px-4 py-3 text-base',
    lg: 'px-6 py-4 text-lg',
  };
  
  const isDisabled = disabled || loading;
  
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${isDisabled ? 'cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
