import React from 'react';

interface PScrapLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark';
}

export const PScrapLogo: React.FC<PScrapLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'dark',
}) => {
  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  const subTextSizes = {
    sm: 'text-[9px]',
    md: 'text-[10.5px]',
    lg: 'text-xs',
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Visual Emblem Badge: Stylized "p" with eco recycling leaf */}
      <div
        className={`${iconSizes[size]} rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-xs shrink-0 ring-1 ring-emerald-400/30`}
      >
        <svg
          viewBox="0 0 40 40"
          className="w-full h-full p-1 fill-none stroke-current"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Circular eco arrow */}
          <path
            d="M 12 18 C 12 12, 28 10, 30 18 C 31 22, 28 28, 22 28"
            stroke="#ffffff"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          {/* Arrowhead */}
          <path
            d="M 23 25 L 21 29 L 26 31"
            stroke="#ffffff"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Dynamic "p" stem & loop */}
          <path
            d="M 14 34 L 14 12 C 14 12, 17 8, 23 8 C 28 8, 29 14, 27 18 C 25 22, 20 23, 14 23"
            stroke="#ffffff"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Leaf accent */}
          <path
            d="M 23 13 C 27 11, 31 13, 30 17 C 29 20, 25 18, 23 13 Z"
            fill="#a7f3d0"
            stroke="#10b981"
            strokeWidth="0.8"
          />
        </svg>
      </div>

      {/* Typographic "pScrap" mark */}
      <div className="flex flex-col leading-none">
        <div className={`font-black tracking-tight ${textSizes[size]}`}>
          <span className="text-emerald-500 font-sans italic">p</span>
          <span
            className={
              variant === 'light'
                ? 'text-white font-serif tracking-normal'
                : 'text-[#0d2847] font-serif tracking-normal'
            }
          >
            Scrap
          </span>
        </div>
        <span
          className={`font-sans font-medium tracking-wide uppercase ${subTextSizes[size]} ${
            variant === 'light' ? 'text-emerald-300' : 'text-emerald-700'
          }`}
        >
          Vehicle Registry
        </span>
      </div>
    </div>
  );
};
