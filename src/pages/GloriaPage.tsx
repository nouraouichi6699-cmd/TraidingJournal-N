import { Gamepad2 } from "lucide-react";

export default function GloriaPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-surface p-10 text-center">
      <Gamepad2 size={64} strokeWidth={1.5} className="text-icon" />
      <h1 className="text-2xl font-bold tracking-wide text-text">GLORIA RPG</h1>
    </div>
  );
}
