"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * 모바일은 아래에서 올라오는 짧은 시트, 데스크톱은 오른쪽 패널.
 * 열리면 제목으로 포커스, Esc와 닫기와 바깥 누르기로 닫고, 닫으면 연 버튼으로 포커스를 돌려준다.
 */
export function Sheet({ title, kicker, onClose, children, size = "short" }: { title: ReactNode; kicker?: string; onClose: () => void; children: ReactNode; size?: "short" | "tall" }) {
  const titleId = useId();
  const headRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    headRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const t = opener.current;
      if (t && document.contains(t)) t.focus();
    };
  }, []);

  return (
    <>
      <button type="button" className="sheet__scrim" aria-label="닫기" tabIndex={-1} onClick={onClose} />
      <aside className="sheet" data-size={size} role="dialog" aria-labelledby={titleId}>
        <div className="sheet__top">
          <div className="sheet__titles">
            {kicker ? <p className="sheet__kicker">{kicker}</p> : null}
            <h2 id={titleId} ref={headRef} tabIndex={-1} className="sheet__title">
              {title}
            </h2>
          </div>
          <button type="button" className="sheet__close" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </aside>
    </>
  );
}
