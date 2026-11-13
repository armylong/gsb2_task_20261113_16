import { AudioData, Project } from '../model/types';
import { audibleTracks } from '../model/ops';

export interface MixOptions {
  /** 时间线起点(秒) */
  start: number;
  /** 时间线终点(秒) */
  end: number;
  sampleRate: number;
}

/** 片段包络增益:线性淡入淡出 */
export function clipGainAt(
  clip: { duration: number; fadeIn: number; fadeOut: number },
  local: number,
): number {
  let g = 1;
  if (clip.fadeIn > 0 && local < clip.fadeIn) g *= Math.max(0, local / clip.fadeIn);
  const remain = clip.duration - local;
  if (clip.fadeOut > 0 && remain < clip.fadeOut) g *= Math.max(0, remain / clip.fadeOut);
  return g;
}

/**
 * 把工程在 [start, end) 范围内的声音混成立体声浮点缓冲。
 * 与试听引擎使用同一套规则:轨道音量/静音/独奏、片段淡入淡出、
 * 同轨重叠片段直接相加;范围之外的声音不会混入。
 * 源采样率与目标不同时做线性插值重采样。
 */
export function renderRange(
  project: Project,
  buffers: Map<string, AudioData>,
  opts: MixOptions,
  out?: [Float32Array, Float32Array],
  outOffset = 0,
): [Float32Array, Float32Array] {
  const { start, end, sampleRate } = opts;
  const n = Math.max(0, Math.round((end - start) * sampleRate));
  const left = out ? out[0] : new Float32Array(n);
  const right = out ? out[1] : new Float32Array(n);

  for (const track of audibleTracks(project)) {
    for (const clip of track.clips) {
      const clipEnd = clip.start + clip.duration;
      const s = Math.max(clip.start, start);
      const e = Math.min(clipEnd, end);
      if (e <= s) continue;
      const data = buffers.get(clip.sourceId);
      if (!data || data.channels.length === 0) continue;
      const numCh = data.channels.length;
      const i0 = Math.max(0, Math.round((s - start) * sampleRate));
      const i1 = Math.min(n, Math.round((e - start) * sampleRate));

      for (let i = i0; i < i1; i++) {
        const t = start + i / sampleRate;
        const local = t - clip.start;
        const srcT = clip.offset + local;
        const g = clipGainAt(clip, local) * track.volume;
        if (g === 0) continue;
        const pos = srcT * data.sampleRate;
        const idx = Math.floor(pos);
        const frac = pos - idx;
        const dst = outOffset + i;
        for (let c = 0; c < Math.min(numCh, 2); c++) {
          const chData = data.channels[c];
          if (idx < 0 || idx >= chData.length) continue;
          const a = chData[idx];
          const b = chData[Math.min(idx + 1, chData.length - 1)];
          const v = (a + (b - a) * frac) * g;
          if (numCh === 1) {
            left[dst] += v;
            right[dst] += v;
          } else if (c === 0) {
            left[dst] += v;
          } else {
            right[dst] += v;
          }
        }
      }
    }
  }
  return [left, right];
}

/** 分块渲染,块间让出事件循环并汇报进度 */
export async function renderMixdown(
  project: Project,
  buffers: Map<string, AudioData>,
  opts: MixOptions,
  onProgress?: (p: number) => void,
): Promise<[Float32Array, Float32Array]> {
  const n = Math.max(0, Math.round((opts.end - opts.start) * opts.sampleRate));
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  const chunk = Math.max(1, Math.round(opts.sampleRate * 0.25));
  for (let done = 0; done < n; done += chunk) {
    const s = opts.start + done / opts.sampleRate;
    const e = opts.start + Math.min(n, done + chunk) / opts.sampleRate;
    renderRange(project, buffers, { start: s, end: e, sampleRate: opts.sampleRate }, out, done);
    onProgress?.(Math.min(1, (done + chunk) / n));
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}
