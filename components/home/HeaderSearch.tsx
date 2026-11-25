"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useMyAreas } from "@/components/area/my-areas-store";
import { setNavPending } from "@/components/NavLink";
import { foodCategory } from "@/lib/food";
import { analysisHref, bareWordFood, parseHome } from "@/lib/home-params";
import {
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_LABEL,
  type SuggestRow,
  loadSuggest,
  localSuggest,
  mergeSuggest,
  peekSuggest,
  serverQuery,
} from "@/lib/suggest";

export const SEARCH_PLACEHOLDER = "동네, 역, 음식점 검색";
const Q_MAX = 40;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="m15.6 15.6 4.4 4.4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 맛집 둘러보기(/analysis)에서 머리말 검색어가 갈 주소. 풀이는 홈 검색과 같다(parseHome).
 * 지역(프리셋, 동, 가, 구, 역 이름, 주소 여러 토큰)과 지역 + 음식(성수 고기)은 그 지역의 /analysis로 바로 간다.
 * 음식만(고기)이면 지금 보는 지역에 음식 조건(food)을 건다. 차트 필터와 프랜차이즈 설정은 넘기지 않는다(지역이 바뀌면 초기화).
 * 그 밖은 지금 범위(area 또는 loc)에 가게 이름 조건(q)을 붙인다. 맨 낱말 + 음식(교촌 치킨)은 이름(교촌)과 음식 조건으로 나눈다.
 * 서버는 q가 맨 낱말이면 홈과 같은 지명 풀이를 먼저 보고, 지역(망원)이면 그 지역으로 보낸다(app/analysis/page.tsx).
 * current는 지금 /analysis 주소의 쿼리(?area=gangnam)다.
 */
export function analysisSearchHref(q: string, current: string): string {
  const h = parseHome({ q });
  // 지금 지역은 홈과 같은 규칙으로 읽는다(analysis/scope.ts는 차트 집계 모듈을 끌고 와 머리말 번들에 넣지 않는다).
  const cur = new URLSearchParams(current);
  const here = parseHome({ area: cur.get("area") ?? undefined, loc: cur.get("loc") ?? undefined }).scope;
  if (h.q !== null) {
    const bw = bareWordFood(q);
    return `${analysisHref(here, bw?.food ?? null)}&${new URLSearchParams({ q: bw ? bw.word : q }).toString()}`;
  }
  if (h.food && foodCategory(q) === h.food) return analysisHref(here, h.food);
  return analysisHref(h.scope, h.food);
}

/** 관련 검색어 목록 id. 항목 id는 뒤에 -<순번> */
const LIST_ID = "site-q-list";

/**
 * 머리말 통합 검색. 스크립트가 없으면 평범한 GET 폼(/?q=)으로 간다.
 * 스크립트가 있으면 같은 주소로 화면 안에서 이동한다(내 위치처럼 메모리에만 있는 상태를 잃지 않게).
 * 맛집 둘러보기에서는 지역, 음식, 가게 이름 검색을 그 화면 안에서 바꾼다(analysisSearchHref). 기록이 남는 이동이다.
 * 입력하면 칸 아래에 관련 검색어가 뜬다(lib/suggest.ts). 고르면 그 글자로 제출과 똑같이 간다.
 * 목록은 사용자 입력(글자, 아래 방향키)으로만 열고, 열린 동안만 DOM에 둔다(lib/top-fold가 listbox가 있으면 상단 바를 접지 않는다).
 * 서버 장소는 입력이 SUGGEST_DEBOUNCE_MS 멈춘 뒤 부르고, 입력이 바뀌거나 닫히면 진행 중 요청을 끊는다. 지금 입력의 응답만 보인다.
 */
export function SearchForm({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // 서버 응답이 memo에 담기면 다시 그린다(값은 쓰지 않는다)
  const [, setLoaded] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const my = useMyAreas();
  const local = useMemo(() => localSuggest(value, my.custom), [value, my.custom]);
  const sq = open ? serverQuery(value) : null;
  const rows = mergeSuggest(local, sq ? peekSuggest(sq) : undefined, sq !== null);
  const shown = open && rows.length > 0;
  const activeIdx = shown && activeKey !== null ? rows.findIndex((r) => r.key === activeKey) : -1;

  useEffect(() => {
    if (!pending) return;
    setNavPending(true);
    return () => setNavPending(false);
  }, [pending]);

  useEffect(() => {
    if (!sq || peekSuggest(sq)) return;
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      void loadSuggest(sq, ctl.signal).then((ok) => {
        if (ok && !ctl.signal.aborted) setLoaded((n) => n + 1);
      });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, [sq]);

  // 바깥을 누르면 닫는다(목록 안은 폼 안이다)
  useEffect(() => {
    if (!shown) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !formRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [shown]);

  useEffect(() => {
    if (activeIdx >= 0) document.getElementById(`${LIST_ID}-${activeIdx}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const close = () => {
    setOpen(false);
    setActiveKey(null);
  };

  // 폼 제출과 항목 고르기가 같이 쓴다
  const go = (raw: string, input: HTMLInputElement | null) => {
    const q = raw.replace(/\s+/g, " ").trim();
    close();
    if (!q) {
      input?.focus();
      return;
    }
    // 경로는 제출 시점의 주소에서 읽는다(Suspense 대기 중의 폼도 같은 규칙을 따른다).
    const here = window.location;
    const href = here.pathname === "/analysis" ? analysisSearchHref(q, here.search) : `/?${new URLSearchParams({ q }).toString()}`;
    startTransition(() => router.push(href));
  };

  const choose = (row: SuggestRow) => {
    setValue(row.text);
    go(row.text, null);
  };

  return (
    <form
      ref={formRef}
      className="hs"
      action="/"
      method="get"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(value, e.currentTarget.querySelector("input"));
      }}
      onBlur={(e) => {
        // 초점이 폼 밖으로 가면 닫는다(목록은 누를 때 초점을 가져가지 않는다)
        if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <label className="visually-hidden" htmlFor="site-q">
        {SEARCH_PLACEHOLDER}
      </label>
      <input
        id="site-q"
        className="hs__input"
        type="search"
        name="q"
        maxLength={Q_MAX}
        enterKeyHint="search"
        autoComplete="off"
        placeholder={SEARCH_PLACEHOLDER}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={shown ? LIST_ID : undefined}
        aria-activedescendant={activeIdx >= 0 ? `${LIST_ID}-${activeIdx}` : undefined}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(e.target.value.trim() !== "");
          setActiveKey(null);
        }}
        onKeyDown={(e) => {
          // 한글 조합 중 키로는 항목을 고르거나 옮기지 않는다. 기본 동작(조합 마치기, 브라우저의 제출 규칙)은 막지 않는다
          // (막으면 조합 중 Enter를 한 번만 보내는 브라우저에서 Enter를 두 번 눌러야 한다)
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (rows.length === 0) return;
            e.preventDefault();
            const down = e.key === "ArrowDown";
            const n = rows.length;
            // 닫혀 있으면 열고 첫 항목에 선다(열리면 서버 자리 때문에 기기 안 항목 수가 줄 수 있다)
            const next = !shown ? 0 : activeIdx < 0 ? (down ? 0 : n - 1) : (activeIdx + (down ? 1 : -1) + n) % n;
            setOpen(true);
            setActiveKey(rows[next].key);
          } else if (e.key === "Enter") {
            if (activeIdx >= 0) {
              e.preventDefault();
              choose(rows[activeIdx]);
            }
          } else if (e.key === "Escape") {
            // 열렸을 때만 닫는다(type=search의 Esc 지우기를 막는다). 닫혔을 때는 그대로 둔다
            if (shown) {
              e.preventDefault();
              close();
            }
          }
        }}
      />
      <button type="submit" className="hs__go" aria-label="검색" aria-busy={pending || undefined}>
        <SearchIcon />
      </button>
      {shown && (
        <ul id={LIST_ID} className="hs__list" role="listbox" aria-label="관련 검색어" onMouseDown={(e) => e.preventDefault()}>
          {rows.map((r, i) => (
            <li key={r.key} id={`${LIST_ID}-${i}`} className="hs__opt" role="option" aria-selected={i === activeIdx} onClick={() => choose(r)}>
              <span className="hs__text">{r.text}</span>
              <span className="hs__kind">{SUGGEST_LABEL[r.kind]}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

/** 홈과 맛집 둘러보기에서는 지금 검색어(q)를 칸에 보인다. 다른 화면에서는 비운다 */
export function HeaderSearch() {
  const path = usePathname();
  const sp = useSearchParams();
  // 맛집 둘러보기는 가게 이름 조건(q)을 칸에 보인다(지역, 음식 검색 뒤에는 빈다).
  const q = path === "/" || path === "/analysis" ? (sp.get("q") ?? "") : "";
  // 주소의 검색어가 바뀌면 칸을 새로 채운다. 맛집 둘러보기는 지역, 음식, 이름 조건이 바뀔 때(검색, 해제, 뒤로 가기) 새로 채운다.
  // 차트 필터만 바뀔 때는 그대로 둔다.
  const key = path === "/analysis" ? `analysis|${sp.get("area") ?? ""}|${sp.get("loc") ?? ""}|${sp.get("food") ?? ""}|${q}` : q;
  return <SearchForm key={key} initial={q} />;
}

export const EXPLORE_LABEL = "맛집 둘러보기";

/** 머리말의 맛집 둘러보기 링크. 스크립트 전과 Suspense 대기 중에는 기본 주소(/analysis)다 */
export function ExploreLinkBase({ href = "/analysis" }: { href?: string }) {
  return (
    <Link className="top__link" prefetch={false} href={href} data-testid="explore-link">
      {EXPLORE_LABEL}
    </Link>
  );
}

/**
 * 홈에서는 지금 보고 있는 지역(area 또는 loc), 음식 조건(업종), 프랜차이즈 제외 설정을 /analysis로 넘긴다.
 * 주소 꼴은 브리핑 링크와 같다(analysisHref). 좌표와 매장 이름 검색어는 넘기지 않는다. 다른 화면에서는 /analysis.
 * 범위 없는 가게 이름 검색(지역으로 풀리지 않은 q)은 보는 지역이 없어 기본 상권 대신 지역 없는 /analysis로 보낸다.
 * 지역으로 풀린 낱말은 주소가 loc + q라 그 지역으로 간다.
 */
export function ExploreLink() {
  const path = usePathname();
  const sp = useSearchParams();
  if (path !== "/") return <ExploreLinkBase />;
  const h = parseHome(Object.fromEntries(sp.entries()));
  if (h.isDefault && h.q) return <ExploreLinkBase />;
  return <ExploreLinkBase href={analysisHref(h.scope, h.food, h.excludeFranchise)} />;
}
