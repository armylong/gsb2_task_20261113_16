import React, { useEffect, useRef } from 'react';
import { AudioData, Clip } from '../model/types';
import { moveClip, trimClipEnd, trimClipStart, updateClip } from '../model/ops';
import { useApp } from '../state/store';

export const TRACK_H = 64;

interface ClipViewProps {
  clip: Clip;
  pxPerSec: number;
  selected: boolean;
  sourceDuration: number;
  data: AudioData | undefined;
}

/** 时间线上的一个片段:可拖动、两端裁剪,显示真实波形与淡入淡出 */
export function ClipView({ clip, pxPerSec, selected, sourceDuration, data }: ClipViewProps) {
  const { dispatch } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = Math.max(2, clip.duration * pxPerSec);
  const height = TRACK_H - 8;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(width));
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, height);
    if (data && data.channels.length > 0) {
      const ch = data.channels[0];
      const samplesPerPx = data.sampleRate / pxPerSec;
      const startSample = clip.offset * data.sampleRate;
      ctx.fillStyle = selected ? '#cfe0ff' : '#9fd0a8';
      const mid = height / 2;
      for (let x = 0; x < w; x++) {
        const s0 = Math.floor(startSample + x * samplesPerPx);
        const s1 = Math.min(ch.length, Math.max(s0 + 1, Math.floor(startSample + (x + 1) * samplesPerPx)));
        let min = 0;
        let max = 0;
        for (let i = s0; i < s1; i++) {
          const v = ch[i];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const y0 = mid - max * mid;
        const y1 = mid - min * mid;
        ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
      }
    }
    // 淡入淡出可视化
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    if (clip.fadeIn > 0) {
      const fw = clip.fadeIn * pxPerSec;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.min(fw, w), 0);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();
    }
    if (clip.fadeOut > 0) {
      const fw = clip.fadeOut * pxPerSec;
      ctx.beginPath();
      ctx.moveTo(w, 0);
      ctx.lineTo(Math.max(0, w - fw), 0);
      ctx.lineTo(w, height);
      ctx.closePath();
      ctx.fill();
    }
  }, [data, clip.offset, clip.duration, clip.fadeIn, clip.fadeOut, pxPerSec, width, height, selected]);

  const beginDrag = (e: React.PointerEvent, mode: 'move' | 'trim-l' | 'trim-r') => {
    e.stopPropagation();
    e.preventDefault();
    dispatch({ type: 'selectClip', id: clip.id });
    const startX = e.clientX;
    const orig = { ...clip };
    dispatch({ type: 'beginTx' });
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / pxPerSec;
      if (mode === 'move') {
        dispatch({ type: 'mutate', mutate: (p) => updateClip(p, clip.id, (c) => moveClip(c, orig.start + dx)) });
      } else if (mode === 'trim-l') {
        dispatch({
          type: 'mutate',
          mutate: (p) => updateClip(p, clip.id, (c) => trimClipStart(c, sourceDuration, orig.start + dx)),
        });
      } else {
        dispatch({
          type: 'mutate',
          mutate: (p) =>
            updateClip(p, clip.id, (c) => trimClipEnd(c, sourceDuration, orig.start + orig.duration + dx)),
        });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      dispatch({ type: 'endTx' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      className={`clip${selected ? ' selected' : ''}`}
      style={{ left: clip.start * pxPerSec, width, height }}
      onPointerDown={(e) => beginDrag(e, 'move')}
      title={`起点 ${clip.start.toFixed(2)}s · 时长 ${clip.duration.toFixed(2)}s`}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div className="clip-handle left" onPointerDown={(e) => beginDrag(e, 'trim-l')} />
      <div className="clip-handle right" onPointerDown={(e) => beginDrag(e, 'trim-r')} />
    </div>
  );
}
