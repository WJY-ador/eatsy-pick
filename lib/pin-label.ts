// 지도 핀의 화면 배치 규칙. 두 지도 어댑터(카카오, Leaflet)가 같이 쓴다(화면 좌표로만 판정).
// 가게 이름 글자 내용은 각 어댑터가 displayName(s.name)으로 넣는다.

type Box = { left: number; top: number; right: number; bottom: number };
const hit = (a: Box, b: Box) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
const inside = (a: Box, f: Box) => a.left >= f.left && a.right <= f.right && a.top >= f.top && a.bottom <= f.bottom;

/** 이름 글자 우선순위. 0 선택, 1 목록에서 강조, 2 우선 매장(매출 상위 몇 곳), 3 나머지 */
export type PinRank = 0 | 1 | 2 | 3;

/**
 * 핀 옆 가게 이름 글자를 겹치지 않게 켠다. 순위가 높은 핀부터 자리를 잡는다.
 * 순위 0, 1은 다른 핀 점과는 겹쳐도 되고, 좌우가 막히면 위, 아래를 본다. 순위 2는 늘 시도하고, 순위 3은 showRest일 때만 시도한다.
 * 어떤 글자든 다른 글자, 지도 위 조작 요소(data-map-ctl), keepClear(지도 제공자 표기, 묶음)와 겹치거나 지도 밖으로 나가면 끈다.
 * 글자 자리는 data-tag="r" | "l" | "t" | "b"(위, 아래는 순위 0, 1만).
 */
export function placePinTags(frame: HTMLElement, pins: { el: HTMLElement; rank: PinRank }[], showRest: boolean, keepClear: Element[] = []): number {
  const f = frame.getBoundingClientRect();
  const items = pins
    .map((p) => ({ ...p, dot: p.el.querySelector<HTMLElement>(".smpin__dot"), tag: p.el.querySelector<HTMLElement>(".smpin__tag") }))
    .filter((p): p is typeof p & { dot: HTMLElement } => p.dot !== null);
  const dots = items.map((p) => p.dot.getBoundingClientRect());
  // 글자 자리는 CSS가 정한다(오른쪽 기본, 왼쪽은 점 가운데 기준 좌우 대칭). 숨겨진 채로 잰 실제 위치를 쓴다.
  const measure = (p: (typeof items)[number], side: string): Box | null => {
    if (!p.tag) return null;
    const prev = p.el.dataset.tag ?? "";
    if (prev !== side) p.el.dataset.tag = side;
    const r = p.tag.getBoundingClientRect();
    if (prev !== side) p.el.dataset.tag = prev;
    return r.width === 0 ? null : { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  };
  const rights = items.map((p, i): Box | null => {
    const now = p.el.dataset.tag ?? "";
    if (now !== "l") return measure(p, now === "r" ? "r" : "");
    const r = measure(p, "l");
    if (!r) return null;
    const cx2 = dots[i].left + dots[i].right;
    return { left: cx2 - r.right, right: cx2 - r.left, top: r.top, bottom: r.bottom };
  });
  const order = items.map((_, i) => i).sort((a, b) => items[a].rank - items[b].rank || a - b);
  const placed: Box[] = [...(frame.parentElement?.querySelectorAll<HTMLElement>("[data-map-ctl]") ?? []), ...keepClear].map((e) => e.getBoundingClientRect());
  let shown = 0;
  for (const i of order) {
    const p = items[i];
    const right = rights[i];
    const forced = p.rank <= 1;
    let side = "";
    if (right && (p.rank <= 2 || showRest)) {
      const cx2 = dots[i].left + dots[i].right;
      const left: Box = { left: cx2 - right.right, right: cx2 - right.left, top: right.top, bottom: right.bottom };
      const clear = (b: Box) => inside(b, f) && !placed.some((q) => hit(q, b));
      const free = (b: Box) => clear(b) && !dots.some((o, j) => j !== i && hit(o, b));
      if (free(right)) side = "r";
      else if (free(left)) side = "l";
      else if (forced) {
        const up = measure(p, "t");
        const down = measure(p, "b");
        if (clear(right)) side = "r";
        else if (clear(left)) side = "l";
        else if (up && clear(up)) side = "t";
        else if (down && clear(down)) side = "b";
      }
      if (side) {
        placed.push(side === "r" ? right : side === "l" ? left : (measure(p, side) as Box));
        shown += 1;
      }
    }
    if ((p.el.dataset.tag ?? "") !== side) p.el.dataset.tag = side;
  }
  return shown;
}

/** 묶음 반경(px). 핀 점(16px) 사이 틈이 6px 이하로 붙거나 덮이는 거리. 이보다 넓히면 따로 누를 수 있는 핀까지 묶인다(1440 해운대역 실측) */
export const CLUSTER_RADIUS_PX = 22;

/**
 * 화면 좌표로 가까운 핀을 묶는다. 앞에 온 점(우선순위가 높은 점)이 묶음의 기준이 된다.
 * keep에 든 id(선택한 매장)는 묶지 않는다. 반경 안에 다른 점이 하나도 없으면 묶지 않는다.
 * 돌려주는 것은 2곳 이상의 묶음뿐이다. 나머지 점은 핀으로 그린다.
 */
export function clusterPins(points: { id: string; x: number; y: number }[], keep: ReadonlySet<string>, radius = CLUSTER_RADIUS_PX): string[][] {
  const r2 = radius * radius;
  const used = new Set<string>();
  const out: string[][] = [];
  for (const p of points) {
    if (used.has(p.id) || keep.has(p.id)) continue;
    const group = [p.id];
    for (const q of points) {
      if (q === p || used.has(q.id) || keep.has(q.id)) continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (dx * dx + dy * dy <= r2) group.push(q.id);
    }
    if (group.length < 2) continue;
    for (const id of group) used.add(id);
    out.push(group);
  }
  return out;
}

/** 묶음 버튼. 핀(.smpin, data-id)과 다른 클래스를 쓴다 */
export function clusterButton(count: number, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "smclu";
  b.dataset.count = String(count);
  b.setAttribute("aria-label", `매장 ${count}곳 묶음, 누르면 확대`);
  const n = document.createElement("span");
  n.className = "smclu__n";
  n.setAttribute("aria-hidden", "true");
  n.textContent = String(count);
  b.appendChild(n);
  b.addEventListener("click", onClick);
  return b;
}

/** 우선 매장: 주어진 핀(지금 화면 안에 핀으로 보이는 매장) 중 지역 매출 상위 순(ccgRank 오름차순) 앞의 n곳 */
export function topRanked(pins: { id: string; ccgRank: number | null }[], n: number): Set<string> {
  if (n <= 0) return new Set();
  return new Set(
    pins
      .filter((s) => typeof s.ccgRank === "number" && Number.isFinite(s.ccgRank))
      .sort((a, b) => (a.ccgRank as number) - (b.ccgRank as number))
      .slice(0, n)
      .map((s) => s.id),
  );
}

/** 매장 핀 버튼. 두 어댑터가 같은 요소를 쓴다(.smpin[data-id], 이름 글자 .smpin__tag) */
export function pinButton(name: string, id: string, onClick: (el: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "smpin";
  b.dataset.id = id;
  b.setAttribute("aria-label", `${name} 영수증 열기`);
  b.setAttribute("aria-pressed", "false");
  b.title = name;
  const dot = document.createElement("span");
  dot.className = "smpin__dot";
  b.appendChild(dot);
  const tag = document.createElement("span");
  tag.className = "smpin__tag";
  tag.setAttribute("aria-hidden", "true");
  tag.textContent = name;
  b.appendChild(tag);
  b.addEventListener("click", () => onClick(b));
  return b;
}

/**
 * 옮긴 동네 핀 버튼(.smpin.smpin--far). 지금 범위 핀과 같은 버튼에 옅은 작은 점을 쓴다. 이름 글자는 켜지 않는다(title로만 보인다).
 * 누르면 그 매장 주소의 동으로 홈 범위를 바꾸고 영수증을 연다(받는 쪽이 한다).
 */
export function panPinButton(name: string, id: string, onClick: () => void): HTMLButtonElement {
  const b = pinButton(name, id, onClick);
  b.classList.add("smpin--far");
  b.removeAttribute("aria-pressed");
  b.setAttribute("aria-label", `${name}, 이 동네로 옮겨 영수증 열기`);
  return b;
}

/** 선택, 강조 표시를 핀 버튼에 단다 */
export function markPin(el: HTMLElement, selected: boolean, hover: boolean): void {
  el.classList.toggle("is-selected", selected);
  el.classList.toggle("is-hover", hover && !selected);
  el.setAttribute("aria-pressed", selected ? "true" : "false");
}
