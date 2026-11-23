"use client";

import { useEffect, useId, useRef } from "react";
import { MerLink } from "@/components/MerLink";
import { SaveButton, StoreSignalDetail, VisitControls } from "@/components/visits";
import { ATTRIBUTION, DISCLAIMER } from "@/lib/site";
import { customersOf, displayName, hoursOf, peakOf, percentLabel } from "@/lib/store-view";
import type { Store } from "@/lib/stores";

function localText(v: boolean | null): string {
  return v === true ? "현지인이 많이 찾는 곳" : v === false ? "표시 없음" : "정보 없음";
}

function hoesikText(v: boolean | null): string {
  return v === true ? "회식하기 좋은 곳으로 표시" : v === false ? "표시 없음" : "정보 없음";
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rc__row">
      <dt className="rc__k">{label}</dt>
      <dd className="rc__v">{children}</dd>
    </div>
  );
}

/**
 * 결제 영수증 상세. 매장명이나 지도 핀을 누르면 열린다.
 * 모바일은 아래에서 올라오는 시트, 데스크톱은 오른쪽 패널. 열리면 제목으로 포커스, Esc와 닫기로 닫는다.
 */
export function Receipt({
  store,
  distance,
  distanceBasis,
  onClose,
  onPeak,
}: {
  store: Store;
  distance: string | null;
  distanceBasis: string | null;
  onClose: () => void;
  /** 대표 피크 차트를 연다(없으면 글자로만) */
  onPeak?: () => void;
}) {
  const titleId = useId();
  const headRef = useRef<HTMLHeadingElement>(null);
  const customers = customersOf(store);
  const peak = peakOf(store);
  const hours = hoursOf(store);

  useEffect(() => {
    headRef.current?.focus();
  }, [store.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button type="button" className="rc__scrim" aria-label="영수증 닫기" tabIndex={-1} onClick={onClose} />
      <aside className="rc" role="dialog" aria-labelledby={titleId}>
        <div className="rc__top">
          <p className="rc__kind">결제 영수증</p>
          <button type="button" className="rc__close" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="rc__paper">
          <h2 id={titleId} ref={headRef} tabIndex={-1} className="rc__name">
            {displayName(store.name)}
          </h2>
          <p className="rc__cat">
            {store.category}
            {distance ? (
              <>
                , <span className="num">{distance}</span>
                {distanceBasis ? ` (${distanceBasis})` : ""}
              </>
            ) : null}
          </p>
          <p className="rc__addr">{store.address}</p>
          <hr className="rc__dash" />
          <dl className="rc__list">
            <Row label={`${store.sigungu || "시군구"} 매출 상위`}>
              <span className="num">{percentLabel(store.ccgRank)}</span>
            </Row>
            <Row label="전국 매출 상위">
              <span className="num">{percentLabel(store.allRank)}</span>
            </Row>
            <Row label="고객층">
              {customers.length ? (
                <ol className="rc__cust">
                  {customers.map((c, i) => (
                    <li key={c}>
                      <span className="num">{i + 1}위</span> {c}
                    </li>
                  ))}
                </ol>
              ) : (
                "정보 없음"
              )}
            </Row>
            <Row label="대표 피크">
              {peak && onPeak ? (
                <button type="button" className="taghit rc__peak" onClick={onPeak} aria-haspopup="dialog">
                  <span className="tag tag--btn">
                    {peak}
                    <span className="tag__chev" aria-hidden="true" />
                  </span>
                </button>
              ) : (
                (peak ?? "정보 없음")
              )}
            </Row>
            <Row label="예상 영업시간">
              {hours ? <span className="num">{hours}</span> : "정보 없음"}
              <span className="rc__note">최근 1개월 결제 승인 시각 기준 추정</span>
            </Row>
            {store.holidays.length ? <Row label="휴무 요일">{store.holidays.join(", ")}</Row> : null}
            <Row label="동네맛집">{localText(store.local)}</Row>
            <Row label="회식 적합">{hoesikText(store.hoesik)}</Row>
          </dl>
          <hr className="rc__dash" />
          <div className="rc__mine">
            <SaveButton store={store} />
            <VisitControls store={store} />
            <StoreSignalDetail store={store} />
          </div>
          <hr className="rc__dash" />
          <MerLink merUrl={store.merUrl} className="cta rc__cta" />
          <p className="rc__attr">{ATTRIBUTION}</p>
          <p className="rc__disc">{DISCLAIMER}</p>
        </div>
      </aside>
    </>
  );
}
