import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createSeries } from "../lib/loginCandles";

const UP = "#2EBD85";
const DOWN = "#F6465D";
const AXIS = "#6b6b68";
const FAINT = "rgba(255,255,255,.07)";
const INK = "#d8d4c8";

const TICK_MS = 250; // one small move inside the forming candle
const ROLL_MS = 3600; // a new candle every few seconds
const BULL_GAP = 110; // between the four candles of the winning run

const PAD = { top: 20, right: 58, bottom: 4, left: 10 };
const VOL_SHARE = 0.14; // the share of the height given to the volume bars, kept low
const CANDLE_SHARE = 0.52; // the newest candle lands here across the plot, leaving the rest to the price line

export interface LoginChartHandle {
  /** A character was typed in the form. */
  keystroke: () => void;
  /** Signed in: four strong candles, then the breakout. */
  success: () => void;
  /** Rejected: one red candle with a long upper wick. */
  reject: () => void;
}

/**
 * The decorative chart on the login screen: one canvas, one animation loop. The series lives outside React, so a
 * tick never costs a render, and the loop stops whenever the tab goes away or the screen unmounts.
 */
const LoginChart = forwardRef<LoginChartHandle, { still?: boolean; className?: string }>(function LoginChart(
  { still = false, className = "" },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const series = useRef(createSeries());
  const dirty = useRef(true); // a still chart only paints when something actually changed

  useImperativeHandle(ref, () => ({
    keystroke: () => {
      if (still) return;
      series.current.add("key");
      dirty.current = true;
    },
    success: () => {
      if (still) return;
      // Four strong candles in a row, then the breakout over the top of them.
      for (let i = 0; i < 4; i++) window.setTimeout(() => { series.current.add("bull"); dirty.current = true; }, i * BULL_GAP);
      window.setTimeout(() => { series.current.add("breakout"); dirty.current = true; }, 4 * BULL_GAP);
    },
    reject: () => {
      if (still) return;
      series.current.add("reject");
      dirty.current = true;
    },
  }), [still]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastTick = 0;
    let lastRoll = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const box = el.getBoundingClientRect();
      w = Math.max(1, Math.round(box.width));
      h = Math.max(1, Math.round(box.height));
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty.current = true;
    };

    const draw = () => {
      const all = series.current.candles;
      if (!all.length) return;

      ctx.clearRect(0, 0, w, h);
      const volH = Math.max(12, h * VOL_SHARE);
      const top = PAD.top;
      const priceH = Math.max(10, h - top - volH - PAD.bottom - 6);
      const plotW = Math.max(10, w - PAD.left - PAD.right);

      // Candles fill the left part only and end at CANDLE_SHARE across, so the newest one sits mid-plot and the
      // dashed price line runs on into clear space. Only as many as fit are drawn; the rest stay off the left.
      const candleW = plotW * CANDLE_SHARE;
      const step = Math.max(4, Math.min(13, candleW / 40));
      const shown = Math.min(all.length, Math.max(6, Math.floor(candleW / step)));
      const list = all.slice(all.length - shown);
      const last = list[list.length - 1];
      const cxOf = (i: number) => PAD.left + candleW - (shown - 1 - i) * step;

      // Scaled to what is on screen, so a candle that has scrolled off cannot stretch the axis.
      let lo = Infinity;
      let hi = -Infinity;
      for (const c of list) { if (c.l < lo) lo = c.l; if (c.h > hi) hi = c.h; }
      const span = hi - lo || 1;
      lo -= span * 0.06;
      hi += span * 0.06;
      const y = (p: number) => top + priceH - ((p - lo) / (hi - lo)) * priceH;

      const bw = Math.max(1.5, Math.min(9, step * 0.62));

      // The price axis on the right: a few levels, no grid across the chart.
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = AXIS;
      for (let i = 0; i <= 4; i++) {
        const p = lo + ((hi - lo) * i) / 4;
        ctx.fillText(p.toFixed(2), w - PAD.right + 7, y(p));
      }

      let maxV = 0;
      for (const c of list) if (c.v > maxV) maxV = c.v;
      maxV = maxV || 1;

      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const cx = cxOf(i);
        const up = c.c >= c.o;
        const color = up ? UP : DOWN;

        // The volume bar under it.
        const vh = (c.v / maxV) * (volH - 4);
        ctx.fillStyle = up ? "rgba(46,189,133,.32)" : "rgba(246,70,93,.32)";
        ctx.fillRect(cx - bw / 2, h - PAD.bottom - vh, bw, vh);

        if (c.glow) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 18;
        }
        // The wick, then the body.
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, bw * 0.16);
        ctx.beginPath();
        ctx.moveTo(cx, y(c.h));
        ctx.lineTo(cx, y(c.l));
        ctx.stroke();
        ctx.fillStyle = color;
        const yo = y(c.o);
        const yc = y(c.c);
        ctx.fillRect(cx - bw / 2, Math.min(yo, yc), bw, Math.max(1.2, Math.abs(yc - yo)));
        ctx.shadowBlur = 0;
      }

      // The dashed line at the last price, and its tag on the axis.
      const lastUp = last.c >= last.o;
      const ly = y(last.c);
      ctx.strokeStyle = lastUp ? UP : DOWN;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, ly);
      ctx.lineTo(w - PAD.right, ly);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = lastUp ? UP : DOWN;
      ctx.fillRect(w - PAD.right + 2, ly - 7.5, PAD.right - 4, 15);
      ctx.fillStyle = "#0b0b0c";
      ctx.font = "600 10px ui-monospace, monospace";
      ctx.fillText(last.c.toFixed(2), w - PAD.right + 6, ly);

      // The open, high, low and close of the candle that is forming, along the top.
      ctx.font = "10px ui-monospace, monospace";
      ctx.textBaseline = "top";
      let x = PAD.left;
      ctx.fillStyle = AXIS;
      ctx.fillText("XAUUSD · 5m", x, 4);
      x += ctx.measureText("XAUUSD · 5m").width + 12;
      for (const [k, v] of [["O", last.o], ["H", last.h], ["L", last.l], ["C", last.c]] as const) {
        ctx.fillStyle = AXIS;
        ctx.fillText(k, x, 4);
        x += ctx.measureText(k).width + 3;
        ctx.fillStyle = k === "C" ? (lastUp ? UP : DOWN) : INK;
        const text = v.toFixed(2);
        ctx.fillText(text, x, 4);
        x += ctx.measureText(text).width + 9;
      }
      ctx.textBaseline = "middle";

      // A hairline under the price area, where the volume starts.
      ctx.strokeStyle = FAINT;
      ctx.beginPath();
      ctx.moveTo(PAD.left, top + priceH + 3);
      ctx.lineTo(w - PAD.right, top + priceH + 3);
      ctx.stroke();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!still) {
        if (now - lastTick >= TICK_MS) { lastTick = now; series.current.tick(); dirty.current = true; }
        if (now - lastRoll >= ROLL_MS) { lastRoll = now; series.current.roll(); dirty.current = true; }
      }
      if (!dirty.current) return;
      dirty.current = false;
      draw();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    raf = requestAnimationFrame(frame);

    const onVisible = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        lastTick = lastRoll = performance.now();
        dirty.current = true;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisible);
      ro.disconnect();
    };
  }, [still]);

  return <canvas ref={canvas} aria-hidden="true" className={`block h-full w-full ${className}`} />;
});

export default LoginChart;
