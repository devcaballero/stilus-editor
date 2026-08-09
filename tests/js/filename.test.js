import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PDF_FILENAME,
  sanitizePdfFilename,
} from "../../static/js/filename.js";

describe("sanitizePdfFilename", () => {
  const cases = [
    ["", DEFAULT_PDF_FILENAME],
    ["   ", DEFAULT_PDF_FILENAME],
    ["informe", "informe.pdf"],
    ["informe.pdf", "informe.pdf"],
    ["Informe.PDF", "Informe.pdf"],
    ["  guia-enfoque  ", "guia-enfoque.pdf"],
    ["docs/informe.pdf", "informe.pdf"],
    ["../etc/passwd", "passwd.pdf"],
    ["a/b\\c.pdf", "c.pdf"],
    ["hola mundo", "hola mundo.pdf"],
    ["hola   mundo", "hola mundo.pdf"],
    ["...hidden...", "hidden.pdf"],
    ["informe!.pdf", "informe.pdf"],
    ["cv_claudio", "cv_claudio.pdf"],
    ["guía-enfoque", "guía-enfoque.pdf"],
    ["año_2024", "año_2024.pdf"],
  ];

  for (const [raw, expected] of cases) {
    it(`maps ${JSON.stringify(raw)} → ${expected}`, () => {
      assert.equal(sanitizePdfFilename(raw), expected);
    });
  }
});
