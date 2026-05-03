import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Counter } from "./Counter";

export type Stat = {
  key: string;
  label: string;
  value: number;
  format?: (n: number) => string;
  hint?: ReactNode;
};

export function StatStrip({
  stats,
  activeKey,
  onSelect,
  className,
}: {
  stats: Stat[];
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  className?: string;
}) {
  const interactive = !!onSelect;
  const colsMobile = stats.length > 2 ? 2 : stats.length;
  const colsDesktop = stats.length;
  return (
    <div
      data-stat-strip
      className={cn(
        "relative grid border border-border/60 glass rounded-lg overflow-hidden shadow-elev",
        className,
      )}
      style={{
        ["--cols-mobile" as any]: colsMobile,
        ["--cols-desktop" as any]: colsDesktop,
        gridTemplateColumns: `repeat(${colsMobile}, minmax(0, 1fr))`,
      }}
    >
      <style>{`
        @media (min-width: 640px) {
          [data-stat-strip] { grid-template-columns: repeat(var(--cols-desktop), minmax(0, 1fr)) !important; }
        }
      `}</style>
      {/* moving scanline accent */}
      <span className="pointer-events-none absolute top-0 left-0 right-0 h-px overflow-hidden">
        <span className="block h-px w-1/3 edge-line animate-scan" />
      </span>
      {stats.map((s, i) => {
        const isActive = activeKey === s.key;
        const Tag: any = interactive ? "button" : "div";
        return (
          <Tag
            key={s.key}
            onClick={interactive ? () => onSelect?.(s.key) : undefined}
            className={cn(
              "group relative text-left px-3 sm:px-5 py-3 sm:py-4 transition-all min-w-0",
              i > 0 && i % colsMobile !== 0 && "border-l border-border/60",
              i >= colsMobile && "border-t border-border/60",
              i > 0 && "sm:border-l sm:border-t-0 border-border/60",
              isActive ? "bg-primary/5" : interactive && "hover:bg-primary/[0.04]",
            )}
          >
            {isActive && (
              <>
                <span className="absolute top-0 left-0 right-0 h-px bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
                <span className="absolute -bottom-px left-1/2 -translate-x-1/2 h-px w-1/2 edge-line opacity-80" />
              </>
            )}
            <div className="kicker flex items-center gap-1.5 truncate">
              <span className={cn(
                "h-1 w-1 rounded-full",
                isActive ? "bg-primary shadow-[0_0_6px_hsl(var(--primary))]" : "bg-muted-foreground/40",
              )} />
              <span className="truncate">{s.label}</span>
            </div>
            <div className="mt-1.5 sm:mt-2 text-lg sm:text-3xl font-semibold tabular-nums tracking-tight truncate">
              <Counter value={s.value} format={s.format} />
            </div>
            {s.hint && (
              <div className="mt-1 text-[10px] font-mono text-muted-foreground">{s.hint}</div>
            )}
          </Tag>
        );
      })}
    </div>
  );
}