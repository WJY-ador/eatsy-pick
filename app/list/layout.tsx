import type { Metadata } from "next";

// 공유 목록은 색인하지 않는다. 페이지 메타데이터는 링크를 읽은 뒤 늦게 오므로, 모든 응답의 머리에 바로 들어가도록 여기에 둔다.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ListLayout({ children }: { children: React.ReactNode }) {
  return children;
}
