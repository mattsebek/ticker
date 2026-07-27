import { FootballDataProvider } from "./types";
import { ApiFootballProvider } from "./ApiFootballProvider";
import { MockFootballProvider } from "./MockFootballProvider";

/**
 * The single place in the app that decides *which* provider is active.
 * Everything downstream (normalization, football service, jobs) depends only
 * on the `FootballDataProvider` interface — set API_FOOTBALL_KEY to switch to
 * live data with no other code changes.
 */
export function createFootballDataProvider(): FootballDataProvider {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (apiKey) return new ApiFootballProvider(apiKey);
  return new MockFootballProvider();
}

export * from "./types";
