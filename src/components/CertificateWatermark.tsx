import React from 'react';

export const CertificateWatermark: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.16] select-none z-0 overflow-hidden"
    >
      <svg
        viewBox="0 0 500 500"
        className="w-[500px] h-[500px] text-[#14532d]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Soft authentic security seal background tint for the full circle */}
        <circle cx="250" cy="250" r="242" fill="#14532d" fillOpacity="0.04" />
        <circle cx="250" cy="250" r="150" fill="#166534" fillOpacity="0.06" />

        {/* 1. Outermost Concentric Circular Security Borders */}
        <circle cx="250" cy="250" r="242" stroke="currentColor" strokeWidth="3.5" />
        <circle cx="250" cy="250" r="235" stroke="currentColor" strokeWidth="1.2" />
        <circle
          cx="250"
          cy="250"
          r="228"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="5 3"
        />
        <circle cx="250" cy="250" r="221" stroke="currentColor" strokeWidth="1.5" />

        {/* 2. Inner Text Boundary Circles */}
        <circle cx="250" cy="250" r="165" stroke="currentColor" strokeWidth="1.5" />
        <circle
          cx="250"
          cy="250"
          r="158"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />
        <circle cx="250" cy="250" r="150" stroke="currentColor" strokeWidth="2.5" />

        {/* 3. Circular text paths for PARIVAHAN SCRAPPERS & Motto */}
        <defs>
          {/* Upper Arc: Left to Right across the top */}
          <path
            id="textPathUpper"
            d="M 60,250 A 190,190 0 1,1 440,250"
            fill="none"
          />
          {/* Lower Arc: Left to Right across the bottom */}
          <path
            id="textPathLower"
            d="M 60,250 A 190,190 0 0,0 440,250"
            fill="none"
          />
        </defs>

        {/* Upper Circular Text: PARIVAHAN SCRAPPERS */}
        <text
          fill="currentColor"
          fontSize="22"
          fontWeight="900"
          letterSpacing="0.26em"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          <textPath href="#textPathUpper" startOffset="50%" textAnchor="middle">
            ★ PARIVAHAN SCRAPPERS ★
          </textPath>
        </text>

        {/* Lower Circular Text: RESPONSIBLE RECYCLING • GREENER INDIA */}
        <text
          fill="currentColor"
          fontSize="14"
          fontWeight="bold"
          letterSpacing="0.22em"
          style={{ fontFamily: 'sans-serif' }}
        >
          <textPath href="#textPathLower" startOffset="50%" textAnchor="middle">
            • RESPONSIBLE RECYCLING • GREENER INDIA •
          </textPath>
        </text>

        {/* 4. Fine Security Ray Radial Hatching in Inner Core */}
        <g stroke="currentColor" strokeWidth="0.75" opacity="0.35">
          <line x1="250" y1="102" x2="250" y2="148" />
          <line x1="250" y1="352" x2="250" y2="398" />
          <line x1="102" y1="250" x2="148" y2="250" />
          <line x1="352" y1="250" x2="398" y2="250" />
          <line x1="145" y1="145" x2="178" y2="178" />
          <line x1="322" y1="322" x2="355" y2="355" />
          <line x1="145" y1="355" x2="178" y2="322" />
          <line x1="322" y1="178" x2="355" y2="145" />
        </g>

        {/* 5. 3 Recycling arrows forming Mobius loop in deep dark green */}
        <g transform="translate(142, 142) scale(0.43)" fill="currentColor">
          <path d="M250,50 L280,120 L220,120 Z" />
          <path
            d="M250,80 C360,80 430,170 410,270 L360,240 C375,170 330,120 250,120 L250,160 L180,100 L250,40 Z"
            fill="currentColor"
          />
          <path
            d="M400,320 C350,420 230,460 140,400 L170,350 C230,390 320,360 360,290 L320,270 L400,230 L430,310 Z"
            fill="currentColor"
          />
          <path
            d="M100,260 C70,160 140,70 230,60 L220,110 C160,120 110,180 130,250 L90,240 L120,330 L190,280 Z"
            fill="currentColor"
          />
        </g>

        {/* 6. Central Stylized Eco Leaf with crisp white vein */}
        <path
          d="M250,180 C285,190 315,225 305,275 C295,315 250,335 250,335 C250,335 205,315 195,275 C185,225 215,190 250,180 Z"
          fill="currentColor"
          opacity="0.95"
        />
        <path
          d="M250,192 Q252,255 250,325"
          stroke="#ffffff"
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        {/* 7. Official Authenticity Inner Micro-Arc Tag */}
        <text
          x="250"
          y="350"
          textAnchor="middle"
          fill="currentColor"
          fontSize="10"
          fontWeight="bold"
          letterSpacing="0.18em"
        >
          OFFICIAL SCRAPPING RECORD
        </text>
      </svg>
    </div>
  );
};

