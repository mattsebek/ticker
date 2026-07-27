import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { BriefCard, MorningBrief } from "../api/types";

export function useBriefing() {
  const [morningBrief, setMorningBrief] = useState<MorningBrief | null>(null);
  const [cards, setCards] = useState<BriefCard[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.briefing.get().then((r) => {
      if (cancelled) return;
      setMorningBrief(r.morningBrief);
      setCards(r.cards);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { morningBrief, cards };
}
