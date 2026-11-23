// Compatibilidade com navegadores antigos (TV Samsung 2021 usa Chromium 76):
// - gap em flexbox (só existe a partir do Chromium 84) é simulado com margens;
// - crypto.randomUUID (Chromium 92) ganha uma alternativa.

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function flexGapSupported() {
  const d = document.createElement("div");
  d.style.cssText = "display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden";
  d.appendChild(document.createElement("div"));
  d.appendChild(document.createElement("div"));
  document.body.appendChild(d);
  const ok = d.scrollHeight === 1;
  document.body.removeChild(d);
  return ok;
}

function fixContainer(el: HTMLElement) {
  const cs = getComputedStyle(el);
  if (cs.display !== "flex" && cs.display !== "inline-flex") return;
  const col = parseFloat(cs.columnGap) || 0, row = parseFloat(cs.rowGap) || 0;
  if (!col && !row) return;
  const horizontal = cs.flexDirection.indexOf("row") === 0;
  const wrap = cs.flexWrap !== "nowrap";
  const kids = Array.from(el.children) as HTMLElement[];
  kids.forEach((k, i) => {
    if (k.dataset.gf) return;
    k.dataset.gf = "1";
    const set = (prop: string, px: number) => {
      if (px && parseFloat(getComputedStyle(k).getPropertyValue(prop)) === 0) k.style.setProperty(prop, px + "px");
    };
    const last = i === kids.length - 1;
    if (wrap) { if (!last) set("margin-right", col); set("margin-bottom", row); }
    else if (i > 0) { if (horizontal) set("margin-left", col); else set("margin-top", row); }
  });
}

function fixTree(root: Element) {
  if (root instanceof HTMLElement) fixContainer(root);
  root.querySelectorAll<HTMLElement>("*").forEach(fixContainer);
}

export function installCompat() {
  if (typeof document === "undefined" || flexGapSupported()) return;
  const pending = new Set<Element>();
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    pending.forEach(n => { if (n.isConnected) { if (n.parentElement) fixContainer(n.parentElement); fixTree(n); } });
    pending.clear();
  };
  new MutationObserver(records => {
    for (const r of records) r.addedNodes.forEach(n => { if (n.nodeType === 1) pending.add(n as Element); });
    if (!scheduled && pending.size) { scheduled = true; requestAnimationFrame(flush); }
  }).observe(document.body, { childList: true, subtree: true });
  fixTree(document.body);
}
