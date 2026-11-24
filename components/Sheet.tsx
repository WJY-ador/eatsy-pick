"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import "@/app/receipt.css";

// 겹친 시트(영수증 위의 근거 시트 등)에서 Esc는 맨 위 한 겹만 닫는다.
// 열린 순서대로 쌓고, keydown 리스너는 하나만 둔다.
type Layer = { close: () => void };
const layers: Layer[] = [];

function onEscape(e: KeyboardEvent) {
  if (e.key !== "Escape" || layers.length === 0) return;
  e.preventDefault();
  layers[layers.length - 1].close();
}

/** 지금 열려 있는 겹 수. 새 시트를 그 위에 올릴 z-index 계산에 쓴다. */
export function openLayerCount(): number {
  return layers.length;
}

/** 이 컴포넌트를 Esc 스택에 올린다. 맨 위일 때만 Esc가 onClose를 부른다. */
export function useEscapeLayer(onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const layer: Layer = { close: () => closeRef.current() };
    if (layers.length === 0) window.addEventListener("keydown", onEscape);
    layers.push(layer);
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      if (layers.length === 0) window.removeEventListener("keydown", onEscape);
    };
  }, []);
}

/**
 * 768px 미만은 아래에서 올라오는 시트, 768px 이상은 오른쪽 패널(스타일은 app/receipt.css).
 * 열리면 제목으로 포커스, Esc와 닫기와 바깥 누르기로 닫고, 닫으면 연 버튼으로 포커스를 돌려준다.
 */
export function Sheet({
  title,
  kicker,
  onClose,
  children,
  size = "short",
  testId,
}: {
  title: ReactNode;
  kicker?: string;
  onClose: () => void;
  children: ReactNode;
  size?: "short" | "tall";
  /** 시험용 선택자(data-testid) */
  testId?: string;
}) {
  const titleId = useId();
  const headRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // 다른 시트(영수증 등) 위에 열리면 그만큼 위로 올린다. 처음 그릴 때의 겹 수로 정한다.
  const [depth] = useState(openLayerCount);
  useEscapeLayer(onClose);

  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    headRef.current?.focus();
    return () => {
      const t = opener.current;
      if (t && document.contains(t)) t.focus();
    };
  }, []);

  const z = (n: number) => (depth > 0 ? { zIndex: `calc(var(--z-sheet) + ${depth * 2 + n})` } : undefined);

  return (
    <>
      <button type="button" className="sheet__scrim" aria-label="닫기" tabIndex={-1} onClick={onClose} style={z(0)} />
      <aside className="sheet" data-size={size} data-testid={testId} role="dialog" aria-labelledby={titleId} style={z(1)}>
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
