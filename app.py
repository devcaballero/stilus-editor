"""Stilus: FastAPI app for Markdown → styled PDF export via WeasyPrint."""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from stilus.filenames import sanitize_pdf_filename
from stilus.pdf_render import render_pdf_sync

logger = logging.getLogger("stilus")
logging.basicConfig(level=logging.INFO)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
FONTS_DIR = BASE_DIR / "fonts"
TEMPLATES_DIR = BASE_DIR / "templates"

_pdf_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="weasyprint")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Manage thread-pool lifecycle for WeasyPrint rendering."""
    yield
    _pdf_executor.shutdown(wait=False)


app = FastAPI(
    title="Stilus",
    description="Editor Markdown con CSS personalizado y exportación PDF (WeasyPrint).",
    version="1.0.0",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/fonts", StaticFiles(directory=FONTS_DIR), name="fonts")
templates = Jinja2Templates(directory=TEMPLATES_DIR)


class PdfRequest(BaseModel):
    """Payload for PDF generation."""

    html: str = Field(..., min_length=1, description="HTML sanitizado del documento")
    css: str = Field(default="", description="Hoja de estilos CSS del usuario/preset")
    filename: str = Field(
        default="",
        max_length=120,
        description="Nombre del archivo (con o sin .pdf)",
    )


class ErrorResponse(BaseModel):
    """Structured error body for client display."""

    detail: str


def _weasyprint_version() -> str:
    """Return WeasyPrint version, or a placeholder if native libs are missing."""
    try:
        from weasyprint import __version__

        return str(__version__)
    except OSError:
        return "no disponible (faltan librerías nativas)"
    except ImportError:
        return "no instalado"


def _unlink_quiet(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        logger.warning("Could not remove temporary PDF %s", path)


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    """Serve the split-pane editor UI."""
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"weasyprint_version": _weasyprint_version()},
    )


@app.post(
    "/api/generate-pdf",
    responses={
        200: {"content": {"application/pdf": {}}},
        422: {"model": ErrorResponse},
    },
)
async def generate_pdf(payload: PdfRequest) -> FileResponse:
    """Generate a downloadable PDF from sanitized HTML and user CSS."""
    loop = asyncio.get_running_loop()
    try:
        pdf_bytes = await loop.run_in_executor(
            _pdf_executor,
            render_pdf_sync,
            payload.html,
            payload.css,
        )
    except Exception:
        logger.exception("WeasyPrint failed to generate PDF")
        raise HTTPException(
            status_code=422,
            detail="No se pudo generar el PDF. Revisá el HTML y el CSS.",
        ) from None

    if not pdf_bytes:
        raise HTTPException(
            status_code=422,
            detail="WeasyPrint generó un PDF vacío. Revisa el HTML y el CSS.",
        )

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    try:
        tmp.write(pdf_bytes)
        tmp.flush()
    finally:
        tmp.close()

    download_name = sanitize_pdf_filename(payload.filename)
    return FileResponse(
        path=tmp.name,
        media_type="application/pdf",
        filename=download_name,
        content_disposition_type="attachment",
        background=BackgroundTask(_unlink_quiet, tmp.name),
    )
