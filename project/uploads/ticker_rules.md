# Ticker Rules

## How to Play

Ticker is a fantasy Premier League game where you choose clubs, not players.

Own as many or as few Premier League clubs as you can afford, earn points from your Starting Four's real-world performances, and trade clubs as their market values rise and fall throughout the season.

Your goal is simple:

> **Score the most fantasy points while building the smartest football portfolio.**

The signature rule:

> **Your lineup locks. Your portfolio never does.**

---

## 1. Build Your Portfolio

### Starting Capital

Every manager begins with:

```text
$100.00 Cash
$0.00 Holdings
$100.00 Portfolio Value
```

Buy as many or as few Premier League clubs as you can afford. There is no requirement to spend it all, and no maximum number of different clubs you may own.

#### Example: Concentrated

| Club | Price |
|---|---:|
| Arsenal | $38.00 |
| Liverpool | $34.00 |
| Chelsea | $20.00 |
| Cash | $8.00 |
| **Portfolio Value** | **$100.00** |

Three clubs owned. This manager can only start three clubs this Gameweek unless another club is purchased before the deadline.

#### Example: Balanced

| Club | Price |
|---|---:|
| Arsenal | $27.00 |
| Aston Villa | $22.00 |
| Brighton | $19.00 |
| Fulham | $17.00 |
| Cash | $15.00 |
| **Portfolio Value** | **$100.00** |

Four clubs owned. All four may start.

#### Example: Diversified

| Club | Price |
|---|---:|
| Brighton | $16.00 |
| Fulham | $15.00 |
| Brentford | $14.00 |
| Everton | $13.00 |
| Bournemouth | $12.00 |
| Leeds | $11.00 |
| Burnley | $10.00 |
| Cash | $9.00 |
| **Portfolio Value** | **$100.00** |

Seven clubs owned. Only four may start each Gameweek — the remaining three become Bench Holdings.

### Portfolio Rules

Ticker imposes financial constraints, not arbitrary ownership limits. You may purchase a club when:

```text
available_cash >= club_current_price
```

and you do not already own it. You may never own the same club twice, borrow money, use margin, or let your cash balance go negative. There is **no** `MAX_HOLDINGS` — own one club or twenty.

### Club Prices

Every Premier League club is assigned an opening market value reflecting expected performance, schedule strength, recent form, and market expectations.

After the season begins, club values may rise or fall based on real-world performance and Ticker market activity. A club's current value may therefore be higher or lower than the price you originally paid.

---

## 2. Pick Your Starting Four

Each Gameweek, you may select:

```text
0–4 clubs
```

from your current Holdings as your **Starting Four**. Only these clubs are eligible to earn fantasy points for that Gameweek. A manager may never select a club they don't currently own.

### Starting Fewer Than Four

Managers are permitted to start fewer than four clubs. Ticker will **not**:

- Normalize scoring
- Automatically purchase or assign a replacement club
- Give replacement points
- Prevent you from entering the Gameweek

#### Example

A manager owns only Arsenal, Liverpool, and Chelsea. They may start all three — they simply have three scoring opportunities instead of four. This is an intentional consequence of concentrated portfolio construction, not an error state.

If fewer than four clubs are selected, Ticker shows a non-blocking warning, e.g. *"You only have 3 clubs starting this Gameweek — one scoring spot is currently empty."* It never prevents submission.

### Set Your Starting Four

A dedicated screen inside the app — one of the primary weekly actions. For each Holding it shows the club crest, name, current price, upcoming opponent, home/away, projected Ticker points, recent form, and current market movement, with a simple tap to move a club between Starting Four and Bench.

---

## 3. Your Bench

Clubs you own but don't start are your **Bench**:

- They remain real investments
- Their prices continue changing
- Ticker computes informational Fantasy Points for them
- They do **not** contribute to Gameweek or season scoring

#### Example

| Starting Four | Points |
|---|---:|
| Arsenal | 10 |
| Aston Villa | 7 |
| Brighton | 5 |
| Fulham | 4 |
| **Gameweek Score** | **26** |

| Bench | Points |
|---|---:|
| Brentford | 8 |
| Everton | 3 |
| Bournemouth | 6 |
| **Bench Points** | **17** |

> Your Bench earned 17 points this week. These points don't count toward your Gameweek score.

Because Holdings can change during a Gameweek, historical Bench membership is based on what you owned **at the deadline**, not what you currently own — if you sell a Bench club mid-week, it still counts as that week's historical Bench.

---

## 4. Scoring

Ticker league standings are determined by **fantasy points**, not portfolio value.

Only clubs in your locked Starting Four earn points toward your score. Portfolio value affects your future spending power, but it does not directly add points to your league score.

### Match Scoring

| Match Event | Points |
|---|---:|
| Win | +5 |
| Draw | +2 |
| Loss | 0 |
| Each goal scored | +1 |
| Clean sheet | +2 |

#### Arsenal wins 3–0

| Scoring Event | Points |
|---|---:|
| Win | +5 |
| Three goals scored | +3 |
| Clean sheet | +2 |
| **Total** | **10** |

#### Chelsea draws 2–2

| Scoring Event | Points |
|---|---:|
| Draw | +2 |
| Two goals scored | +2 |
| **Total** | **4** |

#### Brighton loses 1–3

| Scoring Event | Points |
|---|---:|
| Loss | 0 |
| One goal scored | +1 |
| **Total** | **1** |

### Gameweek Score

Your Gameweek score is the combined total earned by the clubs locked into your **Starting Four** — a snapshot taken at the deadline, not necessarily what you currently hold.

Your points accumulate throughout the Premier League season. The manager with the most total fantasy points at the end of the season wins the league.

### Multiple Matches, Postponements

When a club plays more than once during a Gameweek, points from every eligible match are added together. When a club has no eligible match, it earns zero points for that Gameweek.

A postponed match does not score until it is officially played. If a match is abandoned, points remain pending until the Premier League confirms an official result or schedules a replay. Ticker may adjust scores when an official result or match statistic is corrected after the final whistle.

---

## 5. Buy & Sell

Buy and sell clubs through the Ticker market **independently** — a sale doesn't require a purchase, and a purchase doesn't require a sale.

### The Ticker Market Is Open 24/7

> **Your lineup locks. Your portfolio never does.**

The market stays open **24 hours a day, seven days a week** — before matches, during matches, even at halftime. There is no limit to the number of clubs you may buy or sell, at any time, provided every transaction follows the portfolio and cash rules.

At each Gameweek deadline, Ticker takes an immutable snapshot of your entire Holdings, tagging up to four as your **Starting Four** and the rest as **Bench**. Trades submitted after the deadline update your portfolio and set up your **next** Starting Four. They never change the lineup that's already locked.

#### Example: selling a locked Starter during its match

You begin the Gameweek with Arsenal, Chelsea, Brighton, and Aston Villa as your Starting Four.

Chelsea falls behind 0-2 at halftime. You believe it will underperform and sell it immediately.

- **Fantasy impact:** none. Chelsea is still part of your locked Starting Four, so whatever points it ultimately earns from that match still count toward your Gameweek score.
- **Financial impact:** immediate. Chelsea leaves your current Holdings at the price you sold it for, and you're free to spend the proceeds right away — before the match, or Ticker's next price settlement, is even over.

### Buying Power

Your buying power is simply your available cash — no distinction between sale proceeds and existing cash. You may not borrow, use margin, or let your balance go negative.

#### Example

You sell Chelsea for **$25.00** and already have **$10.00** in cash.

```text
Chelsea sale        +$25.00
Existing cash        +$10.00
------------------------------
Buying power          $35.00
```

You may now buy one $34 club, split it across two or three cheaper clubs, or keep it all as cash — Ticker supports every combination.

### Selling a Club

When you sell a club, you receive its current market value, not your original purchase price.

#### Example

You purchase Arsenal for **$25.00**. Its value rises to **$30.00**. If you sell, your account receives **$30.00** in cash — the additional $5.00 becomes realized portfolio growth. If Arsenal's value instead falls to $22.00, selling it returns $22.00.

### Buying a Club

A purchase completes at the club's displayed execution price. Ticker verifies you have enough available cash and don't already own the club before completing it. There is no Holdings maximum to check.

### Portfolio Value

```text
Portfolio Value =
Current Market Value of All Holdings (Starting + Bench)
+
Available Cash
```

#### Example

| Asset | Value |
|---|---:|
| Arsenal (Starting) | $31.00 |
| Aston Villa (Starting) | $20.00 |
| Brighton (Starting) | $16.00 |
| Fulham (Starting) | $11.00 |
| Brentford (Bench) | $10.00 |
| Everton (Bench) | $8.00 |
| Cash | $6.00 |
| **Total Portfolio Value** | **$102.00** |

Starting or Bench status does not affect Portfolio Value — every club you own counts, whether or not it's currently scoring.

Portfolio value measures the value of your football investments. It does not replace fantasy points as the primary league score.

### Price Changes

Club prices may rise or fall during the season, reflecting match results, goals, clean sheets, form, upcoming schedule, market expectations, and Ticker buying/selling activity. Ticker determines all official club prices — external betting odds, projections, or third-party valuations do not represent executable Ticker prices.

---

## 6. Fantasy Points vs. Portfolio Value

Ticker includes two separate measures of success.

### Fantasy Points

Fantasy points determine your position in the league standings. They are earned through the real-world performances of the clubs in your Starting Four.

### Portfolio Value

Portfolio value determines your financial flexibility. It rises or falls as the market value of every club you own changes — Starting or Bench — and determines which clubs you can afford in future trades.

A manager may have the most valuable portfolio without having the most fantasy points, and vice versa.

> **Points win the league. Portfolio value gives you more tools to get there.**
