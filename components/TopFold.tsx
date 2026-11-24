"use client";

import { useEffect } from "react";
import { startTopFold } from "@/lib/top-fold";

/** 768px 미만에서 스크롤 방향으로 상단 바를 접고 펼친다(lib/top-fold). 그리는 것은 없다 */
export function TopFold() {
  useEffect(() => startTopFold(), []);
  return null;
}
