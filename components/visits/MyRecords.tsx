"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MerLink } from "@/components/MerLink";
import type { Store } from "@/lib/stores";
import { NOT_PERSISTENT_TEXT, clearAll, remove, sortRecords, useVisits } from "@/lib/visits";
import { REACTION_LABEL, dayLabel } from "./format";
import { StoreName } from "./NextPlan";
import { VisitControls } from "./VisitControls";
import s from "./visits.module.css";

/**
 * 내 기록. 최근에 바뀐 순으로 저장, 방문, 재방문 의향을 따로 적는다.
 * 저장만 한 매장에서 바로 "다녀왔어요"를 누를 수 있다. 항목별 기록 전체 삭제(저장, 방문, 반응), 모든 매장 기록 삭제(한 번 확인).
 */
export function MyRecords({ onOpen }: { onOpen?: (store: Store) => void }) {
  const { records, persistent } = useVisits();
  const list = useMemo(() => sortRecords(records), [records]);
  const [confirming, setConfirming] = useState(false);
  const headId = useId();
  const focusHead = useRef(false);
  const headRef = useRef<HTMLHeadingElement>(null);

  // 항목이나 전체를 지우면 버튼이 사라지므로 제목으로 초점을 옮긴다.
  useEffect(() => {
    if (!focusHead.current) return;
    focusHead.current = false;
    headRef.current?.focus();
  });

  return (
    <section className={s.records} aria-labelledby={headId}>
      <h2 className={s.planTitle} id={headId} ref={headRef} tabIndex={-1}>
        내 기록
      </h2>
      <p className={s.note}>기록은 이 기기에만 저장됩니다.</p>
      {persistent ? null : <p className={s.note}>{NOT_PERSISTENT_TEXT}</p>}

      {list.length === 0 ? (
        <p className={s.empty}>저장하거나 다녀온 매장이 아직 없습니다.</p>
      ) : (
        <>
          <ul className={s.items}>
            {list.map((r) => {
              const last = r.visits.length > 0 ? r.visits.reduce((a, b) => (b.at >= a.at ? b : a)) : null;
              return (
                <li key={r.store.id} className={s.item}>
                  <div className={s.itemHead}>
                    <StoreName store={r.store} onOpen={onOpen} />
                    <span className={s.itemMeta}>{r.store.category}</span>
                  </div>
                  <ul className={s.tags} aria-label="기록 상태">
                    <li className={s.tag}>{r.savedAt ? `저장 ${dayLabel(r.savedAt)}` : "저장 안 함"}</li>
                    <li className={s.tag}>
                      {last ? (
                        <>
                          방문 <span className={s.num}>{r.visits.length}</span>회, 최근 {dayLabel(last.at)}
                          {last.occasion ? `, ${last.occasion}` : ""}
                        </>
                      ) : (
                        "방문 기록 없음"
                      )}
                    </li>
                    {r.reaction ? <li className={s.tagStrong}>{REACTION_LABEL[r.reaction]}</li> : null}
                  </ul>
                  <VisitControls store={r.store} compact />
                  <div className={s.actions}>
                    <MerLink merUrl={r.store.merUrl ?? undefined} className={s.cta} />
                    <button
                      type="button"
                      className={s.btnQuiet}
                      aria-label={`${r.store.name} 기록 전체 삭제`}
                      onClick={() => {
                        focusHead.current = true;
                        remove(r.store.id);
                      }}
                    >
                      기록 전체 삭제
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {confirming ? (
            <div className={s.confirm} role="group" aria-label="전체 삭제 확인">
              <p className={s.detailLine}>
                기록 <span className={s.num}>{list.length}</span>건을 모두 지울까요?
              </p>
              <div className={s.actions}>
                <button
                  type="button"
                  className={s.btnDanger}
                  onClick={() => {
                    focusHead.current = true;
                    clearAll();
                    setConfirming(false);
                  }}
                >
                  모두 지우기
                </button>
                <button type="button" className={s.btn} onClick={() => setConfirming(false)}>
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div className={s.actions}>
              <button type="button" className={s.btnQuiet} onClick={() => setConfirming(true)}>
                모든 매장 기록 삭제
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
