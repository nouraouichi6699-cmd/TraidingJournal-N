import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
}

export default function Dropdown({ label, trigger, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="icon-btn"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-2 min-w-[170px] rounded-xl border border-border bg-surface p-1.5 shadow-xl"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
