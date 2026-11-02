// One colour row, shared by every place in Settings that offers a colour: the lighting behind the pages, the
// full-colour background, and the cards. It shows the choices that mean something first - the moving colours, the
// gold, the session, the three own colours - then the twenty plain ones, then a colour of the customer's own and
// the last few they used.
//
// It knows nothing about lighting. It is handed what to show and which swatch is chosen, and reports back which one
// was pressed; what that means, and how it is stored, stays in SettingsView.
import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { isHexColor, normalizeHex, PRESETS, relLuminance, type PaletteChoice } from "../lib/lighting";

/** A choice that means something rather than being a plain colour. */
export interface SpecialChoice {
  id: string;
  label: string;
  /** Any CSS background: a colour, or a gradient where the swatch is a picture of what the choice does. */
  swatch: string;
  /** For a swatch that can land on the colour of the card under it and would otherwise have no edge. */
  outline?: boolean;
  /** The check mark's colour, for a gradient or a variable where it cannot be worked out. */
  ink?: string;
}

/** A check that reads on the swatch under it: dark on a light colour, light on a dark one. */
const inkFor = (hex: string): string => (relLuminance(hex) > 0.45 ? "#000000" : "#ffffff");

const RING = "0 0 0 2px var(--bg), 0 0 0 4px var(--text)";
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";

/** The rainbow the own-colour swatch wears, so it reads as "any colour" rather than as one more colour. */
const RAINBOW = "conic-gradient(#ff4d4d, #ffcc33, #33e58c, #33b8ff, #9b5cff, #ff4d4d)";

export function ColorPalette({ label, specials, choice, hex, onSpecial, onPick, recent, text }: {
  label: string;
  specials: SpecialChoice[];
  /** Which swatch wears the check. */
  choice: PaletteChoice;
  /** The colour behind the picker and the field. */
  hex: string;
  onSpecial: (id: string) => void;
  /** A colour was chosen. `own` marks the ones that are remembered: the picker, the field and the recent row. */
  onPick: (hex: string, own: boolean) => void;
  recent: string[];
  /** The Settings string table, so no wording lives in here. */
  text: (k: string) => string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const picker = useRef<HTMLInputElement | null>(null);
  // null means the field follows the chosen colour; a string is what is being typed, right or wrong.
  const [typed, setTyped] = useState<string | null>(null);
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";

  const name = (id: string): string => text(`col${id[0].toUpperCase()}${id.slice(1)}`);
  const shown = typed ?? hex;
  const bad = typed !== null && typed.trim() !== "" && !isHexColor(typed);

  // Everything selectable in one radio group, in the order it is read: the choices that mean something, the twenty
  // plain colours, then the own colour at the end.
  const cells: { key: string; aria: string; bg: string; on: boolean; ink: string; outline?: boolean; press: () => void; opens?: boolean }[] = [
    ...specials.map((sp) => ({
      key: `s:${sp.id}`,
      aria: sp.label,
      bg: sp.swatch,
      outline: sp.outline,
      on: choice.kind === "special" && choice.id === sp.id,
      ink: sp.ink ?? "#ffffff",
      press: () => { setTyped(null); onSpecial(sp.id); },
    })),
    ...PRESETS.map((pr) => ({
      key: `p:${pr.id}`,
      aria: name(pr.id),
      bg: pr.hex,
      // The white one has no edge of its own on a pale card.
      outline: pr.hex === "#ffffff",
      on: choice.kind === "preset" && choice.hex === pr.hex,
      ink: inkFor(pr.hex),
      press: () => { setTyped(null); onPick(pr.hex, false); },
    })),
    {
      key: "own",
      aria: text("colCustom"),
      bg: RAINBOW,
      on: choice.kind === "own",
      ink: "#ffffff",
      // It chooses the colour that is in the field, and the click opens the picker on top of that. It is not
      // remembered here: nothing has been chosen yet, and the picker can still be cancelled.
      press: () => { setTyped(null); onPick(normalizeHex(hex) ?? "#4dffa0", false); },
      opens: true,
    },
  ];

  // Nothing chosen - a colour saved before the palette existed - still leaves one stop in the tab order.
  const at = cells.findIndex((c) => c.on);
  const stop = at === -1 ? 0 : at;

  // Arrowing along the row only chooses; it never opens the system picker, which would be a dialog in the face of
  // someone who is still looking.
  const move = (from: number, step: number) => {
    const to = (from + step + cells.length) % cells.length;
    cells[to].press();
    refs.current[to]?.focus();
  };

  return (
    <div className="flex w-full grow basis-full flex-col gap-2">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-0.5">
        {cells.map((c, i) => (
          <button
            key={c.key} type="button" role="radio" aria-checked={c.on} tabIndex={i === stop ? 0 : -1}
            aria-label={c.aria} title={c.aria}
            ref={(el) => { refs.current[i] = el; }}
            onClick={() => { c.press(); if (c.opens) picker.current?.click(); }}
            onKeyDown={(e) => {
              const back = e.key === "ArrowUp" || e.key === (rtl ? "ArrowRight" : "ArrowLeft");
              const fwd = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight");
              if (!back && !fwd) return;
              e.preventDefault();
              move(i, back ? -1 : 1);
            }}
            className={`grid h-11 w-11 place-items-center rounded-full ${FOCUS}`}
          >
            <span
              className={`grid h-7 w-7 place-items-center rounded-full ${c.outline ? "border border-border" : ""}`}
              style={{ background: c.bg, boxShadow: c.on ? RING : undefined }}
            >
              {/* A check, not only a ring: the ring on its own is easy to miss in a row this long. */}
              {c.on && <Check size={15} strokeWidth={3} style={{ color: c.ink }} aria-hidden="true" />}
            </span>
          </button>
        ))}
      </div>

      {/* The own colour can be typed as well as hunted for, which is the only way to match a colour you already have. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{text("colCustom")}</span>
        <input
          type="text" dir="ltr" value={shown} maxLength={7} spellCheck={false} autoComplete="off"
          aria-label={text("colHex")} aria-invalid={bad || undefined} placeholder="#4dffa0"
          onChange={(e) => {
            const v = e.target.value;
            setTyped(v);
            const h = normalizeHex(v);
            if (h) onPick(h, true);
          }}
          onBlur={() => setTyped(null)}
          className="tnum h-9 w-[7.5rem] rounded-lg border bg-transparent px-2 text-xs"
          style={{ borderColor: bad ? "var(--loss)" : "var(--border)" }}
        />
        {bad && <span role="alert" className="text-xs" style={{ color: "var(--loss)" }}>{text("colBadHex")}</span>}
      </div>

      {/* Kept out of the tab order: pressing the rainbow swatch is what opens it. */}
      <input
        ref={picker} type="color" value={normalizeHex(hex) ?? "#4dffa0"} tabIndex={-1} aria-hidden="true"
        onChange={(e) => { setTyped(null); onPick(e.target.value, true); }}
        className="pointer-events-none absolute h-px w-px border-0 p-0 opacity-0"
      />

      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={text("colRecent")}>
          <span className="text-xs text-muted">{text("colRecent")}</span>
          {recent.map((h) => (
            <button
              key={h} type="button" aria-label={`${text("colRecent")} ${h}`} title={h}
              onClick={() => { setTyped(null); onPick(h, true); }}
              className={`grid h-11 w-11 place-items-center rounded-full ${FOCUS}`}
            >
              <span className="h-5 w-5 rounded-full border border-border" style={{ background: h }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
