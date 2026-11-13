import { describe, expect, it } from 'vitest';
import { encodeWavPCM16, floatToPcm16 } from '../audio/wav';

describe('WAV 编码', () => {
  it('文件头字段正确', () => {
    const left = new Float32Array(100);
    const right = new Float32Array(100);
    const buf = encodeWavPCM16([left, right], 48000);
    const v = new DataView(buf);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(36 + 100 * 2 * 2);
    expect(String.fromCharCode(v.getUint8(8), v.getUint8(9), v.getUint8(10), v.getUint8(11))).toBe('WAVE');
    expect(v.getUint16(22, true)).toBe(2); // 双声道
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(400);
    expect(buf.byteLength).toBe(44 + 400);
  });

  it('采样值按 16-bit PCM 编码', () => {
    const buf = encodeWavPCM16([new Float32Array([0, 0.5, -0.5, 1, -1])], 44100);
    const v = new DataView(buf);
    expect(v.getInt16(44, true)).toBe(0);
    expect(v.getInt16(46, true)).toBe(Math.round(0.5 * 0x7fff));
    expect(v.getInt16(48, true)).toBe(Math.round(-0.5 * 0x8000));
    expect(v.getInt16(50, true)).toBe(0x7fff);
    expect(v.getInt16(52, true)).toBe(-0x8000);
  });

  it('超幅被钳制,不会整数溢出翻转成爆音', () => {
    expect(floatToPcm16(1.5)).toBe(0x7fff);
    expect(floatToPcm16(-1.5)).toBe(-0x8000);
    expect(floatToPcm16(100)).toBe(0x7fff);
    expect(floatToPcm16(-100)).toBe(-0x8000);
    const buf = encodeWavPCM16([new Float32Array([2.0, -2.0])], 44100);
    const v = new DataView(buf);
    expect(v.getInt16(44, true)).toBe(0x7fff);
    expect(v.getInt16(46, true)).toBe(-0x8000);
  });
});
