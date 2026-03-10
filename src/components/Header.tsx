import React from 'react';
import IconButton from './IconButton';

interface HeaderProps {
    title: string;
    onBack?: () => void;
    rightAction?: React.ReactNode;
    transparent?: boolean;
}

export default function Header({ title, onBack, rightAction, transparent }: HeaderProps) {
    return (
        <header className={`px-5 pt-12 pb-4 flex items-center justify-between z-40 ${transparent ? 'bg-transparent' : 'bg-white'}`}>
            <div className="w-10 flex-shrink-0">
                {onBack && (
                    <IconButton onClick={onBack} aria-label="Go back">
                        <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                            <path d="M7 1L2 7l5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </IconButton>
                )}
            </div>

            <h1 className="flex-1 text-center text-[17px] font-semibold text-[#1c1c1e] truncate px-2">
                {title}
            </h1>

            <div className="w-10 flex flex-shrink-0 justify-end">
                {rightAction}
            </div>
        </header>
    );
}
