import React from 'react';
import { projectEnd } from '../model/ops';
import { useApp } from '../state/store';
import { ClipView, TRACK_H } from './ClipView';
import { Ruler, RULER_H } from './Ruler';
import { TrackHeader } from './TrackHeader';
import { TimeRange } from '../model/types';

interface TimelineProps {
  playhead: number;
  pxPerSec: number;
  onSeek: (t: number) => void;
}

/** 时间线:刻度尺 + 轨道泳道 + 播放头 + 选区,支持横向滚动 */
export function Timeline({ playhead, pxPerSec, onSeek }: TimelineProps) {
  const { state, dispatch } = useApp();
  const contentDuration = Math.max(projectEnd(state.project) + 15, 30);
  const width = contentDuration * pxPerSec;
  const lanesHeight = state.project.tracks.length * TRACK_H;
  const sel: TimeRange | null = state.selection;

  return (
    <div className="timeline">
      <div className="track-headers" style={{ paddingTop: RULER_H }}>
        {state.project.tracks.map((t) => (
          <TrackHeader key={t.id} track={t} />
        ))}
      </div>
      <div className="timeline-scroll">
        <div className="timeline-content" style={{ width, height: RULER_H + lanesHeight }}>
          <Ruler
            width={width}
            pxPerSec={pxPerSec}
            selection={sel}
            onSeek={onSeek}
            onSelect={(r) => dispatch({ type: 'setSelection', selection: r })}
          />
          {state.project.tracks.map((t) => (
            <div
              key={t.id}
              className={`track-lane${t.muted ? ' muted' : ''}`}
              style={{ height: TRACK_H }}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) dispatch({ type: 'selectClip', id: null });
              }}
            >
              {t.clips.map((c) => (
                <ClipView
                  key={c.id}
                  clip={c}
                  pxPerSec={pxPerSec}
                  selected={state.selectedClipId === c.id}
                  sourceDuration={state.buffers.get(c.sourceId)?.duration ?? 0}
                  data={state.buffers.get(c.sourceId)}
                />
              ))}
            </div>
          ))}
          {sel && sel.end > sel.start && (
            <div
              className="selection-overlay"
              style={{
                left: sel.start * pxPerSec,
                width: (sel.end - sel.start) * pxPerSec,
                top: RULER_H,
                height: lanesHeight,
              }}
            />
          )}
          <div className="playhead" style={{ left: playhead * pxPerSec, height: RULER_H + lanesHeight }} />
        </div>
      </div>
    </div>
  );
}
