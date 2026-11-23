import type { Metadata } from "next";
import { AREAS } from "@/lib/areas";
import { SITE_NAME } from "@/lib/site";

const TITLE = "상권별 결제 랭킹";
const DESCRIPTION = "강남역, 여의도, 성수, 을지로 등 상권 19곳의 업종별 BC카드 결제 순위를 봅니다.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ${SITE_NAME}` },
  description: DESCRIPTION,
  alternates: { canonical: "/area" },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESCRIPTION, url: "/area" },
};

export default function AreaIndex() {
  return (
    <main id="main" className="report container">
      <h1 className="report__h">{TITLE}</h1>
      <p className="report__lede">상권을 고르면 업종별로 시군구 매출 상위 가게를 표로 봅니다.</p>
      <ul className="area-index">
        {AREAS.map((a) => (
          <li key={a.slug}>
            <a href={`/area/${a.slug}`}>{a.name}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
