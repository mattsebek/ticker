import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { GameweekPreview, PastColumn } from "../api/types";

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

/** undefined = not fetched yet, null = fetched and either no article has this slug or it isn't published, otherwise that specific article — backs a past-column tap-through, unlike useGameweekPreview() above which always tracks whatever's currently latest. */
export function useGameweekPreviewBySlug(slug: string | undefined) {
  const [preview, setPreview] = useState<GameweekPreview | null | undefined>(undefined);

  useEffect(() => {
    if (!slug) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreview(undefined);
    api.gameweekPreview.bySlug(slug).then((r) => {
      if (!cancelled) setPreview(r.preview);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return preview;
}

/** Recent published articles for the current one's "Past Columns" footer — undefined until fetched, empty once there's nothing else published yet. */
export function usePastColumns(excludeSlug: string | undefined, limit = 5) {
  const [columns, setColumns] = useState<PastColumn[] | undefined>(undefined);

  useEffect(() => {
    if (!excludeSlug) return;
    let cancelled = false;
    api.gameweekPreview.past(excludeSlug, limit).then((r) => {
      if (!cancelled) setColumns(r.columns);
    });
    return () => {
      cancelled = true;
    };
  }, [excludeSlug, limit]);

  return columns;
}
