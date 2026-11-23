import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getDecision } from "@/components/decision";
import type { Choice } from "@/lib/decide";
import { displayName } from "@/lib/format";
import { topPercent } from "@/lib/labels";
import { OG_COLORS as C } from "@/lib/og-theme";
import { type RawSearchParams, parseQuery, resultsTitle } from "@/lib/query";
import { ATTRIBUTION, HELLO, SITE_NAME } from "@/lib/site";

// 단톡방 공유 카드 1200×630. 어떤 경우에도 500을 내지 않는다: 조회 실패나 0건이면 일반 카드.
export const maxDuration = 30;

const W = 1200;
const H = 630;
const CACHE = "public, max-age=600, s-maxage=1800";

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

/** 맨 위 포인트 컬러 띠(12px). 포인트 컬러는 여기에만 쓴다. */
function Stripe() {
  return <div style={{ display: "flex", height: 12, background: C.accent }} />;
}

function Foot() {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 56px 40px", color: C.muted, fontSize: 24 }}>
      <span>{ATTRIBUTION}</span>
      <span style={{ color: C.ink, fontWeight: 700 }}>{SITE_NAME}</span>
    </div>
  );
}

function GenericCard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: C.paper, fontFamily: "Pretendard" }}>
      <Stripe />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: "0 56px" }}>
        <div style={{ display: "flex", color: C.ink, fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>{SITE_NAME}</div>
        <div style={{ display: "flex", marginTop: 28, color: C.ink2, fontSize: 40, lineHeight: 1.35 }}>{HELLO}</div>
      </div>
      <Foot />
    </div>
  );
}

function ResultCardImage({ title, picks }: { title: string; picks: Choice[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: C.paper, fontFamily: "Pretendard" }}>
      <Stripe />
      <div style={{ display: "flex", padding: "40px 56px 0", color: C.ink, fontSize: 56, fontWeight: 700, letterSpacing: -1.5 }}>
        {title}
      </div>
      <div style={{ display: "flex", flex: 1, gap: 20, padding: "28px 56px 32px" }}>
        {picks.map((c) => (
          <div
            key={c.rank}
            style={{ display: "flex", flexDirection: "column", flex: 1, padding: "26px 26px", background: C.paper2, borderRadius: 24, minWidth: 0 }}
          >
            <div style={{ display: "flex", color: C.muted, fontSize: 24, fontWeight: 700 }}>{c.rank}</div>
            <div
              style={{
                display: "block",
                color: C.ink,
                fontSize: 36,
                fontWeight: 700,
                lineHeight: 1.2,
                marginTop: 8,
                lineClamp: 2,
                overflow: "hidden",
              }}
            >
              {displayName(c.item.merNm)}
            </div>
            <div style={{ display: "flex", color: C.muted, fontSize: 24, marginTop: 8 }}>{c.item.merTpbuzNm}</div>
            <div style={{ display: "flex", flex: 1 }} />
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                padding: "10px 20px",
                borderRadius: 999,
                background: C.paper3,
                color: C.ink,
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              {c.sigungu} 상위 {topPercent(c.item.ccgSaleRnk)}%
            </div>
          </div>
        ))}
      </div>
      <Foot />
    </div>
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
  const sp: RawSearchParams = {};
  request.nextUrl.searchParams.forEach((v, k) => {
    const prev = sp[k];
    sp[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  });
  try {
    const input = parseQuery(sp);
    if (input) {
      const d = await getDecision(input);
      if (d.status === "ok" && d.picks.length > 0) {
        return await render(<ResultCardImage title={resultsTitle(input, d.picks.length)} picks={d.picks} />);
      }
    }
  } catch {
    // 아래 일반 카드로 간다.
  }
  try {
    return await render(<GenericCard />);
  } catch {
    // 폰트조차 못 읽으면 1×1 종이색 PNG 대신 빈 200을 내지 않는다: 이미지 없는 204를 낸다.
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
}
