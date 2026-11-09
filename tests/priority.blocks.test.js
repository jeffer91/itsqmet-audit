"use strict";
// Priorización por bloques (nombres/carpetas → documentos → revisiones) y
// urgencias del período vigente. Fecha fija: 9 de noviembre de 2026.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const NOW = "2026-11-09T15:00:00Z";
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(NOW); }
  static now() { return new RealDate(NOW).getTime(); }
}
const FILES = [
  "screens/rules/rules.types.js",
  "screens/rules/rules.file-policy.js",
  "screens/rules/manual/manual.catalog.js",
  "screens/rules/rulesets/rule.required-documents.js",
  "screens/rules/rulesets/rule.training-complete-with-4-evidences.js",
  "screens/priority/priority.config.js",
  "screens/priority/priority.processes.js",
  "screens/priority/priority.naming-policy.js",
  "screens/priority/priority.names.js",
  "screens/priority/priority.storage.js",
  "screens/priority/priority.workflow.js",
  "screens/priority/priority.queue.js",
  "screens/priority/priority.service.js"
];
function folder(rel) {
  return {name: rel.split("/").pop(), relativePath: rel, path: "C:/AUDIT/" + rel};
}
function file(rel) {
  return {name: rel.split("/").pop(), relativePath: rel, path: "C:/AUDIT/" + rel,
    directoryPath: rel.split("/").slice(0, -1).join("/"), extension: path.extname(rel).toLowerCase()};
}
function withParents(paths) {
  const all = new Set();
  paths.forEach(p => { const parts = p.split("/"); for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join("/")); });
  return Array.from(all);
}
function scan(scope, folders, files = []) {
  const dirs = withParents(folders.concat(files.map(f => f.split("/").slice(0, -1).join("/"))).filter(Boolean));
  return {ok: true, type: scope, rootPath: "C:/AUDIT", rootName: scope,
    source: {kind: "folder", selectedFolderPath: "C:/AUDIT"}, scannedAt: NOW,
    folders: dirs.map(folder), files: files.map(file)};
}
function boot(state) {
  const values = new Map();
  const window = {
    localStorage: {getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v)},
    AppStore: {get: () => state, getSnapshot: () => state}
  };
  const context = vm.createContext({window, Date: FixedDate, Intl, Set, Map});
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), context, {filename: f});
  window.RulesEngine = {analyze: s => ({findings: ["UGPA", "UTET"].flatMap(scope => {
    const data = scope === "UGPA" ? s.ugpaResult : s.utetResult;
    return data ? window.RuleRequiredDocuments.run({scope, scanData: data}) : [];
  })})};
  return window;
}
function view(w) {
  const vmResult = w.PriorityService.buildViewModel({});
  return {vmResult, board: w.PriorityQueue.build(vmResult, w.PriorityStorage.load())};
}
const PRO70 = "PROCESOS ESTRATEGICOS/UGPA-PRO-70-Capacitacion Docente";
const PRO31 = "PROCESOS ESTRATEGICOS/UGPA-PRO-31-Formacion Docente";

// ---------- Cola ----------
function queueEnv() {
  const values = new Map();
  const window = {localStorage: {getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v)}};
  const context = vm.createContext({window, Date: FixedDate, Set, Map});
  for (const f of ["priority.storage.js", "priority.workflow.js", "priority.queue.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "screens", "priority", f), "utf8"), context);
  return window;
}

test("las correcciones de nombres y carpetas van antes que los documentos", () => {
  const w = queueEnv();
  const vmData = {
    tasks: [{id: "doc", scope: "UGPA", processNumber: "70", area: "strategic", workType: "document",
      level: "max", title: "Informe", reason: "Vencido", status: "pending", dueDate: "2026-10-15T00:00:00Z"}],
    inconsistencies: [
      {scope: "UGPA", processNumber: "134", category: "names", title: "Nombre de PDF incorrecto",
        area: "mission", groupCount: 63, workType: "quick", items: []},
      {scope: "UGPA", processNumber: "135", category: "period", title: "Carpeta de período mal nombrada",
        area: "mission", groupCount: 1, workType: "quick", items: []},
      {scope: "UGPA", processNumber: "60", category: "period", title: "Duración de período incorrecta",
        area: "strategic", groupCount: 2, workType: "review", items: []}
    ]
  };
  const board = w.PriorityQueue.build(vmData, w.PriorityStorage.load());
  assert.deepEqual(Array.from(board.items, x => w.PriorityQueue.block(x)), [1, 1, 2, 3]);
  // Primero la carpeta de período: determina cómo se lee su contenido.
  assert.match(board.items[0].title, /Carpeta de período/);
  assert.equal(board.items[0].workType, "quick");
});

test("mayor atraso nunca resta urgencia y el rezago histórico no depende del texto", () => {
  const w = queueEnv();
  const base = {scope: "UGPA", area: "strategic", workType: "document", level: "max", status: "pending", reason: "x"};
  const recent = w.PriorityQueue.score({...base, dueDate: "2026-10-31T00:00:00Z"});
  const older = w.PriorityQueue.score({...base, dueDate: "2026-04-15T00:00:00Z"});
  assert.ok(older >= recent);
  const flagged = w.PriorityQueue.score({...base, historical: true, reason: "PDF candidato localizado"});
  assert.ok(flagged < w.PriorityQueue.score(base));
});

test("UTET sin fecha: un período cerrado hace más tiempo va antes", () => {
  const w = queueEnv();
  const base = {scope: "UTET", area: "strategic", workType: "document", level: "high", status: "pending", reason: "x", dueDate: null};
  assert.ok(w.PriorityQueue.score({...base, periodEnd: "2026-03-31T00:00:00Z"}) >
    w.PriorityQueue.score({...base, periodEnd: "2026-09-30T00:00:00Z"}));
});

// ---------- Servicio ----------
test("el período vigente sin carpeta genera Detección y Plan vencidos (PRO-70 y PRO-31)", () => {
  const ugpa = scan("UGPA", [
    PRO70 + "/UGPA-PRO-70-Abril 2026 – Septiembre 2026",
    PRO31 + "/UGPA-PRO-31-Octubre 2025 – Septiembre 2026"
  ]);
  const w = boot({ugpaResult: ugpa, utetResult: null, discardedFindings: []});
  const {vmResult} = view(w);
  const current = vmResult.tasks.filter(t => /^current\|UGPA\|(70|31)\|/.test(t.id));
  assert.deepEqual(Array.from(current, t => t.processNumber + ":" + t.documentId).sort(),
    ["31:rgi1", "31:rgi2", "70:rgi1", "70:rgi2"]);
  assert.ok(current.every(t => t.level === "max" && t.workType === "document"));
  assert.ok(!vmResult.tasks.some(t => /Verificar la ubicación documental/.test(t.title) && /Octubre 2026/.test(t.periodLabel)));
});

test("UTET-56: planificaciones del período vigente sin vencimiento fabricado", () => {
  const root = "PROCESOS ESTRATEGICOS/UTET-PRO-56-Planificacion Semestral del Proceso de Titulación";
  const utet = scan("UTET", [root + "/UTET-PRO-56-Abril 2026 – Septiembre 2026"]);
  const w = boot({ugpaResult: null, utetResult: utet, discardedFindings: []});
  const tasks = view(w).vmResult.tasks.filter(t => t.id.startsWith("current|UTET|56|"));
  assert.equal(tasks.length, 3);
  assert.ok(tasks.every(t => t.dueDate === null));
  assert.equal(tasks.find(t => t.documentId === "rgi3").workType, "review");
});

test("el Reporte de Resultados del Plan es de cierre, no de inicio", () => {
  const root = "PROCESOS MISIONALES/UGPA-PRO-251-Planificacion-de-Capacitacion-y-Formacion-Individual-a-Docentes";
  const period = root + "/UGPA-PRO-251-Abril 2026 – Septiembre 2026";
  const ugpa = scan("UGPA", [period], [period + "/UGPA-RGI1-01-PRO-251-2026-04-Docente Ficticio.pdf"]);
  const w = boot({ugpaResult: ugpa, utetResult: null, discardedFindings: []});
  const report = view(w).vmResult.tasks.find(t => t.processNumber === "251" && /Reporte General/.test(t.title));
  assert.ok(report);
  assert.equal(report.stage, "close");
  assert.equal(new Date(report.dueDate).toISOString().slice(0, 10), "2026-10-15");
});

test("el semestre anterior no es rezago histórico; lo cerrado hace más de un año sí", () => {
  const ugpa = scan("UGPA", [
    PRO70 + "/UGPA-PRO-70-Octubre 2025 – Marzo 2026",
    PRO70 + "/UGPA-PRO-70-Octubre 2024 – Septiembre 2025",
    PRO70 + "/UGPA-PRO-70-Abril 2026 – Septiembre 2026"
  ]);
  const w = boot({ugpaResult: ugpa, utetResult: null, discardedFindings: []});
  const informes = view(w).vmResult.tasks.filter(t => t.processNumber === "70" && /Informe de Cumplimiento/.test(t.officialName || t.title));
  const prev = informes.find(t => t.periodLabel === "Octubre 2025 – Marzo 2026");
  const old = informes.find(t => t.periodLabel === "Octubre 2024 – Septiembre 2025");
  assert.equal(prev.historical, false);
  assert.equal(prev.level, "max");
  assert.equal(old.historical, true);
});

test("una carpeta con período de duración inválida no genera documentos fantasma", () => {
  const ugpa = scan("UGPA", [PRO31 + "/UGPA-PRO-31-Abril 2026–Septiembre 2027"]);
  const w = boot({ugpaResult: ugpa, utetResult: null, discardedFindings: []});
  const tasks = view(w).vmResult.tasks;
  assert.ok(!tasks.some(t => /2027/.test(t.periodLabel || "") && /Abril 2026/.test(t.periodLabel || "")));
});

test("la carpeta vacía de un documento pendiente no duplica la tarea", () => {
  const root = "PROCESOS MISIONALES/UGPA-PRO-135-Medicion de-Impacto-de-la-Capacitacion-Docente";
  const period = root + "/UGPA-PRO-135-Abril 2026–Septiembre 2026";
  const ugpa = scan("UGPA", [period]);
  const w = boot({ugpaResult: ugpa, utetResult: null, discardedFindings: []});
  w.RulesEngine.analyze = s => ({findings: w.RuleRequiredDocuments.run({scope: "UGPA", scanData: s.ugpaResult}).concat([
    {id: "empty-135", scope: "UGPA", ruleId: "empty-folders", category: "empty-folders",
      title: "Carpeta vacía", relativePath: period, expectedValue: "PDF"}])});
  const tasks = view(w).vmResult.tasks.filter(t => t.processNumber === "135");
  assert.equal(tasks.some(t => t.sourceId === "empty-135"), false);
  assert.ok(tasks.some(t => /Informe de Impacto/.test(t.officialName || t.title)));
});

test("muchas carpetas vacías del mismo proceso forman una sola tarea", () => {
  const root = "PROCESOS DE APOYO/UGPA-PRO-321-Matriz CCC";
  const ugpa = scan("UGPA", [root]);
  const w = boot({ugpaResult: ugpa, utetResult: null, discardedFindings: []});
  const empties = [1, 2, 3, 4, 5].map(n => ({id: "e" + n, scope: "UGPA", ruleId: "empty-folders",
    category: "empty-folders", title: "Carpeta vacía", relativePath: root + "/Carrera/Nivel " + n}));
  w.RulesEngine.analyze = () => ({findings: empties});
  const tasks = view(w).vmResult.tasks.filter(t => t.processNumber === "321");
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].groupCount, 5);
});

test("PRO-60: sin fichas, la guía queda en espera y las fichas van primero", () => {
  const base = "PROCESOS ESTRATEGICOS/UGPA-PRO-60-Construcción Curricular Continua";
  const career = base + "/UGPA-PRO-60-Octubre 2025 – Septiembre 2026/UGPA-PRO-60-Educación Básica";
  const ugpa = scan("UGPA", [career + "/UGPA-PRO-60-Acta"],
    [career + "/UGPA-PRO-60-Acta/UGPA-RGI1-01-PRO-60-2026-03-Educación Básica.pdf"]);
  const w = boot({ugpaResult: ugpa, utetResult: null, discardedFindings: []});
  const tasks = view(w).vmResult.tasks.filter(t => t.id.startsWith("pro60|"));
  const guide = tasks.find(t => t.documentId === "guia");
  const ficha = tasks.find(t => t.documentId === "ficha");
  assert.equal(guide.level, "low");
  assert.match(guide.reason, /En espera/);
  assert.doesNotMatch(guide.reason, /Se localizaron el acta y las fichas/);
  assert.equal(ficha.level, "high");
});

test("UTET-57 sin carpeta se señala si PRO-56 planificó Artículo Académico", () => {
  const p56 = "PROCESOS ESTRATEGICOS/UTET-PRO-56-Planificacion Semestral del Proceso de Titulación/UTET-PRO-56-Octubre 2025 Marzo 2026";
  const utet = scan("UTET", [p56], [p56 + "/UTET-RGI3-01-PRO-56-2025-10-Planificación de Artículo Académico.pdf"]);
  const w = boot({ugpaResult: null, utetResult: utet, discardedFindings: []});
  const task = view(w).vmResult.tasks.find(t => t.processNumber === "57");
  assert.ok(task);
  assert.equal(task.periodLabel, "Octubre 2025 – Marzo 2026");
  assert.match(task.displayTitle || task.title, /PRO-57/);
});

test("la tabla de procesos y la exportación usan el mismo nivel que la cola", () => {
  const ugpa = scan("UGPA", [PRO31 + "/UGPA-PRO-31-Octubre 2025 – Septiembre 2026"],
    [PRO31 + "/UGPA-PRO-31-Octubre 2025 – Septiembre 2026/UGPA-RGI1-01-PRO-31-2025-10-Plan de Formacion Docente.pdf"]);
  const w = boot({ugpaResult: ugpa, utetResult: null, discardedFindings: []});
  const {vmResult, board} = view(w);
  const plan = vmResult.tasks.find(t => t.processNumber === "31" && /Plan Anual/.test(t.officialName || "") && /Octubre 2025/.test(t.periodLabel));
  assert.ok(plan);
  assert.equal(plan.level, board.all.find(t => t.id === plan.id).level);
  const row = vmResult.processes.find(p => p.id === "UGPA-31");
  const first = board.all.filter(t => t.processNumber === "31" && t.status !== "done")
    .sort((a, b) => w.PriorityQueue.score(b) - w.PriorityQueue.score(a))[0];
  assert.equal(row.priority, first.level);
});

// ---------- Detección ----------
test("un PDF codificado con fecha de otro período no acredita el documento", () => {
  const period = PRO70 + "/UGPA-PRO-70-Abril 2026 – Septiembre 2026";
  const data = scan("UGPA", [period], [period + "/UGPA-RGI2-01-PRO-70-2025-10-Plan-Capacitaciones.pdf"]);
  const w = boot({ugpaResult: data, utetResult: null, discardedFindings: []});
  const findings = w.RuleRequiredDocuments.run({scope: "UGPA", scanData: data});
  const plan = findings.find(f => /Plan Semestral/.test(f.missingFileName));
  assert.ok(plan);
  assert.match(plan.candidateFileName, /2025-10/);
});

test("las actas emitidas por SISACAD acreditan el acta de titulación", () => {
  const p93 = "PROCESOS MISIONALES/EJECUCION/UTET-PRO-93-Ejecución del Examen Complexivo/UTET-PRO-93-Acta de titulación por examen Complexivo/UTET-PRO-93-Octubre 2025 - Marzo 2026";
  const data = scan("UTET", [p93], [p93 + "/ACTA_COMPLEX_0000000001_ESTUDIANTE_FICTICIO_CX-2026-0000-05-0001_2025-10__2026-03.pdf"]);
  const w = boot({ugpaResult: null, utetResult: data, discardedFindings: []});
  const findings = w.RuleRequiredDocuments.run({scope: "UTET", scanData: data});
  assert.ok(!findings.some(f => /Acta de Titulación por Examen Complexivo/.test(f.missingFileName)));
});

test("el Acuerdo de Patrocinio individual no se cuenta como una capacitación", () => {
  const p134 = "PROCESOS MISIONALES/EJECUCION Y MEDICION DE CAPACITACION DOCENTE/UGPA-PRO-134-Ejecucion-de-Capacitacion-Docente/UGPA-PRO-134-Octubre 2025 - Marzo 2026";
  const acuerdo = p134 + "/UGPA-RGI2-PRO-134-Acuerdo de Patrocinio/UGPA-RGI2-PRO-134-Taller Ficticio";
  const data = scan("UGPA", [acuerdo], [
    acuerdo + "/UGPA-RGI2-01-PRO-134-2026-03-Docente Ficticio Uno.pdf",
    acuerdo + "/UGPA-RGI2-02-PRO-134-2026-03-Docente Ficticio Dos.pdf"
  ]);
  const w = boot({ugpaResult: data, utetResult: null, discardedFindings: []});
  const rule = w.RuleRG002 || Object.values(w).find(v => v && v.id === "RG-002");
  const findings = rule.run({scope: "UGPA", scanData: data});
  assert.equal(findings.filter(f => /Docente Ficticio/.test(f.actualValue)).length, 0);
});
