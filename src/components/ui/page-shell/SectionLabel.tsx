import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionLabel({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 mb-3",
        className,
      )}
    >
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}