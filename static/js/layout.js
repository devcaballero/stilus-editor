/**
 * Mosaic de paneles: dos huecos apilados + un hueco lateral.
 * Orden: [stackTop, stackBottom, side].
 */

export const PANEL_IDS = Object.freeze(["md", "css", "preview"]);

export const DEFAULT_PANEL_ORDER = Object.freeze(["md", "css", "preview"]);

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizePanelOrder(raw) {
  if (!Array.isArray(raw) || raw.length !== PANEL_IDS.length) {
    return [...DEFAULT_PANEL_ORDER];
  }
  const seen = new Set();
  /** @type {string[]} */
  const order = [];
  for (const id of raw) {
    if (typeof id !== "string" || !PANEL_IDS.includes(id) || seen.has(id)) {
      return [...DEFAULT_PANEL_ORDER];
    }
    seen.add(id);
    order.push(id);
  }
  return order;
}

/**
 * Intercambia dos paneles en el orden actual.
 * @param {readonly string[]} order
 * @param {string} a
 * @param {string} b
 * @returns {string[]}
 */
export function swapPanelOrder(order, a, b) {
  const next = [...order];
  const i = next.indexOf(a);
  const j = next.indexOf(b);
  if (i < 0 || j < 0 || i === j) {
    return next;
  }
  next[i] = b;
  next[j] = a;
  return next;
}
