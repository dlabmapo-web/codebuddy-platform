import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  shadow?: boolean;
}

export function Card({ shadow = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`bg-card border border-border rounded-card ${
        shadow ? 'shadow-card' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
