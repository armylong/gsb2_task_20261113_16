import { AudioData, Project, TimeRange } from '../model/types';
import { audibleTracks } from '../model/ops';
import { renderMixdown } from './mixdown';
import { encodeWavPCM16 } from './wav';

/** 整个工程的可导出范围:只统计会出声的轨道,空轨道不拖长时长 */
export function audibleRange(project: Project): TimeRange | null {
  let end = 0;
  for (const t of audibleTracks(project)) {
    for (const c of t.clips) end = Math.max(end, c.start + c.duration);
  }
  return end > 0 ? { start: 0, end } : null;
}

/** 范围内是否有会出声的内容 */
export function hasAudibleContent(project: Project, range: TimeRange): boolean {
  return audibleTracks(project).some((t) =>
    t.clips.some((c) => c.start + c.duration > range.start && c.start < range.end),
  );
}

/**
 * 导出为双声道 16-bit WAV。
 * 渲染规则与试听一致(轨道音量/静音/独奏、淡入淡出、重叠叠加);
 * 范围外的声音不会混入;超幅在编码时钳制,不会整数溢出爆音。
 */
export async function exportWav(
  project: Project,
  buffers: Map<string, AudioData>,
  range: TimeRange,
  sampleRate: number,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  if (!(range.end > range.start)) throw new Error('导出范围为空');
  if (!hasAudibleContent(project, range)) throw new Error('所选范围内没有可导出的音频');
  const [left, right] = await renderMixdown(
    project,
    buffers,
    { start: range.start, end: range.end, sampleRate },
    onProgress,
  );
  const buf = encodeWavPCM16([left, right], sampleRate);
  return new Blob([buf], { type: 'audio/wav' });
}
