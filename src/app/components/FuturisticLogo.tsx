// components/FuturisticLogo.tsx
export default function FuturisticLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <svg
        width="36" height="36" viewBox="0 0 64 64" aria-label="Val-Kassa"
        className="drop-shadow-[0_0_12px_rgba(74,222,128,0.45)]"
      >
        <defs>
          <linearGradient id="vk-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4ADE80"/>
            <stop offset="50%" stopColor="#FB923C"/>
            <stop offset="100%" stopColor="#EF4444"/>
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        {/* V */}
        <path d="M8 12 L24 52 L30 52 L14 12 Z" fill="url(#vk-grad)" filter="url(#glow)"/>
        {/* K in hoekige stijl */}
        <path d="M36 12 L36 52 L42 52 L42 38 L56 52 L62 52 L48 36 L62 20 L56 20 L42 34 L42 12 Z"
              fill="url(#vk-grad)" filter="url(#glow)"/>
      </svg>

    </div>
  );
}