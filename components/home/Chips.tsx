"use client";

import { useEffect, useRef } from "react";

import { NavLink } from "@/components/NavLink";
import type { HomeScope } from "@/lib/home-params";
import { HOME_THEME_CHIPS, isHiddenTheme, type ThemeId, THEMES } from "@/lib/themes";
import type { HomeRegion } from "./RegionAdd";

/** 홈 기본 지역 칩(사용자 요청 원문 순서). 내 주변 다음 프리셋 다섯 곳. 목록에서 지운 곳은 빠진다(RegionAdd.tsx homeRegions) */
export const REGION_CHIPS: { slug: string; label: string }[] = [
  { slug: "gangnam", label: "강남역" },
  { slug: "seongsu", label: "성수" },
  { slug: "euljiro", label: "을지로" },
  { slug: "yeouido", label: "여의도" },
  { slug: "pangyo", label: "판교" },
];

/** 같은 홈 범위인가(프리셋은 slug, 동네는 loc 문자열) */
export function sameScope(a: HomeScope, b: HomeScope): boolean {
  return a.kind === "area" ? b.kind === "area" && a.slug === b.slug : b.kind === "loc" && a.loc === b.loc;
}

/**
 * 지역 줄. 칩은 평범한 링크라 스크립트 없이도 간다(서버 조회). 내 주변은 위치를 묻는 버튼이다.
 * regions는 홈 칩 목록(RegionAdd.tsx homeRegions). 서버와 첫 수화는 기본 칩 다섯 곳, 수화 뒤 이 기기에 저장한 목록이다.
 * 줄 끝(가로로 넘기는 칩 줄 밖)에 지역 추가 버튼, onMap이 있으면 지도 보기 버튼을 둔다. 지도 섹션이 그려질 때만 onMap을 넘긴다.
 */
export function RegionChips({
  regions,
  current,
  near,
  locating,
  hrefFor,
  onNear,
  onMap,
  panelId,
  panelOpen,
  onAdd,
}: {
  regions: HomeRegion[];
  current: HomeScope;
  near: boolean;
  locating: boolean;
  hrefFor: (scope: HomeScope) => string;
  onNear: () => void;
  /** 지도 섹션으로 바로 간다. 없으면 버튼을 그리지 않는다 */
  onMap?: () => void;
  panelId: string;
  panelOpen: boolean;
  onAdd: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const currentKey = near ? null : (regions.find((r) => sameScope(r.scope, current))?.key ?? null);
  // 줄이 넘칠 때만 끝을 흐리게 한다(넓은 화면 CSS가 data-overflow를 본다). 크기와 칩 수가 바뀔 때 다시 잰다.
  // 아래 현재 칩 넘기기보다 먼저 둔다(흐림 여백이 붙은 뒤 위치를 잰다).
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      row.dataset.overflow = String(row.scrollWidth > row.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [regions.length]);
  // 지금 보는 칩이 줄 밖(새로 추가한 지역은 줄 끝)에 있으면 줄만 옆으로 넘겨 보이게 한다(페이지는 움직이지 않는다).
  useEffect(() => {
    const row = rowRef.current;
    const el = row?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row || !el || row.scrollWidth <= row.clientWidth) return;
    const r = row.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    const edge = 32;
    if (e.right > r.right - edge) row.scrollLeft += e.right - r.right + edge;
    else if (e.left < r.left) row.scrollLeft -= r.left - e.left + edge;
  }, [currentKey, regions.length]);
  // 넓은 화면에서 저장 칩이 줄을 넘치면 마우스 휠(세로)로도 줄을 옆으로 넘긴다. 줄 끝에 닿으면 페이지 스크롤로 돌려준다.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const onWheel = (e: WheelEvent) => {
      if (row.scrollWidth <= row.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = row.scrollWidth - row.clientWidth;
      if ((e.deltaY < 0 && row.scrollLeft <= 0) || (e.deltaY > 0 && row.scrollLeft >= max - 1)) return;
      e.preventDefault();
      row.scrollLeft = Math.min(max, Math.max(0, row.scrollLeft + e.deltaY));
    };
    row.addEventListener("wheel", onWheel, { passive: false });
    return () => row.removeEventListener("wheel", onWheel);
  }, []);
  return (
    <div className="chips chips--region">
      <div className="chips__row" id="region-chips" role="group" aria-label="지역" ref={rowRef}>
        <button
          type="button"
          className="chip chip--near"
          data-testid="region-chip"
          data-region="near"
          aria-pressed={near}
          aria-busy={locating || undefined}
          onClick={onNear}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
            <circle cx="12" cy="10" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
          </svg>
          {locating ? "위치 찾는 중" : "내 주변"}
        </button>
        {regions.map((r) => (
          <NavLink
            key={r.key}
            href={hrefFor(r.scope)}
            className="chip"
            current={r.key === currentKey}
            data-testid="region-chip"
            data-region={r.scope.kind === "area" ? r.scope.slug : r.key}
            data-kind={r.kind}
          >
            {r.label}
            {r.sub ? <span className="chip__sub"> {r.sub}</span> : null}
          </NavLink>
        ))}
      </div>
      <button type="button" className="mapjump regionadd" data-testid="region-add" aria-expanded={panelOpen} aria-controls={panelId} aria-label="지역 추가와 편집" onClick={onAdd}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="regionadd__text">지역 추가</span>
      </button>
      {onMap ? (
        <button type="button" className="mapjump" data-testid="map-jump" onClick={onMap}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Zm0 0v13.5m6-11v13.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          </svg>
          지도 보기
        </button>
      ) : null}
    </div>
  );
}

/**
 * 테마 줄과 프랜차이즈 제외 토글. 받은 데이터 위에서 거른다(서버를 다시 부르지 않는다).
 * 칩에 없는 테마(옛 링크 t=y2030)가 주소에 있으면 눌린 칩이 없으니, 줄 아래에 적용 표시와 해제 버튼을 둔다.
 */
export function ThemeChips({ theme, onTheme, exclude, onExclude }: { theme: ThemeId; onTheme: (t: ThemeId) => void; exclude: boolean; onExclude: () => void }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const hidden = theme !== "all" && isHiddenTheme(theme) ? (THEMES.find((t) => t.id === theme)?.label ?? theme) : null;
  const release = () => {
    onTheme("all");
    // 해제 버튼은 사라지므로 포커스를 전체 칩으로 옮긴다.
    rowRef.current?.querySelector<HTMLElement>('[data-theme="all"]')?.focus();
  };
  return (
    <div className={hidden ? "chips chips--theme chips--on" : "chips chips--theme"}>
      <div className="chips__row" role="group" aria-label="테마" ref={rowRef}>
        {HOME_THEME_CHIPS.map((t) => (
          <button key={t.id} type="button" className="chip" data-testid="theme-chip" data-theme={t.id} aria-pressed={theme === t.id} onClick={() => onTheme(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <button type="button" className="sw" role="switch" aria-checked={exclude} data-testid="fr-toggle" onClick={onExclude}>
        <span className="sw__track" aria-hidden="true" />
        프랜차이즈 제외
      </button>
      {hidden ? (
        <div className="theme-on" data-testid="theme-applied" data-theme={theme}>
          <span className="theme-on__text">
            <span className="theme-on__name">{hidden}</span> 조건 적용 중
          </span>
          <button type="button" className="theme-on__off" aria-label={`${hidden} 조건 해제`} onClick={release}>
            해제
          </button>
        </div>
      ) : null}
    </div>
  );
}
