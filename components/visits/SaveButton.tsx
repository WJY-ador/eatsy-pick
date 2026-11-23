"use client";

import type { Store } from "@/lib/stores";
import { save, unsave, useVisitRecord } from "@/lib/visits";
import s from "./visits.module.css";

/** 저장 / 저장됨 전환. 저장은 방문으로 치지 않는다. */
export function SaveButton({ store }: { store: Store }) {
  const rec = useVisitRecord(store.id);
  const saved = !!rec && rec.savedAt !== null;
  return (
    <button
      type="button"
      className={s.save}
      aria-pressed={saved}
      onClick={() => (saved ? unsave(store.id) : save(store))}
    >
      {saved ? "저장됨" : "저장"}
    </button>
  );
}
