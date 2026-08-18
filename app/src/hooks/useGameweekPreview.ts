import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { GameweekPreview } from "../api/types";

/** undefined = not fetched yet, null = fetched and nothing is published, otherwise the live preview. */
export function useGameweekPreview() {
  const [preview, setPreview] = useState<GameweekPreview | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api.gameweekPreview.latest().then((r) => {
      if (!cancelled) setPreview(r.preview);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return preview;
}
