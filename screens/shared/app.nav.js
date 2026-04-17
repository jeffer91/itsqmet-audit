/*
Nombre completo: app.nav.js
Ruta o ubicación: /screens/shared/app.nav.js
Función o funciones:
- Renderizar un menú superior simple para navegar entre pantallas
- Marcar visualmente la pantalla activa
- Incluir la nueva pantalla Dashboard
*/
(function (window, document) {
  "use strict";

  function normalizePage(currentPage) {
    const safe = String(currentPage || "").trim().toLowerCase();
    if (safe === "rules" || safe === "dashboard" || safe === "scan") {
      return safe;
    }
    return "scan";
  }

  function getLinks(currentPage) {
    const current = normalizePage(currentPage);

    if (current === "rules") {
      return {
        current: "rules",
        scanHref: "../scan/scan.index.html",
        dashboardHref: "../dashboard/dashboard.index.html",
        rulesHref: "./rules.index.html"
      };
    }

    if (current === "dashboard") {
      return {
        current: "dashboard",
        scanHref: "../scan/scan.index.html",
        dashboardHref: "./dashboard.index.html",
        rulesHref: "../rules/rules.index.html"
      };
    }

    return {
      current: "scan",
      scanHref: "./scan.index.html",
      dashboardHref: "../dashboard/dashboard.index.html",
      rulesHref: "../rules/rules.index.html"
    };
  }

  function render(currentPage) {
    const host = document.getElementById("appTopNav");
    if (!host) return;

    const links = getLinks(currentPage);

    host.innerHTML = `
      <nav class="app-nav">
        <div class="app-nav__inner">
          <div class="app-nav__brand">AUDIT</div>
          <div class="app-nav__links">
            <a
              class="app-nav__link ${links.current === "scan" ? "is-active" : ""}"
              href="${links.scanHref}"
            >
              Escaneo
            </a>
            <a
              class="app-nav__link ${links.current === "dashboard" ? "is-active" : ""}"
              href="${links.dashboardHref}"
            >
              Dashboard
            </a>
            <a
              class="app-nav__link ${links.current === "rules" ? "is-active" : ""}"
              href="${links.rulesHref}"
            >
              Reglas
            </a>
          </div>
        </div>
      </nav>
    `;
  }

  window.AppNav = {
    render: render
  };
})(window, document);