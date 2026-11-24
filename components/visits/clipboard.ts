// 클립보드 복사. 성공 여부만 돌려준다(권한이 막혔거나 지원하지 않으면 false).

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 구형 인앱 브라우저는 Clipboard API가 있어도 권한을 거부할 수 있다. 아래 선택 복사를 시도한다.
  }
  try {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    try {
      input.focus();
      input.select();
      return document.execCommand("copy");
    } finally {
      input.remove();
      previous?.focus({ preventScroll: true });
    }
  } catch {
    return false;
  }
}
