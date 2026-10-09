import type { Lang } from "../types";

interface Props {
  lang: Lang;
  size?: "md" | "sm";
}

export default function Brand({ lang, size = "md" }: Props) {
  const isAr = lang === "ar";
  const fs = size === "md" ? (isAr ? 30 : 24) : isAr ? 26 : 20;
  return (
    <div className="flex flex-col items-start" style={{ gap: 4 }}>
      <span
        className={isAr ? "font-wordmark-ar" : "font-wordmark"}
        style={{
          background: "var(--brand-navy)",
          color: "var(--brand-gold)",
          border: "1px solid rgba(242, 193, 78, 0.55)",
          borderRadius: 8,
          padding: isAr ? "0 14px 2px" : "2px 14px",
          fontSize: fs,
          lineHeight: 1.25,
        }}
      >
        {isAr ? "ميزان" : "MIZAN"}
      </span>
      <span
        className="font-wordmark text-muted"
        dir="ltr"
        style={{ fontSize: "10px", letterSpacing: "0.18em", fontWeight: 400 }}
      >
        BY NOUR AOUICHI
      </span>
    </div>
  );
}
