/**
 * PDF download filename helpers.
 *
 * Mirrors stilus/filenames.py (server source of truth). The API always
 * re-sanitizes; this preview should match so the browser download name
 * agrees with Content-Disposition.
 *
 * @see stilus/filenames.py
 */

export const DEFAULT_PDF_FILENAME = "stilus-documento.pdf";

/** Characters outside Unicode letters/numbers/underscore, space, `.`, `-`. */
const UNSAFE_FILENAME_RE = /[^\p{L}\p{N}_\s.\-]/gu;

/**
 * @param {string} raw
 * @returns {string}
 */
export function sanitizePdfFilename(raw) {
  let stem = (raw || "").trim();
  if (stem.toLowerCase().endsWith(".pdf")) {
    stem = stem.slice(0, -4).replace(/\s+$/u, "");
  }
  stem = stem.replace(/\\/g, "/");
  const parts = stem.split("/");
  stem = parts[parts.length - 1] || "";
  stem = stem.replace(UNSAFE_FILENAME_RE, "");
  stem = stem.replace(/\s+/g, " ").replace(/^[.\s]+|[.\s]+$/g, "");
  if (!stem) {
    return DEFAULT_PDF_FILENAME;
  }
  return `${stem}.pdf`;
}
