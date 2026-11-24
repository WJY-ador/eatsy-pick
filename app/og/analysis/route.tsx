import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { loadInput, parseScope, scopeName } from "@/components/analysis/scope";
import { type Analysis, type Ratio, analyze, parseFilters, ratioPercent, splitPeak } from "@/lib/analytics";
import { customerLabel } from "@/lib/labels";
import { OG_COLORS as C } from "@/lib/og-theme";
import { ATTRIBUTION, SITE_NAME } from "@/lib/site";
import { loadArea } from "@/lib/stores";

// 상권 분석 공유 카드 1200×630. /analysis와 같은 쿼리(area|loc, food, cat, peak, cust, local, hoesik, fr)를 받는다.
// 어떤 경우에도 500을 내지 않는다: 조회 실패나 0곳이면 일반 카드. 폰트는 /og와 같은 방식으로 fs로 읽는다.
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

function Foot() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "22px 56px 36px",
        borderTop: `2px solid ${C.paper3}`,
        color: C.muted,
        fontSize: 24,
      }}
    >
      <span>{ATTRIBUTION}</span>
      <span style={{ color: C.ink, fontWeight: 700 }}>{SITE_NAME}</span>
    </div>
  );
}

function GenericCard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: C.paper, fontFamily: "Pretendard" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: "0 56px" }}>
        <div style={{ display: "flex", color: C.muted, fontSize: 32, fontWeight: 700 }}>{SITE_NAME}</div>
        <div style={{ display: "flex", marginTop: 16, color: C.ink, fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>상권 분석</div>
        <div style={{ display: "flex", marginTop: 24, color: C.ink2, fontSize: 36 }}>업종, 대표 피크, 주 고객층을 결제 데이터로 나눠 봅니다</div>
      </div>
      <Foot />
    </div>
  );
}

function ratioText(r: Ratio): { value: string; sub: string } {
  const pct = ratioPercent(r);
  return pct === null ? { value: "정보 없음", sub: "값 확인 0곳" } : { value: `${pct}%`, sub: `${r.num}곳 / ${r.den}곳` };
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, paddingRight: 24 }}>
      <div style={{ display: "flex", color: C.muted, fontSize: 24 }}>{label}</div>
      <div style={{ display: "flex", marginTop: 8, color: C.ink, fontSize: 44, fontWeight: 700 }}>{value}</div>
      <div style={{ display: "flex", marginTop: 4, color: C.ink2, fontSize: 22 }}>{sub}</div>
    </div>
  );
}

function AnalysisCard({ title, scopeLabel, food, a }: { title: string; scopeLabel: string; food: string | null; a: Analysis }) {
  const f = a.filters;
  const parts: string[] = [];
  if (food) parts.push(`${food} 업종으로 조회`);
  if (f.cat) parts.push(f.cat);
  if (f.peak) {
    const { day, time } = splitPeak(f.peak);
    parts.push(`${day} ${time} 피크`);
  }
  if (f.cust) parts.push(customerLabel(f.cust));
  parts.push(f.fr ? "프랜차이즈 제외" : "프랜차이즈 포함");
  const local = ratioText(a.kpis.local);
  const hoesik = ratioText(a.kpis.hoesik);
  const top = a.kpis.topCustomer;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: C.paper, fontFamily: "Pretendard" }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "48px 56px 0" }}>
        <div style={{ display: "flex", color: C.muted, fontSize: 26, fontWeight: 700 }}>상권 분석</div>
        <div style={{ display: "flex", marginTop: 6, color: C.ink, fontSize: 64, fontWeight: 700, letterSpacing: -1.5 }}>{title}</div>
        <div style={{ display: "flex", marginTop: 10, color: C.ink2, fontSize: 28 }}>{parts.join(", ")}</div>
        <div style={{ display: "flex", alignItems: "baseline", marginTop: 28 }}>
          <span style={{ color: C.muted, fontSize: 28 }}>분석 매장</span>
          <span style={{ marginLeft: 16, color: C.ink, fontSize: 72, fontWeight: 700 }}>{a.filtered.length}곳</span>
        </div>
        <div style={{ display: "flex", marginTop: 2, color: C.muted, fontSize: 26 }}>조회 지역 {scopeLabel}</div>
        <div style={{ display: "flex", marginTop: 26 }}>
          <Metric label="동네맛집 표시 비중" value={local.value} sub={local.sub} />
          <Metric label="회식 적합 표시 비중" value={hoesik.value} sub={hoesik.sub} />
          <Metric
            label="가장 많은 1위 고객층"
            value={top ? top.leaders.map(customerLabel).join(", ") : "정보 없음"}
            sub={top ? `${top.num}곳 / ${top.den}곳` : "고객층 확인 0곳"}
          />
        </div>
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
  const raw: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((v, k) => {
    if (!(k in raw)) raw[k] = v;
  });
  try {
    const { scope } = parseScope(raw);
    const dataset = await loadArea(loadInput(scope));
    if (dataset.stores.length > 0) {
      const a = analyze(dataset.stores, parseFilters(raw));
      return await render(<AnalysisCard title={dataset.title || scopeName(scope)} scopeLabel={dataset.scopeLabel} food={scope.food ?? null} a={a} />);
    }
  } catch {
    // 아래 일반 카드로 간다.
  }
  try {
    return await render(<GenericCard />);
  } catch {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
}
