"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { MyRecords, NextPlan } from "@/components/visits";
import type { Store } from "@/lib/stores";
import { closeRecords, openRecords, useUi } from "@/lib/ui-state";
import { Sheet } from "./Sheet";

/** 헤더의 내 기록 버튼 */
export function RecordsButton() {
  return (
    <button type="button" className="top__link top__btn" onClick={openRecords} aria-haspopup="dialog">
      내 기록
    </button>
  );
}

/**
 * 내 기록 시트: 다음 약속과 내 기록 관리. 홈에서는 지금 후보로 다음 약속을 고르고, 매장을 누르면 홈의 영수증을 연다.
 * 홈 밖에서는 매장 이름과 id로 홈 영수증 주소로 간다.
 */
export function RecordsSheet() {
  const { recordsOpen, home } = useUi();
  const router = useRouter();
  const open = useCallback(
    (store: Store) => {
      closeRecords();
      if (home) home.open(store);
      else router.push(`/?${new URLSearchParams({ q: store.name, id: store.id }).toString()}`);
    },
    [home, router],
  );
  if (!recordsOpen) return null;
  return (
    <Sheet title="내 기록" onClose={closeRecords} size="tall">
      <div className="records">
        <NextPlan stores={home?.stores ?? []} title={home?.title ?? "지금 조회"} onOpen={open} defaultOpen />
        <MyRecords onOpen={open} />
      </div>
    </Sheet>
  );
}
