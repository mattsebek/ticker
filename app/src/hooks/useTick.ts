import { useEffect, useState } from "react";

/** Simple incrementing counter, used to drive continuous "market is alive" jitter animations. */
export function useTick(intervalMs = 900): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}
