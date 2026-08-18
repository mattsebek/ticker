/** Normalized candidate produced by a detector, before scoring/copy/persistence — spec section 8's "Candidate Intelligence Event." */
export interface CandidateSignal {
  signalType: string;
  clubId: string | null;
  round: number | null;
  /** Building block for the dedup key (spec section 52) — e.g. a day bucket, a milestone value, or a fixture id, depending on signal type. */
  windowLabel: string;
  /** Raw facts preserved verbatim into source_data_json (spec section 24/54) — whatever a detector actually measured. */
  facts: Record<string, number | string | boolean | null>;
  /** How far past its own threshold the signal is (e.g. actual/threshold), used for the "statistical rarity" score component. >= 1 by construction (detectors only emit candidates that already cleared their threshold). */
  rarityRatio: number;
  /** 0..1, already normalized against intelligenceConfig.MAGNITUDE_SCALE — the "market magnitude" score component. */
  magnitude: number;
  /** 0..1 — the club's ownership_pct, i.e. the "users affected" score component. 0 for league-wide (non-club) signals. */
  ownershipPct: number;
  /** Whether this signal type counts toward the "performance divergence" score component (spec section 18) — true only for detectors/performanceDivergence.ts's signal types. */
  isDivergence: boolean;
}
