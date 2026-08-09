"""Tests for HTML document wrapping."""

from __future__ import annotations

from stilus.document import build_document


def test_build_document_wraps_body() -> None:
    html = build_document("<p>Hola</p>")
    assert html.startswith("<!DOCTYPE html>")
    assert '<html lang="es">' in html
    assert "<body>\n<p>Hola</p>\n</body>" in html
    assert '<meta charset="utf-8">' in html


def test_build_document_preserves_fragment() -> None:
    fragment = '<section class="cover-page"><h1>Title</h1></section>'
    html = build_document(fragment)
    assert fragment in html
