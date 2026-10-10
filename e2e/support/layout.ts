import type { Page } from "@playwright/test";
import { expect } from "./test.ts";

/**
 * Nothing on the page sticks out past the right edge of the window: the page
 * doesn't scroll sideways, and no visible element ends beyond the viewport
 * unless a scrolling or clipping container holds it.
 */
export async function expectNoHorizontalOverflow(page: Page) {
  const problems = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > width + 1) {
      out.push(`page scrolls sideways: ${document.documentElement.scrollWidth}px > ${width}px`);
    }
    const clips = (el: Element) => {
      const style = getComputedStyle(el);
      return style.overflowX !== "visible" || style.position === "fixed";
    };
    for (const el of document.body.querySelectorAll("*")) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.right <= width + 1) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (clips(p) && p.getBoundingClientRect().right <= width + 1) {
          clipped = true;
          break;
        }
      }
      if (!clipped) {
        const label = (el.textContent ?? "").trim().slice(0, 40);
        out.push(`<${el.tagName.toLowerCase()}> ends at ${Math.round(rect.right)}px: "${label}"`);
      }
    }
    return out;
  });
  expect(problems, "content cut off on the right").toEqual([]);
}
