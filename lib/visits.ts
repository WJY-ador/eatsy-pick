// 내 방문 기록. 로그인 없이 이 기기의 localStorage에만 둔다.
// 규칙: 저장은 방문이 아니다. 잇플 링크 클릭은 기록하지 않는다. "다녀왔어요"를 직접 눌러야 방문이다.
// 반응(다시 갈래요, 다른 곳 볼래요)은 방문이 1회 이상일 때만 남길 수 있다.
// 저장소가 막힌 브라우저(사파리 비공개 모드 등)는 메모리에만 두고 persistent=false로 알린다.

import { useSyncExternalStore } from "react";
import type { Store } from "./stores";
import { type Occasion, isOccasion } from "./plan";

export { OCCASIONS, type Occasion } from "./plan";

export const VISITS_KEY = "eatsy.visits.v1";
export const VISITS_SCHEMA = 1;

export type Reaction = "again" | "other";
/** 다음에 API 없이 다시 그릴 수 있게 Store 전체를 받아 둔다(merUrl 원문 포함). */
export type StoreSnapshot = Store;
export type VisitEntry = { at: string; occasion?: Occasion };
export type VisitRecord = {
  store: StoreSnapshot;
  /** 저장한 시각. 저장하지 않았거나 저장을 풀면 null */
  savedAt: string | null;
  visits: VisitEntry[];
  reaction: Reaction | null;
  updatedAt: string;
};
type Persisted = { schema: typeof VISITS_SCHEMA; records: Record<string, VisitRecord> };

export type VisitsSnapshot = {
  records: Readonly<Record<string, VisitRecord>>;
  /** false면 이 브라우저에서는 기록이 저장되지 않는다(메모리에만 있다) */
  persistent: boolean;
};

export const NOT_PERSISTENT_TEXT = "이 브라우저에서는 기록이 저장되지 않습니다";

const SERVER_SNAPSHOT: VisitsSnapshot = Object.freeze({ records: Object.freeze({}), persistent: true });

let snapshot: VisitsSnapshot | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = `${VISITS_KEY}.probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isNumOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
const isBoolOrNull = (v: unknown) => v === null || typeof v === "boolean";
const isStrOrNull = (v: unknown) => v === null || typeof v === "string";

function validStore(v: unknown): v is StoreSnapshot {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    isStr(s.id) &&
    s.id.length > 0 &&
    isStr(s.name) &&
    isStr(s.category) &&
    isStr(s.address) &&
    isStr(s.sigungu) &&
    (s.merUrl === null || (isStr(s.merUrl) && s.merUrl.startsWith("https://"))) &&
    isNumOrNull(s.ccgRank) &&
    isNumOrNull(s.allRank) &&
    isBoolOrNull(s.local) &&
    isBoolOrNull(s.hoesik) &&
    isBoolOrNull(s.foreign) &&
    isStrOrNull(s.peakDay) &&
    isStrOrNull(s.peakTime) &&
    Array.isArray(s.customers) &&
    s.customers.every(isStr) &&
    isStrOrNull(s.open) &&
    isStrOrNull(s.close) &&
    Array.isArray(s.holidays) &&
    s.holidays.every(isStr) &&
    isNumOrNull(s.lat) &&
    isNumOrNull(s.lng) &&
    typeof s.franchise === "boolean"
  );
}

function validRecord(v: unknown): v is VisitRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (!validStore(r.store)) return false;
  if (!isStrOrNull(r.savedAt) || !isStr(r.updatedAt)) return false;
  if (r.reaction !== null && r.reaction !== "again" && r.reaction !== "other") return false;
  if (!Array.isArray(r.visits)) return false;
  const visitsOk = r.visits.every(
    (e: unknown) =>
      !!e &&
      typeof e === "object" &&
      isStr((e as VisitEntry).at) &&
      ((e as VisitEntry).occasion === undefined || isOccasion((e as VisitEntry).occasion)),
  );
  if (!visitsOk) return false;
  // 방문 없는 반응, 저장도 방문도 없는 빈 기록은 규칙 위반이라 버린다.
  if (r.visits.length === 0 && r.reaction !== null) return false;
  if (r.visits.length === 0 && r.savedAt === null) return false;
  return true;
}

/** 저장소 원문을 읽는다. 깨진 값, 다른 스키마는 빈 상태로 본다. 기록 하나가 깨졌으면 그 기록만 버린다. */
export function parseVisits(raw: string | null): Record<string, VisitRecord> {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== "object") return {};
  const p = data as Partial<Persisted>;
  if (p.schema !== VISITS_SCHEMA || !p.records || typeof p.records !== "object") return {};
  const out: Record<string, VisitRecord> = {};
  for (const [id, rec] of Object.entries(p.records)) {
    if (validRecord(rec) && rec.store.id === id) out[id] = rec;
  }
  return out;
}

function load(): VisitsSnapshot {
  const s = storage();
  if (!s) return { records: {}, persistent: false };
  let raw: string | null = null;
  try {
    raw = s.getItem(VISITS_KEY);
  } catch {
    return { records: {}, persistent: false };
  }
  return { records: parseVisits(raw), persistent: true };
}

function current(): VisitsSnapshot {
  if (!snapshot) snapshot = load();
  return snapshot;
}

function emit() {
  for (const l of listeners) l();
}

/** 기록을 바꾸고 저장한다. 쓰기가 실패하면 메모리에만 두고 persistent=false로 바꾼다. */
function commit(records: Record<string, VisitRecord>) {
  let persistent = current().persistent;
  if (persistent) {
    const s = storage();
    try {
      if (!s) throw new Error("no storage");
      if (Object.keys(records).length === 0) s.removeItem(VISITS_KEY);
      else s.setItem(VISITS_KEY, JSON.stringify({ schema: VISITS_SCHEMA, records } satisfies Persisted));
    } catch {
      persistent = false;
    }
  }
  snapshot = { records, persistent };
  emit();
}

function now(): string {
  return new Date().toISOString();
}

function update(id: string, fn: (r: VisitRecord | undefined) => VisitRecord | null) {
  const records = { ...current().records };
  const next = fn(records[id]);
  if (next === null) delete records[id];
  else records[id] = next;
  commit(records);
}

/** 저장. 방문으로 치지 않는다. */
export function save(store: Store) {
  update(store.id, (r) => {
    const t = now();
    if (r) return { ...r, store, savedAt: r.savedAt ?? t, updatedAt: t };
    return { store, savedAt: t, visits: [], reaction: null, updatedAt: t };
  });
}

/** 저장 해제. 방문 기록이 없으면 기록 자체를 지운다. */
export function unsave(id: string) {
  update(id, (r) => {
    if (!r) return null;
    if (r.visits.length === 0) return null;
    return { ...r, savedAt: null, updatedAt: now() };
  });
}

/** "다녀왔어요"를 직접 눌렀을 때만 부른다. 방문 1회를 더한다. */
export function markVisited(store: Store, occasion?: Occasion) {
  update(store.id, (r) => {
    const t = now();
    const entry: VisitEntry = occasion ? { at: t, occasion } : { at: t };
    if (r) return { ...r, store, visits: [...r.visits, entry], updatedAt: t };
    return { store, savedAt: null, visits: [entry], reaction: null, updatedAt: t };
  });
}

/** 재방문 의향. 방문이 없으면 무시한다. null이면 반응을 지운다. */
export function setReaction(id: string, reaction: Reaction | null) {
  const r = current().records[id];
  if (!r || r.visits.length === 0) return;
  update(id, (rec) => (rec ? { ...rec, reaction, updatedAt: now() } : null));
}

/** 가장 최근 방문의 모임 유형을 바꾼다. null이면 유형을 지운다. 방문이 없으면 무시한다. */
export function setOccasion(id: string, occasion: Occasion | null) {
  const r = current().records[id];
  if (!r || r.visits.length === 0) return;
  update(id, (rec) => {
    if (!rec) return null;
    const visits = [...rec.visits];
    let last = 0;
    visits.forEach((v, i) => {
      if (v.at >= visits[last].at) last = i;
    });
    visits[last] = occasion ? { at: visits[last].at, occasion } : { at: visits[last].at };
    return { ...rec, visits, updatedAt: now() };
  });
}

/** 방문과 반응만 지운다. 저장은 남긴다. 저장도 안 했으면 기록 자체를 지운다. */
export function clearVisits(id: string) {
  update(id, (r) => {
    if (!r || r.savedAt === null) return null;
    return { ...r, visits: [], reaction: null, updatedAt: now() };
  });
}

/** 매장 하나의 기록(저장, 방문, 반응)을 지운다. */
export function remove(id: string) {
  update(id, () => null);
}

/** 전체 삭제 */
export function clearAll() {
  commit({});
}

/** 최근에 바뀐 순 */
export function getAll(): VisitRecord[] {
  return sortRecords(current().records);
}

export function sortRecords(records: Readonly<Record<string, VisitRecord>>): VisitRecord[] {
  return Object.values(records).sort((a, b) => (a.updatedAt === b.updatedAt ? 0 : a.updatedAt < b.updatedAt ? 1 : -1));
}

function onStorage(e: StorageEvent) {
  // 다른 탭에서 바꾼 기록을 반영한다. key가 null이면 저장소 전체가 비워진 것이다.
  if (e.key !== null && e.key !== VISITS_KEY) return;
  snapshot = load();
  emit();
}

function subscribe(cb: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** 전체 기록과 저장 가능 여부. 서버와 첫 수화에서는 빈 상태다. */
export function useVisits(): VisitsSnapshot {
  return useSyncExternalStore(subscribe, current, () => SERVER_SNAPSHOT);
}

/** 매장 하나의 기록 */
export function useVisitRecord(id: string): VisitRecord | undefined {
  return useVisits().records[id];
}
