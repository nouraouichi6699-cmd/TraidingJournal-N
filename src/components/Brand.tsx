interface Props {
  size?: "md" | "sm";
}

export default function Brand({ size = "md" }: Props) {
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
        className="font-wordmark-ar"
        style={{
          color: "var(--accent)",
          fontSize: size === "md" ? 22 : 18,
          lineHeight: 1.2,
        }}
      >
        ميزان
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
