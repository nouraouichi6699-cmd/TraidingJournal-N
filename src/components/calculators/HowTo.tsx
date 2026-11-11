// The "How to use" card of one calculator: its blurb from text.ts and a worked example computed by calcExample().
import type { Lang } from "../../types";
import type { CalcKey } from "../../lib/calculators";
import { calcExample } from "../../lib/calcExamples";
import { fmtFv, HowToUse, Row, say } from "./ui";
import { HOW, HOW_T } from "./text";

export function HowTo({ lang, k }: { lang: Lang; k: CalcKey }) {
  const h = HOW[k];
  return (
    <HowToUse
      lang={lang} title={HOW_T.title[lang]} blurb={h.blurb[lang]}
      inputs={() => calcExample(k).inputs.map((v, i) => <Row key={i} label={h.labels[i][lang]} value={fmtFv(v)} />)}
      result={() => {
        const out = Object.fromEntries(Object.entries(calcExample(k).out).map(([key, v]) => [key, fmtFv(v)]));
        return say(h.result[lang], out);
      }}
    />
  );
}
