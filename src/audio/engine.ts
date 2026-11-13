import { AudioData, Project } from '../model/types';
import { audibleTracks } from '../model/ops';
import { clipGainAt } from './mixdown';

/**
 * 试听引擎:Web Audio 实时播放。
 * 每条轨道一个常驻 GainNode,播放中改音量/静音/独奏立即生效;
 * 片段的淡入淡出在每次播放时用增益包络调度。
 */
export class PlaybackEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private trackGains = new Map<string, GainNode>();
  private active: AudioBufferSourceNode[] = [];
  private bufferCache = new Map<string, AudioBuffer>();
  private startCtxTime = 0;
  private startPos = 0;
  playing = false;

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private getAudioBuffer(id: string, data: AudioData): AudioBuffer {
    let buf = this.bufferCache.get(id);
    if (!buf) {
      const ctx = this.ensureCtx();
      const frames = data.channels[0]?.length ?? 1;
      buf = ctx.createBuffer(data.channels.length, Math.max(1, frames), data.sampleRate);
      data.channels.forEach((ch, i) => buf!.copyToChannel(new Float32Array(ch), i));
      this.bufferCache.set(id, buf);
    }
    return buf;
  }

  private getTrackGain(trackId: string): GainNode {
    let g = this.trackGains.get(trackId);
    if (!g) {
      g = this.ensureCtx().createGain();
      g.connect(this.master!);
      this.trackGains.set(trackId, g);
    }
    return g;
  }

  play(project: Project, buffers: Map<string, AudioData>, from: number): void {
    this.stopSources();
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    this.startCtxTime = now;
    this.startPos = Math.max(0, from);
    this.playing = true;

    const audible = new Set(audibleTracks(project).map((t) => t.id));
    for (const track of project.tracks) {
      const gain = this.getTrackGain(track.id);
      gain.gain.setTargetAtTime(audible.has(track.id) ? track.volume : 0, now, 0.01);
      if (!audible.has(track.id)) continue;
      for (const clip of track.clips) {
        const clipEnd = clip.start + clip.duration;
        if (clipEnd <= from) continue;
        const data = buffers.get(clip.sourceId);
        if (!data) continue;
        const src = ctx.createBufferSource();
        src.buffer = this.getAudioBuffer(clip.sourceId, data);
        const g = ctx.createGain();
        const t0 = now + Math.max(0, clip.start - from); // 片段起点对应的 ctx 时间
        const t1 = now + (clipEnd - from); // 片段终点对应的 ctx 时间
        const startGain = clipGainAt(clip, Math.max(0, from - clip.start));
        g.gain.setValueAtTime(Math.max(0.0001, startGain), Math.max(now, t0));
        if (clip.fadeIn > 0 && t0 + clip.fadeIn > now) {
          g.gain.linearRampToValueAtTime(1, t0 + clip.fadeIn);
        }
        if (clip.fadeOut > 0) {
          const fStart = t1 - clip.fadeOut;
          if (fStart > now) g.gain.setValueAtTime(1, fStart);
          g.gain.linearRampToValueAtTime(0.0001, Math.max(t1, now + 0.001));
        }
        src.connect(g);
        g.connect(gain);
        const offset = clip.offset + Math.max(0, from - clip.start);
        const dur = clip.duration - Math.max(0, from - clip.start);
        src.start(Math.max(now, t0), offset, Math.max(0.001, dur));
        this.active.push(src);
      }
    }
  }

  /** 播放中实时更新轨道音量/静音/独奏 */
  updateMixer(project: Project): void {
    if (!this.ctx) return;
    const audible = new Set(audibleTracks(project).map((t) => t.id));
    const now = this.ctx.currentTime;
    for (const track of project.tracks) {
      const g = this.trackGains.get(track.id);
      if (g) g.gain.setTargetAtTime(audible.has(track.id) ? track.volume : 0, now, 0.01);
    }
  }

  position(): number {
    if (!this.playing || !this.ctx) return this.startPos;
    return this.startPos + (this.ctx.currentTime - this.startCtxTime);
  }

  /** 暂停:停掉所有声源并返回当前位置,可继续播放 */
  pause(): number {
    const pos = this.position();
    this.stopSources();
    this.startPos = pos;
    return pos;
  }

  /** 停止:回到 0,不留下任何还在响的声音 */
  stop(): void {
    this.stopSources();
    this.startPos = 0;
  }

  /** 换工程时调用:停声并清空缓存 */
  reset(): void {
    this.stopSources();
    this.bufferCache.clear();
    this.trackGains.forEach((g) => {
      try {
        g.disconnect();
      } catch {
        /* ignore */
      }
    });
    this.trackGains.clear();
  }

  private stopSources(): void {
    for (const s of this.active) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* already stopped */
      }
      try {
        s.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.active = [];
    this.playing = false;
  }
}

export const engine = new PlaybackEngine();
