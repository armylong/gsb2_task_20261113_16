/** 时间线上的一个片段。所有时间单位均为秒。 */
export interface Clip {
  id: string;
  /** 引用的素材 id(对应 Project.sources 与音频缓冲) */
  sourceId: string;
  /** 片段在时间线上的起点 */
  start: number;
  /** 片段内容在素材内的起始偏移 */
  offset: number;
  /** 片段在时间线上的长度 */
  duration: number;
  /** 淡入时长(秒) */
  fadeIn: number;
  /** 淡出时长(秒) */
  fadeOut: number;
}

export interface Track {
  id: string;
  name: string;
  /** 线性增益,1 为原始音量 */
  volume: number;
  muted: boolean;
  solo: boolean;
  clips: Clip[];
}

export interface SourceMeta {
  id: string;
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
}

export interface Project {
  name: string;
  tracks: Track[];
  sources: SourceMeta[];
}

/** 解码后的音频数据(与 AudioBuffer 解耦,便于测试与序列化) */
export interface AudioData {
  sampleRate: number;
  channels: Float32Array[];
  duration: number;
}

export interface TimeRange {
  start: number;
  end: number;
}
