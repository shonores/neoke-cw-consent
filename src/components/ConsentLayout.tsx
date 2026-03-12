import type { ReactNode } from 'react';
import LoadingSpinner from './LoadingSpinner';

interface ConsentAction {
  label: string;
  onClick: () => void;
  variant: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
}

interface ConsentLayoutProps {
  icon: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions: ConsentAction[];
}

export default function ConsentLayout({
  icon,
  title,
  subtitle,
  children,
  actions,
}: ConsentLayoutProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-black/5 px-5 py-6 text-center">
        <div className="text-4xl mb-3" aria-hidden>{icon}</div>
        <h2 className="text-xl font-bold text-[#1c1c1e]">{title}</h2>
        {subtitle && <p className="text-sm text-[#8e8e93] mt-1">{subtitle}</p>}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {children}
      </div>

      {/* Actions */}
      <div className="px-5 pb-8 pt-4 border-t border-black/5 grid grid-cols-2 gap-3 bg-white">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            disabled={action.disabled || action.loading}
            aria-label={action.label}
            className={`
              relative flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl font-semibold text-sm
              min-h-[44px] transition-all duration-150 active:scale-95
              disabled:opacity-50 disabled:cursor-not-allowed
              ${action.variant === 'primary'
                ? 'bg-[#5843de] hover:bg-[#5843de]/90 text-white'
                : 'bg-[#f2f2f7] hover:bg-[#e5e5ea] text-[#1c1c1e] border border-black/5'}
            `}
          >
            {action.loading ? <LoadingSpinner size="sm" /> : action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
