"use client";

// 헤더의 내 기록 버튼과 홈 화면을 잇는 작은 상태. 내 기록 시트를 열고, 홈이 지금 후보와 영수증 열기를 알려 준다.

import { useSyncExternalStore } from "react";
import type { Store } from "./stores";

export type HomeContext = { stores: Store[]; title: string; open: (store: Store) => void };
type UiState = { recordsOpen: boolean; home: HomeContext | null };

let state: UiState = { recordsOpen: false, home: null };
const INITIAL = state;
const listeners = new Set<() => void>();

function set(patch: Partial<UiState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export const openRecords = () => set({ recordsOpen: true });
export const closeRecords = () => set({ recordsOpen: false });
export const setHomeContext = (home: HomeContext | null) => set({ home });

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
