export { PageHero } from "./PageHero";
export { StatStrip, type Stat } from "./StatStrip";
export { Counter } from "./Counter";
export { MetaRow, PulseDot } from "./MetaRow";
export { SectionLabel } from "./SectionLabel";
export { EditorialGrid, GridCol } from "./EditorialGrid";

export const PageShell = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div data-portal-page className={`container mx-auto min-w-0 max-w-7xl px-3 py-5 sm:px-6 sm:py-8 space-y-6 sm:space-y-10 ${className}`}>
    {children}
  </div>
);
