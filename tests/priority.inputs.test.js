"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {DocumentInputs:inputs}=require("../screens/priority/priority.inputs-model");
const {DraftModel:model}=require("../screens/priority/priority.draft-model");
test("insumos proponen datos desde hojas sin editar el borrador",()=>{
  const draft=model.create({scope:"UTET",title:"Informe",expectedTemplate:"UTET-INF-01"},"2026");
  const found=inputs.suggestions(draft,{text:"",tables:[{rows:[["Campus","Matriz"],["Resultados","62 participantes"]]}]},model);
  assert.equal(found.find(f=>f.label==="Sede").text,"Matriz");
  assert.equal(draft.fields.find(f=>f.label==="Sede").text,"");
});
test("pegar Markdown o celdas Excel conserva filas y columnas",()=>{
  for(const input of ["|Fecha|Sede|\n|---|---|\n|10/05/2026|Sur|","Fecha\tSede\n10/05/2026\tSur"])
    assert.deepEqual(inputs.pastedTable(input)[0].rows,[["Fecha","Sede"],["10/05/2026","Sur"]]);
  assert.deepEqual(inputs.pastedTable("Una nota ordinaria."),[]);
});
test("cronograma mantiene título, cierre y actividades simultáneas; la incorporación es explícita",()=>{
  const s=inputs.schedule;
  assert.match(s.name,/Mayo 2025/);assert.equal(s.rows.length,18);
  assert.deepEqual(s.rows[13].slice(1),s.rows[14].slice(1));
  assert.equal(s.rows.at(-1)[2],"02/07/2026");
  const d=model.create({title:"Cronograma",scope:"UTET"},"Período elegido");
  assert.deepEqual(model.output(d).tables,[]);
  d.tables=[s];assert.equal(model.output(d).tables[0].rows.length,18);
});
