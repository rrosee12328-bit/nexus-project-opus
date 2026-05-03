import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EditorialGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8", className)}>
      {children}
    </div>
  );
}

export function GridCol({
  span = 6,
  children,
  className,
}: {
  span?: 4 | 5 | 6 | 7 | 8 | 12;
  children: ReactNode;
  className?: string;
}) {
  const map: Record<number, string> = {
    4: "lg:col-span-4",
    5: "lg:col-span-5",
    6: "lg:col-span-6",
    7: "lg:col-span-7",
    8: "lg:col-span-8",
    12: "lg:col-span-12",
  };
  return <div className={cn(map[span], className)}>{children}</div>;
}