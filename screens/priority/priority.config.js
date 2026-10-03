(function (window) {
  "use strict";

  window.PriorityConfig = {
    graceDays: {
      start: 30,
      close: 15
    },
    levels: [
      { id: "max", label: "Máxima", rank: 4 },
      { id: "high", label: "Alta", rank: 3 },
      { id: "medium", label: "Media", rank: 2 },
      { id: "low", label: "Baja", rank: 1 }
    ],
    areas: {
      strategic: { label: "Estratégicos", folder: "PROCESOS ESTRATEGICOS", rank: 3 },
      mission: { label: "Misionales", folder: "PROCESOS MISIONALES", rank: 2 },
      support: { label: "Apoyo", folder: "PROCESOS DE APOYO", rank: 1 },
      other: { label: "Sin clasificar", folder: "", rank: 0 }
    },
    strategicProfiles: {
      UGPA: {
        "31": {
          cadenceMonths: 12,
          effort: "high",
          stages: { rgi1: "start", rgi2: "start", rgi3: "close" }
        },
        "70": {
          cadenceMonths: 6,
          effort: "high",
          stages: { rgi1: "start", rgi2: "start", rgi3: "close" }
        },
        "60": {
          special: true,
          effort: "high",
          note: "Proceso especial: se priorizan sus hallazgos reales sin forzarlo al ciclo detección-plan-informe."
        }
      },
      UTET: {
        "56": {
          cadenceMonths: 6,
          effort: "high",
          stages: { rgi1: "start", rgi2: "start", rgi3: "start" }
        },
        "95": {
          cadenceMonths: 6,
          effort: "high",
          stages: { inf: "close" }
        },
        "94": {
          special: true,
          effort: "high",
          note: "Proceso normativo: se priorizan sus hallazgos reales según la documentación exigible."
        }
      }
    }
  };
})(window);
