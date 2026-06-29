import type { CSSProperties, ReactNode } from 'react';

/** Shared card primitive so every panel/summary tile shares one look. */
export function Card({
  children,
  className = '',
  style,
  hover = false,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  hover?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border ${hover || onClick ? 'transition-colors' : ''} ${className}`}
      style={{
        background: '#111113',
        borderColor: '#1f1f23',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
      onMouseEnter={
        hover || onClick
          ? (e) => (e.currentTarget.style.borderColor = '#3f3f46')
          : undefined
      }
      onMouseLeave={
        hover || onClick
          ? (e) => (e.currentTarget.style.borderColor = '#1f1f23')
          : undefined
      }
    >
      {children}
    </div>
  );
}

export type StatusLevel = 'ok' | 'warn' | 'down';

/** One palette for every status dot / badge / strip across the app. */
export const STATUS: Record<StatusLevel, { color: string; glow: string }> = {
  ok: { color: '#22c55e', glow: '#22c55e66' },
  warn: { color: '#f59e0b', glow: '#f59e0b66' },
  down: { color: '#ef4444', glow: '#ef444466' },
};

export function StatusDot({ level }: { level: StatusLevel }) {
  const s = STATUS[level];
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: s.color, boxShadow: `0 0 6px ${s.glow}` }}
    />
  );
}
