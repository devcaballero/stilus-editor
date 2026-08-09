"""Tests for PDF filename sanitization (server source of truth)."""

from __future__ import annotations

import pytest

from stilus.filenames import DEFAULT_PDF_FILENAME, sanitize_pdf_filename


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", DEFAULT_PDF_FILENAME),
        ("   ", DEFAULT_PDF_FILENAME),
        ("informe", "informe.pdf"),
        ("informe.pdf", "informe.pdf"),
        ("Informe.PDF", "Informe.pdf"),
        ("  guia-enfoque  ", "guia-enfoque.pdf"),
        ("docs/informe.pdf", "informe.pdf"),
        ("../etc/passwd", "passwd.pdf"),
        ("a/b\\c.pdf", "c.pdf"),
        ("hola mundo", "hola mundo.pdf"),
        ("hola   mundo", "hola mundo.pdf"),
        ("...hidden...", "hidden.pdf"),
        ("informe!.pdf", "informe.pdf"),
        ("cv_claudio", "cv_claudio.pdf"),
        ("guía-enfoque", "guía-enfoque.pdf"),
        ("año_2024", "año_2024.pdf"),
    ],
)
def test_sanitize_pdf_filename(raw: str, expected: str) -> None:
    assert sanitize_pdf_filename(raw) == expected


def test_sanitize_always_ends_with_pdf() -> None:
    assert sanitize_pdf_filename("x").endswith(".pdf")
    assert sanitize_pdf_filename("x.pdf").endswith(".pdf")
