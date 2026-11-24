"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Store } from "@/lib/stores";
import {
  NOT_PERSISTENT_TEXT,
  OCCASIONS,
  type Occasion,
  type VisitRecord,
  clearVisits,
  markVisited,
  setOccasion,
  setReaction,
  useVisits,
} from "@/lib/visits";
import { REACTION_LABEL, dayLabel } from "./format";
import s from "./visits.module.css";

function latestVisit(rec: VisitRecord) {
  return rec.visits.reduce((a, b) => (b.at >= a.at ? b : a));
}

/**
 * "다녀왔어요" → 방문 기록 + 그 자리에서 재방문 의향과 모임 유형(선택).
 * 반응과 유형은 누르는 즉시 저장한다. 이미 기록이 있으면 방문 날짜(모임 유형), 재방문 의향과 고치기, 방문 기록 지우기(저장은 남김).
 * compact면 상태 요약과 방문 기록 지우기를 빼고 버튼만 둔다(내 저장 목록이 상태를 따로 보여 줄 때).
 */
export function VisitControls({ store, compact = false }: { store: Store; compact?: boolean }) {
  const { records, persistent } = useVisits();
  const rec = records[store.id];
  const visited = !!rec && rec.visits.length > 0;
  // 편집 중인 매장 id. 같은 인스턴스에 다른 매장이 들어와도 편집 화면이 따라가지 않게 id로 든다.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId === store.id;
  const focusNext = useRef(false);
  const target = useRef<HTMLButtonElement>(null);
  const reactionId = useId();
  const occasionId = useId();

  // 버튼이 사라지는 전환(다녀왔어요 → 반응 입력 → 완료 → 지우기) 뒤에 키보드 초점을 새 자리로 옮긴다.
  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    target.current?.focus();
  });

  const go = (fn: () => void) => () => {
    focusNext.current = true;
    fn();
  };

  const notice = persistent ? null : <p className={s.note}>{NOT_PERSISTENT_TEXT}</p>;

  if (!visited) {
    return (
      <div className={s.controls}>
        <button
          ref={target}
          type="button"
          className={s.btn}
          onClick={go(() => {
            markVisited(store);
            setEditingId(store.id);
          })}
        >
          다녀왔어요
        </button>
        {notice}
      </div>
    );
  }

  const last = latestVisit(rec);

  if (editing) {
    return (
      <div className={`${s.controls} ${s.editing}`} role="group" aria-label="방문 기록 남기기">
        <p className={s.status}>
          방문 <span className={s.num}>{rec.visits.length}</span>회 기록했습니다
        </p>
        <div className={s.field}>
          <p className={s.legend} id={reactionId}>
            재방문 의향
          </p>
          <div className={s.chips} role="group" aria-labelledby={reactionId}>
            {(["again", "other"] as const).map((r, i) => (
              <button
                key={r}
                ref={i === 0 ? target : undefined}
                type="button"
                className={s.chip}
                aria-pressed={rec.reaction === r}
                onClick={() => setReaction(store.id, rec.reaction === r ? null : r)}
              >
                {REACTION_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
        <div className={s.field}>
          <p className={s.legend} id={occasionId}>
            모임 유형 <span className={s.optional}>선택</span>
          </p>
          <div className={s.chips} role="group" aria-labelledby={occasionId}>
            {OCCASIONS.map((o: Occasion) => (
              <button
                key={o}
                type="button"
                className={s.chip}
                aria-pressed={last.occasion === o}
                onClick={() => setOccasion(store.id, last.occasion === o ? null : o)}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <div className={s.actions}>
          <button type="button" className={s.btn} onClick={go(() => setEditingId(null))}>
            완료
          </button>
        </div>
        {notice}
      </div>
    );
  }

  return (
    <div className={s.controls}>
      {compact ? null : (
        <dl className={s.summary}>
          <div>
            <dt>방문</dt>
            <dd>
              <span className={s.num}>{rec.visits.length}</span>회
              <ul className={s.visitList} aria-label="방문 날짜">
                {[...rec.visits]
                  .sort((a, b) => (a.at < b.at ? 1 : -1))
                  .map((v, i) => (
                    <li key={`${v.at}-${i}`}>
                      {dayLabel(v.at)}
                      {v.occasion ? `, ${v.occasion}` : ""}
                    </li>
                  ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt>재방문 의향</dt>
            <dd>{rec.reaction ? REACTION_LABEL[rec.reaction] : "남기지 않음"}</dd>
          </div>
        </dl>
      )}
      <div className={s.actions}>
        <button ref={target} type="button" className={s.btn} onClick={go(() => setEditingId(store.id))}>
          고치기
        </button>
        <button
          type="button"
          className={s.btn}
          onClick={go(() => {
            markVisited(store);
            setEditingId(store.id);
          })}
        >
          또 다녀왔어요
        </button>
        {compact ? null : (
          <button type="button" className={s.btnQuiet} onClick={go(() => clearVisits(store.id))}>
            방문 기록 지우기
          </button>
        )}
      </div>
      {notice}
    </div>
  );
}
