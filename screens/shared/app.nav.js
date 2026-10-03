/*
Nombre completo: app.nav.js
Ruta o ubicación: /screens/shared/app.nav.js
Función o funciones:
- Renderizar un menú superior simple para navegar entre pantallas
- Marcar visualmente la pantalla activa
- Incluir Escaneo, Dashboard, Reglas y Priorización
*/
(function (window, document) {
  "use strict";

  function normalizePage(currentPage) {
    const safe = String(currentPage || "").trim().toLowerCase();
    if (["rules", "dashboard", "scan", "priority"].includes(safe)) return safe;
    return "scan";
  }

  function getLinks(currentPage) {
    const current = normalizePage(currentPage);
    const base = current === "scan" ? "../" : "../";
    return {
      current: current,
      scanHref: current === "scan" ? "./scan.index.html" : base + "scan/scan.index.html",
      dashboardHref: current === "dashboard" ? "./dashboard.index.html" : base + "dashboard/dashboard.index.html",
      rulesHref: current === "rules" ? "./rules.index.html" : base + "rules/rules.index.html",
      priorityHref: current === "priority" ? "./priority.index.html" : base + "priority/priority.index.html"
    };
  }

  function render(currentPage) {
    const host = document.getElementById("appTopNav");
    if (!host) return;
    const links = getLinks(currentPage);
    const items = [
      ["scan", "Escaneo", links.scanHref],
      ["dashboard", "Dashboard", links.dashboardHref],
      ["rules", "Reglas", links.rulesHref],
      ["priority", "Priorización", links.priorityHref]
    ];

    host.innerHTML = `
      <nav class="app-nav">
        <div class="app-nav__inner">
          <div class="app-nav__brand">AUDIT</div>
          <div class="app-nav__links">
            ${items.map(function map(item) {
              return `<a class="app-nav__link ${links.current === item[0] ? "is-active" : ""}" href="${item[2]}">${item[1]}</a>`;
            }).join("")}
          </div>
        </div>
      </nav>
    `;
  }

  function ensureLoadingHost() {
    let host = document.getElementById("appLoadingOverlay");
    if (host) return host;
    host = document.createElement("div");
    host.id = "appLoadingOverlay";
    host.className = "app-loading";
    host.innerHTML = '<div class="app-loading__card"><div class="app-loading__spinner"></div><div><strong id="appLoadingTitle">Procesando…</strong><span>La aplicación sigue trabajando.</span></div></div>';
    document.body.appendChild(host);
    return host;
  }

  function setLoading(visible, message) {
    const host = ensureLoadingHost();
    const title = document.getElementById("appLoadingTitle");
    if (title && message) title.textContent = String(message);
    host.classList.toggle("is-visible", !!visible);
    host.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  window.AppNav = { render: render, setLoading: setLoading };
})(window, document);
