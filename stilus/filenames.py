"""PDF download filename sanitization.

Server source of truth for the ``filename`` field of ``POST /api/generate-pdf``.

Semantics (stable contract):
1. Trim surrounding whitespace.
2. If the value ends with ``.pdf`` (case-insensitive), strip that suffix.
3. Keep only the final path segment (``/`` and ``\\`` are separators;
   drops directories / traversal on every OS).
4. Remove characters outside Unicode word chars, spaces, ``.`` and ``-``
   (``[^\\w\\s.\\-]`` with Unicode).
5. Collapse internal whitespace to a single space; strip spaces and dots
   from both ends.
6. If the result is empty, use ``stilus-documento.pdf``.
7. Otherwise append ``.pdf``.

The browser UI may apply a compatible preview of this rule so the download
attribute matches; the server always re-sanitizes and wins.
"""

from __future__ import annotations

import re
from pathlib import Path

DEFAULT_PDF_FILENAME = "stilus-documento.pdf"
_UNSAFE_FILENAME_RE = re.compile(r"[^\w\s.\-]", re.UNICODE)


def sanitize_pdf_filename(raw: str) -> str:
    """Return a safe download filename ending in ``.pdf``."""
    stem = (raw or "").strip()
    if stem.lower().endswith(".pdf"):
        stem = stem[:-4].rstrip()
    # Normalize Windows separators so Path.name is OS-independent.
    stem = Path(stem.replace("\\", "/")).name
    stem = _UNSAFE_FILENAME_RE.sub("", stem)
    stem = re.sub(r"\s+", " ", stem).strip(" .")
    if not stem:
        return DEFAULT_PDF_FILENAME
    return f"{stem}.pdf"
