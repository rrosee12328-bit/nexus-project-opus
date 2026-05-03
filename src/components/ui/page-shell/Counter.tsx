import { useEffect, useRef, useState } from "react";

export function Counter({
  value,
  format,
  duration = 700,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [n, setN] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = fromRef.current;
    const to = value;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (to - from) * eased;
      setN(next);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format ? format(n) : Math.round(n).toLocaleString()}</>;
}