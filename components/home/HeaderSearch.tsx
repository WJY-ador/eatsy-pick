"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setNavPending } from "@/components/NavLink";

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
 * 머리말 통합 검색. 스크립트가 없으면 평범한 GET 폼(/?q=)으로 간다.
 * 스크립트가 있으면 같은 주소로 화면 안에서 이동한다(내 위치처럼 메모리에만 있는 상태를 잃지 않게).
 */
export function SearchForm({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!pending) return;
    setNavPending(true);
    return () => setNavPending(false);
  }, [pending]);

  return (
    <form
      className="hs"
      action="/"
      method="get"
      role="search"
      onSubmit={(e) => {
        const q = value.replace(/\s+/g, " ").trim();
        e.preventDefault();
        if (!q) {
          e.currentTarget.querySelector("input")?.focus();
          return;
        }
        startTransition(() => router.push(`/?${new URLSearchParams({ q }).toString()}`));
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
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="hs__go" aria-label="검색" aria-busy={pending || undefined}>
        <SearchIcon />
      </button>
    </form>
  );
}

/** 홈에서는 지금 검색어를 칸에 보인다. 다른 화면에서는 비운다 */
export function HeaderSearch() {
  const path = usePathname();
  const sp = useSearchParams();
  const q = path === "/" ? (sp.get("q") ?? "") : "";
  // 주소의 검색어가 바뀌면 칸을 새로 채운다.
  return <SearchForm key={q} initial={q} />;
}
