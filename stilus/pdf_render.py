"""WeasyPrint rendering (blocking; call from a thread pool)."""

from __future__ import annotations

from pathlib import Path

from stilus.document import build_document

# Project root: fonts/ and relative url() in presets resolve from here.
BASE_DIR = Path(__file__).resolve().parent.parent


def render_pdf_sync(html_body: str, css_text: str, *, base_dir: Path | None = None) -> bytes:
    """Render HTML body + CSS string to PDF bytes.

    Raises:
        RuntimeError: WeasyPrint missing or native libraries unavailable.
    """
    root = base_dir if base_dir is not None else BASE_DIR
    try:
        from weasyprint import CSS, HTML
        from weasyprint.text.fonts import FontConfiguration
    except OSError as exc:
        raise RuntimeError(
            "WeasyPrint no puede cargar librerías nativas (Pango/cairo/GDK-PixBuf). "
            "Instálalas según el README y reinicia el servidor."
        ) from exc
    except ImportError as exc:
        raise RuntimeError(
            "WeasyPrint no está instalado. Ejecuta: pip install -r requirements.txt"
        ) from exc

    document = build_document(html_body)
    font_config = FontConfiguration()
    stylesheets = (
        [CSS(string=css_text, base_url=str(root), font_config=font_config)]
        if css_text.strip()
        else []
    )
    return HTML(string=document, base_url=str(root)).write_pdf(
        stylesheets=stylesheets,
        font_config=font_config,
    )
