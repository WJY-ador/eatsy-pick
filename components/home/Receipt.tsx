"use client";

import { useEffect, useId, useRef, useState } from "react";
import "@/app/receipt.css";
import { MerLink } from "@/components/MerLink";
import { useEscapeLayer } from "@/components/Sheet";
import { BookmarkButton, CrmEditor, VisitControls } from "@/components/visits";
import { copyText } from "@/components/visits/clipboard";
import { ATTRIBUTION, DISCLAIMER } from "@/lib/site";
import { customersOf, displayName, hoursOf, peakOf, percentLabel } from "@/lib/store-view";
import type { Store } from "@/lib/stores";

/** 대표 숫자 아래 기준 문구(ccgSaleRnk 정의) */
const RANK_SCOPE = "같은 시군구, 같은 업종 내 BC카드 결제 매출 기준";
const RECEIPT_MER_LINK_TEXT = "실시간 영업, 웨이팅, 메뉴 가격 보기";

type BadgeFlag = "local" | "hoesik";

/** 배지 이름과 누르면 펼치는 설명. 잇플 API 정의서의 loclPrsnPpltYn, empyVsitYn 정의를 그대로 옮긴다(비율, 건수를 덧붙이지 않는다). */
const BADGES: { flag: BadgeFlag; label: string; help: string }[] = [
  { flag: "local", label: "동네맛집", help: "동네 고객 비율이 시군구 평균보다 높은 매장입니다." },
  { flag: "hoesik", label: "회식 적합", help: "저녁 시간대 단체 결제 이력이 있는 매장입니다." },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rc__row">
      <dt className="rc__k">{label}</dt>
      <dd className="rc__v">{children}</dd>
    </div>
  );
}

type CopyState = { id: string; ok: boolean } | null;
/** 펼친 배지 설명. 매장이 바뀌면 다른 id라 저절로 닫힌다 */
type HelpState = { id: string; flag: BadgeFlag } | null;

/** 주소 복사 알림이 머무는 시간 */
const COPY_NOTE_MS = 4000;

/**
 * 결제 영수증 상세. 매장 카드, 목록, 지도 핀을 누르면 열린다.
 * 가게명 바로 아래에 같은 시군구, 같은 업종 내 매출 백분위(ccgSaleRnk 원본)를 대표 숫자로 두고, 값이 true인 배지(동네맛집, 회식 적합)만 이름으로 보인다.
 * 768px 미만은 아래에서 올라오는 시트, 768px 이상은 오른쪽 슬라이드 패널. 열리면 제목으로 포커스, Esc와 닫기로 닫는다.
 * 닫으면 연 요소로 포커스를 돌려준다(여는 쪽이 먼저 돌려주면 그대로 둔다).
 * 저장 표시와 내 기록(단계, 태그, 메모, 방문)은 북마크와 같은 기기 기록에서 읽어 카드, 목록, 내 저장과 바로 같아진다.
 * 잇플 CTA와 의무 표기는 패널 아래 고정 줄에 둔다. 내 기록이 길어져도 스크롤 없이 보인다.
 */
export function Receipt({
  store,
  distance,
  distanceBasis,
  onClose,
  onPeak,
}: {
  store: Store;
  distance: string | null;
  distanceBasis: string | null;
  onClose: () => void;
  /** 대표 피크 차트를 연다(없으면 글자로만) */
  onPeak?: () => void;
}) {
  const titleId = useId();
  const mineId = useId();
  const helpId = useId();
  const headRef = useRef<HTMLHeadingElement>(null);
  const customers = customersOf(store);
  const peak = peakOf(store);
  const hours = hoursOf(store);
  const asideRef = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [copy, setCopy] = useState<CopyState>(null);
  const [help, setHelp] = useState<HelpState>(null);
  // 옛 기기 스냅샷은 값이 비었거나 다른 꼴일 수 있어 수와 true만 인정한다
  const rank = typeof store.ccgRank === "number" && Number.isFinite(store.ccgRank) ? percentLabel(store.ccgRank) : null;
  const badges = BADGES.filter((b) => store[b.flag] === true);
  const openHelp = help && help.id === store.id ? BADGES.find((b) => b.flag === help.flag && store[b.flag] === true) : undefined;

  // 매장이 바뀔 때마다 연 요소를 기억하고(영수증 안의 요소는 빼고) 제목으로 포커스를 옮긴다.
  useEffect(() => {
    const a = document.activeElement;
    if (a instanceof HTMLElement && a !== document.body && !asideRef.current?.contains(a)) opener.current = a;
    headRef.current?.focus();
  }, [store.id]);

  // 닫힌 뒤 포커스가 갈 곳을 잃었으면(본문이나 사라진 영수증 안) 연 요소로 돌려준다.
  useEffect(
    () => () => {
      const a = document.activeElement;
      if (a && a !== document.body && document.contains(a)) return;
      const t = opener.current;
      if (t && document.contains(t)) t.focus();
    },
    [],
  );

  useEffect(() => {
    if (!copy) return;
    const timer = window.setTimeout(() => setCopy(null), COPY_NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [copy]);

  const copyNote = copy && copy.id === store.id ? (copy.ok ? "주소를 복사했습니다" : "복사하지 못했습니다. 주소를 길게 눌러 직접 복사해 주세요") : "";

  // Esc는 맨 위 겹만 닫는다(이 영수증 위에 근거 시트가 열려 있으면 그 시트가 먼저 닫힌다).
  useEscapeLayer(onClose);

  return (
    <>
      <button type="button" className="rc__scrim" aria-label="영수증 닫기" tabIndex={-1} onClick={onClose} />
      <aside ref={asideRef} className="rc" role="dialog" aria-labelledby={titleId}>
        <div className="rc__top">
          <p className="rc__kind">결제 영수증</p>
          <button type="button" className="rc__close" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="rc__paper">
          <div className="rc__head">
            <h2 id={titleId} ref={headRef} tabIndex={-1} className="rc__name">
              {displayName(store.name)}
            </h2>
            <BookmarkButton store={store} className="rc__bookmark" />
          </div>
          <div className="rc__hero">
            {rank ? (
              <p className="rc__rank" data-testid="rc-rank">
                상위 <span className="num rc__pct">{rank}</span>
              </p>
            ) : (
              <p className="rc__rank rc__rank--none" data-testid="rc-rank">
                지역 매출 순위 미확인
              </p>
            )}
            <p className="rc__scope" data-testid="rc-rank-scope">
              {RANK_SCOPE}
            </p>
          </div>
          {badges.length ? (
            <div className="rc__badgebox">
              <ul className="rc__badges">
                {badges.map((b) => {
                  const open = openHelp?.flag === b.flag;
                  return (
                    <li key={b.flag}>
                      <button
                        type="button"
                        className="rc__badge"
                        data-testid="rc-badge"
                        data-flag={b.flag}
                        aria-expanded={open}
                        aria-controls={open ? helpId : undefined}
                        onClick={() => setHelp(open ? null : { id: store.id, flag: b.flag })}
                      >
                        <span className="rc__pill">
                          {b.label}
                          <svg className="rc__chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
                            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {openHelp ? (
                <p className="rc__help" id={helpId} data-testid="rc-badge-help">
                  <span className="rc__helpk">{openHelp.label}</span> {openHelp.help}
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="rc__cat">
            {store.category}
            {distance ? (
              <>
                , <span className="num">{distance}</span>
                {distanceBasis ? ` (${distanceBasis})` : ""}
              </>
            ) : null}
          </p>
          {store.address ? (
            <div className="rc__addrline">
              <p className="rc__addr">{store.address}</p>
              <button
                type="button"
                className="rc__copy"
                data-testid="addr-copy"
                aria-label="주소 복사"
                onClick={async () => {
                  const id = store.id;
                  const ok = await copyText(store.address);
                  setCopy({ id, ok });
                }}
              >
                <svg className="rc__copyicon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                  <rect x="8.75" y="8.75" width="11.5" height="11.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
                  <path d="M15.25 5.5V5a1.25 1.25 0 0 0-1.25-1.25H5A1.25 1.25 0 0 0 3.75 5v9A1.25 1.25 0 0 0 5 15.25h.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
                복사
              </button>
            </div>
          ) : null}
          <p className="rc__copied" role="status" data-ok={copy?.ok ? "true" : "false"}>
            {copyNote}
          </p>
          <hr className="rc__dash" />
          <dl className="rc__list">
            <Row label="전국 동일 업종 매출 상위">
              <span className="num">{percentLabel(store.allRank)}</span>
            </Row>
            <Row label="고객층">
              {customers.length ? (
                <ol className="rc__cust">
                  {customers.map((c, i) => (
                    <li key={c}>
                      <span className="num">{i + 1}위</span> {c}
                    </li>
                  ))}
                </ol>
              ) : (
                "정보 없음"
              )}
            </Row>
            <Row label="대표 피크">
              {peak && onPeak ? (
                <button type="button" className="taghit rc__peak" onClick={onPeak} aria-haspopup="dialog">
                  <span className="tag tag--btn">
                    {peak}
                    <span className="tag__chev" aria-hidden="true" />
                  </span>
                </button>
              ) : (
                (peak ?? "정보 없음")
              )}
            </Row>
            <Row label="예상 영업시간">
              {hours ? <span className="num">{hours}</span> : "정보 없음"}
              <span className="rc__note">최근 1개월 결제 승인 시각 기준</span>
            </Row>
            {store.holidays.length ? <Row label="휴무 요일">{store.holidays.join(", ")}</Row> : null}
          </dl>
          <hr className="rc__dash" />
          <section className="rc__mine" data-testid="crm" aria-labelledby={mineId}>
            <h3 className="rc__minetitle" id={mineId}>
              내 기록
            </h3>
            <CrmEditor key={store.id} store={store} />
            <div className="rc__visits">
              <VisitControls store={store} />
            </div>
            <p className="rc__note">단계, 태그, 메모, 방문 기록은 이 기기에만 저장됩니다.</p>
          </section>
        </div>
        <div className="rc__foot">
          <MerLink merUrl={store.merUrl} label={RECEIPT_MER_LINK_TEXT} className="cta cta--ink rc__cta" />
          <p className="rc__attr">{ATTRIBUTION}</p>
          <p className="rc__disc">{DISCLAIMER}</p>
        </div>
      </aside>
    </>
  );
}
