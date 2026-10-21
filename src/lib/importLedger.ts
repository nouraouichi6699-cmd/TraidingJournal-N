import type { ImportedFlow } from "./cashflow";

export interface FileLedger { startBalance: number | null; firstTrade: string | null; flows: ImportedFlow[]; preFlows: ImportedFlow[] }

/**
 * What an imported file changes in an account's ledger.
 *  - The file's start balance (balance just before its first trade) is used when the file reaches back to the account's
 *    first stored trade (or the account has none yet); the account's previous value, manual or imported, is replaced.
 *  - Its deposits/withdrawals after that first trade become cash flows.
 *  - A file that starts later (does not reach back) also brings the operations before its own first trade,
 *    as long as they are not older than the account's first stored trade (those are inside the start balance).
 */
export function planLedger(currentStart: number, earliest: string | null, l: FileLedger): { start: number | null; reaches: boolean; flows: ImportedFlow[] } {
  const reaches = l.startBalance != null && l.firstTrade != null && (earliest == null || l.firstTrade <= earliest);
  const extra = reaches ? [] : l.preFlows.filter((f) => earliest != null && f.t >= earliest);
  return { start: reaches && l.startBalance !== currentStart ? l.startBalance : null, reaches, flows: [...extra, ...l.flows] };
}
