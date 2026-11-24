"use client";

import { useRef } from "react";

import { NavLink } from "@/components/NavLink";
import { HOME_THEME_CHIPS, isHiddenTheme, type ThemeId, THEMES } from "@/lib/themes";

/** 지역 칩 순서(사용자 요청 원문). 내 주변 다음 프리셋 다섯 곳 */
export const REGION_CHIPS: { slug: string; label: string }[] = [
  { slug: "gangnam", label: "강남역" },
  { slug: "seongsu", label: "성수" },
  { slug: "euljiro", label: "을지로" },
  { slug: "yeouido", label: "여의도" },
  { slug: "pangyo", label: "판교" },
];

/**
 * 지역 줄. 프리셋은 평범한 링크라 스크립트 없이도 간다(서버 조회). 내 주변은 위치를 묻는 버튼이다.
 */
export function RegionChips({
  activeSlug,
  near,
  locating,
  hrefFor,
  onNear,
}: {
  activeSlug: string | null;
  near: boolean;
  locating: boolean;
  hrefFor: (slug: string) => string;
  onNear: () => void;
}) {
  return (
    <div className="chips" role="group" aria-label="지역">
      <div className="chips__row" id="region-chips">
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
        {REGION_CHIPS.map((r) => (
          <NavLink key={r.slug} href={hrefFor(r.slug)} className="chip" current={!near && activeSlug === r.slug} data-testid="region-chip" data-region={r.slug}>
            {r.label}
          </NavLink>
        ))}
      </div>
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
