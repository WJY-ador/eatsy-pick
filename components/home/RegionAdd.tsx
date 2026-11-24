"use client";

// 홈 지역 칩의 목록과 지역 추가, 편집 패널. 목록은 상권 랭킹(/area) 내 상권 목록과 같은 저장소(components/area/my-areas-store.ts)다.
// 홈 칩 = 홈 기본 칩 다섯 곳(REGION_CHIPS) 중 목록에서 지우지 않은 것 + 직접 추가한 지역(추가한 순서).
// 상권 랭킹의 나머지 기본 상권 14곳은 홈 칩에 늘 두지 않는다(칩 줄이 길어진다). 그 상권을 보고 있을 때만 끝에 칩 하나를 더 보인다.
// 저장 꼴(키, href)에 기대지 않고 공개 필드(level, name, sido, address)와 공개 함수만 쓴다.

import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { AreaSearch } from "@/components/area/AreaSearch";
import { addArea, isPersistent, removeArea } from "@/components/area/my-areas-store";
import { areaBySlug } from "@/lib/areas";
import { type HomeScope, scopeFromPlace } from "@/lib/home-params";
import { type AreaCandidate, type CustomArea, METRO, type MyAreasState, keysOf, presetKey } from "@/lib/my-areas";
import { REGION_CHIPS, sameScope } from "./Chips";

export type HomeRegion = {
  /** 저장소 키(지우기에 쓴다) */
  key: string;
  label: string;
  /** 같은 이름 칩을 가르는 짧은 말(시도 또는 시군구). 없으면 빈 문자열 */
  sub: string;
  scope: HomeScope;
  kind: "preset" | "custom";
  /** 목록에 없는 기본 상권을 보고 있을 때만 붙는 칩(편집 목록에 넣지 않는다) */
  temp: boolean;
};

/**
 * 추가한 지역의 홈 조회 범위. 시도 짧은 이름을 앞에 붙여 동명 지역을 가른다(부산 해운대역, 제주 제주시 연동, 경남 고성군).
 * 2026-11-24 실측: 시도 짧은 이름을 붙여도 건수가 줄지 않았다(춘천시 82, 강원 춘천시 82). 고성군은 강원과 경남이 섞였고 경남 고성군은 경남만 나왔다.
 * 긴 시도 이름(강원특별자치도)은 붙이지 않는다(가맹점 주소 표기와 어긋나 0건이 된다, lib/place.ts addressRange).
 */
function homeLocs(c: Pick<CustomArea, "level" | "name" | "sido" | "address">): string[] {
  const sido = c.sido.trim();
  const withSido = (rest: string) => (!sido || rest === sido || rest.startsWith(`${sido} `) ? rest : `${sido} ${rest}`);
  const rest = c.level === "dong" ? c.address.trim().split(/\s+/).slice(1).join(" ") || c.name : c.name;
  return [withSido(rest), rest, c.name];
}

/** 추가한 지역의 홈 범위. 길이 상한에 걸리면 시도를 뗀 꼴, 그것도 안 되면 이름으로 */
export function customScope(c: Pick<CustomArea, "level" | "name" | "sido" | "address">): HomeScope | null {
  for (const loc of homeLocs(c)) {
    const s = scopeFromPlace(loc);
    if (s) return s;
  }
  return null;
}

function presetScope(slug: string, label: string): HomeScope {
  return { kind: "area", slug, name: areaBySlug(slug)?.name ?? label };
}

/**
 * 칩 이름. 도 단위 시군구는 시도를 뗀다(경기 수원시 팔달구 → 수원시 팔달구, 강원 춘천시 → 춘천시).
 * 특별시, 광역시의 구는 이름이 겹치므로(중구, 서구) 시도를 남긴다(대구 중구).
 */
function chipLabel(c: Pick<CustomArea, "level" | "name" | "sido">): string {
  const sido = c.sido.trim();
  if (c.level === "gu" && sido && !METRO.has(sido) && c.name.startsWith(`${sido} `)) return c.name.slice(sido.length + 1);
  return c.name;
}

/** 이름이 같은 칩에만 꼬리말을 붙인다: 시도가 모두 다르면 시도, 같으면 주소에서 처음 갈리는 토큰(과천시, 성남시) */
function subsFor(custom: CustomArea[]): Map<string, string> {
  const out = new Map<string, string>();
  const byLabel = new Map<string, CustomArea[]>();
  for (const c of custom) byLabel.set(chipLabel(c), [...(byLabel.get(chipLabel(c)) ?? []), c]);
  for (const group of byLabel.values()) {
    if (group.length < 2) continue;
    if (new Set(group.map((c) => c.sido)).size === group.length) {
      for (const c of group) out.set(c.key, c.sido);
      continue;
    }
    const tokens = group.map((c) => c.address.trim().split(/\s+/).slice(1));
    const at = Math.max(0, tokens[0].findIndex((_, i) => new Set(tokens.map((t) => t[i])).size > 1));
    group.forEach((c, j) => out.set(c.key, tokens[j][at] ?? c.sido));
  }
  return out;
}

/** 홈 칩 목록. 서버와 첫 수화는 빈 저장 상태라 기본 칩 다섯 곳 그대로다 */
export function homeRegions(state: MyAreasState, current: HomeScope): HomeRegion[] {
  const keys = keysOf(state);
  const list: HomeRegion[] = REGION_CHIPS.filter((r) => keys.has(presetKey(r.slug))).map((r) => ({
    key: presetKey(r.slug),
    label: r.label,
    sub: "",
    scope: presetScope(r.slug, r.label),
    kind: "preset",
    temp: false,
  }));
  const subs = subsFor(state.custom);
  for (const c of state.custom) {
    const scope = customScope(c);
    if (!scope || list.some((r) => sameScope(r.scope, scope))) continue;
    list.push({ key: c.key, label: chipLabel(c), sub: subs.get(c.key) ?? "", scope, kind: "custom", temp: false });
  }
  // 홈 칩에 없는 기본 상권(잠실, 홍대)을 보고 있으면 끝에 그 칩을 보인다. 목록에서 지운 상권은 보이지 않는다.
  if (current.kind === "area" && keys.has(presetKey(current.slug)) && !list.some((r) => sameScope(r.scope, current))) {
    list.push({ key: presetKey(current.slug), label: current.name, sub: "", scope: current, kind: "preset", temp: true });
  }
  return list;
}

/**
 * 지역 추가, 편집 패널(칩 줄 아래). 추가: 동네, 구, 역을 찾아 고르면 목록에 넣고 그 지역 홈으로 간다.
 * 편집: 홈 칩을 지운다. 지우면 상권 랭킹 목록에서도 빠진다.
 */
export function RegionPanel({
  id,
  mode,
  regions,
  onMode,
  onClose,
  onGo,
}: {
  id: string;
  mode: "add" | "edit";
  regions: HomeRegion[];
  onMode: (m: "add" | "edit") => void;
  onClose: () => void;
  /** 고른 지역 홈으로 간다 */
  onGo: (scope: HomeScope) => void;
}) {
  const [notice, setNotice] = useState("");
  const headId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const kept = useMemo(() => regions.filter((r) => !r.temp), [regions]);
  // 홈 칩에 보이는 지역만 고를 수 없게 한다(홈 칩 밖 기본 상권은 골라서 그 상권 홈으로 갈 수 있다).
  const taken = useMemo(() => new Set(kept.map((r) => r.key)), [kept]);

  const onPick = (c: AreaCandidate) => {
    if (c.kind === "preset" && c.slug) {
      // 지운 기본 상권이면 목록에 되살린다. 이미 목록에 있으면 그대로 그 상권으로 간다.
      addArea(c);
      onGo(presetScope(c.slug, c.name));
      return;
    }
    const scope = customScope(c);
    if (!scope) {
      setNotice(`${c.name}의 홈 결과를 열 수 없습니다. 다른 이름으로 찾아 주세요.`);
      return;
    }
    if (!taken.has(c.key) && !addArea(c)) {
      setNotice("추가한 지역이 너무 많습니다. 편집에서 지역을 지운 뒤 다시 넣어 주세요.");
      return;
    }
    if (!isPersistent()) setNotice("이 브라우저에서는 목록이 저장되지 않습니다.");
    onGo(scope);
  };

  const onRemove = (r: HomeRegion, index: number) => {
    removeArea(r.key);
    setNotice(`${r.label}을(를) 지웠습니다. 상권 랭킹 내 상권 목록에서도 빠집니다. 다시 넣으려면 지역 추가에서 찾습니다.`);
    // 지운 자리의 다음 지우기 버튼으로 포커스를 옮긴다(없으면 닫기 버튼).
    window.requestAnimationFrame(() => {
      const btns = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-testid="region-remove"]');
      const next = btns?.[Math.min(index, (btns?.length ?? 1) - 1)];
      (next ?? document.querySelector<HTMLButtonElement>('[data-testid="region-panel-close"]'))?.focus({ preventScroll: true });
    });
  };

  return (
    <section id={id} className="rpanel" data-testid="region-panel" data-mode={mode} aria-labelledby={headId}>
      <div className="rpanel__bar">
        <h2 id={headId} className="rpanel__h">
          {mode === "add" ? "지역 추가" : "홈 지역 편집"}
        </h2>
        <div className="rpanel__act">
          <button
            type="button"
            className="rpanel__btn"
            data-testid="region-edit"
            aria-pressed={mode === "edit"}
            onClick={() => {
              setNotice("");
              onMode(mode === "edit" ? "add" : "edit");
            }}
          >
            편집
          </button>
          <button type="button" className="rpanel__btn" data-testid="region-panel-close" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
      {mode === "add" ? (
        <AreaSearch
          inputTestId="region-search-input"
          label="동네, 구, 역 찾기"
          placeholder="예: 부산 해운대역, 대구 중구, 제주 연동"
          taken={taken}
          takenText="이미 홈 지역 칩에 있습니다"
          onPick={onPick}
          autoFocus
        />
      ) : (
        <>
          {kept.length === 0 ? <p className="rpanel__empty">지역 칩이 없습니다. 지역 추가에서 동네, 구, 역을 넣어 주세요.</p> : null}
          <ul ref={listRef} className="rpanel__list" aria-label="홈 지역 칩">
            {kept.map((r, i) => (
              <li key={r.key} className="rpanel__item" data-testid="region-item" data-key={r.key} data-kind={r.kind}>
                <span className="rpanel__name">
                  {r.label}
                  {r.sub ? <span className="rpanel__sub"> {r.sub}</span> : null}
                </span>
                <button type="button" className="rpanel__remove" data-testid="region-remove" aria-label={`${r.label}${r.sub ? ` ${r.sub}` : ""} 지우기`} onClick={() => onRemove(r, i)}>
                  지우기
                </button>
              </li>
            ))}
          </ul>
          <p className="rpanel__note">
            지운 칩은 <Link href="/area" prefetch={false}>상권 랭킹</Link> 내 상권 목록에서도 빠집니다.
          </p>
        </>
      )}
      <p className="rpanel__notice" role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
