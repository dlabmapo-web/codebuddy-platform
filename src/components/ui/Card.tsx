import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  shadow?: boolean;
}

export function Card({ shadow = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`bg-card border border-border rounded-card ${
        shadow ? 'shadow-[0_2px_8px_rgba(22,24,29,0.08)]' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
