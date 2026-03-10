interface OptionCardProps {
    selected: boolean;
    onClick: () => void;
    title: string;
    description?: string;
    className?: string;
}

export default function OptionCard({ selected, onClick, title, description, className = '' }: OptionCardProps) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left bg-[var(--bg-white)] rounded-[var(--radius-2xl)] px-4 py-4 border-2 transition-all duration-200 ${selected
                    ? 'border-[var(--primary)] bg-[var(--primary-bg)]'
                    : 'border-transparent shadow-[var(--shadow-sm)]'
                } ${className}`}
        >
            <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[#c7c7cc]'
                    }`}>
                    {selected && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </div>
                <div className="flex-1">
                    <p className="text-[15px] font-bold text-[var(--text-main)] italic">{title}</p>
                    {description && <p className="text-[13px] text-[var(--text-muted)] mt-0.5 font-medium">{description}</p>}
                </div>
            </div>
        </button>
    );
}
