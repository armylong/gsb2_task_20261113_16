import React from 'react';
import { Track } from '../model/types';
import { updateTrack } from '../model/ops';
import { useApp } from '../state/store';
import { TRACK_H } from './ClipView';

/** 轨道控制条:命名、音量、静音、独奏 */
export function TrackHeader({ track }: { track: Track }) {
  const { dispatch } = useApp();
  const mutateTrack = (fn: (t: Track) => Track) =>
    dispatch({ type: 'mutate', mutate: (p) => updateTrack(p, track.id, fn) });

  return (
    <div className="track-header" style={{ height: TRACK_H }}>
      <input
        className="track-name"
        value={track.name}
        onFocus={() => dispatch({ type: 'beginTx' })}
        onChange={(e) => mutateTrack((t) => ({ ...t, name: e.target.value }))}
        onBlur={() => dispatch({ type: 'endTx' })}
      />
      <div className="track-row">
        <button
          className={`toggle${track.muted ? ' on-danger' : ''}`}
          title="静音"
          onClick={() =>
            dispatch({ type: 'apply', mutate: (p) => updateTrack(p, track.id, (t) => ({ ...t, muted: !t.muted })) })
          }
        >
          M
        </button>
        <button
          className={`toggle${track.solo ? ' on-warn' : ''}`}
          title="独奏"
          onClick={() =>
            dispatch({ type: 'apply', mutate: (p) => updateTrack(p, track.id, (t) => ({ ...t, solo: !t.solo })) })
          }
        >
          S
        </button>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={track.volume}
          title={`音量 ${(track.volume * 100).toFixed(0)}%`}
          onPointerDown={() => dispatch({ type: 'beginTx' })}
          onChange={(e) => mutateTrack((t) => ({ ...t, volume: Number(e.target.value) }))}
          onPointerUp={() => dispatch({ type: 'endTx' })}
          onBlur={() => dispatch({ type: 'endTx' })}
        />
        <span className="vol-label">{(track.volume * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
