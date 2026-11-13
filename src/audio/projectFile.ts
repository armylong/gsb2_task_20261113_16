import { AudioData, Project, SourceMeta } from '../model/types';
import { floatToPcm16 } from './wav';

const MAGIC = 'PODPROJ1';
const VERSION = 1;

interface FileSource extends SourceMeta {
  frames: number;
  dataOffset: number;
  dataLength: number;
}

/**
 * 工程文件格式(单文件,音频素材内嵌):
 *   8 字节  magic "PODPROJ1"
 *   4 字节  JSON 长度 (LE)
 *   N 字节  JSON: { version, name, tracks, sources:[{...meta, frames, dataOffset, dataLength}] }
 *   其余    每个素材的 16-bit PCM,按声道依次存放
 */
export function serializeProject(project: Project, buffers: Map<string, AudioData>): ArrayBuffer {
  const sources: FileSource[] = [];
  const chunks: ArrayBuffer[] = [];
  let offset = 0;
  for (const meta of project.sources) {
    const data = buffers.get(meta.id);
    if (!data) throw new Error(`缺少音频素材:${meta.name}`);
    const frames = data.channels[0]?.length ?? 0;
    let len = 0;
    for (const ch of data.channels) {
      const buf = new ArrayBuffer(ch.length * 2);
      const view = new DataView(buf);
      for (let i = 0; i < ch.length; i++) view.setInt16(i * 2, floatToPcm16(ch[i]), true);
      chunks.push(buf);
      len += buf.byteLength;
    }
    sources.push({ ...meta, frames, dataOffset: offset, dataLength: len });
    offset += len;
  }
  const json = JSON.stringify({ version: VERSION, name: project.name, tracks: project.tracks, sources });
  const jsonBytes = new TextEncoder().encode(json);
  const out = new ArrayBuffer(12 + jsonBytes.length + offset);
  const view = new DataView(out);
  const u8 = new Uint8Array(out);
  for (let i = 0; i < 8; i++) view.setUint8(i, MAGIC.charCodeAt(i));
  view.setUint32(8, jsonBytes.length, true);
  u8.set(jsonBytes, 12);
  let p = 12 + jsonBytes.length;
  for (const c of chunks) {
    u8.set(new Uint8Array(c), p);
    p += c.byteLength;
  }
  return out;
}

export function deserializeProject(buf: ArrayBuffer): { project: Project; buffers: Map<string, AudioData> } {
  if (buf.byteLength < 12) throw new Error('文件太小,不是有效的工程文件');
  const view = new DataView(buf);
  let magic = '';
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(view.getUint8(i));
  if (magic !== MAGIC) throw new Error('无法识别的文件格式(不是本工具的工程文件)');
  const jsonLen = view.getUint32(8, true);
  if (jsonLen <= 0 || 12 + jsonLen > buf.byteLength) throw new Error('工程文件已损坏(头部不完整)');
  let json: { version?: number; name?: string; tracks?: Project['tracks']; sources?: FileSource[] };
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, jsonLen)));
  } catch {
    throw new Error('工程文件已损坏(无法解析工程数据)');
  }
  if (!json || !Array.isArray(json.tracks) || !Array.isArray(json.sources)) {
    throw new Error('工程文件内容无效');
  }
  if (json.version !== VERSION) throw new Error(`不支持的工程版本:${json.version}`);
  for (const t of json.tracks) {
    if (!t || typeof t.id !== 'string' || !Array.isArray(t.clips)) {
      throw new Error('工程文件内容无效(轨道数据不完整)');
    }
  }

  const buffers = new Map<string, AudioData>();
  const audioBase = 12 + jsonLen;
  const sources: SourceMeta[] = [];
  for (const s of json.sources) {
    if (audioBase + s.dataOffset + s.dataLength > buf.byteLength) {
      throw new Error(`工程文件已损坏(素材 ${s.name} 的音频数据不完整)`);
    }
    const channels: Float32Array[] = [];
    let p = audioBase + s.dataOffset;
    for (let c = 0; c < s.channels; c++) {
      const ch = new Float32Array(s.frames);
      for (let i = 0; i < s.frames; i++) ch[i] = view.getInt16(p + i * 2, true) / 0x8000;
      p += s.frames * 2;
      channels.push(ch);
    }
    const meta: SourceMeta = {
      id: s.id,
      name: s.name,
      duration: s.duration,
      sampleRate: s.sampleRate,
      channels: s.channels,
    };
    sources.push(meta);
    buffers.set(meta.id, { sampleRate: s.sampleRate, channels, duration: s.duration });
  }
  return { project: { name: json.name ?? '未命名工程', tracks: json.tracks, sources }, buffers };
}
