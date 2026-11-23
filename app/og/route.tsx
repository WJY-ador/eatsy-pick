import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { OG_COLORS as C } from "@/lib/og-theme";
import { ATTRIBUTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { type AreaDataset, cleanLoc, loadArea } from "@/lib/stores";

// 홈 공유 카드 1200×630, 상권 꼴(상권명, 조회 범위, 표본 수). 좌표와 개인 기록은 넣지 않는다.
// 어떤 경우에도 500을 내지 않는다: 조회 실패면 일반 카드, 폰트도 못 읽으면 204.
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

function Dash() {
  return <div style={{ display: "flex", height: 0, borderTop: `3px dashed ${C.rule}`, margin: "20px 0" }} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: W, height: H, background: C.paper2, fontFamily: "Pretendard" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 820, padding: "44px 52px", background: C.paper, border: `2px solid ${C.rule}`, borderRadius: 20 }}>
        {children}
        <Dash />
        <div style={{ display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 22 }}>
          <span>{ATTRIBUTION}</span>
          <span style={{ color: C.ink, fontWeight: 700 }}>{SITE_NAME}</span>
        </div>
      </div>
    </div>
  );
}

function GenericCard() {
  return (
    <Frame>
      <div style={{ display: "flex", color: C.ink, fontSize: 30, fontWeight: 700 }}>{SITE_NAME}</div>
      <Dash />
      <div style={{ display: "flex", color: C.ink, fontSize: 46, fontWeight: 700, lineHeight: 1.3 }}>{SITE_TAGLINE}</div>
    </Frame>
  );
}

function AreaCard({ d }: { d: AreaDataset }) {
  const independent = d.stores.filter((s) => !s.franchise).length;
  const hoesik = d.stores.filter((s) => !s.franchise && s.hoesik === true).length;
  const row = (label: string, value: string) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 28, marginTop: 12 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: C.ink, fontWeight: 700 }}>{value}</span>
    </div>
  );
  return (
    <Frame>
      <div style={{ display: "flex", color: C.muted, fontSize: 24 }}>결제 데이터로 고르는 근처 후보</div>
      <div style={{ display: "block", marginTop: 8, color: C.ink, fontSize: 60, fontWeight: 700, lineClamp: 1, overflow: "hidden" }}>{d.title}</div>
      <div style={{ display: "flex", marginTop: 6, color: C.ink2, fontSize: 24 }}>조회 범위: {d.scopeLabel}</div>
      <Dash />
      {row("API 반환", `${d.returned}곳`)}
      {row("중복 정리 뒤 매장", `${d.stores.length}곳`)}
      {row("프랜차이즈 제외", `${independent}곳`)}
      {row("그중 회식 적합 표시", `${hoesik}곳`)}
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
  const area = sp.get("area") ?? undefined;
  const loc = cleanLoc(sp.get("loc")) ?? undefined;
  try {
    const d = await loadArea({ area, loc });
    if (d.stores.length > 0) return await render(<AreaCard d={d} />);
  } catch {
    // 아래 일반 카드로 간다.
  }
  try {
    return await render(<GenericCard />);
  } catch {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
}
