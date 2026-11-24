"use client";

// 내 상권 목록 저장소(localStorage 키 MY_AREAS_KEY). 읽기와 정리 규칙은 lib/my-areas.ts.

import { useSyncExternalStore } from "react";
import { type AreaCandidate, CUSTOM_MAX, type CustomArea, DEFAULT_STATE, MY_AREAS_KEY, type MyAreasState, keysOf, parseMyAreas } from "@/lib/my-areas";

let snapshot: MyAreasState = DEFAULT_STATE;
let loaded = false;
let persistent = true;
const listeners = new Set<() => void>();

function load(): MyAreasState {
  try {
    return parseMyAreas(window.localStorage.getItem(MY_AREAS_KEY));
  } catch {
    persistent = false;
    return DEFAULT_STATE;
  }
}

function current(): MyAreasState {
  if (!loaded) {
    snapshot = load();
    loaded = true;
  }
  return snapshot;
}

function write(next: MyAreasState) {
  snapshot = next;
  loaded = true;
  try {
    window.localStorage.setItem(MY_AREAS_KEY, JSON.stringify({ v: 1, removed: next.removed, custom: next.custom }));
    persistent = true;
  } catch {
    persistent = false;
  }
  for (const l of listeners) l();
}

function onStorage(e: StorageEvent) {
  if (e.key !== null && e.key !== MY_AREAS_KEY) return;
  snapshot = load();
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** 내 상권 목록 상태. 서버와 첫 수화에서는 기본 목록이다 */
export function useMyAreas(): MyAreasState {
  return useSyncExternalStore(subscribe, current, () => DEFAULT_STATE);
}

export function isPersistent(): boolean {
  return persistent;
}

/**
 * 목록에 넣는다. 기본 상권이면 뺀 목록에서 되살린다(사본을 만들지 않는다).
 * 이미 목록에 있으면 아무것도 하지 않고 false.
 */
export function addArea(c: AreaCandidate): boolean {
  const s = current();
  if (keysOf(s).has(c.key)) return false;
  if (c.kind === "preset") {
    write({ ...s, removed: s.removed.filter((k) => k !== c.key) });
    return true;
  }
  if (s.custom.length >= CUSTOM_MAX) return false;
  const item: CustomArea = { key: c.key, kind: c.kind, level: c.level, name: c.name, sido: c.sido, address: c.address, href: c.href };
  write({ ...s, custom: [...s.custom, item] });
  return true;
}

export function removeArea(key: string): void {
  const s = current();
  if (key.startsWith("preset:")) {
    if (!s.removed.includes(key)) write({ ...s, removed: [...s.removed, key] });
    return;
  }
  write({ ...s, custom: s.custom.filter((c) => c.key !== key) });
}
