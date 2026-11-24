import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { areaBySlug } from "@/lib/areas";
import { ATTRIBUTION, SITE_NAME } from "@/lib/site";
import { displayName, percentLabel } from "@/lib/store-view";
import { type AreaDataset, type Store, cleanLoc, loadArea } from "@/lib/stores";

// 홈 공유 카드는 현재 조회한 매장을 시군구, 업종 매출 백분위 순으로 보여 준다.
// 어떤 경우에도 500을 내지 않는다: 조회 실패면 일반 카드, 폰트도 못 읽으면 204.
export const maxDuration = 30;

const W = 1200;
const H = 630;
const CACHE = "public, max-age=600, s-maxage=1800";
const INK = "#141414";
const ACCENT = "#FF5A1F";
const TEXT = "#FFFFFF";
const MUTED = "#C8C5C1";
const RULE = "#3C3937";

type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };
let fontsPromise: Promise<Font[]> | null = null;

function loadFonts(): Promise<Font[]> {
  fontsPromise ??= Promise.all(
    [
      ["Pretendard-Regular.otf", 400],
      ["Pretendard-Bold.otf", 700],
    ].map(async ([file, weight]) => {
      const buf = await readFile(path.join(process.cwd(), "assets", "fonts", file as string));
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      return { name: "Pretendard", data, weight: weight as 400 | 700, style: "normal" as const };
    }),
  ).catch((e) => {
    fontsPromise = null;
    throw e;
  });
  return fontsPromise;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: "66px 76px", background: INK, color: TEXT, fontFamily: "Pretendard" }}>
      <div style={{ display: "flex", alignSelf: "center", padding: "8px 16px", borderRadius: 8, background: ACCENT, color: INK, fontSize: 24, fontWeight: 700 }}>
        BC카드 결제 데이터 기준
      </div>
      {children}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 16, borderTop: `2px solid ${RULE}`, color: MUTED, fontSize: 22 }}>
        <span>{ATTRIBUTION}</span>
        <span style={{ color: TEXT, fontWeight: 700 }}>{SITE_NAME}</span>
      </div>
    </div>
  );
}

function GenericCard() {
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 48, color: ACCENT, fontSize: 36, fontWeight: 700 }}>eatsy pick</div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 18, fontSize: 64, fontWeight: 700 }}>결제 데이터로 찾는 동네 맛집</div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 20, color: MUTED, fontSize: 30 }}>우리 동네 가게를 찾고, 저장하고, 다시 꺼내보세요</div>
    </Frame>
  );
}

function AreaRankingCard({ name }: { name?: string }) {
  const title = name ? `${name} 업종별 결제 랭킹` : "상권별 결제 랭킹";
  const description = name ? `BC카드 결제 데이터로 보는 ${name} 근처 가게 순위` : "주요 상권의 업종별 BC카드 결제 순위";
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 38, fontSize: 64, fontWeight: 700 }}>{title}</div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 18, color: MUTED, fontSize: 30 }}>{description}</div>
    </Frame>
  );
}

function topStores(dataset: AreaDataset) {
  // loadArea 정규화 단계에서 중복을 제거하고 매출 백분위 오름차순으로 정렬한다.
  return dataset.stores
    .filter((store) => !store.franchise && store.ccgRank !== null && store.ccgRank >= 0 && store.ccgRank <= 100)
    .slice(0, 3);
}

function AreaCard({ title, stores }: { title: string; stores: Store[] }) {
  return (
    <Frame>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 16, marginTop: 16, fontSize: title.length > 12 ? 48 : 64, fontWeight: 700, lineHeight: 1.1 }}>
        <span style={{ maxWidth: 640, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ flexShrink: 0, whiteSpace: "nowrap" }}>매출 상위</span>
        <span style={{ flexShrink: 0, whiteSpace: "nowrap", color: ACCENT }}>{`TOP ${stores.length}`}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 8, color: MUTED, fontSize: 23 }}>
        프랜차이즈 제외, 조회 매장의 시군구 및 업종별 결제 매출 기준
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 20, borderTop: `3px solid ${ACCENT}` }}>
        {stores.map((store, i) => (
          <div key={store.id} style={{ display: "flex", alignItems: "center", gap: 20, height: 69, borderBottom: `1px solid ${RULE}`, fontWeight: 700 }}>
            <span style={{ width: 46, flexShrink: 0, color: ACCENT, fontSize: 28 }}>0{i + 1}.</span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 34 }}>{displayName(store.name)}</span>
            <span style={{ flexShrink: 0, color: ACCENT, fontSize: 30 }}>상위 {percentLabel(store.ccgRank)}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

async function render(node: React.ReactElement): Promise<Response> {
  const fonts = await loadFonts();
  const img = new ImageResponse(node, { width: W, height: H, fonts });
  // 본문을 끝까지 만든 뒤 응답한다. 렌더 오류를 여기서 잡아 일반 카드로 돌리기 위해서다.
  const body = await img.arrayBuffer();
  return new Response(body, { status: 200, headers: { "content-type": "image/png", "cache-control": CACHE } });
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const type = sp.get("type");
  const area = sp.get("area") ?? undefined;
  if (type === "site") {
    try {
      return await render(<GenericCard />);
    } catch {
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    }
  }
  if (type === "area-index" || type === "area-ranking") {
    const name = type === "area-ranking" ? areaBySlug(area)?.name : undefined;
    try {
      return await render(<AreaRankingCard name={name} />);
    } catch {
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    }
  }
  const loc = cleanLoc(sp.get("loc")) ?? undefined;
  try {
    const d = await loadArea({ area, loc });
    const stores = topStores(d);
    if (stores.length > 0) return await render(<AreaCard title={d.title} stores={stores} />);
  } catch {
    // 아래 일반 카드로 간다.
  }
  try {
    return await render(<GenericCard />);
  } catch {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
}
