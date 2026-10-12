import { useState } from "react";

const CUR: Record<string, string> = {
  USD: "us", EUR: "eu", GBP: "gb", JPY: "jp", CHF: "ch", CAD: "ca", AUD: "au", NZD: "nz",
  CNH: "cn", CNY: "cn", SEK: "se", NOK: "no", DKK: "dk", MXN: "mx", ZAR: "za", TRY: "tr",
  SGD: "sg", HKD: "hk", PLN: "pl", CZK: "cz", HUF: "hu", ILS: "il", INR: "in",
};
const CRYPTO = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "LTC", "DOT", "AVAX", "LINK", "TRX", "MATIC", "XBT"];
const INDEX: [RegExp, string][] = [
  [/US30|DJI|DOW|NAS|NDX|US100|SPX|US500|SP500/, "us"], [/GER|DE40|DAX/, "de"],
  [/UK100|FTSE/, "gb"], [/JP225|NIK/, "jp"],
];

const Flag = ({ code }: { code: string }) => (
  <img src={`https://flagcdn.com/w40/${code}.png`} alt={code} width={20} height={14} loading="lazy"
    className="h-3.5 w-5 rounded-[2px] object-cover ring-1 ring-black/20" />
);

function GoldBar() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden>
      <path d="M5 2h12l4 12H1z" fill="#f5b83d" stroke="#b07a10" strokeWidth="1" strokeLinejoin="round" />
      <path d="M6.5 4h9l2.2 6H4.3z" fill="#ffd36b" />
    </svg>
  );
}

function CryptoIcon({ sym }: { sym: string }) {
  const [bad, setBad] = useState(false);
  const s = sym === "XBT" ? "btc" : sym.toLowerCase();
  if (bad)
    return <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[9px] font-bold text-on-primary">{sym[0]}</span>;
  return (
    <img src={`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${s}.png`} alt={sym}
      width={20} height={20} loading="lazy" onError={() => setBad(true)} className="h-5 w-5" />
  );
}

/** Small visual in front of a symbol: currency flags, gold bar + US flag, crypto logo, index country flag. */
export default function SymbolIcon({ symbol }: { symbol: string }) {
  const s = symbol.replace(/^[^:]+:/, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let inner: React.ReactNode = null;
  if (/^(XAU|GOLD)/.test(s)) inner = <><GoldBar /><Flag code="us" /></>;
  else if (/^(XAG|SILVER)/.test(s)) inner = <><span className="h-3 w-4 rounded-sm bg-gradient-to-b from-[#e5e7eb] to-[#9ca3af]" /><Flag code="us" /></>;
  else {
    const c = CRYPTO.find((k) => s.startsWith(k));
    if (c) inner = <CryptoIcon sym={c} />;
    else if (s.length >= 6 && CUR[s.slice(0, 3)] && CUR[s.slice(3, 6)])
      inner = (
        <span className="relative inline-flex h-4 w-8 items-center">
          <span className="absolute start-0 top-0.5"><Flag code={CUR[s.slice(0, 3)]} /></span>
          <span className="absolute end-0 bottom-0 rounded-[2px] ring-1 ring-surface"><Flag code={CUR[s.slice(3, 6)]} /></span>
        </span>
      );
    else {
      const idx = INDEX.find(([r]) => r.test(s));
      if (idx) inner = <Flag code={idx[1]} />;
    }
  }
  if (!inner) return null;
  return <span className="inline-flex items-center gap-1" dir="ltr">{inner}</span>;
}
