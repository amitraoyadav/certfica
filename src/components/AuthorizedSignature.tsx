import React from 'react';

export const AuthorizedSignature: React.FC<{ className?: string }> = ({ className = 'h-12' }) => {
  return (
    <svg
      viewBox="0 0 240 80"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible' }}
    >
      {/* Dynamic, fluid blue-ink authorized signature matching the reference */}
      <path
        d="M 20 62 
           C 24 50, 32 28, 42 22 
           C 52 16, 58 24, 52 38 
           C 46 52, 38 60, 32 64 
           C 38 62, 54 48, 64 42 
           C 74 36, 82 40, 78 48 
           C 74 56, 68 58, 75 58 
           C 85 58, 92 46, 102 44 
           C 112 42, 122 46, 130 52 
           C 138 48, 148 36, 160 30 
           C 172 24, 185 28, 178 40 
           C 172 52, 160 58, 150 56
           C 142 54, 136 62, 144 64
           C 156 66, 185 45, 215 38"
        stroke="#0d47a1"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Under-slash decorative flourish underline */}
      <path
        d="M 38 68 C 75 72, 145 64, 225 48"
        stroke="#0d47a1"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
};
