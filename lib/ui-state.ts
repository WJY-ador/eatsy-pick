"use client";

// 헤더의 내 저장 버튼과 홈 화면을 잇는 작은 상태. 내 저장 시트를 열고, 홈이 지금 후보와 영수증 열기를 알려 준다.
// 저장 해제 알림(되돌리기, 태그와 메모 삭제)도 여기 둔다. 알림은 layout의 RecordsSheet 옆에서 그린다.

import { useSyncExternalStore } from "react";
import type { Store } from "./stores";
import type { Stage, VisitRecord } from "./visits";

export type HomeContext = { stores: Store[]; title: string; open: (store: Store) => void };
export type SavesFilter = Stage | "all";
/**
 * 태그나 메모가 있는 매장의 저장을 풀었을 때. savedAt은 되돌릴 때 쓸 원래 저장 시각.
 * restore는 그 사이 기록이 지워졌을 때 되돌리기로 함께 되살릴 저장 때 순위와 단골 제안 닫음이다.
 */
export type UnsaveNotice = {
  store: Store;
  savedAt: string;
  restore: Pick<VisitRecord, "savedRank" | "regularAskClosed">;
  seq: number;
};
type UiState = {
  recordsOpen: boolean;
  savesStage: SavesFilter;
  /** openSaves를 부를 때마다 늘어난다. 시트가 이미 열려 있어도 단계 필터를 다시 맞추게 한다 */
  savesSeq: number;
  home: HomeContext | null;
  unsaveNotice: UnsaveNotice | null;
};

let state: UiState = { recordsOpen: false, savesStage: "all", savesSeq: 0, home: null, unsaveNotice: null };
const INITIAL = state;
const listeners = new Set<() => void>();

function set(patch: Partial<UiState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

/** 내 저장 시트를 연다. 단계를 주면 저장한 곳 탭이 그 단계 필터로 열린다(이미 열려 있으면 그 필터로 바꾼다). */
export const openSaves = (stage: SavesFilter = "all") =>
  set({ recordsOpen: true, savesStage: stage, savesSeq: state.savesSeq + 1 });
export const closeRecords = () => set({ recordsOpen: false });
export const setHomeContext = (home: HomeContext | null) => set({ home });
export const showUnsaveNotice = (store: Store, savedAt: string, restore: UnsaveNotice["restore"]) =>
  set({ unsaveNotice: { store, savedAt, restore, seq: (state.unsaveNotice?.seq ?? 0) + 1 } });
export const closeUnsaveNotice = () => set({ unsaveNotice: null });

export function useUi(): UiState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => INITIAL,
  );
}
