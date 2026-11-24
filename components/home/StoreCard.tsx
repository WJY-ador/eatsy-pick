"use client";

import "@/app/feed.css";
import { MerLink } from "@/components/MerLink";
import { BookmarkButton } from "@/components/visits";
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
 * card는 위에 16:9 업종 참고 이미지를 둔다. 이미지는 형제이고, 본문 버튼의 누름 영역이 그 위까지 덮는다(feed.css .sc__open::before).
 * row(지도 옆 목록)는 이미지 없는 낮은 행이다.
 */
export function StoreCard({ store, distanceM, onOpen, variant = "card", active = false, onHover, reason = null, priority = false }: StoreCardProps) {
  const name = displayName(store.name);
  const dist = distanceLabel(distanceM);
  const cust = customer1Label(store);
  const ranked = typeof store.ccgRank === "number" && Number.isFinite(store.ccgRank);
  const area = store.sigungu || "지역";
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
          {/* 본문 .sc__rank가 같은 수치를 읽으므로 화면 읽기에서는 뺀다 */}
          {ranked ? (
            <span className="sc__topbadge num" aria-hidden="true">
              상위 {percentLabel(store.ccgRank)}
            </span>
          ) : null}
        </div>
      ) : null}
      <button type="button" className="sc__open" data-testid="card-open" aria-haspopup="dialog" onClick={(e) => onOpen(store, e.currentTarget)}>
        <span className="sc__name">{name}</span>
        <span className="sc__rank">
          {ranked ? (
            <>
              {area} 매출 상위 <span className="sc__pct num">{percentLabel(store.ccgRank)}</span>
            </>
          ) : (
            <span className="sc__pct sc__pct--none">매출 순위 미확인</span>
          )}
        </span>
        <span className="sc__meta">
          {store.category ? <span className="sc__badge">{store.category}</span> : null}
          <span className="sc__dist num">{dist ?? "거리 미확인"}</span>
        </span>
        {cust ? <span className="sc__cust">고객층 1위 {cust}</span> : null}
        {reason ? <span className="sc__reason">{reason}</span> : null}
      </button>
      <BookmarkButton store={store} className="sc__bm" />
      <MerLink merUrl={store.merUrl} className="cta sc__cta" />
    </article>
  );
}
