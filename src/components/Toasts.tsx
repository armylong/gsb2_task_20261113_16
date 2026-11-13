import React, { useEffect } from 'react';
import { useApp } from '../state/store';

/** 右下角消息提示,4 秒自动消失 */
export function Toasts() {
  const { state, dispatch } = useApp();

  useEffect(() => {
    if (state.toasts.length === 0) return;
    const timer = setTimeout(() => {
      dispatch({ type: 'dismissToast', id: state.toasts[0].id });
    }, 4000);
    return () => clearTimeout(timer);
  }, [state.toasts, dispatch]);

  return (
    <div className="toasts">
      {state.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dispatch({ type: 'dismissToast', id: t.id })}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
