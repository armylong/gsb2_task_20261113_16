import React, { useRef } from 'react';
import { useApp } from '../state/store';

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  pxPerSec: number;
  onNew: () => void;
  onDemo: () => void;
  onImport: (files: FileList) => void;
  onOpen: (file: File) => void;
  onSave: () => void;
  onExport: () => void;
  onZoom: (pxPerSec: number) => void;
}

/** 顶部工具栏:工程操作、导入、撤销重做、缩放、导出 */
export function Toolbar(props: ToolbarProps) {
  const { state, dispatch } = useApp();
  const importRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLInputElement>(null);
  const { pxPerSec, onZoom } = props;

  return (
    <div className="toolbar">
      <span className="app-title">播客剪辑台</span>
      <input
        className="project-name"
        value={state.project.name}
        onFocus={() => dispatch({ type: 'beginTx' })}
        onChange={(e) => dispatch({ type: 'mutate', mutate: (p) => ({ ...p, name: e.target.value }) })}
        onBlur={() => dispatch({ type: 'endTx' })}
        title="工程名称"
      />
      {state.dirty && <span className="dirty-dot" title="有未保存的修改">●</span>}
      <span className="sep" />
      <button onClick={props.onNew}>新建</button>
      <button onClick={props.onDemo}>演示工程</button>
      <button onClick={() => importRef.current?.click()}>导入音频</button>
      <button onClick={() => openRef.current?.click()}>打开工程</button>
      <button onClick={props.onSave}>保存工程</button>
      <span className="sep" />
      <button disabled={!props.canUndo} onClick={() => dispatch({ type: 'undo' })} title="撤销 (Ctrl/Cmd+Z)">
        ↩ 撤销
      </button>
      <button disabled={!props.canRedo} onClick={() => dispatch({ type: 'redo' })} title="重做 (Ctrl/Cmd+Shift+Z)">
        ↪ 重做
      </button>
      <span className="sep" />
      <button onClick={() => onZoom(pxPerSec / 1.4)} title="缩小">−</button>
      <span className="zoom-label">{Math.round(pxPerSec)}px/s</span>
      <button onClick={() => onZoom(pxPerSec * 1.4)} title="放大">+</button>
      <span className="sep" />
      <button className="primary" onClick={props.onExport}>导出 WAV</button>
      <input
        ref={importRef}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) props.onImport(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={openRef}
        type="file"
        accept=".podproj,application/octet-stream"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) props.onOpen(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
