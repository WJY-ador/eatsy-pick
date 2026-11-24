import type { Metadata } from "next";
import { MAP_PROVIDER, MAP_PROVIDER_NAME } from "@/lib/map-provider";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `개인정보 안내 | ${SITE_NAME}` },
  description: `${SITE_NAME}의 위치 정보, 방문 기록과 메모, 리스트 공유, 잇플 링크, 지도 처리 안내입니다.`,
  alternates: { canonical: "/privacy" },
};

// 본문은 사용자 원문 그대로다(2026-11-23). 2026-11-24 단계, 태그, 메모가 기기에만 있다는 점과 공유에서 빠진다는 점을 더했다(리드 지시). 사실만 적고 덧붙이지 않는다. 리스트 공유 줄은 공유 링크에 담기는 값(lib/share-list.ts 허용 목록)을 적은 것이다.
// 위치 정보 줄 끝 문장은 2026-11-24 역지오코딩 카카오 1순위 전환으로 전송처 이름만 고쳤다.
// 지도 줄: 카카오 빌드는 카카오를 못 불러오면 Leaflet(OpenStreetMap 타일)으로 넘어가므로 둘 다 적는다(리드 지시 문구).
export default function Privacy() {
  return (
    <main id="main" className="report container privacy">
      <h1 className="report__h">개인정보 안내</h1>
      <dl className="privacy__list">
        <div>
          <dt>위치 정보</dt>
          <dd>
            내 주변 보기를 누르거나 위치 권한을 이미 허용한 경우에만 현재 위치를 확인합니다. 정확한 좌표는 이 기기 안에서 거리 계산과 지도 표시에만 쓰고, 서버로 보내거나 저장하지 않습니다. 동네 이름을 찾기 위해 약 100m 단위로 줄인 좌표를 카카오에 보내고, 찾지 못하면 OpenStreetMap Nominatim에 보냅니다.
          </dd>
        </div>
        <div>
          <dt>방문 기록</dt>
          <dd>
            저장, 다녀왔어요, 반응과 저장한 가게에 붙인 단계, 태그, 한 줄 메모는 이 브라우저에만 저장되고 서버로 보내지 않습니다. 화면 위 내 저장 버튼에서 언제든 지울 수 있습니다.
          </dd>
        </div>
        <div>
          <dt>리스트 공유</dt>
          <dd>
            리스트 공유 링크에는 직접 고른 가게의 이름, 업종, 주소, 지역 매출 순위, 잇플 링크와 목록 제목만 담깁니다. 단계, 태그, 메모, 방문 기록, 반응, 위치는 담지 않습니다. 목록은 서버에 저장하지 않고 링크 안에만 있어서, 링크를 받은 사람은 누구나 볼 수 있습니다.
          </dd>
        </div>
        <div>
          <dt>잇플 링크</dt>
          <dd>매장 링크를 누르면 BC카드 잇플 페이지가 새 창으로 열립니다. 링크를 눌렀는지는 기록하지 않습니다.</dd>
        </div>
        <div>
          <dt>지도</dt>
          <dd>
            {MAP_PROVIDER === "kakao"
              ? "지도 타일은 지도 제공자(카카오, 불러오지 못하면 OpenStreetMap) 서버에서 직접 받아 옵니다."
              : `지도 타일은 지도 제공자(${MAP_PROVIDER_NAME}) 서버에서 직접 받아 옵니다.`}
          </dd>
        </div>
      </dl>
    </main>
  );
}
