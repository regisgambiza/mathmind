import React from 'react';

/**
 * Loading Spinner Component
 * 
 * @param {string} size - Spinner size: 'sm' | 'md' | 'lg'
 * @param {string} color - Spinner color: 'accent' | 'ink' | 'white'
 * @param {string} className - Additional CSS classes
 */
export default function LoadingSpinner({ size = 'md', color = 'accent', className = '' }) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };
  
  const colors = {
    accent: 'text-accent',
    ink: 'text-ink',
    white: 'text-white',
    muted: 'text-muted',
  };
  
  return (
    <svg
      className={`animate-spin ${sizes[size]} ${colors[color]} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/**
 * Skeleton Loader Component
 * 
 * @param {string} variant - Skeleton type: 'text' | 'circle' | 'rect'
 * @param {string} width - Width class or value
 * @param {string} height - Height class or value
 * @param {string} className - Additional CSS classes
 */
export function Skeleton({ variant = 'text', width, height, className = '' }) {
  const baseStyles = 'animate-skeleton rounded';
  
  const variants = {
    text: 'h-4',
    circle: 'rounded-full',
    rect: 'rounded-lg',
  };
  
  const style = {
    width: width || '100%',
    height: height || (variant === 'text' ? '1rem' : 'auto'),
  };
  
  return (
    <div
      className={`${baseStyles} ${variants[variant]} ${className}`}
      style={style}
    />
  );
}

/**
 * Loading State Component for full-page or section loading
 * 
 * @param {string} message - Loading message
 * @param {string} icon - Optional emoji icon
 * @param {string} className - Additional CSS classes
 */
export function LoadingState({ message = 'Loading...', icon, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
      <div className="relative w-16 h-16 mb-4">
        <div className="absolute inset-0 rounded-full border-4 border-accent2/20" />
        <div className="absolute inset-0 rounded-full border-4 border-accent2 border-t-transparent animate-spin" />
      </div>
      {icon && <div className="text-4xl mb-2">{icon}</div>}
      <h2 className="font-syne font-700 text-lg text-ink mb-1">{message}</h2>
      <p className="font-dm text-sm text-muted">Generating personalized content...</p>
    </div>
  );
}
