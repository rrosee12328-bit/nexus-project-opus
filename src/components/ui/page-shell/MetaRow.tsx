import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MetaRow({
  items,
  className,
}: {
  items: ReactNode[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-mono text-muted-foreground",
        className,
      )}
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {item}
        </span>
      ))}
    </div>
  );
}

export function PulseDot({ className }: { className?: string }) {
  return (
    <span
      className={cn("h-1.5 w-1.5 rounded-full bg-primary animate-pulse", className)}
    />
  );
}