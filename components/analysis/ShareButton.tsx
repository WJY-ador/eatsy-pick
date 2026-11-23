"use client";

import { useEffect, useRef, useState } from "react";
import s from "./analysis.module.css";

export const SHARE_TOAST = "복사됐어요! 단톡방에 붙여넣으세요";
const TOAST_MS = 2500;

/** 상권과 실제 적용한 필터를 복원하는 자사 URL을 복사한다. clipboard가 막히면 고를 수 있는 입력으로 보여 준다. */
export function ShareButton({ path }: { path: string }) {
  const [toast, setToast] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(false), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (fallback) inputRef.current?.select();
  }, [fallback]);

  return (
    <>
      <button
        type="button"
        className={`${s.btn} ${s.btnStrong}`}
        onClick={async () => {
          const url = new URL(path, window.location.origin).href;
          try {
            await navigator.clipboard.writeText(url);
            setFallback(null);
            setToast(true);
          } catch {
            setFallback(url);
          }
        }}
      >
        분석 리포트 공유하기
      </button>
      {fallback ? (
        <label className={s.fallback}>
          복사가 막혀 있어요. 이 링크를 길게 눌러 복사하세요.
          <input ref={inputRef} type="url" readOnly value={fallback} onFocus={(e) => e.currentTarget.select()} />
        </label>
      ) : null}
      <p className={`${s.toast} ${toast ? s.toastOn : ""}`} role="status" aria-live="polite">
        {toast ? SHARE_TOAST : ""}
      </p>
    </>
  );
}
