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
