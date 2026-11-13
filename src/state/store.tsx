import React, { createContext, useContext, useMemo, useReducer } from 'react';
import { AudioData, Project, TimeRange } from '../model/types';
import { uid } from '../model/ops';
import { HISTORY_LIMIT } from '../model/history';

export interface Toast {
  id: string;
  kind: 'info' | 'error' | 'success';
  text: string;
}

export interface AppState {
  project: Project;
  past: Project[];
  future: Project[];
  /** 拖动/推子进行中的事务快照,结束时一次性入历史 */
  txSnapshot: Project | null;
  /** 音频素材缓冲,独立于撤销历史,撤销不会丢素材 */
  buffers: Map<string, AudioData>;
  selection: TimeRange | null;
  selectedClipId: string | null;
  loopEnabled: boolean;
  dirty: boolean;
  toasts: Toast[];
}

export function emptyProject(): Project {
  return {
    name: '未命名工程',
    sources: [],
    tracks: [{ id: uid('trk'), name: '轨道 1', volume: 1, muted: false, solo: false, clips: [] }],
  };
}

export const initialState: AppState = {
  project: emptyProject(),
  past: [],
  future: [],
  txSnapshot: null,
  buffers: new Map(),
  selection: null,
  selectedClipId: null,
  loopEnabled: false,
  dirty: false,
  toasts: [],
};

export type Action =
  | { type: 'apply'; mutate: (p: Project) => Project }
  | { type: 'beginTx' }
  | { type: 'mutate'; mutate: (p: Project) => Project }
  | { type: 'endTx' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; project: Project; buffers: Map<string, AudioData> }
  | { type: 'addBuffers'; buffers: [string, AudioData][] }
  | { type: 'setSelection'; selection: TimeRange | null }
  | { type: 'selectClip'; id: string | null }
  | { type: 'toggleLoop' }
  | { type: 'markSaved' }
  | { type: 'toast'; kind: Toast['kind']; text: string }
  | { type: 'dismissToast'; id: string };

function pushPast(state: AppState, snapshot: Project): Pick<AppState, 'past' | 'future'> {
  const past = [...state.past, snapshot];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, future: [] };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'apply': {
      const next = action.mutate(state.project);
      if (next === state.project) return state;
      return { ...state, ...pushPast(state, state.project), project: next, dirty: true };
    }
    case 'beginTx':
      return { ...state, txSnapshot: state.project };
    case 'mutate':
      return { ...state, project: action.mutate(state.project), dirty: true };
    case 'endTx': {
      if (!state.txSnapshot || state.txSnapshot === state.project) {
        return { ...state, txSnapshot: null };
      }
      return { ...state, ...pushPast(state, state.txSnapshot), txSnapshot: null };
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      return {
        ...state,
        past: state.past.slice(0, -1),
        project: state.past[state.past.length - 1],
        future: [state.project, ...state.future],
        dirty: true,
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      return {
        ...state,
        past: [...state.past, state.project],
        project: state.future[0],
        future: state.future.slice(1),
        dirty: true,
      };
    }
    case 'load':
      return {
        ...state,
        project: action.project,
        buffers: action.buffers,
        past: [],
        future: [],
        txSnapshot: null,
        selection: null,
        selectedClipId: null,
        dirty: false,
      };
    case 'addBuffers': {
      for (const [id, data] of action.buffers) state.buffers.set(id, data);
      return { ...state };
    }
    case 'setSelection':
      return { ...state, selection: action.selection };
    case 'selectClip':
      return { ...state, selectedClipId: action.id };
    case 'toggleLoop':
      return { ...state, loopEnabled: !state.loopEnabled };
    case 'markSaved':
      return { ...state, dirty: false };
    case 'toast':
      return { ...state, toasts: [...state.toasts, { id: uid('toast'), kind: action.kind, text: action.text }] };
    case 'dismissToast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function toast(dispatch: React.Dispatch<Action>, kind: Toast['kind'], text: string) {
  dispatch({ type: 'toast', kind, text });
}
