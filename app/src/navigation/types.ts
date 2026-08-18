export type AppStackParamList = {
  Main: undefined;
  Trade: { mode: "buy" | "sell"; clubId: string };
  LeagueDetail: { leagueId: string; name: string };
  JoinLeague: { code?: string } | undefined;
  Rules: undefined;
  AiBriefing: undefined;
  GameweekDetail: { initialOffset?: number } | undefined;
  GameweekPreview: undefined;
};

export type MainTabParamList = {
  Portfolio: undefined;
  Market: undefined;
  Compete: undefined;
  Profile: undefined;
};
