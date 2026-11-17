# Scoring methodology

Two scores are calculated independently. The **quality score** describes the
long-term business and trend profile. The **entry score** describes whether the
current price structure offers a reasonable entry window. A high quality score
does not imply a good entry, and a good entry does not imply a good business.

Both scores are versioned (`1.0.0`), timestamped, and stored with their full
sub-criteria so any result can be reconstructed and audited.

## Core rules

1. **Missing data earns no points.** A criterion that cannot be evaluated has
   `status: "missing_data"`, `points: 0`, and its maximum points are excluded from
   coverage. It is never treated as a zero-scoring observation or filled with a
   guess.
2. **Score and coverage are separate.** `score` is the points earned out of 100.
   `coveragePercent` says how much of the rubric could be evaluated. A score of 40
   with 100% coverage means something different from 40 with 40% coverage.
3. **No fundamentals, no fundamental points.** Growth, quality and ownership
   criteria only use verified company fundamentals. The seed and jobs never
   invent them.
4. **Quality and entry share inputs but not conclusions.** Both use indicator
   values and the latest close; neither copies the other's score.

## Quality score (100 points)

| Category | Max | Criteria |
| --- | ---: | --- |
| Trend | 30 | Price above SMA50 (6), price above SMA200 (6), SMA20 above SMA50 (5), SMA50 above SMA200 (5), positive 3-month return (4), within 10% of 52-week high (4) |
| Volume and participation | 10 | Relative volume ≥1.2x (4) or ≥1.0x (2), 20-day average volume above 50-day (3), volume increased versus prior session (3) |
| Business growth | 30 | Revenue growth: ≥15% (12), ≥8% (8), ≥0% (4); net profit growth: ≥15% (10), ≥8% (6), ≥0% (3); EPS growth: ≥15% (8), ≥8% (5), ≥0% (2) |
| Quality | 20 | ROE: ≥15% (8), ≥10% (5), ≥5% (2); operating margin: ≥12% (6), ≥8% (4), ≥0% (2); debt/equity: ≤1.0x (6), ≤1.5x (3) |
| Ownership | 10 | Promoter holding: ≥50% (5), ≥35% (3); institutional holding: ≥10% (5), ≥5% (3) |

Fundamental inputs carry a `periodLabel` (for example `annual 2026-03-31`) that is
stored in the criteria source strings. A user can always see which period produced
the points.

Trend requires up to 252 sessions of highs and lows for the 52-week figure, 200
closes for SMA200, and 63 closes for the 3-month return. Shorter history reduces
coverage instead of lowering the score artificially.

## Entry score (100 points)

| Component | Max | Criteria |
| --- | ---: | --- |
| DMA alignment | 20 | Price above SMA20 (7), SMA20 above SMA50 (7), price above SMA200 (6) |
| Momentum | 20 | RSI(14) in 50–70 (8), 45–50 or 70–75 (5), 40–45 (3), otherwise 0; MACD histogram positive (6); positive 1-month return (6) |
| Price structure | 15 | Within 5% of 52-week high (8), within 10% (4); within 5% of SMA20 (7), within 10% (3) |
| Volume confirmation | 15 | Relative volume ≥1.5x (9), ≥1.2x (6), ≥1.0x (3); volume increased versus prior session (6) |
| Relative strength | 10 | 3-month excess return versus the benchmark positive (5); 1-year excess positive (5). With no benchmark history, absolute thresholds of 10% and 20% are used and the explanation says so |
| Risk / reward | 10 | Reward-to-risk ≥2 (10), ≥1.5 (7), ≥1 (4), otherwise 0 |
| Volatility and stop distance | 10 | ATR14 between 1% and 4% of price (6), 4–6% (3); stop distance ≤8% (4), ≤12% (2) |

### Invalidation level

```text
invalidationLevel = latestClose − 2 × ATR14
```

The stop is not a recommendation, only a volatility-scaled reference. If ATR or
the close is unavailable, `invalidationLevel` is `null`; the API does not
substitute a percentage guess.

### Risk factors

The entry score lists explicit risk factors such as RSI above 70, price at the
52-week high, volume below average, price below SMA200, a stop more than 10% below
price, or coverage below 60%. These are descriptive, not trading instructions.

## Coverage calculation

For each category:

```text
coveragePercent = sum(maxPoints of scorable criteria) / category maxPoints × 100
```

Overall coverage is the weighted sum across categories divided by 100. A
`missing_data` criterion is excluded from both the numerator and the points.

## Persistence

Every score row stores:

- `symbol`, `as_of_date`, `score`, `max_score`
- `available_points`, `coverage_percent`
- the full `categories` / `components` JSON
- `missing_fields`, `risk_factors`, `explanation`
- `methodology_version` and `calculated_at`

Unique keys `(stock_id, as_of_date, methodology_version)` prevent duplicate daily
rows while allowing a new methodology version to coexist with history.

## Limitations

- Fundamentals are only as good as the verified source that supplied them. With
  no filings configured, the quality score is trend-and-volume-only and coverage
  will be low.
- Indicators use unadjusted NSE closes. Corporate actions can distort long-window
  comparisons until adjusted data is available.
- The benchmark comparison depends on stored index history; when it is absent the
  entry score falls back to absolute returns and labels the source accordingly.
- Scores use delayed or end-of-day data. They are not live trading signals.
