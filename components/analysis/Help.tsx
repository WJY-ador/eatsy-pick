"use client";

import { type JSX, type ReactNode, useId, useRef, useState } from "react";
import s from "./analysis.module.css";

/**
 * 제목 옆 작은 ? 버튼과 뜻 글. 기본 화면에는 글을 숨긴다.
 * 누르면 열고 닫는다. 키보드 포커스로 오면 열고, 그대로 떠나면 닫는다(포커스로 연 뒤 누르면 열린 채로 둔다). Esc로 닫는다.
 * 버튼과 글을 따로 돌려줘 부모가 글을 제목 줄 아래 한 줄로 둘 수 있게 한다.
 */
export function useHelp(name: string, text: ReactNode): { button: JSX.Element; panel: JSX.Element } {
  const id = useId();
  const [open, setOpen] = useState(false);
  const byFocus = useRef(false);
  const button = (
    <button
      type="button"
      className={s.helpBtn}
      aria-expanded={open}
      aria-controls={id}
      aria-label={`${name} 뜻`}
      data-testid="help-btn"
      onFocus={(e) => {
        if (!open && e.currentTarget.matches(":focus-visible")) {
          byFocus.current = true;
          setOpen(true);
        }
      }}
      onBlur={() => {
        if (byFocus.current) {
          byFocus.current = false;
          setOpen(false);
        }
      }}
      onClick={() => {
        if (byFocus.current) byFocus.current = false;
        else setOpen((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          byFocus.current = false;
          setOpen(false);
        }
      }}
    >
      ?
    </button>
  );
  const panel = (
    <p id={id} className={s.helpText} hidden={!open} data-testid="help-text">
      {text}
    </p>
  );
  return { button, panel };
}
