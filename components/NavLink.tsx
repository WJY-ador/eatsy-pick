"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect } from "react";

/** 이동 대기 표시: html[data-nav="pending"]. prefetch를 끈 링크는 서버 응답까지 기다리기 때문이다(CSS가 스켈레톤을 띄운다). */
export function setNavPending(on: boolean) {
  if (on) document.documentElement.dataset.nav = "pending";
  else delete document.documentElement.dataset.nav;
}

function PendingFlag() {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    setNavPending(true);
    return () => setNavPending(false);
  }, [pending]);
  return null;
}

/** 소프트 내비게이션 링크: prefetch 끔(프록시 호출 한도), 스크롤 유지. JS가 없으면 평범한 링크로 동작한다. */
export function NavLink({
  href,
  className,
  current,
  children,
  ...rest
}: { href: string; className?: string; current?: boolean; children: React.ReactNode } & Omit<
  React.ComponentProps<typeof Link>,
  "href" | "className" | "children" | "prefetch" | "scroll"
>) {
  return (
    <Link href={href} prefetch={false} scroll={false} className={className} aria-current={current ? "true" : undefined} {...rest}>
      {children}
      <PendingFlag />
    </Link>
  );
}

/** 서버가 새 조건으로 다시 그리면(navKey가 바뀌면) 대기 표시를 끈다. router.push로 이동한 경로(지도 핀, 검색, 내 주변)도 여기서 끝난다. */
export function NavDone({ navKey }: { navKey: string }) {
  useEffect(() => {
    setNavPending(false);
  }, [navKey]);
  return null;
}
