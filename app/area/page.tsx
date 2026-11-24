import type { Metadata } from "next";
import { AREAS } from "@/lib/areas";
import { SITE_NAME } from "@/lib/site";

const TITLE = "상권별 결제 랭킹";
const DESCRIPTION = `강남역, 성수, 을지로, 여의도 등 상권 ${AREAS.length}곳에서 고기구이, 한식, 카페 등 업종별 매출 상위 가게를 BC카드 결제 데이터로 확인하세요.`;
const title = `${TITLE} | ${SITE_NAME}`;
const image = "/og?type=area-index";

export const metadata: Metadata = {
  title: { absolute: title },
  description: DESCRIPTION,
  alternates: { canonical: "/area" },
  openGraph: { type: "website", locale: "ko_KR", siteName: SITE_NAME, title, description: DESCRIPTION, url: "/area", images: [{ url: image, width: 1200, height: 630, alt: TITLE }] },
  twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [image] },
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
