import { OddsDataProvider } from "./types";
import { TheOddsApiProvider } from "./TheOddsApiProvider";
import { MockOddsProvider } from "./MockOddsProvider";

/**
 * The single place in the app that decides which odds provider is active.
 * Everything downstream (the projection engine) depends only on the
 * OddsDataProvider interface — set THE_ODDS_API_KEY to switch to live
 * multi-bookmaker data with no other code changes. Mirrors
 * football/providers/index.ts's createFootballDataProvider() exactly.
 */
export function createOddsProvider(): OddsDataProvider {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (apiKey) return new TheOddsApiProvider(apiKey);
  return new MockOddsProvider();
}

export * from "./types";
