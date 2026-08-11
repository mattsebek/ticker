import { API_BASE_URL } from "./config";
import { getToken } from "./session";
import type {
  ChartPoint,
  ClubDetail,
  ClubSummary,
  GameweekResponse,
  GameweekDetailResponse,
  LeagueListRow,
  PortfolioResponse,
  PublicLeagueRow,
  StandingsRow,
  BriefCard,
  MorningBrief,
  TradeOptionsResponse,
  TradePreviewResponse,
  User,
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
      request<{ token: string; user: User }>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, birthday }) }),
    login: (email: string) => request<{ token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ email }) }),
    me: () => request<{ user: User }>("/auth/me"),
  },
  clubs: {
    all: () => request<{ clubs: ClubSummary[] }>("/clubs"),
    search: (q: string) => request<{ clubs: ClubSummary[] }>(`/clubs/search?q=${encodeURIComponent(q)}`),
    movers: () => request<{ clubs: ClubSummary[] }>("/clubs/movers"),
    topEarners: (range: "gw" | "ytd") => request<{ clubs: ClubSummary[] }>(`/clubs/top-earners?range=${range}`),
    news: () => request<{ news: { id: string; code: string | null; color: string | null; headline: string; timeStr: string; link: string }[] }>("/clubs/news"),
    detail: (id: string) => request<{ club: ClubDetail }>(`/clubs/${id}`),
  },
  portfolio: {
    get: () => request<PortfolioResponse>("/portfolio"),
    chart: () => request<{ points: ChartPoint[] }>("/portfolio/chart"),
    select: (clubIds: string[]) => request<{ ok: true; cash: number }>("/portfolio/select", { method: "POST", body: JSON.stringify({ clubIds }) }),
    setBriefDismissed: (dismissed: boolean) => request("/portfolio/brief-dismissed", { method: "PATCH", body: JSON.stringify({ dismissed }) }),
  },
  gameweek: {
    get: (offset: number) => request<GameweekResponse>(`/gameweek?offset=${offset}`),
    detail: (offset: number = 0) => request<GameweekDetailResponse>(`/gameweek/detail?offset=${offset}`),
  },
  leagues: {
    mine: () => request<{ leagues: LeagueListRow[] }>("/leagues/mine"),
    public: () => request<{ leagues: PublicLeagueRow[] }>("/leagues/public"),
    lookupCode: (code: string) => request<{ league: PublicLeagueRow | null }>(`/leagues/lookup-code?code=${encodeURIComponent(code)}`),
    detail: (id: string, sort: "portfolio" | "points") =>
      request<{ league: { id: string; name: string; commissioner: string; isPrivate: boolean; code: string }; standings: StandingsRow[] }>(`/leagues/${id}?sort=${sort}`),
    join: (params: { leagueId?: string; code?: string }) => request<{ ok: true; league: { id: string; name: string } }>("/leagues/join", { method: "POST", body: JSON.stringify(params) }),
    create: (name: string, isPrivate: boolean) =>
      request<{ ok: true; league: { id: string; name: string; isPrivate: boolean; code: string } }>("/leagues/create", { method: "POST", body: JSON.stringify({ name, isPrivate }) }),
  },
  briefing: {
    get: () => request<{ morningBrief: MorningBrief | null; cards: BriefCard[] }>("/briefing"),
  },
  trades: {
    options: (mode: "trade" | "buy", clubId: string) => request<TradeOptionsResponse>(`/trades/options?mode=${mode}&clubId=${clubId}`),
    preview: (buyClubId: string, sellClubId: string | null) =>
      request<TradePreviewResponse>(`/trades/preview?buyClubId=${buyClubId}${sellClubId ? `&sellClubId=${sellClubId}` : ""}`),
    execute: (buyClubId: string, sellClubId: string | null) =>
      request<{ ok: true; successText: string; cash: number }>("/trades/execute", { method: "POST", body: JSON.stringify({ buyClubId, sellClubId }) }),
  },
};
