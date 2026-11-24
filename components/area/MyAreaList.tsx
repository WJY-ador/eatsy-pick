"use client";

import "./area.css";
import { useId, useMemo, useRef, useState } from "react";
import { type AreaCandidate, keysOf, itemsOf } from "@/lib/my-areas";
import { AreaSearch } from "./AreaSearch";
import { addArea, isPersistent, removeArea, useMyAreas } from "./my-areas-store";

/**
 * 내 상권 목록(/area). 첫 방문과 서버 렌더는 기본 상권 목록이고, 수화 뒤 이 기기에 저장한 목록으로 바뀐다.
 * 지역 추가: 동네, 구, 역을 찾아 목록 끝에 넣는다(이미 있는 지역은 고를 수 없다). 지운 기본 상권을 다시 찾으면 그 상권으로 되살린다.
 * 편집: 기본 상권과 추가한 지역을 지운다. 지운 상권의 랭킹 주소(/area/<slug>)는 그대로 열린다.
 */
export function MyAreaList() {
  const state = useMyAreas();
  const items = useMemo(() => itemsOf(state), [state]);
  const taken = useMemo(() => keysOf(state), [state]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const addId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const onPick = (c: AreaCandidate) => {
    const ok = addArea(c);
    setNotice(ok ? `${c.name}을(를) 목록에 넣었습니다.` : `${c.name}은(는) 이미 목록에 있습니다.`);
    if (!isPersistent()) setNotice((n) => `${n} 이 브라우저에서는 목록이 저장되지 않습니다.`);
    if (ok) setAdding(false);
  };

  const onRemove = (key: string, name: string, index: number) => {
    removeArea(key);
    setNotice(`${name}을(를) 목록에서 지웠습니다. 다시 넣으려면 지역 추가에서 찾습니다.`);
    // 지운 자리의 다음 삭제 버튼으로 포커스를 옮긴다(없으면 편집 버튼).
    window.requestAnimationFrame(() => {
      const btns = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-testid="area-remove"]');
      const next = btns?.[Math.min(index, (btns?.length ?? 1) - 1)];
      (next ?? document.querySelector<HTMLButtonElement>('[data-testid="area-edit"]'))?.focus({ preventScroll: true });
    });
  };

  return (
    <div className="myareas">
      <div className="myareas__bar">
        <button
          type="button"
          className="btn btn--primary myareas__btn"
          data-testid="area-add"
          aria-expanded={adding}
          aria-controls={addId}
          onClick={() => {
            setAdding((v) => !v);
            setEditing(false);
          }}
        >
          {adding ? "추가 닫기" : "지역 추가"}
        </button>
        <button
          type="button"
          className="btn myareas__btn"
          data-testid="area-edit"
          aria-pressed={editing}
          onClick={() => {
            setEditing((v) => !v);
            setAdding(false);
          }}
        >
          {editing ? "편집 완료" : "편집"}
        </button>
      </div>
      <div id={addId} className="myareas__add" hidden={!adding}>
        {adding ? (
          <AreaSearch
            inputTestId="area-search-input"
            label="동네, 구, 역 찾기"
            placeholder="예: 부산 해운대역, 대구 중구, 제주 연동"
            taken={taken}
            takenText="이미 목록에 있습니다"
            onPick={onPick}
            autoFocus
          />
        ) : null}
      </div>
      <p className="myareas__notice" role="status" aria-live="polite">
        {notice}
      </p>
      {items.length === 0 ? <p className="report__empty">목록이 비었습니다. 지역 추가로 동네, 구, 역을 넣어 주세요.</p> : null}
      <ul ref={listRef} className={editing ? "area-index myareas__list is-editing" : "area-index myareas__list"} aria-label="내 상권 목록">
        {items.map((it, i) => (
          <li key={it.key} data-testid="area-item" data-key={it.key} data-kind={it.kind}>
            {editing ? (
              <span className="myareas__edit">
                <span className="myareas__name">
                  {it.name}
                  {it.sub ? <span className="myareas__sub"> {it.sub}</span> : null}
                </span>
                <button type="button" className="myareas__remove" data-testid="area-remove" aria-label={`${it.name} 목록에서 지우기`} onClick={() => onRemove(it.key, it.name, i)}>
                  지우기
                </button>
              </span>
            ) : (
              <a href={it.href}>
                {it.name}
                {it.sub ? <span className="myareas__sub"> {it.sub}</span> : null}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
