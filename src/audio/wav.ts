/**
 * 把浮点采样编码为 16-bit PCM。
 * 先钳制到 [-1, 1] 再缩放,超幅不会整数溢出翻转成爆音。
 */
export function floatToPcm16(x: number): number {
  const c = Math.max(-1, Math.min(1, x));
  return c < 0 ? Math.round(c * 0x8000) : Math.round(c * 0x7fff);
}

function writeString(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

/** 把多声道浮点音频编码为标准 16-bit PCM WAV */
export function encodeWavPCM16(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numChannels = channels.length;
  const frames = channels.length > 0 ? channels[0].length : 0;
  const dataSize = frames * numChannels * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
  view.setUint16(32, numChannels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numChannels; c++) {
      view.setInt16(offset, floatToPcm16(channels[c][i]), true);
      offset += 2;
    }
  }
  return buffer;
}
