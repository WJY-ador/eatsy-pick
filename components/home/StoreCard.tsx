"use client";

import "@/app/feed.css";
import { MerLink } from "@/components/MerLink";
import { BookmarkButton } from "@/components/visits";
import { peakLabel } from "@/lib/labels";
import { distanceLabel, displayName, percentLabel } from "@/lib/store-view";
import type { Store } from "@/lib/stores";
import { customer1Label } from "@/lib/themes";
import { CategoryImage } from "./CategoryImage";

export type StoreCardProps = {
  store: Store;
  /** 거리 기준점에서의 직선거리. 모르면 null */
  distanceM: number | null;
  /** 카드 본문을 누르면 영수증 */
  onOpen: (store: Store, trigger: HTMLElement) => void;
  /** 기본 "card". "row"는 지도 옆 목록용 낮은 높이 */
  variant?: "card" | "row";
  /** 지도에서 선택되거나 강조된 매장 */
  active?: boolean;
  /** PC 호버와 키보드 포커스 때 호출(지도 핀 강조용) */
  onHover?: (id: string | null) => void;
  /** 추천 카드의 실제 일치 이유 한 줄. 없으면 줄을 뺀다 */
  reason?: string | null;
  /** 첫 화면에 보이는 카드의 이미지를 먼저 받는다 */
  priority?: boolean;
};

/**
 * 큐레이션 카드와 지도 옆 목록 행이 같이 쓰는 매장 카드.
 * 본문 버튼, 북마크, 잇플 링크는 형제다. 북마크와 잇플 링크를 눌러도 영수증이 열리지 않는다(앵커에 핸들러를 달지 않는다).
 * 가게명과 매출 근거를 먼저 읽게 둔다. 값이 없는 줄은 미확인으로 적거나 뺀다.
 * 매출 상위 %는 카드마다 본문 .sc__rank 한 번만 적는다(이미지 위 배지를 두지 않는다).
 * card는 위에 16:9 업종 참고 이미지를 둔다. 이미지는 형제이고, 본문 버튼의 누름 영역이 그 위까지 덮는다(feed.css .sc__open::before).
 * row(지도 옆 목록)는 이미지 없는 낮은 행이다. 모든 행이 같은 높이로 네 줄이다(feed.css Row variant).
 *   1줄: 가게명(넘치면 말줄임), 값이 true인 동네맛집, 회식 적합 표시, 오른쪽 끝 거리. 북마크는 그 오른쪽 형제.
 *   2줄: 매출 문구(시군구 매출 상위 N%, 값이 없으면 매출 순위 미확인).
 *     좁으면 시군구 이름(.sc__area)만 말줄임하고 매출 상위 N%는 잘리지 않는다.
 *   3줄: 대표 피크, 고객층 1위, 업종 칩. 칩은 줄이지 않고 다 보이거나 통째로 숨는다(뒤에서부터: 업종, 고객층). 값 없는 칩은 뺀다.
 *   4줄: 잇플 링크를 텍스트 링크로(MerLink, className만 다르다).
 */
export function StoreCard({ store, distanceM, onOpen, variant = "card", active = false, onHover, reason = null, priority = false }: StoreCardProps) {
  const name = displayName(store.name);
  const dist = distanceLabel(distanceM);
  const cust = customer1Label(store);
  const ranked = typeof store.ccgRank === "number" && Number.isFinite(store.ccgRank);
  const area = store.sigungu || "지역";
  const peak = variant === "row" ? peakLabel(store.peakDay ?? undefined, store.peakTime ?? undefined, true) : null;
  const rankLine = ranked ? (
    <>
      <span className="sc__area">{area}</span>{" "}
      <span className="sc__rank-val">
        매출 상위 <span className="sc__pct num">{percentLabel(store.ccgRank)}</span>
      </span>
    </>
  ) : (
    <span className="sc__pct sc__pct--none">매출 순위 미확인</span>
  );
  return (
    <article
      className="sc"
      data-testid="store-card"
      data-id={store.id}
      data-variant={variant}
      data-active={active ? "true" : undefined}
      onMouseEnter={onHover ? () => onHover(store.id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      onFocus={onHover ? () => onHover(store.id) : undefined}
      onBlur={
        onHover
          ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHover(null);
            }
          : undefined
      }
    >
      {variant === "card" ? (
        <div className="sc__media">
          <CategoryImage name={store.name} category={store.category} className="sc__img" priority={priority} />
        </div>
      ) : null}
      <button type="button" className="sc__open" data-testid="card-open" aria-haspopup="dialog" onClick={(e) => onOpen(store, e.currentTarget)}>
        {variant === "row" ? (
          <>
            <span className="sc__line">
              <span className="sc__name">{name}</span>
              {store.local === true ? <span className="sc__flag">동네맛집</span> : null}
              {store.hoesik === true ? <span className="sc__flag">회식 적합</span> : null}
              <span className="sc__dist num">{dist ?? "거리 미확인"}</span>
            </span>
            <span className="sc__rank">{rankLine}</span>
            <span className="sc__chips">
              {peak ? <span className="sc__badge">{peak} 피크</span> : null}
              {cust ? <span className="sc__badge">{cust} 1위</span> : null}
              {store.category ? <span className="sc__badge">{store.category}</span> : null}
            </span>
          </>
        ) : (
          <>
            <span className="sc__name">{name}</span>
            <span className="sc__rank">{rankLine}</span>
            <span className="sc__meta">
              {store.category ? <span className="sc__badge">{store.category}</span> : null}
              <span className="sc__dist num">{dist ?? "거리 미확인"}</span>
            </span>
            {cust ? <span className="sc__cust">고객층 1위 {cust}</span> : null}
            {reason ? <span className="sc__reason">{reason}</span> : null}
          </>
        )}
      </button>
      <BookmarkButton store={store} className="sc__bm" />
      <MerLink merUrl={store.merUrl} className={variant === "row" ? "sc__link" : "cta sc__cta"} />
    </article>
  );
}
