import { Clip, Project, Track } from './types';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 片段允许的最短时长(秒) */
export const MIN_CLIP = 0.01;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** 把片段约束回合法范围:不越过素材边界、不出现负时间、淡入淡出不超出片段长度 */
export function clampClip(clip: Clip, sourceDuration: number): Clip {
  const offset = clamp(clip.offset, 0, Math.max(0, sourceDuration - MIN_CLIP));
  const duration = clamp(clip.duration, MIN_CLIP, Math.max(MIN_CLIP, sourceDuration - offset));
  const start = Math.max(0, clip.start);
  const fadeIn = clamp(clip.fadeIn, 0, duration);
  const fadeOut = clamp(clip.fadeOut, 0, duration - fadeIn);
  return { ...clip, start, offset, duration, fadeIn, fadeOut };
}

/** 移动片段(不允许负时间) */
export function moveClip(clip: Clip, newStart: number): Clip {
  return { ...clip, start: Math.max(0, newStart) };
}

/** 拖动片段左边缘:newStart 为左边缘的新时间线位置 */
export function trimClipStart(clip: Clip, sourceDuration: number, newStart: number): Clip {
  const delta = clamp(newStart - clip.start, -clip.offset, clip.duration - MIN_CLIP);
  return {
    ...clip,
    start: clip.start + delta,
    offset: clip.offset + delta,
    duration: clip.duration - delta,
  };
}

/** 拖动片段右边缘:newEnd 为右边缘的新时间线位置 */
export function trimClipEnd(clip: Clip, sourceDuration: number, newEnd: number): Clip {
  const maxDur = Math.max(MIN_CLIP, sourceDuration - clip.offset);
  const duration = clamp(newEnd - clip.start, MIN_CLIP, maxDur);
  return { ...clip, duration };
}

/**
 * 在 at(时间线时间)处分割片段。
 * 外侧淡入淡出保留:前半保留 fadeIn,后半保留 fadeOut。
 * 分割点太靠近边缘时返回 null。
 */
export function splitClip(clip: Clip, at: number): [Clip, Clip] | null {
  const local = at - clip.start;
  if (local < MIN_CLIP || clip.duration - local < MIN_CLIP) return null;
  const first: Clip = { ...clip, duration: local, fadeOut: 0 };
  const second: Clip = {
    ...clip,
    id: uid('clip'),
    start: at,
    offset: clip.offset + local,
    duration: clip.duration - local,
    fadeIn: 0,
  };
  return [first, second];
}

/** 有轨道独奏时只出声独奏(且未静音)的轨道,否则出声所有未静音轨道 */
export function audibleTracks(project: Project): Track[] {
  const anySolo = project.tracks.some((t) => t.solo);
  return project.tracks.filter((t) => !t.muted && (!anySolo || t.solo));
}

/** 工程末端时间;audibleOnly 时只统计会出声的轨道(空轨道/静音轨道不拖长时间) */
export function projectEnd(project: Project, audibleOnly = false): number {
  const tracks = audibleOnly ? audibleTracks(project) : project.tracks;
  let end = 0;
  for (const t of tracks) {
    for (const c of t.clips) end = Math.max(end, c.start + c.duration);
  }
  return end;
}

export function updateTrack(project: Project, trackId: string, fn: (t: Track) => Track): Project {
  return {
    ...project,
    tracks: project.tracks.map((t) => (t.id === trackId ? fn(t) : t)),
  };
}

export function updateClip(project: Project, clipId: string, fn: (c: Clip) => Clip): Project {
  return {
    ...project,
    tracks: project.tracks.map((t) =>
      t.clips.some((c) => c.id === clipId)
        ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? fn(c) : c)) }
        : t,
    ),
  };
}

export function removeClip(project: Project, clipId: string): Project {
  return {
    ...project,
    tracks: project.tracks.map((t) =>
      t.clips.some((c) => c.id === clipId)
        ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
        : t,
    ),
  };
}

export function addClipToTrack(project: Project, trackId: string, clip: Clip): Project {
  return updateTrack(project, trackId, (t) => ({ ...t, clips: [...t.clips, clip] }));
}

/** 在 time 处分割所有被命中的片段,返回新工程与是否有变化 */
export function splitAtTime(project: Project, time: number): { project: Project; changed: boolean } {
  let changed = false;
  const tracks = project.tracks.map((t) => {
    const clips: Clip[] = [];
    for (const c of t.clips) {
      const parts = splitClip(c, time);
      if (parts) {
        changed = true;
        clips.push(parts[0], parts[1]);
      } else {
        clips.push(c);
      }
    }
    return { ...t, clips };
  });
  return { project: changed ? { ...project, tracks } : project, changed };
}

export function findClip(project: Project, clipId: string): { track: Track; clip: Clip } | null {
  for (const t of project.tracks) {
    const c = t.clips.find((c) => c.id === clipId);
    if (c) return { track: t, clip: c };
  }
  return null;
}
