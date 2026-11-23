"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AREAS, areaBySlug, normalizePlace } from "@/lib/areas";
import { type Scope, analysisPath } from "./scope";
import s from "./analysis.module.css";

/** 빠른 상권 칩. 순서가 화면 순서다. */
const QUICK = ["gangnam", "yeouido", "seongsu", "euljiro", "pangyo"] as const;
const LOC_MAX = 30;

/** 자유 입력이 프리셋 이름이나 별칭이면 그 프리셋 slug */
export function presetSlugOf(input: string): string | null {
  const key = normalizePlace(input);
  if (!key) return null;
  const hit = AREAS.find((a) => a.aliases.includes(key) || normalizePlace(a.name) === key);
  return hit ? hit.slug : null;
}

/** 입력 → 분석 주소. 프리셋이면 area, 아니면 loc. 비었거나 너무 길면 null */
export function switchPath(input: string): string | null {
  const slug = presetSlugOf(input);
  if (slug) return analysisPath({ kind: "area", slug, name: "" }, null);
  const loc = input.replace(/\s+/g, " ").trim();
  if (!loc || loc.length > LOC_MAX) return null;
  return analysisPath({ kind: "loc", loc }, null);
}

/**
 * 상권 칩과 동네 검색. /analysis 안에서 다른 상권으로 바꾼다.
 * 새 주소에는 필터를 넣지 않는다(상권이 바뀌면 차트 필터를 초기화한다).
 */
export function AreaSwitch({ scope }: { scope: Scope }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const current = scope.kind === "area" ? scope.slug : null;

  return (
    <section className={s.panel} aria-label="상권 바꾸기">
      <nav className={s.areaChips} aria-label="빠른 상권">
        {QUICK.map((slug) => {
          const a = areaBySlug(slug);
          if (!a) return null;
          const on = current === slug;
          return (
            <Link
              key={slug}
              href={analysisPath({ kind: "area", slug, name: a.name }, null)}
              prefetch={false}
              scroll={false}
              className={s.areaChip}
              aria-current={on ? "page" : undefined}
            >
              {a.name}
            </Link>
          );
        })}
      </nav>
      <form
        className={s.search}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const path = switchPath(q);
          if (!path) {
            setError("동네 이름을 30자 안으로 입력해 주세요.");
            return;
          }
          setError(null);
          router.push(path, { scroll: false });
        }}
      >
        <label className={s.srOnly} htmlFor="area-search">
          동네 검색
        </label>
        <input
          id="area-search"
          className={s.searchInput}
          type="search"
          enterKeyHint="search"
          placeholder="동네 이름, 예: 성수동2가"
          maxLength={LOC_MAX}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className={s.btn}>
          분석
        </button>
      </form>
      {error ? (
        <p className={s.caption} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
