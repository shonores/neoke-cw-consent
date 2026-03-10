import type { ReactNode } from 'react';
import LoadingSpinner from './LoadingSpinner';

/**
 * Primary CTA button — indigo pill, full-width by default.
 * Use for all main action buttons across the app (Save, Continue, Upload, etc.)
 */
interface PrimaryButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  type?: 'button' | 'submit';
  fullWidth?: boolean;
  className?: string;
}

export default function PrimaryButton({
  onClick,
  disabled,
  loading,
  children,
  type = 'button',
  fullWidth = true,
  className = '',
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        ${fullWidth ? 'w-full' : ''} 
        flex items-center justify-center gap-2 
        py-4 rounded-full 
        text-white font-semibold text-[17px] 
        transition-all duration-150
        active:scale-[0.98] active:opacity-90 
        disabled:opacity-50 disabled:cursor-not-allowed
        bg-[var(--primary)]
        ${className}
      `}
    >
      {loading ? <LoadingSpinner size="sm" /> : children}
    </button>
  );
}
