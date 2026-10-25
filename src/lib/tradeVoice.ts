// Voice notes sent to the Telegram bot in reply to a trade's message: turned into text by the "telegram" function and
// written in the synced setting "mizan-trade-voice" ({ [trade key]: [{ t: text, at: ISO time, d: seconds }] }). Read-only here.
export type VoiceNote = { t: string; at: string; d: number };

export function voiceOf(tradeKey: string): VoiceNote[] {
  try {
    const v = JSON.parse(localStorage.getItem("mizan-trade-voice") ?? "null")?.[tradeKey];
    return Array.isArray(v) ? v.filter((x) => x && typeof x.t === "string") : [];
  } catch {
    return [];
  }
}
