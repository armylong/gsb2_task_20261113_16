import React, { useState } from 'react';
import { audibleRange, exportWav } from '../audio/exporter';
import { toast, useApp } from '../state/store';
import { downloadBlob } from '../util/download';
import { formatTime } from '../util/format';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

/** 导出对话框:整个工程或选区,44.1kHz / 48kHz 双声道 WAV */
export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const { state, dispatch } = useApp();
  const [scope, setScope] = useState<'project' | 'selection'>('project');
  const [rate, setRate] = useState<44100 | 48000>(44100);
  const [progress, setProgress] = useState<number | null>(null);

  if (!open) return null;
  const full = audibleRange(state.project);
  const range = scope === 'selection' ? state.selection : full;
  const exporting = progress !== null;

  const doExport = async () => {
    if (!range || range.end <= range.start) {
      toast(dispatch, 'error', scope === 'selection' ? '请先在刻度尺上框选一段时间' : '工程为空,没有可导出的内容');
      return;
    }
    setProgress(0);
    try {
      const blob = await exportWav(state.project, state.buffers, range, rate, (p) => setProgress(p));
      downloadBlob(blob, `${state.project.name || '工程'}_${rate / 1000}k.wav`);
      toast(dispatch, 'success', 'WAV 导出完成');
      onClose();
    } catch (e) {
      toast(dispatch, 'error', `导出失败:${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={exporting ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>导出 WAV</h2>
        <label className="radio">
          <input
            type="radio"
            checked={scope === 'project'}
            onChange={() => setScope('project')}
            disabled={exporting}
          />
          整个工程{full ? `(${formatTime(full.end)})` : '(空)'}
        </label>
        <label className="radio">
          <input
            type="radio"
            checked={scope === 'selection'}
            onChange={() => setScope('selection')}
            disabled={exporting || !state.selection}
          />
          选中范围
          {state.selection
            ? `(${formatTime(state.selection.start)} → ${formatTime(state.selection.end)})`
            : '(未框选)'}
        </label>
        <label className="radio">
          采样率
          <select value={rate} onChange={(e) => setRate(Number(e.target.value) as 44100 | 48000)} disabled={exporting}>
            <option value={44100}>44.1 kHz</option>
            <option value={48000}>48 kHz</option>
          </select>
        </label>
        {exporting && (
          <div className="progress">
            <div className="progress-bar" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
            <span>{Math.round((progress ?? 0) * 100)}%</span>
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onClose} disabled={exporting}>
            取消
          </button>
          <button className="primary" onClick={doExport} disabled={exporting}>
            {exporting ? '导出中…' : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
}
