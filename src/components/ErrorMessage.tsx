interface ErrorMessageProps {
  message: string;
  className?: string;
}

export default function ErrorMessage({ message, className = '' }: ErrorMessageProps) {
  return (
    <div
      className={`flex items-start gap-3 bg-red-50 border border-red-200 rounded-[12px] p-4 text-red-600 text-sm ${className}`}
      role="alert"
    >
      {/* Warning triangle — line icon, consistent with rest of design system */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        className="flex-shrink-0 mt-0.5"
        aria-hidden
      >
        <path
          d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <p className="flex-1 leading-relaxed">{message}</p>
    </div>
  );
}
