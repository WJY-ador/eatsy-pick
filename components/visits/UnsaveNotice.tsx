"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { displayName } from "@/lib/store-view";
import { closeUnsaveNotice, useUi } from "@/lib/ui-state";
import { deleteCrm, save } from "@/lib/visits";
import s from "./visits.module.css";

/** 알림이 머무는 시간. 알림 위에 포인터나 초점이 있으면 멈춘다 */
const NOTICE_MS = 8000;
/** 삭제 결과 문구가 머무는 시간 */
const DONE_MS = 3000;

/**
 * 태그나 메모가 있는 매장의 저장을 풀었을 때 화면 아래 한 줄 알림: 되돌리기, 태그와 메모 삭제. 영수증이 열려 있으면 그 고정 줄 위에 뜬다.
 * 알림이 사라져도 내 저장의 저장 해제한 곳에서 같은 일을 할 수 있다. 포커스를 가져가지 않고 Esc 겹에 들지 않는다.
 * 읽기 도구가 바뀐 문구를 읽도록 알림 상자는 늘 그려 두고(닫히면 화면에서만 감춘다) 내용만 바꾼다.
 */
export function UnsaveNotice() {
  const { unsaveNotice: n } = useUi();
  const [done, setDone] = useState<string | null>(null);
  const [held, setHeld] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // 알림이 뜰 때 누른 요소(북마크)를 기억한다. 알림 안에서 버튼을 누른 뒤 초점을 돌려줄 곳이다.
  useEffect(() => {
    if (!n) return;
    const a = document.activeElement;
    opener.current = a instanceof HTMLElement && a !== document.body ? a : null;
  }, [n]);

  // 영수증이 열려 있으면 그 아래 고정 줄(잇플 CTA와 의무 표기) 위로 올린다. 가리지 않게.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const foot = document.querySelector("aside.rc .rc__foot");
    const top = foot?.getBoundingClientRect().top;
    el.style.bottom = top === undefined ? "" : `${Math.max(0, window.innerHeight - top) + 8}px`;
  }, [n, done]);

  useEffect(() => {
    if (!n || held) return;
    const t = window.setTimeout(closeUnsaveNotice, NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [n, held]);

  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(null), DONE_MS);
    return () => window.clearTimeout(t);
  }, [done]);

  const finish = (text: string | null) => {
    const inside = !!box.current?.contains(document.activeElement);
    setHeld(false);
    if (text) setDone(text);
    closeUnsaveNotice();
    const o = opener.current;
    if (inside && o && document.contains(o)) o.focus();
  };

  return (
    <div
      ref={box}
      className={s.toast}
      data-open={n || done ? "true" : "false"}
      data-testid="unsave-notice"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
      }}
    >
      <p className={s.toastText} aria-live="polite">
        {n ? `${displayName(n.store.name)} 저장을 해제했습니다. 태그와 메모는 남아 있습니다.` : (done ?? "")}
      </p>
      {n ? (
        <div className={s.toastActions}>
          <button
            type="button"
            className={s.toastBtn}
            data-testid="unsave-undo"
            onClick={() => {
              save(n.store, { savedAt: n.savedAt, restore: n.restore });
              finish(null);
            }}
          >
            되돌리기
          </button>
          <button
            type="button"
            className={s.toastBtn}
            data-testid="unsave-delete"
            onClick={() => {
              deleteCrm(n.store.id);
              finish("태그와 메모를 지웠습니다.");
            }}
          >
            태그와 메모 삭제
          </button>
        </div>
      ) : null}
    </div>
  );
}
