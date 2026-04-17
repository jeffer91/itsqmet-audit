/*
Nombre completo: rules.bootstrap.js
Ruta o ubicación: /screens/rules/rules.bootstrap.js
Función o funciones:
- Cargar dinámicamente las reglas en la pantalla Reglas
- Soportar reglas modulares con varios scripts por carpeta
- Mantener compatibilidad con reglas legadas planas
*/
(function (window, document) {
  "use strict";

  let lastResult = {
    ok: false,
    files: [],
    loaded: [],
    loadedScripts: [],
    error: ""
  };

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function buildGlobalRuleNameFromLegacyFile(fileName) {
    const safe = safeText(fileName);
    const base = safe.replace(/^rule\./i, "").replace(/\.js$/i, "");
    const chunks = base.split(/[^a-zA-Z0-9]+/).filter(Boolean);

    return "Rule" + chunks.map(function mapChunk(chunk) {
      return chunk.charAt(0).toUpperCase() + chunk.slice(1);
    }).join("");
  }

  function normalizeRuleDescriptor(entry) {
    if (typeof entry === "string") {
      const fileName = safeText(entry);
      if (!fileName) return null;

      return {
        id: fileName.replace(/^rule\./i, "").replace(/\.js$/i, ""),
        type: "legacy",
        folderName: "",
        globalName: buildGlobalRuleNameFromLegacyFile(fileName),
        scripts: [fileName],
        manifestFile: ""
      };
    }

    if (!entry || typeof entry !== "object") {
      return null;
    }

    const scripts = Array.isArray(entry.scripts)
      ? entry.scripts.map(function mapItem(item) {
          return safeText(item);
        }).filter(Boolean)
      : [];

    if (!scripts.length) {
      return null;
    }

    return {
      id: safeText(entry.id) || scripts[0],
      type: safeText(entry.type) || "folder",
      folderName: safeText(entry.folderName),
      globalName: safeText(entry.globalName),
      scripts: scripts,
      manifestFile: safeText(entry.manifestFile)
    };
  }

  function hasRuleObject(globalName) {
    const safeName = safeText(globalName);
    return !!(safeName && Object.prototype.hasOwnProperty.call(window, safeName));
  }

  function encodePath(relativePath) {
    return safeText(relativePath)
      .split("/")
      .filter(Boolean)
      .map(function mapPart(part) {
        return encodeURIComponent(part);
      })
      .join("/");
  }

  function buildRuleScriptUrl(relativePath) {
    return "./rulesets/" + encodePath(relativePath);
  }

  function loadScript(src) {
    return new Promise(function executor(resolve, reject) {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = function onLoad() {
        resolve(src);
      };
      script.onerror = function onError() {
        reject(new Error(`No se pudo cargar la regla ${src}.`));
      };
      document.head.appendChild(script);
    });
  }

  async function loadRuleDescriptor(descriptor) {
    const loadedScripts = [];

    if (descriptor.globalName && hasRuleObject(descriptor.globalName)) {
      return loadedScripts;
    }

    for (const relativePath of descriptor.scripts) {
      const src = buildRuleScriptUrl(relativePath);
      await loadScript(src);
      loadedScripts.push(relativePath);
    }

    return loadedScripts;
  }

  async function loadRuleScripts() {
    if (!window.api || !window.api.rules || typeof window.api.rules.listFiles !== "function") {
      lastResult = {
        ok: false,
        files: [],
        loaded: [],
        loadedScripts: [],
        error: "La API de reglas no está disponible. Abre esta pantalla desde Electron."
      };
      return clone(lastResult);
    }

    const response = await window.api.rules.listFiles();

    if (!response || response.ok !== true) {
      throw new Error(
        response && response.error
          ? response.error
          : "No se pudo obtener el listado de reglas."
      );
    }

    const rawFiles = Array.isArray(response.files) ? response.files : [];
    const descriptors = rawFiles.map(normalizeRuleDescriptor).filter(Boolean);
    const loaded = [];
    const loadedScripts = [];

    for (const descriptor of descriptors) {
      const scripts = await loadRuleDescriptor(descriptor);

      if (scripts.length) {
        loaded.push(descriptor.id);
        loadedScripts.push.apply(loadedScripts, scripts);
      }
    }

    lastResult = {
      ok: true,
      files: descriptors,
      loaded: loaded.slice(),
      loadedScripts: loadedScripts.slice(),
      error: ""
    };

    return clone(lastResult);
  }

  const ready = loadRuleScripts().catch(function onError(error) {
    lastResult = {
      ok: false,
      files: [],
      loaded: [],
      loadedScripts: [],
      error:
        error && error.message ? error.message : "No se pudieron cargar las reglas."
    };
    return clone(lastResult);
  });

  window.RulesBootstrap = {
    ready: ready,
    getLastResult: function getLastResult() {
      return clone(lastResult);
    }
  };
})(window, document);