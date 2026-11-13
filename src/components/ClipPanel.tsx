import React from 'react';
import { addClipToTrack, findClip, MIN_CLIP, removeClip, splitClip, uid, updateClip, updateTrack } from '../model/ops';
import { toast, useApp } from '../state/store';
import { formatTime } from '../util/format';

interface ClipPanelProps {
  playhead: number;
}

/** 选中片段的属性面板:淡入淡出、分割、删除、复制到其他轨道 */
export function ClipPanel({ playhead }: ClipPanelProps) {
  const { state, dispatch } = useApp();
  const found = state.selectedClipId ? findClip(state.project, state.selectedClipId) : null;

  if (!found) {
    return <div className="clip-panel empty">未选中片段 — 点击时间线上的片段后可在这里调整淡入淡出、分割、删除或复制</div>;
  }
  const { clip, track } = found;

  const setFade = (field: 'fadeIn' | 'fadeOut', value: number) => {
    const v = Math.max(0, Math.min(isNaN(value) ? 0 : value, clip.duration));
    dispatch({ type: 'apply', mutate: (p) => updateClip(p, clip.id, (c) => ({ ...c, [field]: v })) });
  };

  const doSplit = () => {
    if (playhead <= clip.start + MIN_CLIP || playhead >= clip.start + clip.duration - MIN_CLIP) {
      toast(dispatch, 'info', '播放头不在选中片段内,无法分割');
      return;
    }
    dispatch({
      type: 'apply',
      mutate: (p) => {
        const cur = findClip(p, clip.id);
        if (!cur) return p;
        const parts = splitClip(cur.clip, playhead);
        if (!parts) return p;
        return updateTrack(p, cur.track.id, (t) => ({
          ...t,
          clips: t.clips.flatMap((c) => (c.id === clip.id ? parts : [c])),
        }));
      },
    });
  };

  const doDelete = () => {
    dispatch({ type: 'apply', mutate: (p) => removeClip(p, clip.id) });
    dispatch({ type: 'selectClip', id: null });
  };

  const copyTo = (trackId: string) => {
    if (!trackId) return;
    dispatch({
      type: 'apply',
      mutate: (p) => addClipToTrack(p, trackId, { ...clip, id: uid('clip') }),
    });
    toast(dispatch, 'success', '已复制到目标轨道');
  };

  return (
    <div className="clip-panel">
      <span className="clip-info">
        选中片段 · 轨道「{track.name}」 · 起点 {formatTime(clip.start)} · 时长 {formatTime(clip.duration)} · 素材偏移{' '}
        {formatTime(clip.offset)}
      </span>
      <label>
        淡入(s)
        <input
          type="number"
          min={0}
          step={0.1}
          value={clip.fadeIn}
          onChange={(e) => setFade('fadeIn', Number(e.target.value))}
        />
      </label>
      <label>
        淡出(s)
        <input
          type="number"
          min={0}
          step={0.1}
          value={clip.fadeOut}
          onChange={(e) => setFade('fadeOut', Number(e.target.value))}
        />
      </label>
      <button onClick={doSplit}>✂ 在播放头分割</button>
      <button className="danger" onClick={doDelete}>
        删除
      </button>
      <label>
        复制到
        <select value="" onChange={(e) => copyTo(e.target.value)}>
          <option value="">选择轨道…</option>
          {state.project.tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
