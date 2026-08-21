# Nymor demo recording steps

## Prerequisites

1. `.env` fully filled in (see `.env.example`), buyer account funded with
   testnet XLM and USDC, `ANTHROPIC_API_KEY` set.
2. Start the seller: `pnpm dev:resources` (leave running in one terminal).
3. Set `NYMOR_SESSION_CAP_USD=0.08` in `.env` so the cap trips within a few
   summarize calls (each is $0.02) — makes the budget-refusal step land
   quickly on camera instead of requiring dozens of calls.

## Recording (2-3 minutes)

1. **Live price via MCP** — in Claude Code/Desktop with `nymor-server`
   configured, ask: "What's the current XLM price? Use Nymor." Watch it call
   `nymor.discover` then `nymor.pay_and_call("xlm-price")` and return a real
   price with a Stellar tx hash.

2. **Show settlement on-chain** — open
   `https://stellar.expert/explorer/testnet/{NYMOR_SELLER_PAYTO_ADDRESS}`
   and point at the just-settled transaction: real USDC amount, confirmed
   timestamp, matches the tx hash from step 1.

3. **Run the budget refusal** — either ask the agent to summarize several
   different texts in a row (each `pay_and_call("summarize")`), or run
   `pnpm demo` (`demo/run-demo.ts`) which does this deterministically and
   prints the `BUDGET_EXCEEDED` refusal without attempting payment.

4. **Show the persisted ledger** — ask "what's my Nymor spend status?" (or
   call `nymor.spend_status`) and show the real `spent_usd` / `remaining_usd`
   from `nymor.ledger.json`, matching what was just shown on Stellar Expert.

## Submission

Submit to Stellar Hacks: Agents on DoraHacks first; reuse the recording for
an SCF Build Award application.
