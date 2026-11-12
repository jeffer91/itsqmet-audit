(function (window) {
  "use strict";
  const KEY = "audit_sharepoint_libraries_v1";
  const DEFAULTS = Object.freeze({
    UGPA: "https://itsqmet.sharepoint.com/sites/UGPA-UnidaddeGestindeProcesosAcadmicos/Documentos%20compartidos/Forms/AllItems.aspx",
    UTET: "https://itsqmet.sharepoint.com/sites/UTET-TitulacinyEficienciaTerminal/Documentos%20compartidos/Forms/AllItems.aspx"
  });
  function normalizeUrl(value) {
    if (!String(value || "").trim()) return "";
    const url = new URL(String(value).trim());
    if (url.protocol !== "https:" || !url.hostname.endsWith(".sharepoint.com") ||
        url.username || url.password || url.port || !/\/Forms\/AllItems\.aspx$/i.test(url.pathname))
      throw new Error("Pega el enlace de la biblioteca SharePoint (Forms/AllItems.aspx).");
    // El id de una carpeta seleccionada no cambia la raíz de la biblioteca.
    url.search = ""; url.hash = "";
    return url.href;
  }
  function load() {
    let stored = {};
    try {
      const data = JSON.parse(window.localStorage.getItem(KEY) || "{}");
      if (data && typeof data === "object" && !Array.isArray(data)) stored = data;
    } catch (_) { /* Conservar los enlaces institucionales si la configuración local está dañada. */ }
    // Migrar configuraciones antiguas que guardaban UTET vacío: nunca exigir
    // que se pegue una URL por cada proceso o carpeta.
    return Object.fromEntries(["UGPA", "UTET"].map(scope => [scope,
      typeof stored[scope] === "string" && stored[scope].trim() ? stored[scope] : DEFAULTS[scope]]));
  }
  function save(values) {
    const next = {
      UGPA: normalizeUrl(values.UGPA) || DEFAULTS.UGPA,
      UTET: normalizeUrl(values.UTET) || DEFAULTS.UTET
    };
    window.localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  }
  function localPath(value) { return String(value || "").replace(/\\/g, "/").replace(/\/+$/, ""); }
  function prepare(shared) {
    const settings = load(), scopes = {};
    for (const scope of ["UGPA", "UTET"]) {
      const scan = shared && shared[scope === "UGPA" ? "ugpaResult" : "utetResult"];
      if (!scan || !scan.ok || scan.source?.kind !== "folder") continue;
      let library;
      try { library = normalizeUrl(settings[scope]); } catch (_) { continue; }
      if (!library) continue;
      const root = localPath(scan.rootPath);
      if (!root) continue;
      const directories = new Map([[root.toLowerCase(), ""]]);
      for (const folder of scan.folders || []) {
        const relativePath = localPath(folder.relativePath).replace(/^\/+/, "");
        const absolute = localPath(folder.path || folder.absolutePath ||
          (relativePath ? root + "/" + relativePath : ""));
        if (!absolute.toLowerCase().startsWith(root.toLowerCase() + "/")) continue;
        const relative = absolute.slice(root.length + 1);
        if (relative.split("/").some(part => part === ".." || part === ".")) continue;
        directories.set(absolute.toLowerCase(), relative);
      }
      scopes[scope] = {library, root, directories};
    }
    return scopes;
  }
  function folderUrl(item, context) {
    const source = context && context[item.scope];
    if (!source) return "";
    let candidate = localPath(item.actionPath || item.parentPath);
    // Si el hallazgo apunta al padre, priorizar la carpeta real del inventario.
    // Nunca construir una URL de una carpeta inexistente a partir del nombre propuesto.
    const relativePath = localPath(item.pathLabel).replace(/^\/+/, "");
    const inventoried = relativePath ? source.root + "/" + relativePath : "";
    if (inventoried && source.directories.has(inventoried.toLowerCase())) candidate = inventoried;
    const root = source.root.toLowerCase();
    if (candidate.toLowerCase() !== root && !candidate.toLowerCase().startsWith(root + "/")) return "";
    if (candidate.split("/").some(part => part === ".." || part === ".")) return "";
    // Para un archivo o una carpeta aún inexistente se abre el padre inventariado.
    while (!source.directories.has(candidate.toLowerCase()) && candidate.length > source.root.length)
      candidate = candidate.slice(0, candidate.lastIndexOf("/"));
    const relative = source.directories.get(candidate.toLowerCase());
    if (relative === undefined) return "";
    const url = new URL(source.library);
    const libraryPath = decodeURIComponent(url.pathname.replace(/\/Forms\/AllItems\.aspx$/i, ""));
    url.searchParams.set("id", libraryPath + (relative ? "/" + relative : ""));
    return url.href;
  }
  function decorate(item, context) {
    return {...item, sharePointUrl: folderUrl(item, context),
      ...(item.groupItems ? {groupItems: item.groupItems.map(child => decorate({...child, scope: child.scope || item.scope}, context))} : {})};
  }
  window.PrioritySharePoint = {load, save, prepare, folderUrl, decorate, normalizeUrl};
})(window);
