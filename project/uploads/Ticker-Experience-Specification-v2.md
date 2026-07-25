
# Ticker Experience Specification v2.0

> Canonical product, UX, and visual design specification for Claude Design.

---

# 1. Product Vision

## Positioning

Ticker is **fantasy football for clubs**.

Instead of selecting players, users invest in four Premier League clubs. Club values fluctuate based on real football performance and market sentiment. Users compete by growing the strongest portfolio over the course of the season.

Ticker complements Fantasy Premier League rather than replacing it.

## Success Metrics

- User understands the game in under 5 minutes.
- Weekly engagement requires less than 10 minutes.
- Users check the app after every matchday.
- Private competitions become the primary growth engine.

## Product Principles

- Simple rules. Deep strategy.
- AI explains. Users decide.
- No pay-to-win.
- Premium, calm, intelligent.
- Every screen answers one question.

---

# 2. Brand & Voice

## Personality

Calm. Confident. Editorial. Analytical. Never sensational.

## Copy Style

Write like a football writer at *The Athletic*.

Avoid:
- "🚀 Massive gains!"
- "Must buy now!"
- Betting terminology.

Prefer:
- "Liverpool's value increased after consecutive wins and favorable fixtures."

---

# 3. Visual Design System

## Inspiration

Primary:
- Robinhood (Light)
- Apple Stocks
- Linear
- Stripe

Avoid:
- ESPN
- Yahoo Fantasy
- DraftKings
- FanDuel

## Color

Background: White

Surface: Very light gray

Green: Appreciation

Red: Depreciation

Blue: Primary actions

Gray: Secondary hierarchy

## Typography

Hero numbers dominate every financial screen.

Max four text sizes.

Never rely on color alone to create hierarchy.

## Spacing

8-point system.

Page margins: 24px

Card spacing: 16px

Card padding: 24px

Corner radius: 18px

## Motion

Screen transition:
250ms fade + upward slide.

Card tap:
98% scale.

Charts animate from previous values.

Portfolio values count upward.

---

# 4. Navigation

Bottom tabs:

1. Portfolio
2. Market
3. Competitions
4. AI
5. Profile

No hamburger menu.

Maximum two taps to any primary destination.

---

# 5. Screen Specifications

## Portfolio

Purpose:
How am I doing?

Layout (top to bottom):

1. Portfolio Summary
2. Performance Chart
3. AI Morning Brief
4. Holdings
5. Biggest Movers
6. Upcoming Fixtures
7. Competition Snapshot

### Portfolio Summary

Shows:

- Total value
- Today's movement
- Weekly movement
- Overall rank
- Season rank
- 30-day sparkline

### Holdings

Exactly four rows.

Each row:

- Crest
- Club
- Current value
- Weekly %
- Fixture badge
- Sparkline
- Chevron

Tap -> Club Detail.

### Loading

Skeleton cards.

No spinner.

### Empty State

Prompt user to complete draft.

---

## Market

Purpose:
What changed?

Sections:

- Trending Up
- Trending Down
- Most Bought
- Most Sold
- Fixture Winners
- Fixture Risks

Each row contains:

- Crest
- Club
- Price
- Daily %
- Weekly %
- Ownership %
- Sparkline

---

## Club Detail

Hero:

- Crest
- Club
- Current value
- Season chart

Sections:

- AI Analysis
- Fixtures
- Form
- News
- Ownership
- Historical movement

Primary CTA:
Trade Club

---

## Trading

Two-column comparison.

Current club vs replacement.

Show:

- Budget impact
- Fixture advantage
- AI explanation
- Confirm Trade

Trade confirmation uses a brokerage-style animation.

---

## Competitions

Cards:

- Leaderboard
- Weekly movers
- Recent trades
- Activity
- AI recap

Users may belong to multiple competitions with one shared portfolio.

---

## AI

Never presented as a chatbot by default.

Primary format is editorial briefing.

Standard briefing structure:

1. Market summary
2. Biggest opportunity
3. Biggest risk
4. Fixture insight
5. Suggested investigation

AI never gives guaranteed recommendations.

---

## Profile

Contains:

- Avatar
- Name
- Subscription
- Competitions
- Notification settings
- Appearance
- Help

---

# 6. Components

## Club Row

72px height.

Elements:

Crest | Name | Price | Sparkline | % | Chevron

## Cards

One purpose only.

Maximum one primary CTA.

## Buttons

Primary:
Filled blue.

Secondary:
Outlined.

Danger:
Red.

Disabled:
Gray.

## Charts

List:
Sparkline.

Detail:
30D / 3M / Season.

Default: Season.

---

# 7. States

Every screen supports:

- Loading
- Empty
- Offline
- Error
- Success

No generic 'Something went wrong.'

Explain what happened and next action.

---

# 8. Notifications

Allowed:

- Weekly AI Brief
- Large value movement
- Rank changes
- Trade deadline

Never send engagement spam.

---

# 9. Accessibility

WCAG AA.

44x44 tap targets.

Dynamic Type.

Keyboard support.

Charts never rely only on color.

---

# 10. Claude Design Instructions

Build mobile-first.

Prefer whitespace over density.

Never invent extra navigation.

Never use sports-betting language.

Always ask:
'Would this feel at home inside Robinhood?'

If yes, adapt it for football.

