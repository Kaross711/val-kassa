// components/BackgroundFX.tsx
export default function BackgroundFX() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Geanimeerde gradient-wolk */}
      <div className="absolute -top-1/3 -left-1/3 h-[120vmax] w-[120vmax] bg-[radial-gradient(circle_at_center,rgba(0,245,212,0.12),transparent_60%)] animate-float-slow" />
      {/* Diagonaal grid met masker voor depth */}
      <div className="absolute inset-0 opacity-35 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]">
        <div className="h-full w-full bg-[linear-gradient(115deg,transparent_0_48%,rgba(124,58,237,0.35)_50%,transparent_52%)] bg-[length:18px_18px] animate-grid-shift"/>
      </div>
      {/* Scanline shimmer bovenaan */}
      <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.18),transparent)] animate-pulse-slow" />
    </div>
  );
}
