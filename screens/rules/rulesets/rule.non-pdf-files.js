/*
Nombre completo: rule.non-pdf-files.js
Ruta: /screens/rules/rulesets/rule.non-pdf-files.js
Función:
- Detectar cualquier archivo documental que no sea PDF.
- Ignorar exclusivamente archivos técnicos del sistema.
- Abrir siempre la carpeta que contiene el archivo.
*/
(function (window) {
  "use strict";

  const Types = window.RulesTypes || {};
  const Policy = window.RulesFilePolicy;
  const TECHNICAL = new Set(["desktop.ini", "thumbs.db"]);

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function getParentAbsolutePath(absolutePath) {
    return safeText(absolutePath).replace(/[\\/][^\\/]+$/, "");
  }

  function isTechnical(fileName) {
    return TECHNICAL.has(safeText(fileName).toLowerCase());
  }

  function run(scope, scanData, rule) {
    if (!scanData || scanData.ok !== true) return [];

    const findFinalPdf = Policy.createPdfLookup(scanData.files);
    return (Array.isArray(scanData.files) ? scanData.files : [])
      .filter(function keep(file) {
        if (!file || isTechnical(file.name) || Policy.isIgnored(file)) return false;
        return !Policy.isFinalPdf(file);
      })
      .map(function mapFile(file) {
        const isEditable = Policy.isEditable(file);
        const finalPdf = isEditable ? findFinalPdf(file) : null;
        const editableStatus = !isEditable ? "other" : finalPdf ? "with-final" : "without-final";
        const title = editableStatus === "with-final"
          ? "Versión editable adicional con PDF final"
          : editableStatus === "without-final"
          ? "Archivo editable sin PDF final"
          : "Archivo en formato no admitido";
        const description = editableStatus === "with-final"
          ? "Se encontró su PDF final correspondiente, pero permanece un Word o Excel editable en la carpeta."
          : editableStatus === "without-final"
          ? "Existe un archivo de trabajo, pero no se encontró su PDF final equivalente en esta carpeta."
          : "El archivo no es un PDF final ni un documento editable Word/Excel reconocido.";
        const finding = {
          ruleId: rule.id,
          ruleName: rule.name,
          category: "non-pdf",
          scope: scope,
          severity: rule.severity,
          title: title,
          description: description,
          editableStatus: editableStatus,
          relatedPdfPath: finalPdf ? finalPdf.path || "" : "",
          rootName: scanData.rootName || "",
          rootPath: scanData.rootPath || "",
          relativePath: Types.normalizeRelativePath
            ? Types.normalizeRelativePath(file.relativePath)
            : safeText(file.relativePath),
          absolutePath: file.path || "",
          actualLabel: "Archivo",
          actualValue: file.name || "",
          expectedLabel: "Acción recomendada",
          expectedValue: editableStatus === "with-final"
            ? "Revisar el editable adicional; el PDF final ya acredita el documento."
            : "Incorporar o verificar el PDF final correspondiente.",
          exampleLabel: finalPdf ? "PDF final correspondiente" : "Estado documental",
          exampleValue: finalPdf ? finalPdf.relativePath || finalPdf.name : "No se encontró PDF equivalente.",
          foundFileName: file.name || "",
          primaryActionLabel: "Abrir carpeta",
          primaryActionPath: getParentAbsolutePath(file.path || "") || scanData.rootPath || ""
        };

        finding.id = Types.buildFindingId
          ? Types.buildFindingId(finding)
          : [rule.id, scope, finding.relativePath].join("|");

        return finding;
      });
  }

  window.RuleNonPdfFiles = {
    id: "non-pdf-files",
    name: "Archivos no PDF",
    scope: "BOTH",
    severity: "warning",
    description: "Advierte sobre Word/Excel adicionales incluso si existe su PDF final; distingue editables sin PDF y formatos no admitidos.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);
