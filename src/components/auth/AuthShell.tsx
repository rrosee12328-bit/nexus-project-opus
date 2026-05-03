import { ReactNode } from "react";

/**
 * Shared futuristic backdrop for public auth/marketing pages.
 * Mirrors the AdminLayout/OpsLayout aesthetic: ambient grid, hero glow,
 * scanline accent, and an edge-line divider on top.
 */
export function AuthShell({ children, kicker = "VEKTISS / SECURE ACCESS" }: { children: ReactNode; kicker?: string }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient grid */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.35]" aria-hidden />
      {/* Hero glow halo */}
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" aria-hidden />
      {/* Scanline overlay */}
      <div className="pointer-events-none absolute inset-0 scanline opacity-60" aria-hidden />
      {/* Top edge-line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px edge-line" aria-hidden />

      {/* Floating status kicker */}
      <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 z-10 flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        <span className="kicker text-[10px] text-muted-foreground/80">{kicker}</span>
      </div>

      {/* Bottom edge-line */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px edge-line" aria-hidden />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 animate-fade-in">
        {children}
      </div>
    </div>
  );
}