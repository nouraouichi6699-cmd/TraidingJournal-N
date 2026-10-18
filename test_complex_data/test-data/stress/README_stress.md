# Stress test dataset (mizan_stress_2025.csv)

Synthetic, deterministic (seed 18). Used ONLY by automated tests; the app never reads it.
expected_stress.json holds the results computed by an independent Python implementation (not the app's code).

## What is inside
- 1,192 rows = 1,177 unique tickets (1,163 closed + 14 open) + 15 exact duplicate rows. Rows are fully shuffled (not chronological).
- 18 instruments: 9 FX pairs, gold, silver, oil, 3 indices, BTC, ETH. Start balance 25,000. Closes from 2025-01-02 to 2026-01-19 (8 trades close in Jan 2026, 1 opens in Dec 2024).
- 80 partial-close pieces (40 positions split in two rows), 28 hedge legs (opposite side on the same symbol, overlapping), 4 "close all" minutes (several trades closing in the same minute), 33 breakeven trades (P&L exactly 0), 11 weekend closes (crypto), 269 trades crossing midnight, 155 crossing a weekend, 53 crossing a month-end.
- 107 rows without commission (crypto, breakeven); swap column present (informational).
- Messy formats: 4 date formats (ISO, MT5 dotted, "Oct 7, 2025, 2:50 PM", "7 Oct 2025, 14:50"); numbers with "+", unicode minus, "$", comma decimals ("12,50"), thousands separators; Buy/buy/BUY/Long; symbols "OANDA:EURUSD", "eurusd", " GBPUSD ", "XAUUSD.m" (a different symbol from XAUUSD).

## Conventions used for the expected values
- Day/month attribution = CLOSE date; the importer drops seconds, so order = close minute, then ticket.
- Duplicates (same ticket) count once; open positions are excluded from every analytic.
- "Profit" is NET (commission and swap already inside it). Percentages are in percent units.
- Sharpe/Sortino/Calmar: daily returns over every weekday between the first and last close, plus weekend dates that have closes; return = day P&L / balance at the start of the day.
- Items printed in the "ambiguous" section depend on a definition choice and should be reported as INFO, not FAIL.
