"use client";

import { useEffect, useRef, useState } from "react";
import type { Store } from "@/lib/stores";
import { displayName } from "@/lib/store-view";
import { closeRegularAsk, isSaved, setStage, shouldAskRegular, useVisitRecord } from "@/lib/visits";
import { rankCompare, sinceLabel, useKstToday } from "./format";
import s from "./visits.module.css";

/**
 * 저장할 때와 지금의 지역 매출 순위 한 줄. 지금 값(nowRank)은 지금 조회한 매장 데이터에서만 받는다(내 저장 사본 값을 넘기지 않는다).
 * 같거나 하나라도 모르면 그리지 않는다.
 */
export function RankCompareLine({ savedRank, nowRank }: { savedRank: number | null; nowRank: number | null | undefined }) {
  const cmp = rankCompare(savedRank, nowRank);
  if (!cmp) return null;
  return (
    <p className={s.rankLine} data-testid="rank-compare">
      저장할 때 상위 <span className={s.num}>{cmp.saved}</span>, 지금 상위 <span className={s.num}>{cmp.now}</span>
      <span className={s.rankBasis}>지역 매출 순위, 최근 1개월 결제 매출 기준</span>
    </p>
  );
}

/** 마지막 다녀왔어요 뒤 지난 날수(오늘 방문, 어제 방문, N일 전 방문). 방문이 없으면 null */
export function useVisitSince(store: Store): string | null {
  const rec = useVisitRecord(store.id);
  const today = useKstToday();
  return rec ? sinceLabel(rec.visits, today) : null;
}

/**
 * 단골 제안. 저장했고 다녀왔어요를 3번 이상 눌렀고 단골도 보류도 아니면 한 줄로 묻는다.
 * 옮기기는 단계를 단골로 바꾼다. 닫기는 그 매장에 다시 묻지 않게 기록에 남긴다.
 * 누르면 버튼이 사라지므로 결과 문구를 그 자리에 두고 키보드 초점을 옮긴다.
 */
export function RegularAsk({ store }: { store: Store }) {
  const rec = useVisitRecord(store.id);
  const [done, setDone] = useState<{ id: string; text: string } | null>(null);
  const focusDone = useRef(false);
  const doneRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!focusDone.current) return;
    focusDone.current = false;
    doneRef.current?.focus();
  });

  if (rec && shouldAskRegular(rec)) {
    const name = displayName(store.name);
    return (
      <div className={s.ask} role="group" aria-label="단골 제안" data-testid="regular-ask">
        <p className={s.askText}>
          <span className={s.num}>{rec.visits.length}</span>번 방문했습니다. 단골로 옮길까요?
        </p>
        <div className={s.actions}>
          <button
            type="button"
            className={s.btn}
            data-testid="regular-ask-move"
            aria-label={`${name} 단골로 옮기기`}
            onClick={() => {
              focusDone.current = true;
              setDone({ id: store.id, text: "단골로 옮겼습니다." });
              setStage(store.id, "regular");
            }}
          >
            옮기기
          </button>
          <button
            type="button"
            className={s.btnQuiet}
            data-testid="regular-ask-close"
            aria-label={`${name} 단골 제안 닫기`}
            onClick={() => {
              focusDone.current = true;
              setDone({ id: store.id, text: "이 가게에는 다시 묻지 않습니다." });
              closeRegularAsk(store.id);
            }}
          >
            닫기
          </button>
        </div>
      </div>
    );
  }
  if (done && done.id === store.id && isSaved(rec)) {
    return (
      <p ref={doneRef} className={s.note} tabIndex={-1} role="status" data-testid="regular-ask-done">
        {done.text}
      </p>
    );
  }
  return null;
}

/**
 * 영수증의 내 기록 맨 위: 마지막 다녀왔어요 뒤 지난 날수, 저장할 때와 지금 순위, 단골 제안.
 * live: 영수증의 store가 지금 조회한 값인지. 아니면(내 저장 사본으로 연 영수증) 순위 비교를 띄우지 않는다.
 */
export function CrmFacts({ store, live }: { store: Store; live: boolean }) {
  const rec = useVisitRecord(store.id);
  const since = useVisitSince(store);
  const savedRank = live && rec && isSaved(rec) && rankCompare(rec.savedRank, store.ccgRank) ? rec.savedRank : null;
  return (
    <>
      {since || savedRank !== null ? (
        <div className={s.facts}>
          {since ? (
            <p className={s.detailLine} data-testid="visit-since">
              {since}
            </p>
          ) : null}
          {savedRank !== null ? <RankCompareLine savedRank={savedRank} nowRank={store.ccgRank} /> : null}
        </div>
      ) : null}
      <RegularAsk store={store} />
    </>
  );
}
