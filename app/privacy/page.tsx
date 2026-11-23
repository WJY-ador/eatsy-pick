import type { Metadata } from "next";
import { MAP_PROVIDER_NAME } from "@/lib/map-provider";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `개인정보 안내 | ${SITE_NAME}` },
  description: `${SITE_NAME}의 위치 정보, 방문 기록, 잇플 링크, 지도 처리 안내입니다.`,
  alternates: { canonical: "/privacy" },
};

// 본문은 사용자 원문 그대로다(2026-11-23). 사실만 적고 덧붙이지 않는다.
export default function Privacy() {
  return (
    <main id="main" className="report container privacy">
      <h1 className="report__h">개인정보 안내</h1>
      <dl className="privacy__list">
        <div>
          <dt>위치 정보</dt>
          <dd>
            내 주변 보기를 누르거나 위치 권한을 이미 허용한 경우에만 현재 위치를 확인합니다. 정확한 좌표는 이 기기 안에서 거리 계산과 지도 표시에만 쓰고, 서버로 보내거나 저장하지 않습니다. 동네 이름을 찾기 위해 약 100m 단위로 줄인 좌표를 OpenStreetMap Nominatim에 보냅니다.
          </dd>
        </div>
        <div>
          <dt>방문 기록</dt>
          <dd>저장, 다녀왔어요, 반응은 이 브라우저에만 저장되고 서버로 보내지 않습니다. 내 기록에서 언제든 지울 수 있습니다.</dd>
        </div>
        <div>
          <dt>잇플 링크</dt>
          <dd>매장 링크를 누르면 BC카드 잇플 페이지가 새 창으로 열립니다. 링크를 눌렀는지는 기록하지 않습니다.</dd>
        </div>
        <div>
          <dt>지도</dt>
          <dd>지도 타일은 지도 제공자 서버에서 직접 받아 옵니다. 지금 지도 제공자: {MAP_PROVIDER_NAME}</dd>
        </div>
      </dl>
    </main>
  );
}
