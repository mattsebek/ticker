import { API_BASE_URL } from "./config";
import { getToken } from "./session";
import type {
  ChartPoint,
  ClubDetail,
  ClubSummary,
  GameweekResponse,
  GameweekDetailResponse,
  LeagueListRow,
  ManagerSummary,
  PortfolioResponse,
  PublicLeagueRow,
  StandingsRow,
  BriefCard,
  MorningBrief,
  BuyPreviewResponse,
  SellPreviewResponse,
  ShortPreviewResponse,
  CoverPreviewResponse,
  User,
  GameweekPreview,
  PastColumn,
  MarketMatchup,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options.headers as any) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError(res.status, (body && body.error) || `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  auth: {
    register: (name: string, email: string, birthday: string) =>
      request<{ ok: true; email: string }>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, birthday }) }),
    login: (email: string) => request<{ ok: true; email: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email }) }),
    verifyCode: (email: string, code: string) =>
      request<{ token: string; user: User }>("/auth/verify", { method: "POST", body: JSON.stringify({ email, code }) }),
    me: () => request<{ user: User }>("/auth/me"),
  },
  clubs: {
    all: (opts?: { withFixtures?: boolean }) => request<{ clubs: ClubSummary[] }>(opts?.withFixtures ? "/clubs?fixtures=1" : "/clubs"),
    search: (q: string) => request<{ clubs: ClubSummary[] }>(`/clubs/search?q=${encodeURIComponent(q)}`),
    movers: () => request<{ clubs: ClubSummary[] }>("/clubs/movers"),
    topEarners: (range: "gw" | "ytd") => request<{ clubs: ClubSummary[] }>(`/clubs/top-earners?range=${range}`),
    news: () =>
      request<{ news: { id: string; code: string | null; color: string | null; headline: string; source: string; timeStr: string; link: string; thumbnail: string | null }[] }>(
        "/clubs/news"
      ),
    detail: (id: string) => request<{ club: ClubDetail }>(`/clubs/${id}`),
    matchups: () => request<{ round: number; matchups: MarketMatchup[] }>("/clubs/matchups"),
  },
  portfolio: {
    get: () => request<PortfolioResponse>("/portfolio"),
    chart: () => request<{ points: ChartPoint[] }>("/portfolio/chart"),
    completeOnboarding: () => request<{ ok: true }>("/portfolio/complete-onboarding", { method: "POST" }),
    setBriefDismissed: (dismissed: boolean) => request("/portfolio/brief-dismissed", { method: "PATCH", body: JSON.stringify({ dismissed }) }),
  },
  gameweek: {
    get: (offset: number) => request<GameweekResponse>(`/gameweek?offset=${offset}`),
    detail: (offset: number = 0) => request<GameweekDetailResponse>(`/gameweek/detail?offset=${offset}`),
    setStartingFour: (clubIds: string[]) =>
      request<{ ok: true; clubIds: string[] }>("/gameweek/starting-four", { method: "PUT", body: JSON.stringify({ clubIds }) }),
  },
  leagues: {
    mine: () => request<{ leagues: LeagueListRow[] }>("/leagues/mine"),
    public: () => request<{ leagues: PublicLeagueRow[] }>("/leagues/public"),
    lookupCode: (code: string) => request<{ league: PublicLeagueRow | null }>(`/leagues/lookup-code?code=${encodeURIComponent(code)}`),
    detail: (id: string, sort: "portfolio" | "points") =>
      request<{ league: { id: string; name: string; commissioner: string; isPrivate: boolean; code: string; createdStr: string }; standings: StandingsRow[] }>(`/leagues/${id}?sort=${sort}`),
    member: (leagueId: string, memberId: string, round?: number) =>
      request<ManagerSummary>(`/leagues/${leagueId}/members/${memberId}${round != null ? `?round=${round}` : ""}`),
    join: (params: { leagueId?: string; code?: string }) => request<{ ok: true; league: { id: string; name: string } }>("/leagues/join", { method: "POST", body: JSON.stringify(params) }),
    create: (name: string, isPrivate: boolean, code?: string) =>
      request<{ ok: true; league: { id: string; name: string; isPrivate: boolean; code: string } }>("/leagues/create", { method: "POST", body: JSON.stringify({ name, isPrivate, code }) }),
  },
  briefing: {
    get: () => request<{ morningBrief: MorningBrief | null; cards: BriefCard[] }>("/briefing"),
  },
  trades: {
    buyPreview: (clubId: string) => request<BuyPreviewResponse>(`/trades/buy-preview?clubId=${clubId}`),
    sellPreview: (clubId: string) => request<SellPreviewResponse>(`/trades/sell-preview?clubId=${clubId}`),
    shortPreview: (clubId: string) => request<ShortPreviewResponse>(`/trades/short-preview?clubId=${clubId}`),
    coverPreview: (clubId: string) => request<CoverPreviewResponse>(`/trades/cover-preview?clubId=${clubId}`),
    buy: (clubId: string) => request<{ ok: true; successText: string; cash: number }>("/trades/buy", { method: "POST", body: JSON.stringify({ clubId }) }),
    sell: (clubId: string) => request<{ ok: true; successText: string; cash: number }>("/trades/sell", { method: "POST", body: JSON.stringify({ clubId }) }),
    short: (clubId: string) => request<{ ok: true; successText: string; cash: number }>("/trades/short", { method: "POST", body: JSON.stringify({ clubId }) }),
    cover: (clubId: string) => request<{ ok: true; successText: string; cash: number }>("/trades/cover", { method: "POST", body: JSON.stringify({ clubId }) }),
  },
  notifications: {
    status: () => request<{ enabled: boolean }>("/notifications/status"),
    registerToken: (token: string, platform: "ios" | "android") =>
      request<{ ok: true }>("/notifications/register-token", { method: "POST", body: JSON.stringify({ token, platform }) }),
    setEnabled: (enabled: boolean) => request<{ ok: true }>("/notifications/enabled", { method: "PATCH", body: JSON.stringify({ enabled }) }),
  },
  gameweekPreview: {
    latest: () => request<{ preview: GameweekPreview | null }>("/gameweek-preview/latest"),
    bySlug: (slug: string) => request<{ preview: GameweekPreview | null }>(`/gameweek-preview/by-slug/${encodeURIComponent(slug)}`),
    past: (excludeSlug: string, limit = 5) =>
      request<{ columns: PastColumn[] }>(`/gameweek-preview/past?excludeSlug=${encodeURIComponent(excludeSlug)}&limit=${limit}`),
  },
};
