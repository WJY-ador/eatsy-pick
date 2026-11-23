"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AREAS, areaBySlug, matchArea } from "@/lib/areas";
import { OCCASIONS, type OccasionSlug } from "@/lib/occasions";
import { hrefFor } from "@/lib/query";

export type BarState = { area?: string; q?: string; occ: OccasionSlug; excludeFranchise: boolean };

/** 원터치 칩 8개. 나머지 11개 상권과 자유 입력은 "다른 동네" 입력으로 */
const CHIP_SLUGS = ["gangnam", "yeouido", "seongsu", "euljiro", "pangyo", "gwanghwamun", "hongdae", "yeoksam"];
const CHIPS = CHIP_SLUGS.map((s) => areaBySlug(s)!).filter(Boolean);
const OTHER_NAMES = AREAS.filter((a) => !CHIP_SLUGS.includes(a.slug)).map((a) => a.name);

/** 이동 대기 표시: 결과 영역을 흐리게 한다(html[data-nav="pending"]). prefetch를 끈 링크는 서버 응답까지 기다리기 때문이다. */
function setNavPending(on: boolean) {
  if (on) document.documentElement.dataset.nav = "pending";
  else delete document.documentElement.dataset.nav;
}

function PendingFlag() {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    setNavPending(true);
    return () => setNavPending(false);
  }, [pending]);
  return null;
}

/** 소프트 내비게이션 링크: prefetch 끔(프록시 호출 한도), 스크롤 유지. JS가 없으면 평범한 링크로 동작한다. */
export function NavLink({ href, className, current, children, ...rest }: { href: string; className: string; current?: boolean; children: React.ReactNode } & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link href={href} prefetch={false} scroll={false} className={className} aria-current={current ? "true" : undefined} {...rest}>
      {children}
      <PendingFlag />
    </Link>
  );
}

/**
 * 상단 고정 컨트롤 바: 1행 동네 칩(가로 스크롤), 2행 다른 동네 입력, 3행 모임 4등분.
 * 칩과 모임은 링크라 스크립트 없이도 동작하고, 스크립트가 있으면 결과만 바뀐다.
 */
export function ControlBar({ state }: { state: BarState }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const otherName = state.area && !CHIP_SLUGS.includes(state.area) ? areaBySlug(state.area)?.name : undefined;
  const shown = state.q ?? otherName ?? "";
  const [q, setQ] = useState(shown);
  const [lastShown, setLastShown] = useState(shown);
  if (shown !== lastShown) {
    // 조건이 바뀌어 서버가 새 값을 그리면 입력도 맞춘다(렌더 중 상태 맞춤).
    setLastShown(shown);
    setQ(shown);
  }

  // 선택된 칩이 보이게 가로 스크롤만 맞춘다(세로 스크롤은 건드리지 않는다).
  useEffect(() => {
    const sc = scrollerRef.current;
    const el = sc?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!sc || !el) return;
    sc.scrollLeft = Math.max(0, el.offsetLeft - (sc.clientWidth - el.offsetWidth) / 2);
  }, [state.area]);

  const go = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const area = matchArea(v);
    const href = hrefFor({ area: area?.slug, q: area ? undefined : v, occ: state.occ, excludeFranchise: state.excludeFranchise });
    setNavPending(true);
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  };

  useEffect(() => setNavPending(false), [state.area, state.q, state.occ, state.excludeFranchise]);

  return (
    <div className="bar">
      <div className="container bar__inner">
        <div className="bar__chips" ref={scrollerRef} role="group" aria-label="동네">
          {CHIPS.map((a) => (
            <NavLink
              key={a.slug}
              href={hrefFor({ area: a.slug, occ: state.occ, excludeFranchise: state.excludeFranchise })}
              className="chip"
              current={state.area === a.slug}
            >
              {a.name}
            </NavLink>
          ))}
        </div>
        <form
          className="bar__other"
          action="/"
          method="get"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement | null;
            go(input?.value ?? q);
          }}
        >
          <label htmlFor="q" className="bar__label">
            다른 동네
          </label>
          <input
            id="q"
            name="q"
            type="text"
            inputMode="text"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={40}
            list="area-list"
            placeholder="예: 잠실, 문래동"
            className="input bar__input"
            value={q}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              // 자동완성 항목을 고르면 바로 검색한다. 글자를 치는 중(insertText, 조합 중)에는 검색하지 않는다.
              const inputType = (e.nativeEvent as InputEvent).inputType;
              const picked = !inputType || inputType === "insertReplacementText";
              if (picked && OTHER_NAMES.includes(v.trim())) go(v);
            }}
          />
          <input type="hidden" name="occ" value={state.occ} />
          {state.excludeFranchise ? null : <input type="hidden" name="fr" value="0" />}
          <datalist id="area-list">
            {OTHER_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </form>
        <div className="seg" role="group" aria-label="모임 성격">
          {OCCASIONS.map((o) => (
            <NavLink
              key={o.slug}
              href={hrefFor({ area: state.area, q: state.q, occ: o.slug, excludeFranchise: state.excludeFranchise })}
              className="seg__item"
              current={state.occ === o.slug}
            >
              {o.name}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
