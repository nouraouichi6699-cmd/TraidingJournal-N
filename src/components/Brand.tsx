import { Scale } from "lucide-react";
import type { Lang } from "../types";

interface Props {
  lang: Lang;
  size?: "md" | "sm";
}

export default function Brand({ lang, size = "md" }: Props) {
  const isAr = lang === "ar";
  const box = size === "md" ? 40 : 36;
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          width: box,
          height: box,
          background: "linear-gradient(135deg, var(--primary), var(--primary-2))",
        }}
      >
        <Scale size={size === "md" ? 22 : 20} className="text-white" strokeWidth={2} />
      </div>
      <div className="flex flex-col" style={{ lineHeight: 1.1 }}>
        <span
          className={isAr ? "font-wordmark-ar" : "font-wordmark"}
          style={{ fontSize: size === "md" ? "22px" : "20px" }}
        >
          {isAr ? "ميزان" : "Mizan"}
        </span>
        <span
          className="font-wordmark text-muted"
          dir="ltr"
          style={{ fontSize: "10.5px", letterSpacing: "0.14em", marginTop: 3 }}
        >
          BY NOUR AOUICHI
        </span>
      </div>
    </div>
  );
}
