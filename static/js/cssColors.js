/**
 * CSS color literals in value position (for editor swatches).
 */

const COLOR_RE =
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\(\s*[\d.%\s,/]+\s*\)|hsla?\(\s*[-.\d%\s,/deg]+\s*\)/gi;

/**
 * @param {string} line
 * @param {number} index
 * @returns {boolean}
 */
export function isCssValuePosition(line, index) {
  const prefix = line.slice(0, index);
  const lastColon = prefix.lastIndexOf(":");
  if (lastColon < 0) {
    return false;
  }
  const after = prefix.slice(lastColon + 1);
  return !after.includes(";") && !after.includes("{");
}

/**
 * @param {string} line
 * @returns {{ index: number, value: string }[]}
 */
export function findCssValueColors(line) {
  /** @type {{ index: number, value: string }[]} */
  const found = [];
  COLOR_RE.lastIndex = 0;
  let match = COLOR_RE.exec(line);
  while (match) {
    if (isCssValuePosition(line, match.index)) {
      found.push({ index: match.index, value: match[0] });
    }
    match = COLOR_RE.exec(line);
  }
  return found;
}

/**
 * @param {{ eachLine: Function, getLineNumber: Function, setBookmark: Function, on: Function }} cm
 * @returns {() => void}
 */
export function bindCssColorSwatches(cm) {
  /** @type {{ clear: () => void }[]} */
  let marks = [];
  let timer = 0;

  function paint() {
    marks.forEach((mark) => {
      mark.clear();
    });
    marks = [];
    cm.eachLine((lineHandle) => {
      const lineNo = cm.getLineNumber(lineHandle);
      if (lineNo === null) {
        return;
      }
      const colors = findCssValueColors(lineHandle.text);
      colors.forEach((color) => {
        const widget = document.createElement("span");
        widget.className = "cm-color-swatch";
        widget.style.backgroundColor = color.value;
        widget.setAttribute("aria-hidden", "true");
        marks.push(
          cm.setBookmark({ line: lineNo, ch: color.index }, {
            widget,
            insertLeft: true,
          })
        );
      });
    });
  }

  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(paint, 80);
  }

  cm.on("change", schedule);
  paint();
  return paint;
}
