# Stilus

Editor web personal para redactar en Markdown o HTML, aplicar CSS (presets o propio) y exportar a PDF con WeasyPrint. Pensado como material de apoyo editorial (por ejemplo, publicaciones en LinkedIn): sin autenticación ni base de datos.

## Stack

- **Backend:** FastAPI + Uvicorn, generación de PDF con WeasyPrint
- **Frontend:** Vanilla JavaScript (ES Modules), HTML/CSS estáticos servidos por FastAPI
- **UI del editor:** CodeMirror, marked.js y DOMPurify (CDN)

Una sola app/repositorio: FastAPI sirve la interfaz (`GET /`) y el endpoint `POST /api/generate-pdf`.

## Estructura

```text
/
├── app.py                 # Rutas FastAPI y montaje de static/fonts
├── stilus/                # Lógica PDF (filename, document wrap, render)
├── templates/             # index.html
├── static/
│   ├── css/
│   │   ├── app.css        # UI de Stilus
│   │   └── presets/       # preset-base.css + preset-{dark,light,warm}.css
│   └── js/                # ES modules (main.js orquesta; resto lógica pura)
├── fonts/                 # .woff2 para preview y PDF
├── tests/                 # pytest + tests/js (node:test)
├── requirements.txt
├── requirements-dev.txt   # pytest, ruff
├── package.json           # scripts de test JS (sin bundler)
└── pyproject.toml         # config pytest / ruff
```

## Requisitos previos

- **Python** ≥ 3.9 (según `pyproject.toml`)
- Dependencias nativas de **WeasyPrint** (Pango, cairo, GDK-PixBuf)
- Para tests JS: **Node.js** 18+ (solo el runtime; no hay build step)

### Dependencias de sistema (WeasyPrint)

#### macOS (Homebrew)

```bash
brew install pango cairo gdk-pixbuf libffi
```

Si WeasyPrint no encuentra las librerías:

```bash
export DYLD_LIBRARY_PATH="$(brew --prefix)/lib:${DYLD_LIBRARY_PATH:-}"
```

#### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  python3-dev \
  python3-pip \
  python3-cffi \
  libcairo2 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libgdk-pixbuf-2.0-0 \
  libffi-dev \
  shared-mime-info
```

#### Fedora

```bash
sudo dnf install -y \
  cairo \
  pango \
  gdk-pixbuf2 \
  libffi-devel \
  python3-devel
```

## Instalación

Desde la raíz del repositorio:

```bash
python3 -m venv .venv
```

```bash
# macOS / Linux
source .venv/bin/activate
```

```powershell
# Windows (PowerShell)
.venv\Scripts\Activate.ps1
```

```bash
pip install -r requirements.txt
```

Para desarrollo (tests y lint):

```bash
pip install -r requirements-dev.txt
```

## Ejecución

Con el entorno virtual activado:

```bash
# macOS, si WeasyPrint no encuentra las librerías de Homebrew
export DYLD_LIBRARY_PATH="$(brew --prefix)/lib:${DYLD_LIBRARY_PATH:-}"

uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Abrí [http://127.0.0.1:8000](http://127.0.0.1:8000).

## Uso breve

1. Editá Markdown o HTML en el panel de contenido.
2. Elegí un preset CSS (`Dark`, `Light`, `Warm`) o editá el CSS a mano.
3. Opcional: portada, assets (imágenes referenciadas por nombre) y nombre del PDF.
4. Revisá la vista previa y exportá con **Exportar PDF**.

## Presets CSS

- `preset-{dark,light,warm}.css` — tokens de tema (`:root`)
- `preset-base.css` — tipografías, `@page`, componentes compartidos

Al aplicar un preset, el cliente descarga ambos en paralelo y ensambla `tokens + "\n" + base` (sin `@import`). Ese CSS completo es el que va al editor, a la preview y al PDF.

Las tipografías viven en `fonts/` (Lora, Open Sans, JetBrains Mono), servidas en `/fonts/...` y resueltas por WeasyPrint al exportar.

## Persistencia (`localStorage`)

El editor guarda markdown/HTML, CSS, preset activo, nombre de archivo, portada, assets y layout de paneles. Al recargar, si existe CSS guardado (`stilus.css`), ese texto tiene prioridad sobre volver a bajar el preset.

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/` | Interfaz del editor |
| `POST` | `/api/generate-pdf` | Body JSON: `{ "html", "css", "filename" }` → PDF |

Errores de generación: `422` con `detail` descriptivo.

## Tests y lint

Con el entorno virtual activado y `pip install -r requirements-dev.txt`:

```bash
# Python
pytest -q
ruff check app.py stilus tests
# equivalente:
npm run test:py
npm run lint:py

# JavaScript (Node, sin bundler)
npm run test:js

# Ambos
npm test
```

## Limitaciones conocidas

- Al pegar un HTML completo (`<!DOCTYPE>` / `<html>`), solo se usa el contenido de `<body>`. Un `<style>` en el `<head>` no se aplica: hay que llevar esos estilos al panel CSS (o a un preset).
- Las imágenes del documento deben cargarse como **Assets** si el HTML las referencia por nombre de archivo relativo.

## Licencia

Proyecto de uso personal; no se ha definido una licencia de distribución.
