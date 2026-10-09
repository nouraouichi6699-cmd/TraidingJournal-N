import type { Lang } from "../types";

interface Props {
  lang: Lang;
  size?: "md" | "sm";
}

export default function Brand({ lang, size = "md" }: Props) {
  const isAr = lang === "ar";
  const h = size === "md" ? 66 : 54;
  return (
    <div className="flex flex-col items-center" style={{ gap: 2 }}>
      <img
        src="/logo.png"
        alt="Mizan"
        height={h}
        style={{ height: h, width: "auto", borderRadius: 10, background: "#fff", padding: 2 }}
      />
      <span
        className={isAr ? "font-wordmark-ar" : "font-wordmark"}
        style={{
          color: "var(--accent)",
          fontSize: isAr ? (size === "md" ? 22 : 18) : size === "md" ? 19 : 16,
          lineHeight: 1.2,
        }}
      >
        {isAr ? "ميزان" : "MIZAN"}
      </span>
    </div>
  );
}

export function ByLine() {
  return (
    <span
      className="font-wordmark text-muted whitespace-nowrap"
      dir="ltr"
      style={{ fontSize: "11px", letterSpacing: "0.2em", fontWeight: 400 }}
    >
      BY NOUR AOUICHI
    </span>
  );
}
