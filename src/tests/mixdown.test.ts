import { describe, expect, it } from 'vitest';
import { clipGainAt, renderRange } from '../audio/mixdown';
import { audibleRange, hasAudibleContent } from '../audio/exporter';
import { AudioData, Clip, Project, Track } from '../model/types';

const SR = 100; // 用 100Hz 采样率让断言直观

/** 常量素材:每个采样都是 value */
const constSource = (value: number, seconds: number): AudioData => ({
  sampleRate: SR,
  channels: [new Float32Array(seconds * SR).fill(value)],
  duration: seconds,
});

const makeProject = (tracks: Partial<Track>[], clipsPerTrack: Clip[][]): Project => ({
  name: 'p',
  sources: [{ id: 's1', name: 's', duration: 100, sampleRate: SR, channels: 1 }],
  tracks: tracks.map((t, i) => ({
    id: `t${i}`,
    name: `T${i}`,
    volume: 1,
    muted: false,
    solo: false,
    ...t,
    clips: clipsPerTrack[i],
  })),
});

const clip = (over: Partial<Clip>): Clip => ({
  id: Math.random().toString(36).slice(2),
  sourceId: 's1',
  start: 0,
  offset: 0,
  duration: 1,
  fadeIn: 0,
  fadeOut: 0,
  ...over,
});

describe('混音渲染', () => {
  it('单片段按轨道音量渲染', () => {
    const p = makeProject([{ volume: 0.5 }], [[clip({ start: 0, duration: 1 })]]);
    const buffers = new Map([['s1', constSource(0.8, 10)]]);
    const [l, r] = renderRange(p, buffers, { start: 0, end: 1, sampleRate: SR });
    expect(l.length).toBe(100);
    expect(l[50]).toBeCloseTo(0.4, 5);
    expect(r[50]).toBeCloseTo(0.4, 5);
  });

  it('范围外的声音不会混入', () => {
    const p = makeProject([{}], [[clip({ start: 0, duration: 2 })]]);
    const buffers = new Map([['s1', constSource(1, 10)]]);
    const [l] = renderRange(p, buffers, { start: 3, end: 4, sampleRate: SR });
    expect(l.every((v) => v === 0)).toBe(true);
  });

  it('选区只截取片段落在范围内的部分', () => {
    const p = makeProject([{}], [[clip({ start: 1, duration: 2 })]]);
    const buffers = new Map([['s1', constSource(1, 10)]]);
    const [l] = renderRange(p, buffers, { start: 0, end: 4, sampleRate: SR });
    expect(l[50]).toBe(0); // 0.5s,片段还没开始
    expect(l[150]).toBeCloseTo(1, 5); // 1.5s,片段内
    expect(l[350]).toBe(0); // 3.5s,片段已结束
  });

  it('offset 决定从素材的哪里开始读', () => {
    const data: AudioData = {
      sampleRate: SR,
      channels: [Float32Array.from({ length: 10 * SR }, (_, i) => i / (10 * SR))],
      duration: 10,
    };
    const p = makeProject([{}], [[clip({ start: 0, offset: 5, duration: 1 })]]);
    const [l] = renderRange(p, new Map([['s1', data]]), { start: 0, end: 1, sampleRate: SR });
    expect(l[0]).toBeCloseTo(0.5, 2);
    expect(l[99]).toBeCloseTo(0.599, 2);
  });

  it('同轨重叠片段声音叠加', () => {
    const p = makeProject([{}], [[clip({ start: 0, duration: 2 }), clip({ start: 1, duration: 2 })]]);
    const buffers = new Map([['s1', constSource(0.4, 10)]]);
    const [l] = renderRange(p, buffers, { start: 0, end: 3, sampleRate: SR });
    expect(l[50]).toBeCloseTo(0.4, 5); // 只有第一段
    expect(l[150]).toBeCloseTo(0.8, 5); // 重叠区相加
    expect(l[250]).toBeCloseTo(0.4, 5); // 只有第二段
  });

  it('静音轨不出声,独奏时只有独奏轨出声', () => {
    const buffers = new Map([['s1', constSource(1, 10)]]);
    const muted = makeProject([{ muted: true }], [[clip({ start: 0, duration: 1 })]]);
    expect(renderRange(muted, buffers, { start: 0, end: 1, sampleRate: SR })[0][50]).toBe(0);

    const solo = makeProject(
      [{}, { solo: true }],
      [
        [clip({ start: 0, duration: 1 })],
        [clip({ start: 0, duration: 1 })],
      ],
    );
    const [l] = renderRange(solo, buffers, { start: 0, end: 1, sampleRate: SR });
    expect(l[50]).toBeCloseTo(1, 5); // 只有独奏轨,不是 2
  });

  it('线性淡入淡出', () => {
    expect(clipGainAt({ duration: 2, fadeIn: 1, fadeOut: 1 }, 0)).toBe(0);
    expect(clipGainAt({ duration: 2, fadeIn: 1, fadeOut: 1 }, 0.5)).toBeCloseTo(0.5);
    expect(clipGainAt({ duration: 2, fadeIn: 1, fadeOut: 1 }, 1)).toBe(1);
    expect(clipGainAt({ duration: 2, fadeIn: 1, fadeOut: 1 }, 1.5)).toBeCloseTo(0.5);
    expect(clipGainAt({ duration: 2, fadeIn: 1, fadeOut: 1 }, 2)).toBe(0);

    const p = makeProject([{}], [[clip({ start: 0, duration: 2, fadeIn: 2 })]]);
    const buffers = new Map([['s1', constSource(1, 10)]]);
    const [l] = renderRange(p, buffers, { start: 0, end: 2, sampleRate: SR });
    expect(l[0]).toBeCloseTo(0, 5);
    expect(l[100]).toBeCloseTo(0.5, 1); // 中点增益约 0.5
  });

  it('重采样:48k 素材导出到 44.1k 长度正确', () => {
    const data: AudioData = {
      sampleRate: 48000,
      channels: [new Float32Array(48000).fill(0.5)],
      duration: 1,
    };
    const p = makeProject([{}], [[clip({ start: 0, duration: 1 })]]);
    const [l] = renderRange(p, new Map([['s1', data]]), { start: 0, end: 1, sampleRate: 44100 });
    expect(l.length).toBe(44100);
    expect(l[22050]).toBeCloseTo(0.5, 5);
  });
});

describe('导出范围', () => {
  it('空轨道与静音轨不拖长导出时长', () => {
    const p = makeProject(
      [{}, {}, { muted: true }],
      [
        [clip({ start: 0, duration: 3 })],
        [],
        [clip({ start: 50, duration: 10 })],
      ],
    );
    expect(audibleRange(p)).toEqual({ start: 0, end: 3 });
  });

  it('空工程没有可导出内容', () => {
    const p = makeProject([{}], [[]]);
    expect(audibleRange(p)).toBeNull();
    expect(hasAudibleContent(p, { start: 0, end: 10 })).toBe(false);
  });

  it('选区与片段不相交时判定为无内容', () => {
    const p = makeProject([{}], [[clip({ start: 0, duration: 1 })]]);
    expect(hasAudibleContent(p, { start: 5, end: 6 })).toBe(false);
    expect(hasAudibleContent(p, { start: 0.5, end: 2 })).toBe(true);
  });
});
