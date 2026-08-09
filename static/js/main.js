/**
 * Stilus — DOM orchestrator: editors, preview, export, persistence.
 */
import { STORAGE_KEYS } from "./storage.js";
import { DEFAULT_PDF_FILENAME, sanitizePdfFilename } from "./filename.js";
import {
  PURIFY_CONFIG,
  prepareRawHtml,
} from "./htmlSource.js";
import {
  applyAssetUrls,
  applyAssetUrlsInCss,
  assetBasename,
  assetsToPayload,
  parseAssetsPayload,
} from "./assets.js";
import {
  PRESET_KEYS,
  loadPresetCss,
} from "./presets.js";

const MAX_ASSET_BYTES = 2.5 * 1024 * 1024;
const MAX_ASSETS = 40;
const ASSET_ACCEPT = /^(image\/(jpeg|png|webp|gif|svg\+xml))$/i;

const LAYOUT_DEFAULTS = {
  editorsPct: 33.333,
  mdPct: 50,
};

const LAYOUT_LIMITS = {
  editorsMin: 20,
  editorsMax: 70,
  mdMin: 18,
  mdMax: 82,
};

const DEBOUNCE_MS = 300;
const MAX_COVER_EDGE = 1800;
const COVER_JPEG_QUALITY = 0.85;


const DEFAULT_PDF_STEM = DEFAULT_PDF_FILENAME.replace(/\.pdf$/i, "");

function boot() {
  /** CSS inyectado solo cuando hay imagen de portada (preview + PDF). */
  const COVER_CSS = `
.stilus-cover {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  page-break-after: always;
  break-after: page;
  page-break-inside: avoid;
}
@media print {
  .stilus-cover {
    min-height: 245mm;
    height: 245mm;
  }
}
@media screen {
  .stilus-cover {
    min-height: 70vh;
    padding: 1.5rem 1rem;
  }
}
.stilus-cover img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}
`;

  const DEFAULT_MARKDOWN = `# Título del documento

Material de apoyo para una publicación en LinkedIn.

## Puntos clave

- Idea principal con contexto
- Evidencia o ejemplo concreto
- Llamada a la acción breve

> Una cita o insight que refuerce el mensaje.

### Detalle técnico

\`\`\`python
def resumen(texto: str) -> str:
    return texto.strip()
\`\`\`

Párrafo de cierre: invita a comentar o compartir la experiencia.
`;
  
  /** Preset aplicado al iniciar y si se exporta con el editor CSS vacío. */
  const DEFAULT_PRESET = "dark";

  /** @type {Record<string, string>} */
  const presetCache = {};

  const els = {
    mdTextarea: document.getElementById("editor-markdown"),
    cssTextarea: document.getElementById("editor-css"),
    preview: document.getElementById("preview-frame"),
    panels: document.getElementById("panels"),
    panelsEditors: document.getElementById("panels-editors"),
    splitterMain: document.getElementById("splitter-main"),
    splitterEditors: document.getElementById("splitter-editors"),
    presetSelect: document.getElementById("preset-select"),
    filenameInput: document.getElementById("pdf-filename"),
    exportBtn: document.getElementById("btn-export"),
    status: document.getElementById("status-bar"),
    coverControl: document.getElementById("cover-control"),
    coverFile: document.getElementById("cover-file"),
    coverThumb: document.getElementById("cover-thumb"),
    coverPlaceholder: document.getElementById("cover-placeholder"),
    coverClear: document.getElementById("btn-cover-clear"),
    assetsControl: document.getElementById("assets-control"),
    assetsToggle: document.getElementById("btn-assets-toggle"),
    assetsPanel: document.getElementById("assets-panel"),
    assetsFile: document.getElementById("assets-file"),
    assetsList: document.getElementById("assets-list"),
    assetsEmpty: document.getElementById("assets-empty"),
    assetsCount: document.getElementById("assets-count"),
    assetsClearAll: document.getElementById("btn-assets-clear-all"),
    mdCopyBtn: document.getElementById("btn-md-copy"),
    mdClearBtn: document.getElementById("btn-md-clear"),
    cssCopyBtn: document.getElementById("btn-css-copy"),
    cssClearBtn: document.getElementById("btn-css-clear"),
  };
  
  if (
    !els.mdTextarea ||
    !els.cssTextarea ||
    !els.preview ||
    !els.panels ||
    !els.panelsEditors ||
    !els.splitterMain ||
    !els.splitterEditors ||
    !els.presetSelect ||
    !els.filenameInput ||
    !els.exportBtn ||
    !els.status ||
    !els.coverControl ||
    !els.coverFile ||
    !els.coverThumb ||
    !els.coverPlaceholder ||
    !els.coverClear ||
    !els.assetsControl ||
    !els.assetsToggle ||
    !els.assetsPanel ||
    !els.assetsFile ||
    !els.assetsList ||
    !els.assetsEmpty ||
    !els.assetsCount ||
    !els.assetsClearAll ||
    !els.mdCopyBtn ||
    !els.mdClearBtn ||
    !els.cssCopyBtn ||
    !els.cssClearBtn
  ) {
    console.error("Stilus: faltan elementos del DOM.");
    return;
  }
  
  /** @type {string | null} last known CSS from an applied preset */
  let lastPresetCss = null;
  /** @type {string} */
  let activePreset = "";
  /** @type {string | null} data URL de la imagen de portada */
  let coverDataUrl = null;
  
  /**
   * Assets del documento: nombre de archivo → data URL.
   * @type {Map<string, string>}
   */
  const documentAssets = new Map();
  
  /**
   * @param {() => void} fn
   * @param {number} wait
   * @returns {() => void}
   */
  function debounce(fn, wait) {
    let timer = 0;
    return function debounced() {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, wait);
    };
  }
  
  /**
   * @param {string} message
   * @param {"error" | "ok" | "info"} kind
   * @param {number} [autoHideMs]
   */
  function setStatus(message, kind, autoHideMs) {
    els.status.hidden = !message;
    els.status.textContent = message;
    els.status.dataset.kind = kind;
    if (autoHideMs && message) {
      window.setTimeout(() => {
        if (els.status.textContent === message) {
          els.status.hidden = true;
          els.status.textContent = "";
        }
      }, autoHideMs);
    }
  }
  
  /**
   * @param {string} url
   * @returns {Promise<string>}
   */
  async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`No se pudo cargar ${url} (${res.status})`);
    }
    return res.text();
  }
  
  /**
   * Load assembled preset CSS (tokens + base). Updates cache only after success.
   * @param {string} key
   * @returns {Promise<string>}
   */
  async function loadPreset(key) {
    const css = await loadPresetCss(key, fetchText);
    presetCache[key] = css;
    return css;
  }
  
  function buildPreviewSrcdoc(htmlBody, cssText) {
    // El preset pinta html/body (igual que WeasyPrint / @page).
    // No forzar "escritorio" gris sobre html: en light/warm se veía
    // como marco y parecía que el fondo no llenaba la página.
    return `<!DOCTYPE html>
  <html lang="es">
  <head>
  <meta charset="utf-8">
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
  ${cssText}
  html {
  min-height: 100%;
  }
  body {
  box-sizing: border-box;
  min-height: 100vh;
  }
  </style>
  </head>
  <body>
  ${htmlBody}
  </body>
  </html>`;
  }
  
  
  
  /**
   * Convert editor source (Markdown or HTML) into sanitized HTML for preview/PDF.
   * @param {string} source
   * @returns {string}
   */
  function sourceToSafeHtml(source) {
    const rawHtml = prepareRawHtml(source, (md) =>
      marked.parse(md, { async: false })
    );
    return DOMPurify.sanitize(rawHtml, PURIFY_CONFIG);
  }
  
  /**
   * Prepend cover page markup when a cover image is set.
   * @param {string} html
   * @returns {string}
   */
  function withCoverHtml(html) {
    if (!coverDataUrl) {
      return html;
    }
    return (
      `<section class="stilus-cover" aria-label="Portada">` +
      `<img src="${coverDataUrl}" alt="Portada del documento">` +
      `</section>` +
      html
    );
  }
  
  /**
   * @param {string} cssText
   * @returns {string}
   */
  function withCoverCss(cssText) {
    return coverDataUrl ? `${COVER_CSS}\n${cssText}` : cssText;
  }
  
  function updateCoverUi() {
    const hasCover = Boolean(coverDataUrl);
    els.coverControl.dataset.hasCover = hasCover ? "true" : "false";
    els.coverClear.hidden = !hasCover;
    els.coverPlaceholder.hidden = hasCover;
    els.coverThumb.hidden = !hasCover;
    if (hasCover) {
      els.coverThumb.src = coverDataUrl;
    } else {
      els.coverThumb.removeAttribute("src");
    }
  }
  
  /**
   * Resize/compress image for preview, PDF and localStorage.
   * @param {File} file
   * @returns {Promise<string>}
   */
  function fileToCoverDataUrl(file) {
    return new Promise((resolve, reject) => {
      const type = (file.type || "").toLowerCase();
      const looksImage =
        type.startsWith("image/") ||
        /\.(jpe?g|png|webp|gif)$/i.test(file.name || "");
      if (!looksImage) {
        reject(new Error("El archivo debe ser una imagen (JPEG, PNG, WebP o GIF)."));
        return;
      }
  
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No se pudo leer el archivo de imagen."));
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        if (!result.startsWith("data:image/")) {
          reject(new Error("El archivo no parece una imagen válida."));
          return;
        }
  
        const img = new Image();
        img.onload = () => {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;
          if (!width || !height) {
            resolve(result);
            return;
          }
          const scale = Math.min(1, MAX_COVER_EDGE / Math.max(width, height));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(result);
            return;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          try {
            resolve(canvas.toDataURL("image/jpeg", COVER_JPEG_QUALITY));
          } catch (err) {
            resolve(result);
          }
        };
        img.onerror = () =>
          reject(
            new Error(
              "No se pudo decodificar la imagen. Probá con JPEG o PNG (HEIC no está soportado)."
            )
          );
        img.src = result;
      };
      reader.readAsDataURL(file);
    });
  }
  
  function clearCover() {
    coverDataUrl = null;
    els.coverFile.value = "";
    updateCoverUi();
    persistEditors();
    renderPreview();
    setStatus("Portada eliminada.", "ok", 2000);
  }
  
  /**
   * @param {File} file
   */
  async function setCoverFromFile(file) {
    try {
      coverDataUrl = await fileToCoverDataUrl(file);
      updateCoverUi();
      persistEditors();
      renderPreview();
      setStatus("Portada aplicada. Se insertará al inicio del PDF.", "ok", 2800);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(message, "error");
      els.coverFile.value = "";
    }
  }
  
  
  /**
   * @param {File} file
   * @returns {Promise<string>}
   */
  function fileToAssetDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!ASSET_ACCEPT.test(file.type)) {
        reject(new Error(`Tipo no soportado: ${file.name}`));
        return;
      }
      if (file.size > MAX_ASSET_BYTES) {
        reject(
          new Error(
            `${file.name} supera ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)} MB.`
          )
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        if (!result.startsWith("data:image/")) {
          reject(new Error(`No se pudo leer ${file.name}.`));
          return;
        }
        resolve(result);
      };
      reader.onerror = () => reject(new Error(`Error al leer ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }
  
  function persistAssets() {
    try {
      localStorage.setItem(
        STORAGE_KEYS.assets,
        JSON.stringify(assetsToPayload(documentAssets))
      );
    } catch (err) {
      console.warn("Stilus: no se pudieron guardar los assets", err);
      setStatus(
        "Assets en memoria, pero localStorage está lleno (no se guardaron).",
        "info",
        4000
      );
    }
  }
  
  function loadAssetsFromStorage() {
    const loaded = parseAssetsPayload(localStorage.getItem(STORAGE_KEYS.assets));
    documentAssets.clear();
    for (const [name, dataUrl] of loaded) {
      documentAssets.set(name, dataUrl);
    }
  }
  
  function renderAssetsList() {
    const names = Array.from(documentAssets.keys()).sort((a, b) =>
      a.localeCompare(b, "es")
    );
    els.assetsCount.textContent = String(names.length);
    els.assetsControl.dataset.hasAssets = names.length ? "true" : "false";
    els.assetsClearAll.hidden = names.length === 0;
    els.assetsEmpty.hidden = names.length > 0;
    els.assetsList.replaceChildren();
  
    for (const name of names) {
      const dataUrl = documentAssets.get(name);
      if (!dataUrl) {
        continue;
      }
      const li = document.createElement("li");
      li.className = "assets-item";
  
      const thumb = document.createElement("img");
      thumb.className = "assets-item-thumb";
      thumb.src = dataUrl;
      thumb.alt = "";
  
      const label = document.createElement("span");
      label.className = "assets-item-name";
      label.textContent = name;
      label.title = name;
  
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "assets-item-remove";
      removeBtn.setAttribute("aria-label", `Eliminar ${name}`);
      removeBtn.title = "Eliminar";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        documentAssets.delete(name);
        persistAssets();
        renderAssetsList();
        renderPreview();
        setStatus(`Asset eliminado: ${name}`, "ok", 2000);
      });
  
      li.append(thumb, label, removeBtn);
      els.assetsList.appendChild(li);
    }
  }
  
  /**
   * @param {boolean} open
   */
  function setAssetsPanelOpen(open) {
    els.assetsPanel.hidden = !open;
    els.assetsToggle.setAttribute("aria-expanded", open ? "true" : "false");
    els.assetsControl.dataset.open = open ? "true" : "false";
  }
  
  /**
   * @param {FileList | File[]} fileList
   */
  async function addAssetsFromFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) {
      return;
    }
  
    const incoming = [];
    for (const file of files) {
      const name = assetBasename(file.name);
      if (!name) {
        continue;
      }
      incoming.push({ file, name });
    }
    if (!incoming.length) {
      return;
    }
  
    const collisions = incoming
      .filter(({ name }) => documentAssets.has(name))
      .map(({ name }) => name);
  
    if (collisions.length) {
      const unique = [...new Set(collisions)];
      const ok = window.confirm(
        `Estos assets ya existen y se van a sobrescribir:\n\n• ${unique.join(
          "\n• "
        )}\n\n¿Continuar?`
      );
      if (!ok) {
        els.assetsFile.value = "";
        return;
      }
    }
  
    const room = MAX_ASSETS - documentAssets.size;
    const newNames = new Set(
      incoming.filter(({ name }) => !documentAssets.has(name)).map(({ name }) => name)
    );
    if (newNames.size > room) {
      setStatus(
        `Máximo ${MAX_ASSETS} assets. Liberá espacio o subí menos archivos.`,
        "error"
      );
      els.assetsFile.value = "";
      return;
    }
  
    let added = 0;
    const errors = [];
    for (const { file, name } of incoming) {
      try {
        const dataUrl = await fileToAssetDataUrl(file);
        documentAssets.set(name, dataUrl);
        added += 1;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  
    persistAssets();
    renderAssetsList();
    renderPreview();
    els.assetsFile.value = "";
    setAssetsPanelOpen(true);
  
    if (errors.length && !added) {
      setStatus(errors[0], "error");
    } else if (errors.length) {
      setStatus(
        `${added} asset(s) cargados. Algunos fallaron: ${errors[0]}`,
        "info",
        4000
      );
    } else {
      setStatus(
        `${added} asset(s) listos para preview y PDF.`,
        "ok",
        2800
      );
    }
  }
  
  function renderPreview() {
    const source = mdEditor.getValue();
    const cssText = withCoverCss(applyAssetUrlsInCss(cssEditor.getValue(), documentAssets));
    const safeHtml = withCoverHtml(applyAssetUrls(sourceToSafeHtml(source), documentAssets));
    els.preview.srcdoc = buildPreviewSrcdoc(safeHtml, cssText);
  }
  
  
  function persistEditors() {
    try {
      localStorage.setItem(STORAGE_KEYS.markdown, mdEditor.getValue());
      localStorage.setItem(STORAGE_KEYS.css, cssEditor.getValue());
      localStorage.setItem(STORAGE_KEYS.preset, activePreset);
      localStorage.setItem(STORAGE_KEYS.filename, els.filenameInput.value.trim());
      if (coverDataUrl) {
        localStorage.setItem(STORAGE_KEYS.cover, coverDataUrl);
      } else {
        localStorage.removeItem(STORAGE_KEYS.cover);
      }
    } catch (err) {
      console.warn("Stilus: no se pudo guardar en localStorage", err);
      if (coverDataUrl) {
        setStatus(
          "La portada es muy grande para guardarla en el navegador; se usará solo en esta sesión.",
          "info",
          4000
        );
      }
    }
  }
  
  const schedulePreview = debounce(renderPreview, DEBOUNCE_MS);
  const schedulePersist = debounce(persistEditors, DEBOUNCE_MS);
  
  function onEditorChange() {
    schedulePreview();
    schedulePersist();
  
    if (activePreset && lastPresetCss !== null) {
      if (cssEditor.getValue() !== lastPresetCss) {
        activePreset = "";
        els.presetSelect.value = "";
        persistEditors();
      }
    }
  }
  
  /**
   * @param {string} key
   * @param {boolean} force
   */
  async function applyPreset(key, force) {
    if (!key) {
      return;
    }
  
    const currentCss = cssEditor.getValue();
    const hasUnsavedEdits =
      currentCss.trim() !== "" &&
      (lastPresetCss === null || currentCss !== lastPresetCss);
  
    if (!force && hasUnsavedEdits) {
      const ok = window.confirm(
        "Tienes cambios manuales en el CSS. ¿Reemplazarlos con el preset seleccionado?"
      );
      if (!ok) {
        els.presetSelect.value = activePreset;
        return;
      }
    }
  
    try {
      const css = await loadPreset(key);
      cssEditor.setValue(css);
      lastPresetCss = css;
      activePreset = key;
      els.presetSelect.value = key;
      renderPreview();
      persistEditors();
      setStatus(`Preset «${els.presetSelect.selectedOptions[0].text}» aplicado.`, "ok", 2500);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(message, "error");
      els.presetSelect.value = activePreset;
    }
  }
  
  /**
   * Extract FastAPI error detail from JSON or text body.
   * @param {Response} res
   * @returns {Promise<string>}
   */
  async function readErrorDetail(res) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const data = await res.json();
        if (typeof data.detail === "string") {
          return data.detail;
        }
        if (Array.isArray(data.detail)) {
          return data.detail
            .map((item) => (item && item.msg) || JSON.stringify(item))
            .join("; ");
        }
        return JSON.stringify(data);
      } catch {
        return `Error ${res.status}`;
      }
    }
    const text = await res.text();
    return text || `Error ${res.status}`;
  }
  
  /**
   * Ensure the CSS editor has content before PDF export.
   * If empty, load DEFAULT_PRESET into the editor (avoids WeasyPrint UA-only styles).
   * @returns {Promise<string>}
   */
  async function ensureCssForExport() {
    const current = cssEditor.getValue();
    if (current.trim()) {
      return current;
    }
  
    const key = DEFAULT_PRESET;
    const css = await loadPreset(key);
    cssEditor.setValue(css);
    lastPresetCss = css;
    activePreset = key;
    els.presetSelect.value = key;
    persistEditors();
    renderPreview();
    setStatus(
      `CSS vacío: se aplicó el preset «${key}» antes de exportar.`,
      "info",
      3500
    );
    return css;
  }
  
  async function exportPdf() {
    els.exportBtn.disabled = true;
    setStatus("Generando PDF…", "info");
  
    try {
      const source = mdEditor.getValue();
      const cssSource = await ensureCssForExport();
      const cssText = withCoverCss(applyAssetUrlsInCss(cssSource, documentAssets));
      const downloadName = sanitizePdfFilename(els.filenameInput.value);
      const safeHtml = withCoverHtml(applyAssetUrls(sourceToSafeHtml(source), documentAssets));
  
      const res = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: safeHtml,
          css: cssText,
          filename: downloadName,
        }),
      });
  
      if (!res.ok) {
        const detail = await readErrorDetail(res);
        setStatus(detail, "error");
        return;
      }
  
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatus(`PDF descargado: ${downloadName}`, "ok", 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(
        message.startsWith("No se pudo") || message.startsWith("Preset")
          ? message
          : `Error de red: ${message}`,
        "error"
      );
    } finally {
      els.exportBtn.disabled = false;
    }
  }
  
  // --- CodeMirror editors -------------------------------------------------
  
  const savedMarkdown = localStorage.getItem(STORAGE_KEYS.markdown);
  const savedCss = localStorage.getItem(STORAGE_KEYS.css);
  const savedPreset = localStorage.getItem(STORAGE_KEYS.preset) || "";
  const savedFilename = localStorage.getItem(STORAGE_KEYS.filename);
  const savedCover = localStorage.getItem(STORAGE_KEYS.cover);
  
  els.filenameInput.value =
    savedFilename !== null && savedFilename !== ""
      ? savedFilename.replace(/\.pdf$/i, "")
      : DEFAULT_PDF_STEM;
  
  if (savedCover && savedCover.startsWith("data:image/")) {
    coverDataUrl = savedCover;
  }
  updateCoverUi();
  loadAssetsFromStorage();
  
  const mdEditor = CodeMirror.fromTextArea(els.mdTextarea, {
    mode: "markdown",
    theme: "neo",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    autofocus: true,
  });
  
  const cssEditor = CodeMirror.fromTextArea(els.cssTextarea, {
    mode: "css",
    theme: "neo",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
  });
  
  mdEditor.setValue(savedMarkdown !== null ? savedMarkdown : DEFAULT_MARKDOWN);
  
  mdEditor.on("change", onEditorChange);
  cssEditor.on("change", onEditorChange);
  
  els.filenameInput.addEventListener("input", schedulePersist);
  els.filenameInput.addEventListener("change", () => {
    const cleaned = sanitizePdfFilename(els.filenameInput.value).replace(/\.pdf$/i, "");
    if (els.filenameInput.value.trim() !== cleaned) {
      els.filenameInput.value = cleaned;
    }
    persistEditors();
  });
  
  els.presetSelect.addEventListener("change", () => {
    const key = els.presetSelect.value;
    if (!key) {
      activePreset = "";
      persistEditors();
      return;
    }
    applyPreset(key, false);
  });
  
  els.exportBtn.addEventListener("click", exportPdf);
  
  els.coverFile.addEventListener("change", () => {
    const file = els.coverFile.files && els.coverFile.files[0];
    if (file) {
      setCoverFromFile(file);
    }
  });
  
  els.coverClear.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearCover();
  });
  
  renderAssetsList();
  
  els.assetsToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setAssetsPanelOpen(els.assetsPanel.hidden);
  });
  
  els.assetsFile.addEventListener("change", () => {
    if (els.assetsFile.files && els.assetsFile.files.length) {
      addAssetsFromFiles(els.assetsFile.files);
    }
  });
  
  els.assetsClearAll.addEventListener("click", () => {
    if (!documentAssets.size) {
      return;
    }
    if (!window.confirm("¿Eliminar todos los assets del documento?")) {
      return;
    }
    documentAssets.clear();
    persistAssets();
    renderAssetsList();
    renderPreview();
    setStatus("Assets eliminados.", "ok", 2000);
  });
  
  els.assetsPanel.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  
  document.addEventListener("click", () => {
    if (!els.assetsPanel.hidden) {
      setAssetsPanelOpen(false);
    }
  });
  
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.assetsPanel.hidden) {
      setAssetsPanelOpen(false);
    }
  });
  
  /**
   * @param {string} text
   * @param {string} okLabel
   */
  async function copyEditorText(text, okLabel) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setStatus(`${okLabel} copiado al portapapeles.`, "ok", 2200);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`No se pudo copiar: ${message}`, "error");
    }
  }
  
  els.mdCopyBtn.addEventListener("click", () => {
    copyEditorText(mdEditor.getValue(), "Markdown / HTML");
  });
  
  els.cssCopyBtn.addEventListener("click", () => {
    copyEditorText(cssEditor.getValue(), "CSS");
  });
  
  els.mdClearBtn.addEventListener("click", () => {
    if (!mdEditor.getValue().trim()) {
      setStatus("El editor Markdown / HTML ya está vacío.", "info", 2000);
      return;
    }
    if (!window.confirm("¿Vaciar el editor Markdown / HTML?")) {
      return;
    }
    mdEditor.setValue("");
    mdEditor.focus();
    persistEditors();
    renderPreview();
    setStatus("Markdown / HTML vaciado.", "ok", 2000);
  });
  
  els.cssClearBtn.addEventListener("click", () => {
    if (!cssEditor.getValue().trim()) {
      setStatus("El editor CSS ya está vacío.", "info", 2000);
      return;
    }
    if (!window.confirm("¿Vaciar el editor CSS?")) {
      return;
    }
    cssEditor.setValue("");
    activePreset = "";
    lastPresetCss = null;
    els.presetSelect.value = "";
    cssEditor.focus();
    persistEditors();
    renderPreview();
    setStatus("CSS vaciado.", "ok", 2000);
  });
  
  // --- Resizable layout ---------------------------------------------------
  
  /**
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  
  /**
   * @returns {{ editorsPct: number, mdPct: number }}
   */
  function loadLayout() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.layout);
      if (!raw) {
        return { ...LAYOUT_DEFAULTS };
      }
      const parsed = JSON.parse(raw);
      return {
        editorsPct: clamp(
          Number(parsed.editorsPct) || LAYOUT_DEFAULTS.editorsPct,
          LAYOUT_LIMITS.editorsMin,
          LAYOUT_LIMITS.editorsMax
        ),
        mdPct: clamp(
          Number(parsed.mdPct) || LAYOUT_DEFAULTS.mdPct,
          LAYOUT_LIMITS.mdMin,
          LAYOUT_LIMITS.mdMax
        ),
      };
    } catch {
      return { ...LAYOUT_DEFAULTS };
    }
  }
  
  /**
   * @param {{ editorsPct: number, mdPct: number }} layout
   */
  function persistLayout(layout) {
    try {
      localStorage.setItem(STORAGE_KEYS.layout, JSON.stringify(layout));
    } catch {
      /* quota / private mode */
    }
  }
  
  /** @type {{ editorsPct: number, mdPct: number }} */
  let layoutState = loadLayout();
  
  const layoutMq = window.matchMedia("(max-width: 1100px)");
  
  /**
   * @param {{ editorsPct: number, mdPct: number }} layout
   * @param {boolean} [save]
   */
  function applyLayout(layout, save) {
    layoutState = {
      editorsPct: clamp(
        layout.editorsPct,
        LAYOUT_LIMITS.editorsMin,
        LAYOUT_LIMITS.editorsMax
      ),
      mdPct: clamp(layout.mdPct, LAYOUT_LIMITS.mdMin, LAYOUT_LIMITS.mdMax),
    };
  
    if (layoutMq.matches) {
      els.panels.style.removeProperty("grid-template-columns");
      els.panelsEditors.style.removeProperty("grid-template-rows");
    } else {
      const editorsFr = layoutState.editorsPct;
      const previewFr = 100 - layoutState.editorsPct;
      const mdFr = layoutState.mdPct;
      const cssFr = 100 - layoutState.mdPct;
      els.panels.style.gridTemplateColumns =
        `minmax(200px, ${editorsFr}fr) var(--splitter-size) minmax(240px, ${previewFr}fr)`;
      els.panelsEditors.style.gridTemplateRows =
        `minmax(120px, ${mdFr}fr) var(--splitter-size) minmax(100px, ${cssFr}fr)`;
    }
  
    if (save) {
      persistLayout(layoutState);
    }
  }
  
  function refreshEditors() {
    mdEditor.refresh();
    cssEditor.refresh();
  }
  
  /**
   * @param {"col" | "row"} axis
   * @param {HTMLElement} splitter
   */
  function bindSplitter(axis, splitter) {
    const isCol = axis === "col";
  
    splitter.addEventListener("pointerdown", (event) => {
      if (layoutMq.matches || event.button !== 0) {
        return;
      }
      event.preventDefault();
  
      splitter.classList.add("is-active");
      document.body.classList.add("is-resizing-panels");
      document.body.classList.add(isCol ? "is-resizing-col" : "is-resizing-row");
  
      /**
       * @param {PointerEvent} moveEvent
       */
      function onMove(moveEvent) {
        if (isCol) {
          const rect = els.panels.getBoundingClientRect();
          if (rect.width <= 0) {
            return;
          }
          applyLayout({
            ...layoutState,
            editorsPct: ((moveEvent.clientX - rect.left) / rect.width) * 100,
          });
        } else {
          const rect = els.panelsEditors.getBoundingClientRect();
          if (rect.height <= 0) {
            return;
          }
          applyLayout({
            ...layoutState,
            mdPct: ((moveEvent.clientY - rect.top) / rect.height) * 100,
          });
        }
        refreshEditors();
      }
  
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        splitter.classList.remove("is-active");
        document.body.classList.remove(
          "is-resizing-panels",
          "is-resizing-col",
          "is-resizing-row"
        );
        applyLayout(layoutState, true);
        refreshEditors();
      }
  
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
      onMove(event);
    });
  
    splitter.addEventListener("keydown", (event) => {
      if (layoutMq.matches) {
        return;
      }
      const step = event.shiftKey ? 5 : 2;
      let next = null;
  
      if (isCol) {
        if (event.key === "ArrowLeft") {
          next = { ...layoutState, editorsPct: layoutState.editorsPct - step };
        } else if (event.key === "ArrowRight") {
          next = { ...layoutState, editorsPct: layoutState.editorsPct + step };
        }
      } else if (event.key === "ArrowUp") {
        next = { ...layoutState, mdPct: layoutState.mdPct - step };
      } else if (event.key === "ArrowDown") {
        next = { ...layoutState, mdPct: layoutState.mdPct + step };
      }
  
      if (!next) {
        return;
      }
      event.preventDefault();
      applyLayout(next, true);
      refreshEditors();
    });
  }
  
  applyLayout(layoutState);
  bindSplitter("col", els.splitterMain);
  bindSplitter("row", els.splitterEditors);
  
  layoutMq.addEventListener("change", () => {
    applyLayout(layoutState);
    window.requestAnimationFrame(refreshEditors);
  });
  
  window.addEventListener("resize", () => {
    window.requestAnimationFrame(refreshEditors);
  });
  
  // Bootstrap: restore CSS / preset
  (async function bootstrap() {
    if (savedCss !== null && savedCss !== "") {
      cssEditor.setValue(savedCss);
      activePreset = savedPreset && PRESET_KEYS.includes(savedPreset) ? savedPreset : "";
      els.presetSelect.value = activePreset;
      if (activePreset) {
        try {
          lastPresetCss = await loadPreset(activePreset);
        } catch {
          lastPresetCss = null;
        }
      }
      renderPreview();
      return;
    }
  
    const initial =
      savedPreset && PRESET_KEYS.includes(savedPreset) ? savedPreset : DEFAULT_PRESET;
    await applyPreset(initial, true);
  })();
}

boot();
