"use client";

import type { Store } from "@/lib/stores";
import { closeUnsaveNotice, showUnsaveNotice } from "@/lib/ui-state";
import { hasNotes, isSaved, save, unsave, useVisitRecord } from "@/lib/visits";
import s from "./visits.module.css";

/**
 * 북마크. 처음 누르면 가고 싶은 곳으로 바로 저장하고, 다시 누르면 저장을 푼다. 저장은 방문으로 치지 않는다.
 * 태그나 메모가 있는 매장을 풀면 화면 아래 알림으로 되돌리기와 태그와 메모 삭제를 준다(UnsaveNotice).
 * 상태는 기기 저장 기록(lib/visits) 하나에서 읽어 카드, 목록, 영수증, 내 저장이 같이 바뀐다.
 * live: store가 지금 조회한 값인지(기본 true). false면 저장 때 순위를 찍지 않는다(내 저장 사본으로 연 영수증 등).
 */
export function BookmarkButton({ store, className, live = true }: { store: Store; className?: string; live?: boolean }) {
  const rec = useVisitRecord(store.id);
  const saved = isSaved(rec);
  const toggle = () => {
    if (!saved || !rec) {
      closeUnsaveNotice();
      save(store, { live });
      return;
    }
    const notes = hasNotes(rec);
    const savedAt = rec.savedAt;
    unsave(store.id);
    if (notes && savedAt) showUnsaveNotice(rec.store, savedAt, { savedRank: rec.savedRank, regularAskClosed: rec.regularAskClosed });
  };
  return (
    <button
      type="button"
      className={className ? `${s.bookmark} ${className}` : s.bookmark}
      aria-label={saved ? "저장 해제" : "저장"}
      aria-pressed={saved}
      data-testid="bookmark"
      onClick={toggle}
    >
      <svg className={s.bookmarkIcon} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path
          d="M6.5 3.75h11a.75.75 0 0 1 .75.75v15.6a.4.4 0 0 1-.64.32L12 16.25l-5.61 4.17a.4.4 0 0 1-.64-.32V4.5a.75.75 0 0 1 .75-.75Z"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
