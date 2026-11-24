"use client";

import { useId, useState, useSyncExternalStore } from "react";
import type { SectionId } from "@/lib/curation-assign";
import type { Store } from "@/lib/stores";
import type { ThemeId } from "@/lib/themes";
import { StoreCard } from "./StoreCard";

/** 한 섹션에 싣는 카드 수 상한(PC와 모바일 같다). 나머지는 아래 지도와 전체 매장에서 본다 */
export const CURATION_MAX = 12;

// 768px 미만은 가로 스와이프(넘김 버튼 없음), 768~1023px은 3열, 1024px 이상은 4열 묶음으로 넘긴다.
const WIDE = "(min-width: 64rem)";
function subscribe(l: () => void) {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", l);
  return () => m.removeEventListener("change", l);
}
function usePerPage(): number {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(WIDE).matches ? 4 : 3),
    () => 4,
  );
}

function Arrow({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d={dir === "next" ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 큐레이션 한 섹션. 모바일은 다음 카드 일부가 보이는 가로 스와이프, PC는 3~4열 묶음과 넘김 버튼.
 * 어떤 카드를 싣는지는 부모가 정한다(화면 폭과 무관). 열 수는 넘김 버튼에만 쓴다.
 * 제목 옆 수는 실은 카드 수다. 조건에 맞는 전체 수가 더 크면 아래 안내 한 줄로 어디서 보는지 적는다.
 */
export function Curation({
  theme,
  title,
  sub,
  stores,
  total,
  shownElsewhere = 0,
  distanceOf,
  onOpen,
  activeId,
  onHover,
  priority = false,
  reasons,
}: {
  theme: ThemeId | SectionId;
  title: string;
  sub: string;
  /** 이 섹션에 배정한 카드(최대 CURATION_MAX) */
  stores: Store[];
  /** 이 조건에 맞는 전체 수 */
  total: number;
  /** 조건에 맞지만 앞 섹션에 이미 실려 여기서 뺀 수(전체 테마의 중복 제거) */
  shownElsewhere?: number;
  distanceOf: (s: Store) => number | null;
  onOpen: (s: Store, trigger: HTMLElement) => void;
  activeId: string | null;
  onHover?: (id: string | null) => void;
  /** 첫 화면 섹션이면 앞 카드 두 장의 이미지를 먼저 받는다 */
  priority?: boolean;
  /** 추천 섹션: 매장 id별 실제 일치 이유 한 줄 */
  reasons?: ReadonlyMap<string, string>;
}) {
  const hid = useId();
  const perPage = usePerPage();
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(stores.length / perPage));
  const at = Math.min(page, pages - 1);
  const shownFrom = at * perPage;
  return (
    <section className="cur" data-testid="curation" data-theme={theme} aria-labelledby={hid}>
      <div className="cur__head">
        <div className="cur__titles">
          <div className="cur__line">
            <h2 id={hid} className="cur__h">
              {title}
            </h2>
            <span className="cur__n num">{stores.length}곳</span>
          </div>
          <p className="cur__sub">{sub}</p>
        </div>
        <div className="cur__nav">
          <span className="cur__pos num" aria-live="polite">
            {pages > 1 ? `${at + 1} / ${pages}` : ""}
          </span>
          <button type="button" className="cur__btn" data-testid="cur-prev" aria-label={`${title} 이전 묶음`} disabled={at === 0} onClick={() => setPage(at - 1)}>
            <Arrow dir="prev" />
          </button>
          <button type="button" className="cur__btn" data-testid="cur-next" aria-label={`${title} 다음 묶음`} disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
            <Arrow dir="next" />
          </button>
        </div>
      </div>
      <ul className="cur__track" aria-label={`${title}, ${stores.length}곳`}>
        {stores.map((s, i) => (
          <li key={s.id} className="cur__item" data-off={i < shownFrom || i >= shownFrom + perPage ? "true" : undefined}>
            <StoreCard store={s} distanceM={distanceOf(s)} onOpen={onOpen} active={s.id === activeId} onHover={onHover} priority={priority && i < 2} reason={reasons?.get(s.id) ?? null} />
          </li>
        ))}
      </ul>
      {total > stores.length ? (
        <p className="cur__more">
          {shownElsewhere > 0
            ? `조건에 맞는 ${total}곳 중 위 섹션에 나온 ${shownElsewhere}곳은 빼고 실었습니다. 전체는 아래 지도와 전체 매장에서 볼 수 있습니다.`
            : `나머지 ${total - stores.length}곳은 아래 지도와 전체 매장에서 볼 수 있습니다.`}
        </p>
      ) : null}
    </section>
  );
}
