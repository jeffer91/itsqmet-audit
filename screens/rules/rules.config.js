/*
Nombre completo: rules.config.js
Ruta o ubicación: /screens/rules/rules.config.js
Función o funciones:
- Centralizar configuración compartida del módulo de reglas
- Declarar excepciones de carpetas contenedoras
- Mantener opciones visuales comunes para la pantalla
*/

(function (window) {
  "use strict";

  window.RulesConfig = {
    // Comentario técnico: estas carpetas son contenedores raíz y no deben
    // evaluarse como carpetas de proceso. Sus hijas sí pueden ser procesos.
    ROOT_EXCEPTION_FOLDERS: [
      "PROCESOS DE APOYO",
      "PROCESOS ESTRATEGICOS",
      "PROCESOS MISIONALES"
    ],

    UI: {
      // Comentario técnico: cuando el filtro está en "Todas las reglas",
      // la vista se compacta para soportar un catálogo grande sin crecer demasiado.
      compactRulesWhenAll: true
    }
  };
})(window);