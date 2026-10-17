"use client";

import { useEffect, useRef } from "react";

let scrollLocks = 0;
let originalOverflow = "";

function lockScroll() {
  if (scrollLocks === 0) originalOverflow = document.body.style.overflow;
  scrollLocks += 1;
  document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks -= 1;
    if (scrollLocks === 0) document.body.style.overflow = originalOverflow;
  };
}

export function useDialogFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const releaseScroll = lockScroll();
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      releaseScroll();
      window.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, onClose]);
  return ref;
}
