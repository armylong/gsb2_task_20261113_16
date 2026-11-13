import React, { useEffect, useRef } from 'react';
import { TimeRange } from '../model/types';
import { formatTime } from '../util/format';

export const RULER_H = 28;

interface RulerProps {
  width: number;
  pxPerSec: number;
  selection: TimeRange | null;
  onSeek: (t: number) => void;
  onSelect: (r: TimeRange | null) => void;
}

/** 时间刻度尺:点击定位播放头,拖动框选一段时间 */
export function Ruler({ width, pxPerSec, selection, onSeek, onSelect }: RulerProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = RULER_H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#191c24';
    ctx.fillRect(0, 0, width, RULER_H);
    if (selection && selection.end > selection.start) {
      ctx.fillStyle = 'rgba(96, 150, 255, 0.28)';
      ctx.fillRect(selection.start * pxPerSec, 0, (selection.end - selection.start) * pxPerSec, RULER_H);
    }
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const step = steps.find((s) => s * pxPerSec >= 70) ?? 300;
    ctx.strokeStyle = '#454b5a';
    ctx.fillStyle = '#9aa3b2';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.beginPath();
    for (let t = 0; t * pxPerSec <= width; t += step) {
      const x = Math.round(t * pxPerSec) + 0.5;
      ctx.moveTo(x, RULER_H - 9);
      ctx.lineTo(x, RULER_H);
      ctx.fillText(formatTime(t), x + 3, 3);
    }
    ctx.stroke();
  }, [width, pxPerSec, selection]);

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const t0 = Math.max(0, (e.clientX - rect.left) / pxPerSec);
    let dragged = false;
    const move = (ev: PointerEvent) => {
      const t1 = Math.max(0, (ev.clientX - rect.left) / pxPerSec);
      if (!dragged && Math.abs(t1 - t0) * pxPerSec > 4) dragged = true;
      if (dragged) onSelect({ start: Math.min(t0, t1), end: Math.max(t0, t1) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!dragged) {
        onSelect(null);
        onSeek(t0);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <canvas
      ref={ref}
      style={{ width, height: RULER_H, display: 'block', cursor: 'col-resize' }}
      onPointerDown={onPointerDown}
    />
  );
}
