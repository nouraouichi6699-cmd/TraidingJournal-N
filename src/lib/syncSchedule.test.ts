import { nextDelay, type DelayInput } from "./syncSchedule";
let pass = 0, fail = 0;
const base: DelayInput = { hidden: false, online: true, errorCount: 0, idleMs: 0, lastPullMs: 0, now: 1_000_000 };
const t = (name: string, i: Partial<DelayInput>, exp: { delayMs: number } | "pause") => {
  const got = nextDelay({ ...base, ...i });
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`}`);
};
t("hidden -> pause", { hidden: true }, "pause");
t("offline -> pause", { online: false }, "pause");
t("hidden beats focus", { hidden: true, focus: true }, "pause");
t("base 30 s right after a pull", { lastPullMs: base.now }, { delayMs: 30_000 });
t("base 30 s, 10 s elapsed -> 20 s left", { lastPullMs: base.now - 10_000 }, { delayMs: 20_000 });
t("overdue pull -> 0 (never earlier than 15 s gap)", { lastPullMs: base.now - 40_000 }, { delayMs: 0 });
t("focus 5 s after a pull -> wait 10 s", { focus: true, lastPullMs: base.now - 5_000 }, { delayMs: 10_000 });
t("focus 20 s after a pull -> immediate", { focus: true, lastPullMs: base.now - 20_000 }, { delayMs: 0 });
t("focus, never pulled -> immediate", { focus: true }, { delayMs: 0 });
t("idle 4:59 -> still 30 s", { idleMs: 299_999, lastPullMs: base.now }, { delayMs: 30_000 });
t("idle 5:00 -> 60 s", { idleMs: 300_000, lastPullMs: base.now }, { delayMs: 60_000 });
t("activity resets idle -> 30 s", { idleMs: 0, lastPullMs: base.now }, { delayMs: 30_000 });
[[1, 30_000], [2, 60_000], [3, 120_000], [4, 240_000], [5, 300_000], [9, 300_000]].forEach(([n, d]) =>
  t(`error x${n} -> ${d / 1000} s (cap 300 s)`, { errorCount: n, lastPullMs: base.now }, { delayMs: d }));
t("error backoff beats idle", { errorCount: 2, idleMs: 600_000, lastPullMs: base.now }, { delayMs: 60_000 });
t("reset after success (errorCount 0) -> 30 s", { errorCount: 0, lastPullMs: base.now }, { delayMs: 30_000 });
t("online event after errors: caller resets errors, focus gap only", { focus: true, errorCount: 0, lastPullMs: base.now - 1_000 }, { delayMs: 14_000 });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
