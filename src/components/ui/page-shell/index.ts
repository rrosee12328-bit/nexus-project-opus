export { PageHero } from "./PageHero";
export { StatStrip, type Stat } from "./StatStrip";
export { Counter } from "./Counter";
export { MetaRow, PulseDot } from "./MetaRow";
export { SectionLabel } from "./SectionLabel";
export { EditorialGrid, GridCol } from "./EditorialGrid";

export const PageShell = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`container mx-auto px-4 sm:px-6 max-w-7xl py-8 space-y-10 ${className}`}>
    {children}
  </div>
);