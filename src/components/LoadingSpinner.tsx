interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeMap = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };
  return (
    <div
      className={`${sizeMap[size]} border-2 border-[#5B4FE9]/20 border-t-[#5B4FE9] rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
