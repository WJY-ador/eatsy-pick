import type { Metadata } from "next";
import { MyAreaList } from "@/components/area/MyAreaList";
import { AREAS } from "@/lib/areas";
import { SITE_NAME, shareImages, shareTwitterImages } from "@/lib/site";

const TITLE = "상권별 결제 랭킹";
const DESCRIPTION = `강남역, 성수, 을지로, 여의도 등 상권 ${AREAS.length}곳에서 고기구이, 한식, 카페 등 업종별 매출 상위 가게를 BC카드 결제 데이터로 확인하세요.`;
const title = `${TITLE} | ${SITE_NAME}`;

export const metadata: Metadata = {
  title: { absolute: title },
  description: DESCRIPTION,
  alternates: { canonical: "/area" },
  openGraph: { type: "website", locale: "ko_KR", siteName: SITE_NAME, title, description: DESCRIPTION, url: "/area", images: shareImages(title) },
  twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: shareTwitterImages(title) },
};

export default function AreaIndex() {
  return (
    <main id="main" className="report container">
      <h1 className="report__h">{TITLE}</h1>
      <p className="report__lede">
        상권을 고르면 업종별로 시군구 매출 상위 가게를 표로 봅니다. 지역 추가를 누르면 다른 동네, 구, 역을 찾아 목록에 넣습니다. 목록은 이 기기에만 저장됩니다.
      </p>
      <MyAreaList />
    </main>
  );
}
