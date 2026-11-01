import { TriangleAlert } from "lucide-react";
import { stT } from "../i18n";
import type { Lang } from "../types";

/**
 * Shown when unified currency is on but a rate is still missing. Nothing has been converted in that case, so the
 * totals above are the raw amounts and the reader has to be told.
 */
export default function FxWarning({ codes, lang }: { codes: string[]; lang: Lang }) {
  if (!codes.length) return null;
  const L = stT(lang);
  const names = codes.map((c) => c || L("noCurrencyCode")).join(", ");
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
      <TriangleAlert size={14} className="mt-0.5 shrink-0 text-icon" />
      <span>{L("ratesMissing").replace("{codes}", names)}</span>
    </p>
  );
}
