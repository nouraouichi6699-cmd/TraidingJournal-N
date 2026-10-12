import { Heart } from "lucide-react";

export default function HeartButton({ on, label, onClick, className = "", overlay = false }: { on: boolean; label: string; onClick: () => void; className?: string; overlay?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`${on ? "heart-on text-icon" : overlay ? "text-white hover:text-icon" : "text-muted hover:text-icon"} ${overlay ? "bg-black/55" : ""} rounded-full p-1.5 transition-colors hover:bg-primary-tint ${className}`}
    >
      <Heart size={17} fill={on ? "currentColor" : "none"} />
    </button>
  );
}
