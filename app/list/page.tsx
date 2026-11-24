import type { Metadata } from "next";
import Link from "next/link";
import { inflateRawSync } from "node:zlib";
import { Suspense } from "react";
import { MerLink } from "@/components/MerLink";
import { SHARE_JSON_MAX, type SharedList, decodeSharedList } from "@/lib/share-list";
import { SITE_NAME } from "@/lib/site";
import { displayName, percentLabel } from "@/lib/store-view";
import "./list.css";

// 공유 목록. 의무 표기는 공통 레이아웃의 푸터가 보여 준다. 링크(d) 안에 담긴 목록만 그린다. 서버 저장소, 누가 공유했는지, 언제 다녀왔는지는 없다.
// 링크는 믿지 않는다: lib/share-list가 항목마다 검사하고 깨진 항목만 버린다. merUrl은 받은 문자열 그대로 MerLink에 넘긴다.

/** 압축본을 푼다. 상한을 넘거나 깨졌으면 null */
function inflate(bytes: Uint8Array): Uint8Array | null {
  try {
    return inflateRawSync(bytes, { maxOutputLength: SHARE_JSON_MAX });
  } catch {
    return null;
  }
}

type Params = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Params> };

function read(raw: Params): SharedList | null {
  return decodeSharedList(raw.d, inflate);
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const list = read(await searchParams);
  const title = list && list.stores.length > 0 ? `${list.title} | ${SITE_NAME}` : `공유 목록 | ${SITE_NAME}`;
  return {
    title: { absolute: title },
    description: "BC카드 결제 데이터로 고른 가게 목록입니다.",
  };
}

async function SharedListView({ searchParams }: Props) {
  const list = read(await searchParams);
  if (!list || list.stores.length === 0) {
    return (
      <div className="state" data-testid="shared-empty">
        <h1 className="state__h">목록을 열 수 없습니다</h1>
        <p>링크가 잘렸거나 바뀌었을 수 있습니다. 보낸 사람에게 링크를 다시 받아 주세요.</p>
        <Link className="slist__home" prefetch={false} href="/">
          가게 찾아보기
        </Link>
      </div>
    );
  }
  return (
    <>
      <header className="slist__head">
        <p className="slist__kicker">공유된 목록</p>
        <h1 className="slist__title">{list.title}</h1>
        <p className="slist__count">
          가게 <span className="num">{list.stores.length}</span>곳
        </p>
        {list.dropped > 0 ? (
          <p className="slist__warn">
            링크에서 읽지 못한 <span className="num">{list.dropped}</span>곳은 빼고 보여 드립니다.
          </p>
        ) : null}
      </header>
      <ol className="slist__items">
        {list.stores.map((st) => (
          <li key={st.merUrl} className="slist__item" data-testid="shared-item">
            <div className="slist__main">
              <h2 className="slist__name">{displayName(st.name)}</h2>
              <p className="slist__meta">
                {st.category ? <span className="slist__cat">{st.category}</span> : null}
                {st.ccgRank !== null ? (
                  <span>
                    {st.sigungu || "지역"} 매출 상위 <span className="num">{percentLabel(st.ccgRank)}</span>
                  </span>
                ) : (
                  <span>지역 매출 순위 미확인</span>
                )}
              </p>
              {st.address ? <p className="slist__addr">{st.address}</p> : null}
            </div>
            <MerLink merUrl={st.merUrl} className="cta slist__cta" />
          </li>
        ))}
      </ol>
      <Link className="slist__home" prefetch={false} href="/">
        다른 가게 찾아보기
      </Link>
    </>
  );
}

export default function ListPage({ searchParams }: Props) {
  return (
    <main id="main" className="slist container container--narrow">
      <Suspense fallback={<p className="slist__kicker">목록을 불러오는 중입니다.</p>}>
        <SharedListView searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
