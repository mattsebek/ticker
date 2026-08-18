import { footballRepo } from "../../football/repo";
import { marketRepo } from "../../market/repo";
import { intelligenceConfig } from "../intelligenceConfig";
import { CandidateSignal } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function dayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

/** BUY_VOLUME_SPIKE / SELL_VOLUME_SPIKE / NET_BUYING_SPIKE / NET_SELLING_SPIKE — spec sections 9.1/9.2. */
export function detectTradingActivity(): CandidateSignal[] {
  const out: CandidateSignal[] = [];
  const now = Date.now();

  for (const club of footballRepo.listClubs()) {
    const ownershipPct = marketRepo.getOwnershipPct(club.id) / 100; // getOwnershipPct returns 0..100, CandidateSignal wants a 0..1 fraction

    // --- BUY_VOLUME_SPIKE / SELL_VOLUME_SPIKE: raw count vs trailing 7-day daily average ---
    const current = marketRepo.getTransactionCounts(club.id, now - DAY_MS, now);
    const trailing = marketRepo.getTransactionCounts(club.id, now - WEEK_MS - DAY_MS, now - DAY_MS);
    const trailingDailyAvgBuys = Math.max(trailing.buys / 7, 0.5); // floored to avoid a divide-by-zero explosion on a club with zero prior history
    const trailingDailyAvgSells = Math.max(trailing.sells / 7, 0.5);

    if (current.buys >= intelligenceConfig.MIN_TRANSACTIONS) {
      const ratio = current.buys / trailingDailyAvgBuys;
      if (ratio >= intelligenceConfig.VOLUME_SPIKE_RATIO) {
        out.push({
          signalType: "BUY_VOLUME_SPIKE",
          clubId: club.id,
          round: null,
          windowLabel: dayBucket(),
          facts: { count: current.buys, avgCount: Math.round(trailingDailyAvgBuys * 10) / 10, ratio },
          rarityRatio: ratio / intelligenceConfig.VOLUME_SPIKE_RATIO,
          magnitude: Math.min(1, ratio / intelligenceConfig.MAGNITUDE_SCALE.volumeRatio),
          ownershipPct,
          isDivergence: false,
        });
      }
    }
    if (current.sells >= intelligenceConfig.MIN_TRANSACTIONS) {
      const ratio = current.sells / trailingDailyAvgSells;
      if (ratio >= intelligenceConfig.VOLUME_SPIKE_RATIO) {
        out.push({
          signalType: "SELL_VOLUME_SPIKE",
          clubId: club.id,
          round: null,
          windowLabel: dayBucket(),
          facts: { count: current.sells, avgCount: Math.round(trailingDailyAvgSells * 10) / 10, ratio },
          rarityRatio: ratio / intelligenceConfig.VOLUME_SPIKE_RATIO,
          magnitude: Math.min(1, ratio / intelligenceConfig.MAGNITUDE_SCALE.volumeRatio),
          ownershipPct,
          isDivergence: false,
        });
      }
    }

    // --- NET_BUYING_SPIKE / NET_SELLING_SPIKE: net trader imbalance over the last 24h ---
    const traders = marketRepo.getNetTraderCounts(club.id, now - DAY_MS, now).filter((t) => t.net !== 0);
    const netBuyers = traders.filter((t) => t.net > 0).length;
    const netSellers = traders.filter((t) => t.net < 0).length;
    const participants = netBuyers + netSellers;
    if (participants >= intelligenceConfig.MIN_TRADERS) {
      if (netBuyers > 0 && netSellers === 0) {
        out.push({
          signalType: "NET_BUYING_SPIKE",
          clubId: club.id,
          round: null,
          windowLabel: dayBucket(),
          facts: { netBuyers, netSellers, participants },
          rarityRatio: intelligenceConfig.NET_IMBALANCE_RATIO, // fully one-sided — treat as at/above the imbalance bar
          magnitude: Math.min(1, netBuyers / intelligenceConfig.MAGNITUDE_SCALE.volumeRatio / 5),
          ownershipPct,
          isDivergence: false,
        });
      } else if (netSellers > 0 && netBuyers === 0) {
        out.push({
          signalType: "NET_SELLING_SPIKE",
          clubId: club.id,
          round: null,
          windowLabel: dayBucket(),
          facts: { netBuyers, netSellers, participants },
          rarityRatio: intelligenceConfig.NET_IMBALANCE_RATIO,
          magnitude: Math.min(1, netSellers / intelligenceConfig.MAGNITUDE_SCALE.volumeRatio / 5),
          ownershipPct,
          isDivergence: false,
        });
      } else if (netBuyers > netSellers && netBuyers / netSellers >= intelligenceConfig.NET_IMBALANCE_RATIO) {
        out.push({
          signalType: "NET_BUYING_SPIKE",
          clubId: club.id,
          round: null,
          windowLabel: dayBucket(),
          facts: { netBuyers, netSellers, participants },
          rarityRatio: netBuyers / netSellers / intelligenceConfig.NET_IMBALANCE_RATIO,
          magnitude: Math.min(1, netBuyers / intelligenceConfig.MAGNITUDE_SCALE.volumeRatio / 5),
          ownershipPct,
          isDivergence: false,
        });
      } else if (netSellers > netBuyers && netSellers / netBuyers >= intelligenceConfig.NET_IMBALANCE_RATIO) {
        out.push({
          signalType: "NET_SELLING_SPIKE",
          clubId: club.id,
          round: null,
          windowLabel: dayBucket(),
          facts: { netBuyers, netSellers, participants },
          rarityRatio: netSellers / netBuyers / intelligenceConfig.NET_IMBALANCE_RATIO,
          magnitude: Math.min(1, netSellers / intelligenceConfig.MAGNITUDE_SCALE.volumeRatio / 5),
          ownershipPct,
          isDivergence: false,
        });
      }
    }
  }

  return out;
}
