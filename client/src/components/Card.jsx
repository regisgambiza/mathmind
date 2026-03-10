import React from 'react';

/**
 * Modern Card Component
 * 
 * @param {React.ReactNode} children - Card content
 * @param {string} variant - Card style: 'default' | 'elevated' | 'subtle' | 'accent'
 * @param {string} padding - Padding size: 'sm' | 'md' | 'lg' | 'none'
 * @param {string} className - Additional CSS classes
 * @param {function} onClick - Click handler (makes card interactive)
 * @param {boolean} hoverable - Add hover effects
 */
export default function Card({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  onClick,
  hoverable = false,
  ...props
}) {
  const baseStyles = 'rounded-xl transition-all';
  
  const variants = {
    default: 'bg-card border-2 border-border',
    elevated: 'bg-card border-2 border-border shadow-lg hover:shadow-xl',
    subtle: 'bg-card border border-border/50',
    accent: 'bg-accent/5 border-2 border-accent/20',
    glass: 'glass border border-border/30',
  };
  
  const paddings = {
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-6 sm:p-8',
    none: '',
  };
  
  const hoverStyles = hoverable ? 'hover:scale-[1.02] cursor-pointer' : '';
  
  return (
    <div
      onClick={onClick}
      className={`${baseStyles} ${variants[variant]} ${paddings[padding]} ${hoverStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
