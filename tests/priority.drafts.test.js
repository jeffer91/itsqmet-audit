"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {DraftModel:model} = require("../screens/priority/priority.draft-model");
const task = {scope:"UTET",processNumber:"95",documentId:"inf",officialName:"Informe final",expectedTemplate:"UTET-INF-0X-PRO-95-AÑO-MES"};
test("el borrador usa el período elegido y no traslada resultados históricos sin confirmación",()=>{
  const draft = model.create(task,"Mayo 2026 a Noviembre 2026");
  model.analyze(draft,"1. Resultados obtenidos\nEn 2025 hubo 170 participantes.\n2. Conclusiones\nCumplimiento parcial.");
  const result = draft.fields.find(f=>f.label === "Resultados");
  assert.match(result.candidate,/170 participantes/);
  assert.doesNotMatch(JSON.stringify(model.output(draft)),/170 participantes/);
  result.text="210 participantes confirmados.";
  assert.match(JSON.stringify(model.output(draft)),/210 participantes/);
});
test("los criterios reutilizan decisiones y equivalencias sin reutilizar cifras",()=>{
  const rules=[{label:"Asistencia por jornada",decision:"sí",alias:"Turnos"},{label:"Sede",decision:"no"}];
  const next=model.create(task,"Otro período",rules);
  model.analyze(next,"Turnos: 3");
  assert.equal(next.fields.find(f=>f.label==="Asistencia por jornada").candidate,"3");
  assert.equal(model.output(next).sections.some(s=>s.label==="Sede"),false);
  assert.notEqual(model.identity(task),model.identity({...task,processNumber:"97"}));
});
test("el ejemplo propone apartados nuevos y el acta de titulación no se confunde con ACT",()=>{
  const draft=model.create({...task,expectedTemplate:"AT-ITSQMET-UTET-AÑO-MES"},"Período");
  model.analyze(draft,"1. Observaciones por carrera\nSoftware tuvo dos jornadas.");
  assert.equal(draft.kind,"GENERAL");
  assert.equal(draft.fields.find(f=>f.label==="Observaciones por carrera").candidate,"Software tuvo dos jornadas.");
});
test("detecta referencias a rangos históricos sin reescribirlas",()=>{
  const draft=model.create(task,"Mayo 2026 a Noviembre 2026");
  model.analyze(draft,"Resultados: comparación con octubre de 2025 – marzo de 2026");
  assert.deepEqual(draft.referencePeriods,["octubre de 2025 – marzo de 2026"]);
  assert.match(draft.fields.find(f=>f.label==="Resultados").candidate,/2025/);
});
test("el motor propio distingue un informe de cumplimiento de una ficha individual",()=>{
  const compliance=model.create({scope:"UGPA",processNumber:"70",documentId:"rgi3",title:"Informe",expectedTemplate:"UGPA-RGI3"},"2026");
  const individual=model.create({scope:"UTET",processNumber:"58",documentId:"rgi1",title:"Verificación",expectedTemplate:"UTET-RGI1"},"2026");
  assert.ok(model.review(compliance).missing.includes("Plan aprobado"));
  assert.ok(model.review(individual).missing.includes("Estudiante"));
  assert.equal(model.review(individual).missing.includes("Plan aprobado"),false);
  assert.equal(model.periodKey("mayo de 2026 – noviembre de 2026"),model.periodKey("Mayo 2026 a Noviembre 2026"));
});
test("calcula la distribución por tabla y conserva las filas sin dato",()=>{
  const draft={tables:[{label:"Registro",rows:[["Sede"],["Matriz"],[""],["Matriz"]]}]};
  assert.match(model.tableFindings(draft)[0],/Matriz \(2\).*sin dato.*3 filas/);
});
