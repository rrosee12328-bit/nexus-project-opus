import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KpiPulse {
  label: string;
  value: number;
  /** Optional value suffix, e.g. "h", "%". */
  suffix?: string;
  /** Optional value prefix, e.g. "$". */
  prefix?: string;
  icon: LucideIcon;
  /** 7 daily numbers, oldest -> newest. Used for sparkline & trend. */
  spark?: number[];
  /** Absolute delta vs the previous comparable window. */
  delta?: number;
  /** Tone hint — drives accent color */
  tone?: "primary" | "success" | "warn" | "danger" | "info" | "violet" | "pink";
  link?: string;
  /** Treat down trends as positive (e.g. overdue tasks decreasing is good). */
  invertTrend?: boolean;
  /** Show a pulsing live dot. */
  live?: boolean;
  loading?: boolean;
}

const TONE_MAP: Record<NonNullable<KpiPulse["tone"]>, { text: string; bg: string; ring: string; stroke: string }> = {
  primary: { text: "text-primary",     bg: "bg-primary/10",     ring: "ring-primary/20",     stroke: "hsl(var(--primary))" },
  success: { text: "text-emerald-500", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20", stroke: "hsl(142 71% 45%)" },
  warn:    { text: "text-amber-500",   bg: "bg-amber-500/10",   ring: "ring-amber-500/20",   stroke: "hsl(38 92% 50%)" },
  danger:  { text: "text-rose-500",    bg: "bg-rose-500/10",    ring: "ring-rose-500/20",    stroke: "hsl(347 77% 50%)" },
  info:    { text: "text-sky-500",     bg: "bg-sky-500/10",     ring: "ring-sky-500/20",     stroke: "hsl(199 89% 48%)" },
  violet:  { text: "text-violet-500",  bg: "bg-violet-500/10",  ring: "ring-violet-500/20",  stroke: "hsl(262 83% 58%)" },
  pink:    { text: "text-pink-500",    bg: "bg-pink-500/10",    ring: "ring-pink-500/20",    stroke: "hsl(330 81% 60%)" },
};

/** Smoothly count up to `target` over ~600ms. */
function useCountUp(target: number, duration = 600) {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      // easeOutCubic
      const e = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * e);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return val;
}

function Sparkline({ data, stroke }: { data: number[]; stroke: string }) {
  if (!data.length) return null;
  const w = 80, h = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((d, i) => `${(i * step).toFixed(1)},${(h - ((d - min) / span) * h).toFixed(1)}`).join(" ");
  const last = data[data.length - 1];
  const lastX = (data.length - 1) * step;
  const lastY = h - ((last - min) / span) * h;
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      <circle cx={lastX} cy={lastY} r={2} fill={stroke} />
    </svg>
  );
}

function formatNum(n: number, prefix?: string, suffix?: string) {
  const abs = Math.abs(n);
  let body: string;
  if (abs >= 1000) body = `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  else body = Number.isInteger(n) ? n.toString() : n.toFixed(1);
  return `${prefix ?? ""}${body}${suffix ?? ""}`;
}

export function KpiPulseCard(props: KpiPulse) {
  const tone = TONE_MAP[props.tone ?? "primary"];
  const animated = useCountUp(props.value);
  const Icon = props.icon;
  const positive = props.invertTrend ? (props.delta ?? 0) <= 0 : (props.delta ?? 0) >= 0;
  const TrendIcon = (props.delta ?? 0) === 0 ? Minus : positive ? TrendingUp : TrendingDown;

  const inner = (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card p-3 sm:p-4 transition-all",
        "min-h-[136px] sm:min-h-[148px]",
        "hover:-translate-y-0.5 hover:shadow-lg hover:ring-1",
        tone.ring,
      )}
    >
      {/* gradient sheen */}
      <div className={cn("pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-60 blur-2xl transition-opacity group-hover:opacity-100", tone.bg)} />

      <div className="relative flex items-start justify-between gap-2">
        <div className={cn("h-8 w-8 rounded-md flex items-center justify-center", tone.bg)}>
          <Icon className={cn("h-4 w-4", tone.text)} />
        </div>
        {props.live && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", tone.bg)} />
              <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", tone.text.replace("text-", "bg-"))} />
            </span>
            LIVE
          </span>
        )}
      </div>

      <div className="relative mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {props.loading ? (
            <>
              <div className="h-7 sm:h-8 w-16 rounded-md bg-muted/60 animate-pulse" />
              <div className="mt-2 h-3 w-24 rounded bg-muted/40 animate-pulse" />
            </>
          ) : (
            <>
              <p className="font-mono text-2xl sm:text-3xl font-semibold leading-none tracking-tight tabular-nums">
                {formatNum(animated, props.prefix, props.suffix)}
              </p>
              <p className="mt-1.5 text-[11px] sm:text-xs text-muted-foreground line-clamp-1">{props.label}</p>
            </>
          )}
        </div>
        {props.spark && props.spark.length > 1 && !props.loading && (
          <div className="shrink-0 opacity-80">
            <Sparkline data={props.spark} stroke={tone.stroke} />
          </div>
        )}
      </div>

      {props.loading ? (
        <div className="relative mt-2 h-3 w-20 rounded bg-muted/30 animate-pulse" />
      ) : typeof props.delta === "number" && (
        <div className="relative mt-2 flex items-center gap-1">
          <TrendIcon className={cn("h-3 w-3", positive ? "text-emerald-500" : "text-rose-500", (props.delta ?? 0) === 0 && "text-muted-foreground")} />
          <span className={cn("font-mono text-[11px] tabular-nums", positive ? "text-emerald-500" : "text-rose-500", (props.delta ?? 0) === 0 && "text-muted-foreground")}>
            {(props.delta ?? 0) > 0 ? "+" : ""}{props.delta}
          </span>
          <span className="text-[10px] text-muted-foreground">vs prev 7d</span>
        </div>
      )}
    </div>
  );

  return props.link ? <Link to={props.link} className="block h-full">{inner}</Link> : inner;
}
