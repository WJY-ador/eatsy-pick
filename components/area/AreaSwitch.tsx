"use client";

import "./area.css";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { areaHrefFor, itemsOf } from "@/lib/my-areas";
import { AreaSearch } from "./AreaSearch";
import { useMyAreas } from "./my-areas-store";

/**
 * 랭킹 화면의 지역 변경. 내 상권 목록(기본 상권과 직접 추가한 지역)에서 고르거나 지역을 직접 찾는다.
 * 같은 화면 흐름에서 클라이언트 이동만 한다(지도 열림 상태는 map-state에 있어 남는다). 업종 페이지면 같은 업종으로 간다.
 */
export function AreaSwitch({ currentKey, currentName, group }: { currentKey: string; currentName: string; group: string | null }) {
  const router = useRouter();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const state = useMyAreas();
  const items = useMemo(() => itemsOf(state), [state]);
  const taken = useMemo(() => new Set([currentKey]), [currentKey]);

  const go = (href: string) => {
    setOpen(false);
    startTransition(() => router.push(areaHrefFor(href, group)));
  };

  return (
    <div className="aswitch" aria-busy={pending || undefined}>
      <button type="button" className="aswitch__btn" data-testid="area-switch" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <span className="aswitch__now">{currentName}</span>
        <span className="aswitch__act">{pending ? "바꾸는 중" : open ? "닫기" : "지역 변경"}</span>
      </button>
      <div id={panelId} className="aswitch__panel" hidden={!open}>
        {open ? (
          <>
            <p className="aswitch__h">내 상권에서 고르기</p>
            <ul className="aswitch__chips">
              {items.map((it) => (
                <li key={it.key}>
                  <button
                    type="button"
                    className="aswitch__chip"
                    data-key={it.key}
                    aria-current={it.key === currentKey ? "true" : undefined}
                    disabled={it.key === currentKey}
                    onClick={() => go(it.href)}
                  >
                    {it.name}
                    {it.sub ? <span className="aswitch__sub"> {it.sub}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            <AreaSearch
              inputTestId="area-switch-input"
              label="다른 지역 직접 찾기"
              placeholder="예: 부산 해운대역, 대구 중구, 제주 연동"
              taken={taken}
              takenText="지금 보고 있는 지역"
              onPick={(c) => go(c.href)}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
