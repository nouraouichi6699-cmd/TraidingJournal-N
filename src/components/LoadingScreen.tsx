import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { loadingPhrases } from "../i18n";
import type { Lang } from "../types";

// How long one phrase stays on screen.
const PHRASE_MS = 3000;
// The sidebar groups (Overview, Manage, Growth) and how many links each holds, so the rail matches the real one.
const GROUPS = [4, 3, 4];
// Column heights of the placeholder chart, so it reads as a chart and not as one more block.
const CHART = [38, 62, 50, 74, 58, 86, 68, 92, 55, 79, 70, 88];

type Variant = "dashboard" | "content" | "simple";

interface Props {
  lang: Lang;
  /** The one line a screen reader says, e.g. t("loadingData"): the phrases themselves stay hidden from it. */
  label: string;
  /** "dashboard" stands for the whole page, "content" for the page area alone, "simple" for before we know the user. */
  variant?: Variant;
}

const Bar = ({ className = "", style }: { className?: string; style?: CSSProperties }) => (
  <div className={`ld-skel rounded-xl ${className}`} style={style} />
);

const Card = ({ className = "", children }: { className?: string; children?: ReactNode }) => (
  <div className={`flex flex-col gap-3 rounded-2xl border border-border p-4 ${className}`} style={{ background: "var(--card-bg)" }}>
    <Bar className="h-3 w-24 !rounded" />
    {children ?? <Bar className="min-h-0 flex-1 !rounded-lg" />}
  </div>
);

// A random phrase on every appearance, then the next one every few seconds. The fade comes from .ld-phrase, which
// reduced motion turns off; the rotation itself keeps going either way.
function Phrase({ lang, className = "" }: { lang: Lang; className?: string }) {
  const list = loadingPhrases[lang];
  const [i, setI] = useState(() => Math.floor(Math.random() * list.length));
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => n + 1), PHRASE_MS);
    return () => window.clearInterval(id);
  }, []);
  const phrase = list[i % list.length];
  // The key restarts the fade on every change.
  return <p className={`text-sm text-muted ${className}`}><span key={phrase} className="ld-phrase inline-block">{phrase}</span></p>;
}

// The real sidebar remembers its width and starts collapsed on a narrow screen: read the same thing, so the rail
// keeps its width when the page takes over.
const railOpen = () => {
  try {
    const v = localStorage.getItem("mizan-sidebar");
    return v == null ? window.innerWidth >= 1000 : v !== "0";
  } catch {
    return true;
  }
};

function Shell({ children }: { children: ReactNode }) {
  const [open] = useState(railOpen);
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2">
        <Bar className="h-8 w-28" />
        <div className="ms-auto flex items-center gap-2">
          <Bar className="hidden h-8 w-24 sm:block" />
          <Bar className="h-8 w-8 !rounded-full" />
          <Bar className="h-8 w-8 !rounded-full" />
        </div>
      </div>
      <div className="flex">
        <div className={`sticky top-3 m-3 flex shrink-0 flex-col self-start rounded-2xl border border-border bg-surface p-2 ${open ? "w-[208px]" : "w-[60px]"}`}>
          {GROUPS.map((n, gi) => (
            <div key={gi} className={gi ? "mt-3" : ""}>
              {open && <Bar className="mx-3 mb-1 h-2 w-16 !rounded" />}
              <div className="flex flex-col gap-0.5">
                {Array.from({ length: n }, (_, i) => <Bar key={i} className={open ? "h-10" : "mx-auto h-9 w-9"} />)}
              </div>
            </div>
          ))}
        </div>
        <main className="min-w-0 flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}

function Content({ lang }: { lang: Lang }) {
  return (
    <div className="space-y-4">
      {/* The title and the two filters above the cards. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Bar className="h-6 w-28" />
          <Bar className="h-8 w-24" />
          <Bar className="h-8 w-20" />
        </div>
        <Bar className="hidden h-8 w-24 sm:block" />
      </div>
      {/* Under 640px the real cards stand in one column, which is where this grid starts too. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Card key={i} className="h-[130px]" />)}
      </div>
      <Card className="h-56 sm:h-64">
        <div className="flex min-h-0 flex-1 items-end gap-1.5">
          {CHART.map((h, i) => <Bar key={i} className="flex-1 !rounded-md" style={{ height: `${h}%` }} />)}
        </div>
      </Card>
      <Card className="h-56">
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => <Bar key={i} className="min-h-0 flex-1 !rounded-lg" />)}
        </div>
      </Card>
      <Phrase lang={lang} className="pt-1 text-center" />
    </div>
  );
}

export default function LoadingScreen({ lang, label, variant = "dashboard" }: Props) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {/* Hidden from screen readers: the label above already says we are loading, and the phrases would repeat it. */}
      <div aria-hidden="true">
        {variant === "simple" ? (
          <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg px-6 text-text">
            <Phrase lang={lang} className="text-center !text-base" />
            <Bar className="h-2 w-56 max-w-full !rounded-full" />
          </div>
        ) : variant === "content" ? (
          <Content lang={lang} />
        ) : (
          <Shell><Content lang={lang} /></Shell>
        )}
      </div>
    </div>
  );
}
