import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
}

export default function IconButton({ children, className = '', ...props }: IconButtonProps) {
    return (
        <button
            className={`
        flex items-center justify-center 
        w-10 h-10 rounded-full 
        transition-all duration-150 
        active:scale-90 active:bg-black/5
        text-[#5B4FE9] 
        ${className}
      `}
            {...props}
        >
            {children}
        </button>
    );
}
