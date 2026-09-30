/*
Nombre completo: manual.catalog.js
Ruta: /screens/rules/manual/manual.catalog.js
Función:
- Fuente maestra de procesos y documentos esperados según los manuales UGPA y UTET.
- Mantener la jerarquía acordada: código desde el título/listado del proceso y documentos desde "Documentos generados en el proceso".
*/
(function (window) {
  "use strict";

  const catalog = {
    UGPA: {
      manualRootPatterns: ["UGPA-MP-ITSQMET", "Manual de Procesos"],
      processes: {
        "70": {
          name: "Proceso de Capacitación Docente",
          documents: [
            { id: "rgi1", label: "Detección de Necesidades de Capacitación", codes: ["UGPA-RGI1", "PRO-70"], keywords: ["deteccion", "necesidades", "capacitacion"], template: "UGPA-RGI1-0X-PRO-70-AÑO-MES" },
            { id: "rgi2", label: "Plan Semestral de Capacitación Docente", codes: ["UGPA-RGI2", "PRO-70"], keywords: ["plan", "semestral", "capacitacion"], template: "UGPA-RGI2-0X-PRO-70-AÑO-MES" },
            { id: "rgi3", label: "Informe de Cumplimiento del Plan Semestral de Capacitación", codes: ["UGPA-RGI3", "PRO-70"], keywords: ["informe", "cumplimiento", "plan", "capacitacion"], template: "UGPA-RGI3-0X-PRO-70-AÑO-MES" }
          ]
        },
        "31": {
          name: "Proceso de Formación Docente",
          documents: [
            { id: "rgi1", label: "Detección de Necesidades de Formación", codes: ["UGPA-RGI1", "PRO-31"], keywords: ["deteccion", "necesidades", "formacion"], template: "UGPA-RGI1-0X-PRO-31-AÑO-MES" },
            { id: "rgi2", label: "Plan Anual de Formación Docente", codes: ["UGPA-RGI2", "PRO-31"], keywords: ["plan", "anual", "formacion"], template: "UGPA-RGI2-0X-PRO-31-AÑO-MES" },
            { id: "rgi3", label: "Informe de Cumplimiento del Plan de Formación", codes: ["UGPA-RGI3", "PRO-31"], keywords: ["informe", "cumplimiento", "plan", "formacion"], template: "UGPA-RGI3-0X-PRO-31-AÑO-MES" }
          ]
        },
        "60": {
          name: "Proceso de Construcción Curricular Continua",
          documents: [
            { id: "rgi1", label: "Acta de Reunión de Colectivos Docentes para el Análisis de la Ficha CCC", codes: ["UGPA-RGI1", "PRO-60"], keywords: ["acta", "colectivos", "ccc"], template: "UGPA-RGI1-0X-PRO-60-AÑO-MES" },
            { id: "rgi2", label: "Ficha Individual de Análisis por Nivel - Construcción Curricular Continua", codes: ["UGPA-RGI2", "PRO-60"], keywords: ["ficha", "individual", "analisis", "curricular"], template: "UGPA-RGI2-0X-PRO-60-AÑO-MES" },
            { id: "rgi3", label: "Guía Curricular de Aplicación Académica de la Carrera", codes: ["RGI3", "PRO-60"], keywords: ["guia", "curricular", "aplicacion", "academica"], template: "RGI3-0X-PRO-60-AÑO-MES" }
          ]
        },
        "134": {
          name: "Proceso de Ejecución de Capacitación Docente",
          documents: [
            { id: "rgi1", label: "Planificación de la Capacitación", codes: ["UGPA-RGI1", "PRO-134"], keywords: ["planificacion", "capacitacion"], template: "UGPA-RGI1-0X-PRO-134-AÑO-MES" },
            { id: "rgi2", label: "Acuerdo de Patrocinio Institucional", codes: ["UGPA-RGI2", "PRO-134"], keywords: ["acuerdo", "patrocinio"], template: "UGPA-RGI2-0X-PRO-134-AÑO-MES" },
            { id: "inf", label: "Informe final de Capacitación", codes: ["UGPA-INF", "PRO-134"], keywords: ["informe", "final", "capacitacion"], template: "UGPA-INF-0X-PRO-134-AÑO-MES" }
          ]
        },
        "135": {
          name: "Proceso de Medición de Impacto de la Capacitación Docente",
          documents: [
            { id: "rgi1", label: "Instrumento de Evaluación de la Capacitación", codes: ["UGPA-RGI1", "PRO-135"], keywords: ["instrumento", "evaluacion", "capacitacion"], template: "UGPA-RGI1-0X-PRO-135-AÑO-MES" },
            { id: "inf", label: "Informe de Impacto de Capacitación", codes: ["UGPA-INF", "PRO-135"], keywords: ["informe", "impacto", "capacitacion"], template: "UGPA-INF-0X-PRO-135-AÑO-MES" }
          ]
        },
        "251": {
          name: "Proceso de Planificación de Capacitación y Formación Individual a Docentes",
          documents: [
            { id: "rgi1", label: "Plan Individual de Formación y Capacitación Docente", codes: ["UGPA-RGI1", "PRO-251"], keywords: ["plan", "individual", "formacion", "capacitacion"], template: "UGPA-RGI1-0X-PRO-251-AÑO-MES" },
            { id: "rgi2", label: "Reporte General de Resultados del Plan de Formación y Capacitación Docente", codes: ["UGPA-RGI2", "PRO-251"], keywords: ["reporte", "resultados", "plan", "formacion", "capacitacion"], template: "UGPA-RGI2-0X-PRO-251-AÑO-MES" }
          ]
        },
        "248": {
          name: "Proceso de Seguimiento al Proceso de Formación del Personal Docente",
          documents: [
            { id: "rgi1", label: "Reporte de Seguimiento de Formación Docente", codes: ["UGPA-RGI1", "PRO-248"], keywords: ["reporte", "seguimiento", "formacion"], template: "UGPA-RGI1-0X-PRO-248-AÑO-MES" }
          ]
        },
        "321": {
          name: "Proceso de Generación, Emisión y Validación de Matriz de Ejecución Curricular",
          documents: [
            { id: "com", label: "Carga de la Matriz CCC en Sisacad - Comunicado", codes: ["COM-ITSQMET-UGPA"], keywords: ["matriz", "ccc", "sisacad", "comunicado"], template: "COM-ITSQMET-UGPA-AÑO-MES-0X" }
          ]
        }
      }
    },
    UTET: {
      manualRootPatterns: ["UTET-MP-ITSQMET", "Manual de Procesos"],
      processes: {
        "94": {
          name: "Proceso de Regulación de Normativa de la UTET",
          documents: [
            { id: "reglamento", label: "Reglamento de la UTET", codes: ["CTI-REG-14"], keywords: ["reglamento", "utet"], template: "CTI-REG-14" },
            { id: "resolucion", label: "Resolución del OCS", codes: ["ITSQMET-OCS"], keywords: ["resolucion", "ocs"], template: "ITSQMET-OCS-AÑO-MES-0X/DÍA-MES-AÑO" },
            { id: "acta-consejo", label: "Acta de Consejo OCS", codes: ["ACC-ITSQMET-OCS"], keywords: ["acta", "consejo", "ocs"], template: "ACC-ITSQMET-OCS-AÑO-MES-0X" },
            { id: "acta-socializacion", label: "Acta de Socialización", codes: ["UTET-ACT", "PRO-94"], keywords: ["acta", "socializacion"], template: "UTET-ACT-0X-PRO-94-AÑO-MES" }
          ]
        },
        "56": {
          name: "Proceso de Planificación Semestral del Proceso de Titulación",
          documents: [
            { id: "rgi1", label: "Planificación del Examen Complexivo", codes: ["UTET-RGI1", "PRO-56"], keywords: ["planificacion", "examen", "complexivo"], template: "UTET-RGI1-0X-PRO-56-AÑO-MES" },
            { id: "rgi2", label: "Planificación del Trabajo de Titulación", codes: ["UTET-RGI2", "PRO-56"], keywords: ["planificacion", "trabajo", "titulacion"], template: "UTET-RGI2-0X-PRO-56-AÑO-MES" },
            { id: "rgi3", label: "Planificación de Artículo Académico", codes: ["UTET-RGI3", "PRO-56"], keywords: ["planificacion", "articulo", "academico"], template: "UTET-RGI3-0X-PRO-56-AÑO-MES" }
          ]
        },
        "95": {
          name: "Proceso de Evaluación Semestral del Proceso de Titulación",
          documents: [
            { id: "inf", label: "Informe Final del Proceso de Titulación", codes: ["UTET-INF", "PRO-95"], keywords: ["informe", "final", "titulacion"], template: "UTET-INF-0X-PRO-95-AÑO-MES" }
          ]
        },
        "58": {
          name: "Proceso de Seguimiento de Requisitos",
          documents: [
            { id: "act", label: "Acta de Seguimiento de los Requisitos de Titulación", codes: ["UTET-ACT", "PRO-58"], keywords: ["acta", "seguimiento", "requisitos"], template: "UTET-ACT-0X-PRO-58-AÑO-MES" },
            { id: "rgi1", label: "Informe Individual de Verificación de Requisitos para el Proceso de Titulación", codes: ["UTET-RGI1", "PRO-58"], keywords: ["informe", "individual", "verificacion", "requisitos"], template: "UTET-RGI1-0X-PRO-58-AÑO-MES" },
            { id: "rgi2", label: "Reporte Final de Requisitos para Ingreso a Titulación", codes: ["UTET-RGI2", "PRO-58"], keywords: ["reporte", "final", "requisitos", "ingreso"], template: "UTET-RGI2-0X-PRO-58-AÑO-MES" }
          ]
        },
        "59": {
          name: "Proceso de Gestión de Guías de Integración Curricular",
          documents: [
            { id: "formato-guia", label: "Formato de Guía de Integración Curricular", keywords: ["formato", "guia", "integracion", "curricular"], template: "Formato de Guía de Integración Curricular" },
            { id: "guia", label: "Guía de Integración Curricular", keywords: ["guia", "integracion", "curricular"], template: "Guía de Integración Curricular" }
          ]
        },
        "88": {
          name: "Proceso de Ejecución de Seminarios Complexivos",
          note: "El listado/título del manual identifica este proceso como UTET-PRO-88; la tabla final lo rotula como UTET-PRO-45. Se aplica la jerarquía acordada y se conserva PRO-88.",
          documents: [
            { id: "solicitud", label: "Solicitud de Ingreso al Proceso de Titulación - Oficio", codes: ["OFI-ITSQMET-UTET"], keywords: ["solicitud", "ingreso", "titulacion"], template: "OFI-ITSQMET-UTET-AÑO-MES-0X" },
            { id: "cronograma", label: "Cronograma de Exámenes Complexivo - Memorando", codes: ["MEM-ITSQMET-UTET"], keywords: ["cronograma", "examenes", "complexivo"], template: "MEM-ITSQMET-UTET-AÑO-MES-0X" },
            { id: "guias", label: "Guías de Integración Curricular", keywords: ["guias", "integracion", "curricular"], template: "Guías de Integración Curricular" },
            { id: "plan-estudios", label: "Plan de Estudios del Núcleo Complexivo", keywords: ["plan", "estudios", "nucleo", "complexivo"], template: "Plan de Estudios del Núcleo Complexivo" }
          ]
        },
        "93": {
          name: "Proceso de Ejecución de Examen Complexivo",
          documents: [
            { id: "com", label: "Comunicado del Proceso de Titulación y Evaluación", codes: ["COM-ITSQMET-UTET"], keywords: ["comunicado", "titulacion", "evaluacion"], template: "COM-ITSQMET-UTET-AÑO-MES-0X" },
            { id: "acta", label: "Acta de Titulación por Examen Complexivo", codes: ["AT-ITSQMET-UTET"], keywords: ["acta", "titulacion", "examen", "complexivo"], template: "AT-ITSQMET-UTET-AÑO-MES-0X" }
          ]
        },
        "96": {
          name: "Proceso de Ingreso al Trabajo de Titulación",
          documents: [
            { id: "solicitud", label: "Solicitud de Ingreso al Proceso de Titulación - Oficio", codes: ["OFI-ITSQMET-UTET"], keywords: ["solicitud", "ingreso", "titulacion"], template: "OFI-ITSQMET-UTET-AÑO-MES-0X" },
            { id: "cronograma", label: "Cronograma de Trabajo de Titulación - Memorando", codes: ["MEM-ITSQMET-UTET"], keywords: ["cronograma", "trabajo", "titulacion"], template: "MEM-ITSQMET-UTET-AÑO-MES-0X" },
            { id: "rgi1", label: "Designación de Tutores para la Gestión de Trabajo de Titulación", codes: ["UTET-RGI1", "PRO-96"], keywords: ["designacion", "tutores", "trabajo", "titulacion"], template: "UTET-RGI1-0X-PRO-96-AÑO-MES" },
            { id: "temas", label: "Ficha de Posibles Temas de Trabajo de Titulación", keywords: ["ficha", "posibles", "temas", "titulacion"], template: "Ficha de Posibles Temas de Trabajo de Titulación" }
          ]
        },
        "164": {
          name: "Proceso de Ejecución del Trabajo de Titulación",
          documents: [
            { id: "plan", label: "Plan de Trabajo de Titulación", keywords: ["plan", "trabajo", "titulacion"], template: "Plan de Trabajo de Titulación" },
            { id: "borrador1", label: "Trabajo de Titulación (Borrador 1)", keywords: ["trabajo", "titulacion", "borrador", "1"], template: "Trabajo de Titulación (Borrador 1)" },
            { id: "borrador2", label: "Trabajo de Titulación (Borrador 2)", keywords: ["trabajo", "titulacion", "borrador", "2"], template: "Trabajo de Titulación (Borrador 2)" },
            { id: "final", label: "Trabajo de Titulación (Final)", keywords: ["trabajo", "titulacion", "final"], template: "Trabajo de Titulación (Final)" },
            { id: "plagio", label: "Porcentaje de Plagio - Memorando", codes: ["MEM-ITSQMET-UTET"], keywords: ["porcentaje", "plagio"], template: "MEM-ITSQMET-UTET-AÑO-MES-0X" },
            { id: "com", label: "Comunicado del Proceso de Titulación y Evaluación", codes: ["COM-ITSQMET-UTET"], keywords: ["comunicado", "titulacion", "evaluacion"], template: "COM-ITSQMET-UTET-AÑO-MES-0X" },
            { id: "acta", label: "Acta de Titulación por Trabajo de Titulación", codes: ["AT-ITSQMET-UTET"], keywords: ["acta", "titulacion", "trabajo"], template: "AT-ITSQMET-UTET-AÑO-MES-0X" }
          ]
        },
        "57": {
          name: "Proceso de Gestión de Artículo Académico",
          documents: [
            { id: "solicitud", label: "Solicitud de Ingreso al Proceso de Titulación - Oficio", codes: ["OFI-ITSQMET-UTET"], keywords: ["solicitud", "ingreso", "titulacion"], template: "OFI-ITSQMET-UTET-AÑO-MES-0X" },
            { id: "cronograma", label: "Cronograma de Artículo Académico - Memorando", codes: ["MEM-ITSQMET-UTET"], keywords: ["cronograma", "articulo", "academico"], template: "MEM-ITSQMET-UTET-AÑO-MES-0X" },
            { id: "rgi1", label: "Designación de Docentes Metodológicos para la Gestión de Trabajo de Titulación", codes: ["UTET-RGI1", "PRO-57"], keywords: ["designacion", "docentes", "metodologicos"], template: "UTET-RGI1-0X-PRO-57-AÑO-MES" },
            { id: "pregunta", label: "Pregunta de Investigación - Artículo Académico", keywords: ["pregunta", "investigacion", "articulo", "academico"], template: "Pregunta de Investigación Modalidad de Titulación: Artículo Académico" },
            { id: "borrador", label: "Artículo Académico (Borrador I)", keywords: ["articulo", "academico", "borrador"], template: "Artículo Académico (Borrador I)" },
            { id: "final", label: "Artículo Académico (Final)", keywords: ["articulo", "academico", "final"], template: "Artículo Académico (Final)" },
            { id: "com", label: "Comunicado del Proceso de Titulación y Evaluación", codes: ["COM-ITSQMET-UTET"], keywords: ["comunicado", "titulacion", "evaluacion"], template: "COM-ITSQMET-UTET-AÑO-MES-0X" },
            { id: "plagio", label: "Porcentaje de Plagio - Memorando", codes: ["MEM-ITSQMET-UTET"], keywords: ["porcentaje", "plagio"], template: "MEM-ITSQMET-UTET-AÑO-MES-0X" },
            { id: "acta", label: "Acta de Titulación por Artículo Académico", codes: ["AT-ITSQMET-UTET"], keywords: ["acta", "titulacion", "articulo"], template: "AT-ITSQMET-UTET-AÑO-MES-0X" }
          ]
        },
        "97": {
          name: "Proceso de Inducción del Proceso de Titulación",
          documents: [
            { id: "rgi1", label: "Registro de Asistencia Inducción", codes: ["UTET-RGI1", "PRO-97"], keywords: ["registro", "asistencia", "induccion"], template: "UTET-RGI1-0X-PRO-97-AÑO-MES" },
            { id: "inf", label: "Informe de Finalización de la Inducción del Proceso de Titulación", codes: ["UTET-INF", "PRO-97"], keywords: ["informe", "finalizacion", "induccion"], template: "UTET-INF-0X-PRO-97-AÑO-MES" }
          ]
        }
      }
    }
  };

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeText(value) {
    return safeText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[–—_]+/g, "-")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getUnit(scope) {
    const key = safeText(scope).toUpperCase();
    return catalog[key] || null;
  }

  function getProcess(scope, processNumber) {
    const unit = getUnit(scope);
    if (!unit) return null;
    return unit.processes[safeText(processNumber)] || null;
  }

  function isRecognizedRootManual(scope, fileName) {
    const unit = getUnit(scope);
    if (!unit) return false;
    const normalized = normalizeText(fileName);
    return unit.manualRootPatterns.every(function every(pattern) {
      return normalized.includes(normalizeText(pattern));
    });
  }

  window.AuditManualCatalog = {
    catalog: catalog,
    normalizeText: normalizeText,
    getUnit: getUnit,
    getProcess: getProcess,
    isRecognizedRootManual: isRecognizedRootManual
  };
})(window);
