import { describe, expect, it } from 'vitest';
import {
  audibleTracks,
  clampClip,
  MIN_CLIP,
  moveClip,
  projectEnd,
  splitAtTime,
  splitClip,
  trimClipEnd,
  trimClipStart,
} from '../model/ops';
import { Clip, Project } from '../model/types';

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: 'c1',
  sourceId: 's1',
  start: 2,
  offset: 1,
  duration: 4,
  fadeIn: 0,
  fadeOut: 0,
  ...over,
});

const projectWith = (tracks: Partial<Project['tracks'][number]>[]): Project => ({
  name: 'p',
  sources: [],
  tracks: tracks.map((t, i) => ({
    id: `t${i}`,
    name: `T${i}`,
    volume: 1,
    muted: false,
    solo: false,
    clips: [],
    ...t,
  })),
});

describe('时间计算:移动与裁剪', () => {
  it('移动不能到负时间', () => {
    expect(moveClip(clip({ start: 2 }), -5).start).toBe(0);
    expect(moveClip(clip({ start: 2 }), 3.5).start).toBe(3.5);
  });

  it('裁左边缘不能越过素材起点', () => {
    // offset=1,最多向左露出 1 秒
    const c = trimClipStart(clip({ start: 2, offset: 1, duration: 4 }), 10, 0);
    expect(c.start).toBe(1);
    expect(c.offset).toBe(0);
    expect(c.duration).toBe(5);
  });

  it('裁左边缘不能越过右边缘', () => {
    const c = trimClipStart(clip({ start: 2, offset: 1, duration: 4 }), 10, 100);
    expect(c.duration).toBeCloseTo(MIN_CLIP);
    expect(c.start + c.duration).toBeCloseTo(6);
  });

  it('裁右边缘不能越过素材末尾', () => {
    // 素材长 6,offset=1,最长 5 秒
    const c = trimClipEnd(clip({ start: 2, offset: 1, duration: 4 }), 6, 100);
    expect(c.duration).toBe(5);
    expect(c.offset + c.duration).toBe(6);
  });

  it('裁右边缘不能短于最小长度', () => {
    const c = trimClipEnd(clip({ start: 2, duration: 4 }), 6, 0);
    expect(c.duration).toBeCloseTo(MIN_CLIP);
  });

  it('clampClip 修正越界数据', () => {
    const c = clampClip(clip({ start: -1, offset: -2, duration: 100, fadeIn: 50, fadeOut: 60 }), 10);
    expect(c.start).toBe(0);
    expect(c.offset).toBe(0);
    expect(c.offset + c.duration).toBeLessThanOrEqual(10);
    expect(c.fadeIn + c.fadeOut).toBeLessThanOrEqual(c.duration + 1e-9);
  });
});

describe('时间计算:分割', () => {
  it('分割点两侧时长与偏移正确,外侧淡变保留', () => {
    const [a, b] = splitClip(clip({ start: 2, offset: 1, duration: 4, fadeIn: 0.5, fadeOut: 0.7 }), 4.5)!;
    expect(a.start).toBe(2);
    expect(a.duration).toBeCloseTo(2.5);
    expect(a.offset).toBe(1);
    expect(a.fadeIn).toBe(0.5);
    expect(a.fadeOut).toBe(0);
    expect(b.start).toBe(4.5);
    expect(b.offset).toBeCloseTo(3.5);
    expect(b.duration).toBeCloseTo(1.5);
    expect(b.fadeIn).toBe(0);
    expect(b.fadeOut).toBe(0.7);
  });

  it('分割后的片段仍能继续裁剪且不越界', () => {
    const [, b] = splitClip(clip({ start: 2, offset: 1, duration: 4 }), 4.5)!;
    // 后半段 offset=3.5,向左最多露出 3.5 秒
    const trimmed = trimClipStart(b, 6, 0);
    expect(trimmed.offset).toBe(0);
    expect(trimmed.start).toBeCloseTo(1);
    expect(trimmed.duration).toBeCloseTo(5);
  });

  it('分割点太靠近边缘时拒绝', () => {
    expect(splitClip(clip({ start: 2, duration: 4 }), 2.001)).toBeNull();
    expect(splitClip(clip({ start: 2, duration: 4 }), 5.999)).toBeNull();
    expect(splitClip(clip({ start: 2, duration: 4 }), 10)).toBeNull();
  });

  it('splitAtTime 只分割被命中的片段', () => {
    const p = projectWith([
      { clips: [clip({ id: 'a', start: 0, offset: 0, duration: 4 }), clip({ id: 'b', start: 5, offset: 0, duration: 2 })] },
    ]);
    const { project, changed } = splitAtTime(p, 2);
    expect(changed).toBe(true);
    expect(project.tracks[0].clips).toHaveLength(3);
    expect(project.tracks[0].clips.map((c) => c.id)).toEqual(['a', expect.any(String), 'b']);
  });
});

describe('轨道可听性与工程时长', () => {
  it('静音被排除,独奏时只有独奏轨出声', () => {
    const p = projectWith([{ id: 'a', muted: true }, { id: 'b' }, { id: 'c', solo: true }]);
    expect(audibleTracks(p).map((t) => t.id)).toEqual(['c']);
    const p2 = projectWith([{ id: 'a', muted: true }, { id: 'b' }, { id: 'c' }]);
    expect(audibleTracks(p2).map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('空轨道不拖长可听时长', () => {
    const p = projectWith([
      { clips: [clip({ start: 0, duration: 5 })] },
      { clips: [] },
      { clips: [clip({ start: 100, duration: 50 })], muted: true },
    ]);
    expect(projectEnd(p, true)).toBe(5);
    expect(projectEnd(p, false)).toBe(150);
  });
});
