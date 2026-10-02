"use client";

import { useEffect } from "react";

/** Elements that make the custom cursor grow on hover. */
const GROW = "a,button,input,select,textarea,label,.chip,.vb,.kpi,.card,.out";

/**
 * The site's custom cursor. The `#dot` element itself is rendered by the root
 * layout so it exists before hydration.
 */
export default function Cursor() {
  useEffect(() => {
    const dot = document.getElementById("dot");
    if (!dot) return;
    if (window.matchMedia("(hover:none)").matches) return;

    const move = (event: PointerEvent) => {
      dot.style.transform = `translate(${event.clientX}px,${event.clientY}px)`;
    };
    const over = (event: Event) => {
      const target = event.target as Element | null;
      if (target?.closest?.(GROW)) dot.classList.add("big");
    };
    const out = (event: Event) => {
      const target = event.target as Element | null;
      if (target?.closest?.(GROW)) dot.classList.remove("big");
    };

    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);

    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
    };
  }, []);

  return null;
}
