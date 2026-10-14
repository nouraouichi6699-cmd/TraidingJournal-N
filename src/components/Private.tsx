import { useEffect, useState, type ReactNode } from "react";
import { usePrivacy } from "../usePrivacy";

/** Masks its children while privacy mode is on. A click reveals the value for a few seconds. */
export default function Private({ children, hint = "" }: { children: ReactNode; hint?: string }) {
  const { hidden } = usePrivacy();
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!peek) return;
    const id = setTimeout(() => setPeek(false), 4000);
    return () => clearTimeout(id);
  }, [peek]);
  useEffect(() => { if (!hidden) setPeek(false); }, [hidden]);
  if (!hidden || peek) return <>{children}</>;
  return (
    <button type="button" title={hint} aria-label={hint} onClick={(e) => { e.stopPropagation(); setPeek(true); }} className="cursor-pointer select-none tracking-widest text-muted" dir="ltr">
      ••••••
    </button>
  );
}
