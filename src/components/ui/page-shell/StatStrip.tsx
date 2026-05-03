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
  return (
    <div
      className={cn(
        "relative grid border border-border/60 glass rounded-lg overflow-hidden shadow-elev",
        `grid-cols-2 sm:grid-cols-${Math.min(stats.length, 6)}`,
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
    >
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
              "group relative text-left px-5 py-4 transition-all",
              i > 0 && "sm:border-l border-border/60",
              isActive ? "bg-primary/5" : interactive && "hover:bg-primary/[0.04]",
            )}
          >
            {isActive && (
              <>
                <span className="absolute top-0 left-0 right-0 h-px bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
                <span className="absolute -bottom-px left-1/2 -translate-x-1/2 h-px w-1/2 edge-line opacity-80" />
              </>
            )}
            <div className="kicker flex items-center gap-1.5">
              <span className={cn(
                "h-1 w-1 rounded-full",
                isActive ? "bg-primary shadow-[0_0_6px_hsl(var(--primary))]" : "bg-muted-foreground/40",
              )} />
              {s.label}
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight">
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