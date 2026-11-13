import { Project } from './types';

export interface HistoryState {
  past: Project[];
  present: Project;
  future: Project[];
}

export const HISTORY_LIMIT = 100;

/**
 * 推入一次新编辑。present 进入 past,future 被清空——
 * 撤销之后再编辑不会保留旧的重做分支。
 */
export function pushHistory(h: HistoryState, next: Project): HistoryState {
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [] };
}

export function canUndo(h: HistoryState): boolean {
  return h.past.length > 0;
}

export function canRedo(h: HistoryState): boolean {
  return h.future.length > 0;
}

export function undo(h: HistoryState): HistoryState {
  if (!canUndo(h)) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
  };
}

export function redo(h: HistoryState): HistoryState {
  if (!canRedo(h)) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
  };
}
