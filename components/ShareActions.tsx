"use client";

import { useEffect, useRef, useState } from "react";

export const TOAST_TEXT = "복사됐어요! 단톡방에 붙여넣으세요";
const TOAST_MS = 2500;

/**
 * 공유 버튼 하나: 현재 조건 URL을 clipboard에 복사하고 토스트를 띄운다.
 * clipboard가 막힌 환경이면 URL을 고를 수 있는 입력으로 보여 준다.
 */
export function ShareActions({ path }: { path: string }) {
  const [toast, setToast] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(false), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (fallback) fallbackRef.current?.select();
  }, [fallback]);

  return (
    <>
      <button
        type="button"
        className="btn btn--primary"
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
        단톡방에 공유하기
      </button>
      {fallback ? (
        <div className="share__fallback">
          <label htmlFor="share-url" className="label">
            복사가 막혀 있어요. 이 링크를 길게 눌러 복사하세요.
          </label>
          <input
            ref={fallbackRef}
            id="share-url"
            className="input"
            type="url"
            readOnly
            value={fallback}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      ) : null}
      <p className={toast ? "toast is-on" : "toast"} role="status" aria-live="polite">
        {toast ? TOAST_TEXT : ""}
      </p>
    </>
  );
}
