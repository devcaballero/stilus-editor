"""HTML document assembly for WeasyPrint."""

from __future__ import annotations


def build_document(html_body: str) -> str:
    """Wrap a body HTML fragment into a complete document string."""
    return (
        "<!DOCTYPE html>\n"
        '<html lang="es">\n'
        "<head>\n"
        '<meta charset="utf-8">\n'
        "</head>\n"
        f"<body>\n{html_body}\n</body>\n"
        "</html>\n"
    )
