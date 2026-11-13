import React from 'react';
import { formatTime } from '../util/format';
import { useApp } from '../state/store';

interface TransportProps {
  playing: boolean;
  playhead: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSplitAtPlayhead: () => void;
}

/** 走带控制:播放/暂停/停止、当前时间、选区与循环 */
export function Transport({ playing, playhead, onPlay, onPause, onStop, onSplitAtPlayhead }: TransportProps) {
  const { state, dispatch } = useApp();
  const sel = state.selection;
  return (
    <div className="transport">
      <button className="primary" onClick={playing ? onPause : onPlay}>
        {playing ? '⏸ 暂停' : '▶ 播放'}
      </button>
      <button onClick={onStop}>⏹ 停止</button>
      <button onClick={onSplitAtPlayhead} title="在播放头处分割所有被命中的片段">
        ✂ 在播放头分割
      </button>
      <span className="time">{formatTime(playhead)}</span>
      <span className="sep" />
      <label className={`loop-toggle${state.loopEnabled ? ' active' : ''}`}>
        <input type="checkbox" checked={state.loopEnabled} onChange={() => dispatch({ type: 'toggleLoop' })} />
        循环选区
      </label>
      <span className="selection-info">
        {sel && sel.end > sel.start
          ? `选区 ${formatTime(sel.start)} → ${formatTime(sel.end)}(${formatTime(sel.end - sel.start)})`
          : '未框选选区(在刻度尺上拖动可框选)'}
      </span>
    </div>
  );
}
