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
    <section className={cn("border-b border-border/60 pb-8 mb-8", className)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {kicker && (
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              {kicker}
            </div>
          )}
          <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-xl text-sm text-muted-foreground leading-relaxed">
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