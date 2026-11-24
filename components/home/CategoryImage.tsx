"use client";

import "@/app/catimg.css";
import { useState } from "react";
import { CATEGORY_IMAGES, NEUTRAL_KEYS, type ImageKey, pickImage } from "@/lib/category-image";

/**
 * 카드 위 16:9 업종 참고 이미지. 상자 높이는 aspect-ratio로 고정해 로드 전, 후, 실패에 같다.
 * 사진은 메뉴 → 업종 소분류 → 넓은 업종 → 중립 실사 순서로 고른다(lib/category-image.ts pickImage). name이 없으면 업종 값만 본다.
 * 고른 파일을 못 불러오면 로컬 중립 실사로 바꾼다(data-kind="fallback"). 중립 실사도 못 불러오면 다음 중립 실사로 넘기고, 다 실패하면 바탕색 상자로 둔다.
 * 이미지 위에는 표시를 얹지 않는다. 실제 매장 사진이 아니라는 안내는 첫 큐레이션 섹션 머리에 한 줄로 둔다(Curation.tsx). 화면 낭독기는 alt로 참고 이미지임을 읽는다.
 */
export function CategoryImage({
  category,
  name,
  className,
  priority = false,
}: {
  category: string | null | undefined;
  name?: string;
  className?: string;
  priority?: boolean;
}) {
  const { key } = pickImage({ name, category });
  // 못 불러온 키. 키가 바뀌면(다른 매장) 이전 실패는 의미가 없으므로 고른 키와 함께 기억한다
  const [failed, setFailed] = useState<{ key: ImageKey; keys: ImageKey[] }>({ key, keys: [] });
  const failedKeys = failed.key === key ? failed.keys : [];
  // 고른 키, 그다음 중립 실사 순서로 아직 실패하지 않은 첫 파일
  const chain: ImageKey[] = [key, ...NEUTRAL_KEYS.filter((k) => k !== key)];
  const shown = chain.find((k) => !failedKeys.includes(k)) ?? null;
  const img = shown ? CATEGORY_IMAGES[shown] : null;
  const fail = (k: ImageKey) =>
    setFailed((prev) => {
      const keys = prev.key === key ? prev.keys : [];
      return keys.includes(k) ? prev : { key, keys: [...keys, k] };
    });
  const cls = className ? `catimg ${className}` : "catimg";

  return (
    <div className={cls} data-testid="cat-image" data-kind={shown === key ? "photo" : "fallback"} data-group={key}>
      {img && shown ? (
        // key를 바꿔 새 img로 그린다. 같은 요소에서 src와 srcSet만 바꾸면 깨진 srcSet 후보가 남을 수 있다
        // 미리 잘라 둔 정적 webp 두 장을 srcSet으로 고른다. 이미지 최적화 서버를 거치지 않는다
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={shown}
          className="catimg__img"
          src={img.src}
          srcSet={img.srcSet}
          sizes="(min-width: 64rem) 280px, (min-width: 48rem) 33vw, 75vw"
          width={img.width}
          height={img.height}
          alt={img.alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          onError={() => fail(shown)}
          ref={(el) => {
            // hydration 전에 이미 실패한 이미지는 onError가 다시 오지 않는다
            if (el && el.complete && el.naturalWidth === 0) fail(shown);
          }}
        />
      ) : null}
    </div>
  );
}
