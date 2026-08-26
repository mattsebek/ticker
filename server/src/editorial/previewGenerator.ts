import Anthropic from "@anthropic-ai/sdk";
import { editorialConfig } from "./editorialConfig";
import { GameweekPreviewFacts } from "./previewData";

export interface GeneratedPreview {
  headline: string;
  body: string;
}

const SYSTEM_PROMPT = `You are the writer behind Ticker's weekly "Gameweek Preview" — a long-form column for Ticker, an app where users trade real football (soccer) clubs like stocks: club prices move on real match performance and real buy/sell demand, users hold portfolios of clubs, and "Gameweek" is their scoring period.

Voice: r/WallStreetBets. Degenerate-gambler energy applied to a football stock market — think "tendies," "diamond hands," "this is the way," "printing," "bagholder," ALL CAPS for emphasis, self-aware humor about risk, liberal emoji use (🚀📈🔥💎🙌🐻🧻). Funny, punchy, a little unhinged, but never mean-spirited toward any specific real person.

Hard rules:
- Every club name, price, percentage, and stat you use MUST come from the facts provided in the user message. Never invent a number, a stat, or an event that isn't given to you.
- Any dollar amount you reference (a club's price, a "purchasePrice"/"currentPrice", a manager's "portfolioValue") MUST be written with a leading "$" (e.g. "$45.20"), matching how the app displays money everywhere else. Never put a "$" in front of points or percentages.
- Plain text with ONE markdown exception: wrap a short phrase in **double asterisks** when it genuinely deserves bold emphasis (a club name at a key moment, a standout stat, a punchline) — use it sparingly, a handful of times total, never whole sentences. No other markdown syntax at all (no #, no bullet dashes, no italics, no links).
- Never use an em dash (—). Use a comma, a period, or a hyphen instead.
- Structure: (1) an opening hook covering the market's overall mood and the hottest clubs, (2) a section spotlighting the games given to you as the week's closest/most competitive, one at a time, (3) a closing section profiling the #1 overall manager, who they hold, how those clubs have performed, roasted/celebrated in the same voice.
- Target length: about ${editorialConfig.TARGET_WORD_COUNT} words total.
- Output format, exactly: a single line starting with "HEADLINE: " followed by a punchy headline under 80 characters, then a line containing only "---", then the full body text.`;

function buildUserPrompt(facts: GameweekPreviewFacts): string {
  return `Here is this week's real data. Write the Gameweek Preview from it.\n\n${JSON.stringify(facts, null, 2)}`;
}

/** Belt-and-suspenders alongside the system prompt's own "never use an em dash" rule — models don't always follow style instructions consistently, and a stray — is one of the more recognizable "obviously AI-written" tells. */
function stripEmDashes(s: string): string {
  return s.replace(/—/g, "-");
}

function parseResponse(text: string): GeneratedPreview {
  const separatorIdx = text.indexOf("---");
  if (separatorIdx === -1) throw new Error("Model response missing '---' separator between headline and body.");
  const headlineLine = text.slice(0, separatorIdx).trim();
  const body = text.slice(separatorIdx + 3).trim();
  const headline = headlineLine.replace(/^HEADLINE:\s*/i, "").trim();
  if (!headline || !body) throw new Error("Model response had an empty headline or body after parsing.");
  return { headline: stripEmDashes(headline), body: stripEmDashes(body) };
}

/** Real, non-deterministic LLM generation — deliberately isolated in this one module (mirrors intelligence/copyTemplates.ts's role) so the rest of the domain never has to know it's talking to an external API. Throws on any failure; callers (previewService) decide how to surface that, never silently fall back to placeholder text. */
export async function generatePreviewCopy(facts: GameweekPreviewFacts): Promise<GeneratedPreview> {
  if (!editorialConfig.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured — set it in the server environment to enable Gameweek Preview generation.");
  }
  const client = new Anthropic({ apiKey: editorialConfig.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: editorialConfig.MODEL,
    max_tokens: 4096,
    temperature: 1,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(facts) }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Model response contained no text block.");
  return parseResponse(textBlock.text);
}
