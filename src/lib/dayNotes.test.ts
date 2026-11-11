import { applyDayEntry, dayBadge, MOODS, moodEmoji, parseDayNotes } from "./dayNotes";
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + d}`); };

ok("five fixed moods with distinct emoji", MOODS.length === 5 && new Set(MOODS.map((m) => m.emoji)).size === 5 && new Set(MOODS.map((m) => m.id)).size === 5);
ok("moodEmoji maps an id, unknown -> undefined", moodEmoji("happy") === MOODS[0].emoji && moodEmoji("nope") === undefined && moodEmoji(undefined) === undefined);

const a = applyDayEntry({}, "2025-03-04", { mood: "happy" });
ok("set a mood", a["2025-03-04"]?.mood === "happy" && a["2025-03-04"]?.note === undefined);
const b = applyDayEntry(a, "2025-03-04", { note: "calm day" });
ok("adding a note keeps the mood", b["2025-03-04"]?.mood === "happy" && b["2025-03-04"]?.note === "calm day");
ok("does not mutate the input", a["2025-03-04"]?.note === undefined);
const c = applyDayEntry(b, "2025-03-04", { mood: null });
ok("mood: null clears the mood only", c["2025-03-04"]?.mood === undefined && c["2025-03-04"]?.note === "calm day");
const d = applyDayEntry(c, "2025-03-04", { note: "   " });
ok("blank note on a mood-less day removes the entry", !("2025-03-04" in d) && Object.keys(d).length === 0);
ok("unknown mood id is not stored", !("2025-03-05" in applyDayEntry({}, "2025-03-05", { mood: "bogus" })));
ok("note is capped", (applyDayEntry({}, "2025-03-06", { note: "x".repeat(5000) })["2025-03-06"].note?.length ?? 0) === 2000);

ok("parse: junk / null / array -> {}", Object.keys(parseDayNotes("not json")).length === 0 && Object.keys(parseDayNotes(null)).length === 0 && Object.keys(parseDayNotes("[1]")).length === 0);
const p = parseDayNotes(JSON.stringify({ "2025-03-04": { mood: "tired", note: "hi" }, "bad-key": { mood: "happy" }, "2025-03-05": { mood: "bogus" }, "2025-03-06": { note: "  " }, "2025-03-07": 5 }));
ok("parse keeps valid entries only", Object.keys(p).join() === "2025-03-04" && p["2025-03-04"].mood === "tired", Object.keys(p).join());
ok("parse round-trips applyDayEntry output", JSON.stringify(parseDayNotes(JSON.stringify(b))) === JSON.stringify(b));

ok("badge: mood wins", JSON.stringify(dayBadge({ mood: "down", note: "x" })) === JSON.stringify({ kind: "mood", emoji: moodEmoji("down") }));
ok("badge: note only -> note glyph", dayBadge({ note: "x" })?.kind === "note");
ok("badge: none", dayBadge(undefined) === null && dayBadge({}) === null && dayBadge({ note: " " }) === null);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
