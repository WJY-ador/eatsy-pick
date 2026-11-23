import type { AreaPreset } from "@/lib/areas";
import type { Choice } from "@/lib/decide";
import { displayName } from "@/lib/format";
import { FIELD_LABELS, buildTags, customerLabel, holidaysLabel, hoursLabel, hoursShort } from "@/lib/labels";
import { ATTRIBUTION } from "@/lib/site";
import { MerLink } from "./MerLink";

function shortDistance(m: number): string {
  if (m >= 1000) return `${(Math.round(m / 100) / 10).toFixed(1)}km`;
  return `${Math.max(10, Math.round(m / 10) * 10)}m`;
}

/**
 * 결과 카드, 네 줄: 가게명과 업종, 태그(최대 4), 보조 줄(예상 영업, 거리), 잇플 버튼.
 * 주소, 휴무, 고객층 2~3위, 조건 충족 내역, 영업시간 설명은 "정보 더 보기"로 접는다.
 */
export function ResultCard({ choice, area }: { choice: Choice; area?: AreaPreset }) {
  const { item, fit } = choice;
  const tags = buildTags(item, choice.sigungu);
  const hours = hoursShort(item.srtTime, item.endTime);
  const sub = [
    hours ? `예상 영업 ${hours}` : null,
    area && choice.distanceM !== null ? `${area.centerName}에서 ${shortDistance(choice.distanceM)}` : null,
  ].filter(Boolean);
  const rk = item.vistCstmrRnkList;
  const more = [rk?.rk02, rk?.rk03].filter((v): v is string => Boolean(v)).map(customerLabel);
  const hoursFull = hoursLabel(item.srtTime, item.endTime);
  const holidays = holidaysLabel(item.hldyDwk);

  return (
    <article className="pick" aria-labelledby={`pick-${choice.rank}`}>
      <div className="pick__title">
        <h3 className="pick__name" id={`pick-${choice.rank}`}>
          <span className="pick__no num">{choice.rank}</span>
          <span className="visually-hidden">번 </span>
          {displayName(item.merNm)}
        </h3>
        <span className="pick__cat">{item.merTpbuzNm}</span>
      </div>

      {tags.length > 0 ? (
        <ul className="tags" aria-label="결제 데이터 태그">
          {tags.map((t) => (
            <li key={t.key} className={t.key === "rank" ? "tag tag--lead" : "tag"}>
              {t.text}
            </li>
          ))}
        </ul>
      ) : null}

      {sub.length > 0 ? <p className="pick__sub">{sub.join(", ")}</p> : null}

      <MerLink merUrl={item.merUrl} className="pick__go" />
      <p className="pick__attr">{ATTRIBUTION}</p>

      <details className="more">
        <summary>정보 더 보기</summary>
        <dl className="facts">
          <div>
            <dt>{FIELD_LABELS.address}</dt>
            <dd>{item.merAddr}</dd>
          </div>
          {hoursFull ? (
            <div>
              <dt>{FIELD_LABELS.hours}</dt>
              <dd>
                <span className="num">{hoursFull}</span> <span className="facts__note">{FIELD_LABELS.hoursNote}</span>
              </dd>
            </div>
          ) : null}
          {holidays ? (
            <div>
              <dt>{FIELD_LABELS.holidays}</dt>
              <dd>{holidays}</dd>
            </div>
          ) : null}
          {more.length > 0 ? (
            <div>
              <dt>주 고객층 2~3위</dt>
              <dd>{more.join(", ")}</dd>
            </div>
          ) : null}
          <div>
            <dt>이 모임 조건</dt>
            <dd>
              {fit.total}개 중 {fit.met.length}개 충족{fit.met.length > 0 ? `: ${fit.met.join(", ")}` : ""}
            </dd>
          </div>
        </dl>
      </details>
    </article>
  );
}
