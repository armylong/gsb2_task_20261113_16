import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, HistoryState, pushHistory, redo, undo } from '../model/history';
import { Project } from '../model/types';

const proj = (name: string): Project => ({ name, sources: [], tracks: [] });

describe('撤销/重做', () => {
  it('基本撤销与重做', () => {
    let h: HistoryState = { past: [], present: proj('v0'), future: [] };
    h = pushHistory(h, proj('v1'));
    h = pushHistory(h, proj('v2'));
    expect(h.present.name).toBe('v2');
    expect(canUndo(h)).toBe(true);

    h = undo(h);
    expect(h.present.name).toBe('v1');
    h = undo(h);
    expect(h.present.name).toBe('v0');
    expect(canUndo(h)).toBe(false);

    h = redo(h);
    expect(h.present.name).toBe('v1');
    h = redo(h);
    expect(h.present.name).toBe('v2');
    expect(canRedo(h)).toBe(false);
  });

  it('撤销后再编辑会清掉旧的重做分支', () => {
    let h: HistoryState = { past: [], present: proj('v0'), future: [] };
    h = pushHistory(h, proj('v1'));
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = pushHistory(h, proj('v1b'));
    expect(canRedo(h)).toBe(false);
    expect(h.present.name).toBe('v1b');
    h = undo(h);
    expect(h.present.name).toBe('v0');
  });

  it('空历史上撤销/重做是安全的空操作', () => {
    const h: HistoryState = { past: [], present: proj('v0'), future: [] };
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('历史深度有上限', () => {
    let h: HistoryState = { past: [], present: proj('v0'), future: [] };
    for (let i = 1; i <= 150; i++) h = pushHistory(h, proj(`v${i}`));
    expect(h.past.length).toBeLessThanOrEqual(100);
  });
});
