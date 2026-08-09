/**
 * Detect and normalize editor source (Markdown vs HTML fragment/document).
 */

/**
 * @param {string} source
 * @returns {boolean}
 */
export function looksLikeHtmlDocument(source) {
  const trimmed = source.trim();
  if (!trimmed) {
    return false;
  }
  if (/^<!DOCTYPE\s+html\b/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return true;
  }
  return /^<(?:section|article|div|main|body|header|aside)\b/i.test(trimmed);
}

/**
 * If the source is a full HTML document, keep only the body contents.
 * @param {string} source
 * @returns {string}
 */
export function extractHtmlFragment(source) {
  const bodyMatch = source.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    return bodyMatch[1].trim();
  }
  return source.trim();
}

/**
 * Produce unsanitized HTML from editor source.
 * @param {string} source
 * @param {(markdown: string) => string} parseMarkdown
 * @returns {string}
 */
export function prepareRawHtml(source, parseMarkdown) {
  if (looksLikeHtmlDocument(source)) {
    return extractHtmlFragment(source);
  }
  return parseMarkdown(source);
}

/** Tags/attrs needed by the book-style HTML presets (DOMPurify). */
export const PURIFY_CONFIG = {
  ADD_TAGS: [
    "section",
    "article",
    "header",
    "footer",
    "aside",
    "main",
    "nav",
    "figure",
    "figcaption",
  ],
  ADD_ATTR: ["class", "id", "lang", "data-theme", "colspan", "rowspan"],
  ALLOW_DATA_ATTR: true,
};
