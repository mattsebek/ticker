import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { GameweekPreviewIconConfig } from "../api/types";

const DEFAULT_CONFIG: GameweekPreviewIconConfig = { icon: "football", badge: "trending", background: "diagonal", color: "ink" };

/** Admin-editable at /admin/gameweek-preview — see GameweekPreviewArt.tsx for the icon geometry this selects between. Defaults match the server's own default row, so a slow/failed fetch never shows a broken thumbnail. */
export function useGameweekPreviewIconConfig(): GameweekPreviewIconConfig {
  const [config, setConfig] = useState<GameweekPreviewIconConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    let cancelled = false;
    api.gameweekPreview.iconConfig().then((r) => {
      if (!cancelled) setConfig(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
