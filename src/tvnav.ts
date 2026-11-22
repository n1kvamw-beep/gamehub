// Navegação no site com o comando: move o foco entre botões/links e clica.
export type Dir = "up" | "down" | "left" | "right";

const SELECTOR = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Se houver uma janela aberta (login, editar jogo, código do comando), a navegação fica presa lá dentro.
function scope(): ParentNode {
  const dialogs = document.querySelectorAll(".modal, .pad-card");
  return dialogs.length ? dialogs[dialogs.length - 1] : document;
}

function visible(el: Element) {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none";
}

const items = () => [...scope().querySelectorAll<HTMLElement>(SELECTOR)].filter(visible);
const center = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

export function moveFocus(dir: Dir) {
  const list = items();
  if (!list.length) return;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || cur === document.body || !list.includes(cur)) {
    // Primeiro movimento: começa no conteúdo principal, não no menu lateral.
    (list.find(e => e.closest(".main-area")) ?? list[0]).focus();
    return;
  }
  const c = center(cur);
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const p = center(el);
    const dx = p.x - c.x, dy = p.y - c.y;
    const main = dir === "up" ? -dy : dir === "down" ? dy : dir === "left" ? -dx : dx;
    if (main < 4) continue;
    const side = dir === "up" || dir === "down" ? Math.abs(dx) : Math.abs(dy);
    const score = main + side * 2.5;
    if (score < bestScore) { best = el; bestScore = score; }
  }
  if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }
  else window.scrollBy({ top: dir === "down" ? 160 : dir === "up" ? -160 : 0, behavior: "smooth" });
}

export function clickFocused() {
  const el = document.activeElement as HTMLElement | null;
  if (el && el !== document.body) el.click();
}

// "B": fecha a janela aberta ou volta atrás (botão "Voltar" da página).
export function goBack() {
  const dialog = [...document.querySelectorAll(".modal, .pad-card")].pop();
  if (dialog) {
    const close = dialog.querySelector<HTMLElement>(".modal-head .icon-btn, .pad-close");
    if (close) return close.click();
  }
  const back = [...document.querySelectorAll<HTMLElement>(".back-link")].find(visible);
  if (back) back.click();
}

export function scrollPage(dir: "up" | "down") {
  const main = document.querySelector<HTMLElement>(".main-area");
  const top = (dir === "down" ? 1 : -1) * window.innerHeight * 0.7;
  window.scrollBy({ top, behavior: "smooth" });
  main?.scrollBy({ top, behavior: "smooth" });
}
