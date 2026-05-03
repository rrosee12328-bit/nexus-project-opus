import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Activity, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient grid */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.4]" aria-hidden />
      {/* Hero glow halo */}
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" aria-hidden />
      {/* Animated drifting glow blob */}
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl animate-glow-pulse"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-1/3 -left-20 h-[360px] w-[360px] rounded-full bg-primary/10 blur-3xl animate-drift"
        aria-hidden
      />
      {/* Scanline overlay */}
      <div className="pointer-events-none absolute inset-0 scanline opacity-60" aria-hidden />
      {/* Top + bottom edge lines */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px edge-line" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px edge-line" aria-hidden />

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="kicker text-foreground/80">Vektiss / Command Layer</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="shadow-glow">
            <Link to="/signup">
              Request access <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-16 pb-28 sm:pt-24 animate-fade-up">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="kicker">A new operating layer for your studio</span>
          </div>
          <h1 className="text-balance text-5xl sm:text-7xl font-semibold tracking-tight text-gradient leading-[1.02]">
            The cockpit for modern content operations.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Vektiss unifies clients, projects, approvals, and AI decisioning into a single
            high-density command surface — engineered for studios that move at signal speed.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="shadow-glow">
              <Link to="/signup">
                Launch your portal <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="bg-background/40 backdrop-blur-md">
              <Link to="/login">Operator sign in</Link>
            </Button>
          </div>
        </div>

        {/* Hero stat strip */}
        <div className="relative mx-auto mt-20 max-w-5xl">
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-primary/20 via-transparent to-primary/20 opacity-60 blur-xl" aria-hidden />
          <div className="relative grid grid-cols-2 sm:grid-cols-4 overflow-hidden rounded-2xl border border-border/60 bg-background/60 backdrop-blur-xl shadow-elev">
            {/* moving scanline accent */}
            <div className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-primary/30 to-transparent animate-scan" aria-hidden />
            {[
              { k: "UPTIME", v: "99.99%" },
              { k: "AVG SLA", v: "< 24H" },
              { k: "AI DECISIONS", v: "1.2K/MO" },
              { k: "STUDIO HOURS", v: "5,400+" },
            ].map((s, i) => (
              <div
                key={s.k}
                className={`relative p-5 sm:p-6 ${i !== 0 ? "border-l border-border/40" : ""}`}
              >
                <div className="kicker">{s.k}</div>
                <div className="mt-2 font-mono text-2xl sm:text-3xl tabular-nums">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Pillars */}
        <div className="relative mx-auto mt-16 grid max-w-5xl gap-4 sm:grid-cols-3">
          {[
            {
              icon: Activity,
              title: "Real-time signal",
              body: "Live pulse across clients, projects, and revenue — surfaced before it matters.",
            },
            {
              icon: Sparkles,
              title: "AI command center",
              body: "Autonomous watchers flag margin, comms, and risk. You approve. It executes.",
            },
            {
              icon: ShieldCheck,
              title: "Cockpit-grade trust",
              body: "Tenant-isolated, audit-logged, and built on a hardened backend by default.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group relative overflow-hidden rounded-xl border border-border/60 bg-background/50 p-5 backdrop-blur-xl transition-all hover:border-primary/40 hover:shadow-glow"
            >
              <div className="absolute inset-x-0 top-0 h-px edge-line opacity-60" aria-hidden />
              <Icon className="h-5 w-5 text-primary" />
              <div className="mt-4 text-sm font-medium">{title}</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer kicker */}
      <footer className="relative z-10 mx-auto max-w-7xl px-6 pb-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="kicker">© Vektiss / All systems nominal</span>
          <Link to="/login" className="kicker hover:text-foreground transition-colors">
            Enter the cockpit →
          </Link>
        </div>
      </footer>
    </div>
  );
}