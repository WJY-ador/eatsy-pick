"use client";

import "./area.css";
import { useEffect, useId, useRef, useState } from "react";
import { AREA_QUERY_MAX, type AreaCandidate, LEVEL_LABEL } from "@/lib/my-areas";

/** 입력이 멈춘 뒤 검색까지 기다리는 시간 */
const DEBOUNCE_MS = 300;

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "done"; q: string; list: AreaCandidate[] } | { kind: "error"; message: string };

/**
 * 지역 검색(동네, 구, 역). 서버 경로 /api/area-search로 후보를 받고, 동명 지역은 시도와 주소로 가른다.
 * taken에 든 키는 고를 수 없게 표시한다(이미 목록에 있는 지역, 지금 보고 있는 지역).
 */
export function AreaSearch({
  inputTestId,
  label,
  placeholder,
  taken,
  takenText,
  onPick,
  autoFocus = false,
}: {
  inputTestId: string;
  label: string;
  placeholder: string;
  taken: Set<string>;
  takenText: string;
  onPick: (c: AreaCandidate) => void;
  autoFocus?: boolean;
}) {
  const inputId = useId();
  const listId = useId();
  const statusId = useId();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const run = async (raw: string) => {
    const q = raw.replace(/\s+/g, " ").trim();
    abort.current?.abort();
    if (!q) {
      setStatus({ kind: "idle" });
      return;
    }
    const ctl = new AbortController();
    abort.current = ctl;
    setStatus({ kind: "loading" });
    try {
      const res = await fetch(`/api/area-search?${new URLSearchParams({ q }).toString()}`, { signal: ctl.signal });
      const body = (await res.json().catch(() => ({}))) as { candidates?: AreaCandidate[]; error?: string };
      if (ctl.signal.aborted) return;
      if (!res.ok || !Array.isArray(body.candidates)) {
        setStatus({ kind: "error", message: body.error ?? "지역 검색이 잠시 실패했습니다. 잠시 뒤 다시 시도해 주세요." });
        return;
      }
      setStatus({ kind: "done", q, list: body.candidates });
    } catch {
      if (!ctl.signal.aborted) setStatus({ kind: "error", message: "지역 검색이 잠시 실패했습니다. 잠시 뒤 다시 시도해 주세요." });
    }
  };

  const schedule = (v: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void run(v);
    }, DEBOUNCE_MS);
  };

  const list = status.kind === "done" ? status.list : [];
  const statusText =
    status.kind === "loading"
      ? "찾는 중입니다."
      : status.kind === "error"
        ? status.message
        : status.kind === "done"
          ? list.length > 0
            ? `${status.q} 검색 결과 ${list.length}곳`
            : `${status.q}에 맞는 동네, 구, 역을 찾지 못했습니다. 시도를 붙여 다시 찾아 주세요(예: 부산 해운대역).`
          : "";

  return (
    <div className="asearch">
      <form
        className="asearch__form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (timer.current !== null) window.clearTimeout(timer.current);
          void run(value);
        }}
      >
        <label className="asearch__label" htmlFor={inputId}>
          {label}
        </label>
        <div className="asearch__row">
          <input
            ref={inputRef}
            id={inputId}
            className="asearch__input"
            data-testid={inputTestId}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={AREA_QUERY_MAX}
            placeholder={placeholder}
            value={value}
            aria-describedby={statusId}
            aria-controls={listId}
            onChange={(e) => {
              setValue(e.target.value);
              schedule(e.target.value);
            }}
          />
          <button type="submit" className="btn asearch__go">
            찾기
          </button>
        </div>
      </form>
      <p id={statusId} className="asearch__status" role="status" aria-live="polite">
        {statusText}
      </p>
      <ul id={listId} className="asearch__list" aria-label="지역 검색 결과">
        {list.map((c) => {
          const isTaken = taken.has(c.key);
          return (
            <li key={c.key}>
              <button
                type="button"
                className="asearch__cand"
                data-testid="area-candidate"
                data-key={c.key}
                data-kind={c.kind}
                disabled={isTaken}
                aria-disabled={isTaken}
                onClick={() => onPick(c)}
              >
                <span className="asearch__name">{c.name}</span>
                <span className="asearch__tag">{c.unit ?? LEVEL_LABEL[c.level]}</span>
                <span className="asearch__addr">{c.address}</span>
                {isTaken ? <span className="asearch__taken">{takenText}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
