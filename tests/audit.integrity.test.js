"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const { scanFolderDirectory } = require("../core/archive/archive.scan");
const { importArchiveFile } = require("../core/archive/archive.extract");
let directory;
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === "electron") return { app: { getPath: () => directory } };
  return originalLoad.call(this, name, ...args);
};
const history = require("../core/history/history.store");
const signatures = require("../core/signatures/signature.service");
Module._load = originalLoad;

async function setup(t) {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "audit-regression-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
}

test("el historial serializa cambios y conserva un archivo dañado", async t => {
  await setup(t);
  await Promise.all([history.setSourcePath("UGPA", "unidad-a"), history.setSourcePath("UTET", "unidad-b")]);
  const saved = await history.loadHistory();
  assert.equal(saved.ugpaSourcePath, "unidad-a");
  assert.equal(saved.utetSourcePath, "unidad-b");
  await fs.writeFile(history.getHistoryFilePath(), "{");
  await assert.rejects(history.setSourcePath("UGPA", "otro"), /historial está dañado/);
  assert.equal(await fs.readFile(history.getHistoryFilePath(), "utf8"), "{");
});

test("un ZIP dañado conserva la extracción anterior", async t => {
  await setup(t);
  const current = path.join(directory, "current");
  const archivePath = path.join(directory, "bad.zip");
  await fs.mkdir(current);
  await fs.writeFile(path.join(current, "old.pdf"), "original");
  await fs.writeFile(archivePath, "invalid");
  await assert.rejects(importArchiveFile({ type: "UTET", archivePath, workspaceRoot: directory }));
  assert.equal(await fs.readFile(path.join(current, "old.pdf"), "utf8"), "original");
  assert.deepEqual((await fs.readdir(directory)).sort(), ["bad.zip", "current"]);
});

test("firmas usa el inventario, incorpora solicitudes solapadas y señala fuentes inaccesibles", async t => {
  await setup(t);
  const validator = path.join(directory, "validator.js");
  await fs.writeFile(validator, 'process.stdout.write(JSON.stringify({status:"no-electronic-signature",cover:{version:1,status:"inspected",slots:[]}}))');
  // A Node subprocess standing in for Python receives validate_pdf.py as its script.
  // Use a preload to provide a deterministic validator on all supported platforms.
  const oldPython = process.env.AUDIT_PYTHON, oldOptions = process.env.NODE_OPTIONS;
  process.env.AUDIT_PYTHON = process.execPath;
  await fs.appendFile(validator, ";process.exit(0)");
  process.env.NODE_OPTIONS = '--require "' + validator + '"';
  t.after(() => {
    for (const [key, value] of [["AUDIT_PYTHON", oldPython], ["NODE_OPTIONS", oldOptions]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  async function inventory(type) {
    const root = path.join(directory, type);
    await fs.mkdir(path.join(root, "txt_convertidos"), { recursive: true });
    await fs.writeFile(path.join(root, "txt_convertidos", "ignorado.pdf"), "x");
    await fs.writeFile(path.join(root, "activo.pdf"), "x");
    return scanFolderDirectory({ type, folderPath: root, preserveRoot: true });
  }
  const ugpa = await inventory("UGPA"), utet = await inventory("UTET");
  await history.upsertScanResult("UGPA", ugpa);
  const first = signatures.scan();
  await history.upsertScanResult("UTET", utet);
  const [, latest] = await Promise.all([first, signatures.scan()]);
  assert.deepEqual(latest.records.map(r => r.scope).sort(), ["UGPA", "UTET"]);
  assert.ok(latest.records.every(r => r.name === "activo.pdf" && r.status === "no-electronic-signature"));
  assert.equal((await signatures.scan()).stats.reused, 2);
  const stored = path.join(directory, "signature-validation-v2.json");
  const legacy = JSON.parse(await fs.readFile(stored, "utf8"));
  for (const record of Object.values(legacy.records)) delete record.cover;
  await fs.writeFile(stored, JSON.stringify(legacy));
  assert.equal((await signatures.scan()).stats.scanned, 2);
  await fs.rm(utet.rootPath, { recursive: true });
  const partial = await signatures.scan();
  assert.ok(partial.stats.partial);
  assert.ok(partial.records.find(r => r.scope === "UTET").stale);
  assert.ok(!partial.records.find(r => r.scope === "UGPA").stale);
  assert.equal((await signatures.list()).partial, true);
});
