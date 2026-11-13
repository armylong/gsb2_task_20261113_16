import React, { useCallback, useEffect, useRef, useState } from 'react';
import { engine } from './audio/engine';
import { decodeAudioFile } from './audio/decode';
import { buildDemoProject } from './audio/demo';
import { deserializeProject, serializeProject } from './audio/projectFile';
import { ClipPanel } from './components/ClipPanel';
import { ExportDialog } from './components/ExportDialog';
import { Timeline } from './components/Timeline';
import { Toasts } from './components/Toasts';
import { Toolbar } from './components/Toolbar';
import { Transport } from './components/Transport';
import { projectEnd, splitAtTime, uid } from './model/ops';
import { SourceMeta } from './model/types';
import { AppProvider, emptyProject, toast, useApp } from './state/store';
import { downloadBlob } from './util/download';

const MIN_ZOOM = 5;
const MAX_ZOOM = 600;

function Main() {
  const { state, dispatch } = useApp();
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [pxPerSec, setPxPerSec] = useState(80);
  const [exportOpen, setExportOpen] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;

  // 播放中改音量/静音/独奏立即生效
  useEffect(() => {
    engine.updateMixer(state.project);
  }, [state.project]);

  // 播放头跟随实际声音;处理选区循环与播到末尾自动停止
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const st = stateRef.current;
      const pos = engine.position();
      const sel = st.selection;
      if (st.loopEnabled && sel && sel.end > sel.start && pos >= sel.end) {
        engine.play(st.project, st.buffers, sel.start);
      } else {
        const end = projectEnd(st.project, true);
        if (end > 0 && pos >= end) {
          const p = engine.pause();
          setPlayhead(p);
          setPlaying(false);
          return;
        }
      }
      setPlayhead(engine.position());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // 关闭页面前提醒未保存的修改
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (stateRef.current.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const doPlay = useCallback(() => {
    engine.play(stateRef.current.project, stateRef.current.buffers, playheadRef.current);
    setPlaying(true);
  }, []);

  const doPause = useCallback(() => {
    const p = engine.pause();
    setPlayhead(p);
    setPlaying(false);
  }, []);

  const doStop = useCallback(() => {
    engine.stop();
    setPlayhead(0);
    setPlaying(false);
  }, []);

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(0, t);
      setPlayhead(clamped);
      if (playing) engine.play(stateRef.current.project, stateRef.current.buffers, clamped);
    },
    [playing],
  );

  const replaceProject = useCallback(
    (project: typeof state.project, buffers: typeof state.buffers, message: string) => {
      engine.reset();
      setPlaying(false);
      setPlayhead(0);
      dispatch({ type: 'load', project, buffers });
      toast(dispatch, 'success', message);
    },
    [dispatch],
  );

  const confirmDiscard = useCallback(() => {
    return !stateRef.current.dirty || window.confirm('当前工程有未保存的修改,继续将丢弃这些修改。确定吗?');
  }, []);

  const onNew = useCallback(() => {
    if (!confirmDiscard()) return;
    replaceProject(emptyProject(), new Map(), '已新建空白工程');
  }, [confirmDiscard, replaceProject]);

  const onDemo = useCallback(() => {
    if (!confirmDiscard()) return;
    const { project, buffers } = buildDemoProject();
    replaceProject(project, buffers, '已加载演示工程(人声 + 配乐,含重叠片段)');
  }, [confirmDiscard, replaceProject]);

  const onImport = useCallback(
    async (files: FileList) => {
      for (const f of Array.from(files)) {
        try {
          const data = await decodeAudioFile(f);
          const meta: SourceMeta = {
            id: uid('src'),
            name: f.name,
            duration: data.duration,
            sampleRate: data.sampleRate,
            channels: data.channels.length,
          };
          dispatch({ type: 'addBuffers', buffers: [[meta.id, data]] });
          dispatch({
            type: 'apply',
            mutate: (p) => ({
              ...p,
              sources: [...p.sources, meta],
              tracks: [
                ...p.tracks,
                {
                  id: uid('trk'),
                  name: f.name.replace(/\.[^.]+$/, ''),
                  volume: 1,
                  muted: false,
                  solo: false,
                  clips: [
                    { id: uid('clip'), sourceId: meta.id, start: 0, offset: 0, duration: data.duration, fadeIn: 0, fadeOut: 0 },
                  ],
                },
              ],
            }),
          });
          toast(dispatch, 'success', `已导入 ${f.name}`);
        } catch {
          toast(dispatch, 'error', `无法导入 ${f.name}:文件损坏或格式不支持`);
        }
      }
    },
    [dispatch],
  );

  const onOpen = useCallback(
    async (file: File) => {
      if (!confirmDiscard()) return;
      try {
        const buf = await file.arrayBuffer();
        const { project, buffers } = deserializeProject(buf);
        replaceProject(project, buffers, `已打开工程「${project.name}」`);
      } catch (e) {
        // 打开失败不清空当前工程
        toast(dispatch, 'error', `无法打开工程:${(e as Error).message}`);
      }
    },
    [confirmDiscard, dispatch, replaceProject],
  );

  const onSave = useCallback(() => {
    try {
      const buf = serializeProject(stateRef.current.project, stateRef.current.buffers);
      downloadBlob(new Blob([buf]), `${stateRef.current.project.name || '工程'}.podproj`);
      dispatch({ type: 'markSaved' });
      toast(dispatch, 'success', '工程已保存(含全部音频素材与编辑状态)');
    } catch (e) {
      toast(dispatch, 'error', `保存失败:${(e as Error).message}`);
    }
  }, [dispatch]);

  const onSplitAtPlayhead = useCallback(() => {
    const t = playheadRef.current;
    const { project, changed } = splitAtTime(stateRef.current.project, t);
    if (!changed) {
      toast(dispatch, 'info', '播放头处没有可分割的片段');
      return;
    }
    dispatch({ type: 'apply', mutate: () => project });
  }, [dispatch]);

  // 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave();
      } else if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) {
        const id = stateRef.current.selectedClipId;
        if (id) {
          e.preventDefault();
          dispatch({
            type: 'apply',
            mutate: (p) => ({
              ...p,
              tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== id) })),
            }),
          });
          dispatch({ type: 'selectClip', id: null });
        }
      } else if (!typing && e.key === ' ') {
        e.preventDefault();
        if (engine.playing) doPause();
        else doPlay();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch, doPause, doPlay, onSave]);

  const onZoom = useCallback((v: number) => {
    setPxPerSec(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v)));
  }, []);

  return (
    <div className="app">
      <Toolbar
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        pxPerSec={pxPerSec}
        onNew={onNew}
        onDemo={onDemo}
        onImport={onImport}
        onOpen={onOpen}
        onSave={onSave}
        onExport={() => setExportOpen(true)}
        onZoom={onZoom}
      />
      <Transport
        playing={playing}
        playhead={playhead}
        onPlay={doPlay}
        onPause={doPause}
        onStop={doStop}
        onSplitAtPlayhead={onSplitAtPlayhead}
      />
      <Timeline playhead={playhead} pxPerSec={pxPerSec} onSeek={seek} />
      <ClipPanel playhead={playhead} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Main />
    </AppProvider>
  );
}
