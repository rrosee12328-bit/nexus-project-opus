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
        "grid border border-border/60 bg-background/60 backdrop-blur-md rounded-lg overflow-hidden",
        `grid-cols-2 sm:grid-cols-${Math.min(stats.length, 6)}`,
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
    >
      {stats.map((s, i) => {
        const isActive = activeKey === s.key;
        const Tag: any = interactive ? "button" : "div";
        return (
          <Tag
            key={s.key}
            onClick={interactive ? () => onSelect?.(s.key) : undefined}
            className={cn(
              "relative text-left px-5 py-4 transition-colors",
              i > 0 && "sm:border-l border-border/60",
              isActive ? "bg-primary/5" : interactive && "hover:bg-foreground/[0.02]",
            )}
          >
            {isActive && <span className="absolute top-0 left-0 right-0 h-px bg-primary" />}
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {s.label}
            </div>
            <div className="mt-1 text-2xl sm:text-3xl font-semibold tabular-nums">
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