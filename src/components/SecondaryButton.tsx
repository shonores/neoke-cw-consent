import React from 'react';
import LoadingSpinner from './LoadingSpinner';

interface SecondaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    loading?: boolean;
    fullWidth?: boolean;
}

export default function SecondaryButton({
    loading,
    fullWidth = true,
    children,
    className = '',
    ...props
}: SecondaryButtonProps) {
    return (
        <button
            {...props}
            disabled={props.disabled || loading}
            className={`
        ${fullWidth ? 'w-full' : ''} 
        flex items-center justify-center gap-2 
        py-4 rounded-full 
        text-[var(--text-main)] font-semibold text-[17px] 
        transition-all duration-150
        active:scale-[0.98] active:bg-[#e5e5ea]
        disabled:opacity-50 disabled:cursor-not-allowed
        bg-[#E5E5EA]
        ${className}
      `}
        >
            {loading ? <LoadingSpinner size="sm" /> : children}
        </button>
    );
}
