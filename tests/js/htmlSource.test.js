import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractHtmlFragment,
  looksLikeHtmlDocument,
  prepareRawHtml,
} from "../../static/js/htmlSource.js";

describe("looksLikeHtmlDocument", () => {
  it("detects doctype and html root", () => {
    assert.equal(looksLikeHtmlDocument("<!DOCTYPE html><html></html>"), true);
    assert.equal(looksLikeHtmlDocument("<html lang='es'>"), true);
  });

  it("detects block fragments", () => {
    assert.equal(looksLikeHtmlDocument("<section class='x'>"), true);
    assert.equal(looksLikeHtmlDocument("# Markdown"), false);
  });
});

describe("extractHtmlFragment", () => {
  it("extracts body contents", () => {
    const src = "<html><body><p>Hi</p></body></html>";
    assert.equal(extractHtmlFragment(src), "<p>Hi</p>");
  });

  it("returns trimmed fragment when no body", () => {
    assert.equal(extractHtmlFragment("  <section></section>  "), "<section></section>");
  });
});

describe("prepareRawHtml", () => {
  it("skips markdown parser for HTML", () => {
    const out = prepareRawHtml("<section>x</section>", () => {
      throw new Error("should not parse markdown");
    });
    assert.equal(out, "<section>x</section>");
  });

  it("uses markdown parser for text", () => {
    const out = prepareRawHtml("hola", (md) => `<p>${md}</p>`);
    assert.equal(out, "<p>hola</p>");
  });
});
