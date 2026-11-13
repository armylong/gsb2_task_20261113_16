import { AudioData } from '../model/types';

/** 解码本地音频文件为浮点声道数据,全部在浏览器内完成,不上传 */
export async function decodeAudioFile(file: File): Promise<AudioData> {
  const ctx = new AudioContext();
  try {
    const raw = await file.arrayBuffer();
    const buf = await ctx.decodeAudioData(raw);
    const channels: Float32Array[] = [];
    for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c).slice());
    return { sampleRate: buf.sampleRate, channels, duration: buf.duration };
  } finally {
    void ctx.close();
  }
}
