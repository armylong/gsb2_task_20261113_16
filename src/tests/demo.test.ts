import { describe, expect, it } from 'vitest';
import { buildDemoProject } from '../audio/demo';
import { deserializeProject, serializeProject } from '../audio/projectFile';
import { renderMixdown } from '../audio/mixdown';
import { audibleRange } from '../audio/exporter';
import { encodeWavPCM16 } from '../audio/wav';

describe('演示工程全流程', () => {
  it('演示工程有两条不同轨道且片段重叠', () => {
    const { project } = buildDemoProject();
    expect(project.tracks.length).toBeGreaterThanOrEqual(2);
    expect(project.tracks[0].clips[0].sourceId).not.toBe(project.tracks[1].clips[0].sourceId);
    const intervals = project.tracks.flatMap((t) => t.clips.map((c) => [c.start, c.start + c.duration]));
    const overlap = intervals.some((a, i) => intervals.some((b, j) => i !== j && a[0] < b[1] && b[0] < a[1]));
    expect(overlap).toBe(true);
  });

  it('保存→重新打开后工程状态与音频完全恢复', () => {
    const { project, buffers } = buildDemoProject();
    const buf = serializeProject(project, buffers);
    const back = deserializeProject(buf);
    expect(back.project).toEqual(project);
    for (const s of project.sources) {
      const orig = buffers.get(s.id)!;
      const restored = back.buffers.get(s.id)!;
      expect(restored.sampleRate).toBe(orig.sampleRate);
      expect(restored.channels.length).toBe(orig.channels.length);
      expect(restored.channels[0].length).toBe(orig.channels[0].length);
      // 16-bit 量化误差在 1/32768 以内
      for (let i = 0; i < orig.channels[0].length; i += 997) {
        expect(Math.abs(restored.channels[0][i] - orig.channels[0][i])).toBeLessThan(1 / 32768 + 1e-6);
      }
    }
  });

  it('损坏或不支持的文件会报错而不是崩溃', () => {
    expect(() => deserializeProject(new ArrayBuffer(4))).toThrow();
    expect(() => deserializeProject(new TextEncoder().encode('not a project at all........').buffer as ArrayBuffer)).toThrow();
    const { project, buffers } = buildDemoProject();
    const good = serializeProject(project, buffers);
    const truncated = good.slice(0, 100);
    expect(() => deserializeProject(truncated)).toThrow();
  });

  it('演示工程可以完整混音并编码为 WAV', async () => {
    const { project, buffers } = buildDemoProject();
    const range = audibleRange(project)!;
    expect(range.end).toBeGreaterThan(10);
    const progresses: number[] = [];
    const [l, r] = await renderMixdown(
      project,
      buffers,
      { start: range.start, end: range.end, sampleRate: 44100 },
      (p) => progresses.push(p),
    );
    expect(l.length).toBe(Math.round(range.end * 44100));
    expect(r.length).toBe(l.length);
    expect(progresses[progresses.length - 1]).toBe(1);
    // 有实际声音
    let peak = 0;
    for (let i = 0; i < l.length; i += 101) peak = Math.max(peak, Math.abs(l[i]));
    expect(peak).toBeGreaterThan(0.01);
    const wav = encodeWavPCM16([l, r], 44100);
    expect(wav.byteLength).toBe(44 + l.length * 4);
  }, 30000);
});
