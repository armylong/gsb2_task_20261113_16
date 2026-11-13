import { AudioData, Project } from '../model/types';
import { uid } from '../model/ops';

/** 生成一段类似人声的素材:一串带包络的"词",基频在 110~190Hz 之间变化 */
function makeVoice(sr: number): Float32Array {
  const dur = 12;
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let t = 0.3;
  while (t < dur - 0.4) {
    const wordLen = 0.18 + rand() * 0.35;
    const f0 = 110 + rand() * 80;
    const start = Math.floor(t * sr);
    const len = Math.floor(wordLen * sr);
    for (let i = 0; i < len && start + i < n; i++) {
      const tt = i / sr;
      const env = Math.sin((Math.PI * i) / len);
      const vibr = 1 + 0.02 * Math.sin(2 * Math.PI * 5 * tt);
      out[start + i] +=
        env *
        0.35 *
        (Math.sin(2 * Math.PI * f0 * vibr * tt) * 0.6 +
          Math.sin(2 * Math.PI * f0 * 2 * vibr * tt) * 0.25 +
          Math.sin(2 * Math.PI * f0 * 3 * vibr * tt) * 0.15);
    }
    t += wordLen + 0.08 + rand() * 0.25;
  }
  return out;
}

/** 生成一段配乐素材:和弦垫 + 低音,带缓慢的呼吸感 */
function makeMusic(sr: number): Float32Array {
  const dur = 16;
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  const chords = [
    [220, 277.18, 329.63],
    [196, 246.94, 293.66],
    [174.61, 220, 261.63],
    [196, 246.94, 293.66],
  ];
  const chordLen = 4;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const chord = chords[Math.floor(t / chordLen) % chords.length];
    let v = 0;
    for (const f of chord) v += Math.sin(2 * Math.PI * f * t) * 0.12;
    v += Math.sin(2 * Math.PI * (chord[0] / 2) * t) * 0.15;
    v *= 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.5 * t);
    out[i] = v * 0.5;
  }
  return out;
}

/**
 * 内置演示工程:两条内容不同的音轨(人声 + 配乐),片段在时间上有重叠。
 * 音频完全在本地用算法生成,不依赖任何外部文件。
 */
export function buildDemoProject(): { project: Project; buffers: Map<string, AudioData> } {
  const sr = 44100;
  const voice: AudioData = { sampleRate: sr, channels: [makeVoice(sr)], duration: 12 };
  const music: AudioData = { sampleRate: sr, channels: [makeMusic(sr)], duration: 16 };
  const voiceId = uid('src');
  const musicId = uid('src');
  const project: Project = {
    name: '演示工程',
    sources: [
      { id: voiceId, name: '人声素材(生成)', duration: 12, sampleRate: sr, channels: 1 },
      { id: musicId, name: '配乐素材(生成)', duration: 16, sampleRate: sr, channels: 1 },
    ],
    tracks: [
      {
        id: uid('trk'),
        name: '人声',
        volume: 1,
        muted: false,
        solo: false,
        clips: [
          { id: uid('clip'), sourceId: voiceId, start: 0, offset: 0, duration: 8, fadeIn: 0, fadeOut: 0.5 },
          { id: uid('clip'), sourceId: voiceId, start: 9.5, offset: 8, duration: 4, fadeIn: 0.3, fadeOut: 0 },
        ],
      },
      {
        id: uid('trk'),
        name: '配乐',
        volume: 0.6,
        muted: false,
        solo: false,
        clips: [
          { id: uid('clip'), sourceId: musicId, start: 1.5, offset: 0, duration: 13, fadeIn: 1.5, fadeOut: 2 },
        ],
      },
    ],
  };
  const buffers = new Map<string, AudioData>([
    [voiceId, voice],
    [musicId, music],
  ]);
  return { project, buffers };
}
