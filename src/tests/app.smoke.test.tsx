// @vitest-environment jsdom
/**
 * UI 冒烟测试:真实渲染 App,走通
 * 加载演示工程 → 选中/删除片段 → 撤销 → 保存工程 → 重新解析 → 导出 WAV
 * 这条完整链路。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import App from '../App';
import { deserializeProject } from '../audio/projectFile';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const blobs: Blob[] = [];

beforeAll(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (b: Blob) => {
      blobs.push(b);
      return 'blob:mock';
    },
    revokeObjectURL: () => undefined,
  });
  // jsdom 不实现导航,拦掉 a.click()
  HTMLAnchorElement.prototype.click = () => undefined;
});

let root: Root | null = null;
let container: HTMLDivElement;

function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<App />));
}

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

const buttonByText = (text: string): HTMLButtonElement => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  if (!btn) throw new Error(`button not found: ${text}`);
  return btn;
};

async function waitFor(fn: () => boolean, what: string, timeout = 10000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error(`timeout waiting for: ${what}`);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

async function blobBytes(b: Blob): Promise<ArrayBuffer> {
  if (typeof b.arrayBuffer === 'function') return b.arrayBuffer();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = reject;
    fr.readAsArrayBuffer(b);
  });
}

describe('UI 冒烟:演示工程 → 剪辑 → 保存/重开 → 导出', () => {
  it('完整流程可以走通', async () => {
    render();

    // 1. 加载演示工程
    click(buttonByText('演示工程'));
    const clips = () => document.querySelectorAll('.clip');
    expect(clips().length).toBe(3); // 人声 2 段 + 配乐 1 段
    expect(document.querySelectorAll('.track-header').length).toBe(2);

    // 2. 选中一个片段并删除(一次可撤销的操作)
    const firstClip = clips()[0];
    act(() => {
      firstClip.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(document.querySelector('.clip-panel.empty')).toBeNull();
    click(buttonByText('删除'));
    expect(clips().length).toBe(2);

    // 3. 撤销删除
    click(buttonByText('撤销'));
    expect(clips().length).toBe(3);

    // 4. 保存工程,并验证保存的文件能重新解析出完整状态
    const before = blobs.length;
    click(buttonByText('保存工程'));
    expect(blobs.length).toBe(before + 1);
    const projectBuf = await blobBytes(blobs[blobs.length - 1]);
    const reopened = deserializeProject(projectBuf);
    expect(reopened.project.name).toBe('演示工程');
    expect(reopened.project.tracks.length).toBe(2);
    expect(reopened.project.tracks.flatMap((t) => t.clips).length).toBe(3);
    expect(reopened.buffers.size).toBe(2);
    for (const s of reopened.project.sources) {
      expect(reopened.buffers.get(s.id)!.channels[0].length).toBeGreaterThan(0);
    }

    // 5. 导出 WAV(整个工程,44.1kHz)
    click(buttonByText('导出 WAV'));
    expect(document.querySelector('.modal')).not.toBeNull();
    const exportBtn = Array.from(document.querySelectorAll('.modal-actions button')).find((b) =>
      b.textContent?.includes('导出'),
    )!;
    click(exportBtn);
    await waitFor(() => document.querySelector('.modal') === null, 'export dialog to close');
    const wavBlob = blobs[blobs.length - 1];
    const wavBuf = await blobBytes(wavBlob);
    const view = new DataView(wavBuf);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    expect(view.getUint16(22, true)).toBe(2); // 双声道
    expect(view.getUint32(24, true)).toBe(44100);
    expect(wavBuf.byteLength).toBeGreaterThan(44 + 44100 * 4); // 至少 1 秒内容

    act(() => root!.unmount());
  }, 30000);
});
