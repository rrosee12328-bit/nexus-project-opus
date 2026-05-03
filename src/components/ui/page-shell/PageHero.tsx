import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHero({
  kicker,
  title,
  description,
  action,
  children,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative pb-8 mb-8 animate-fade-up",
        "before:absolute before:bottom-0 before:left-0 before:right-0 before:h-px before:edge-line before:opacity-70",
        className,
      )}
    >
      {/* ambient halo */}
      <div className="pointer-events-none absolute -top-10 -left-10 h-48 w-[60%] rounded-full bg-primary/10 blur-3xl animate-glow-pulse" />
      <div className="relative flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {kicker && (
            <div className="flex items-center gap-2 kicker">
              {kicker}
            </div>
          )}
          <h1 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight text-gradient leading-[1.05]">
            {title}
          </h1>
          {description && (
            <p className="mt-4 max-w-xl text-sm text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}