"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { MySaves, UnsaveNotice } from "@/components/visits";
import type { Store } from "@/lib/stores";
import { closeRecords, openSaves, useUi } from "@/lib/ui-state";
import { Sheet } from "./Sheet";

/** 머리말의 내 저장 버튼 */
export function RecordsButton({ className = "top__link top__btn" }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => openSaves()}
      aria-haspopup="dialog"
      data-testid="saves-open"
    >
      내 저장
    </button>
  );
}

/**
 * 내 저장 시트: 저장한 곳과 다녀온 곳, 리스트 공유, 다음 약속. 홈에서는 매장을 누르면 홈의 영수증을 연다.
 * 홈 밖에서는 매장 이름과 id로 홈 영수증 주소로 간다. openSaves(단계)로 열면 저장한 곳이 그 단계 필터로 열린다.
 * 저장 해제 알림은 시트와 따로 늘 그린다(시트가 닫혀 있어도 카드나 영수증에서 저장을 풀 수 있다).
 */
export function RecordsSheet() {
  const { recordsOpen, savesStage, savesSeq, home } = useUi();
  const router = useRouter();
  const open = useCallback(
    (store: Store) => {
      closeRecords();
      if (home) home.open(store);
      else router.push(`/?${new URLSearchParams({ q: store.name, id: store.id }).toString()}`);
    },
    [home, router],
  );
  return (
    <>
      {recordsOpen ? (
        <Sheet title="내 저장" onClose={closeRecords} size="tall" testId="saves">
          <MySaves
            stores={home?.stores ?? []}
            title={home?.title ?? "지금 조회"}
            onOpen={open}
            stage={savesStage}
            stageSeq={savesSeq}
          />
        </Sheet>
      ) : null}
      <UnsaveNotice />
    </>
  );
}
