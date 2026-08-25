"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const extension = path.resolve(process.env.COBRINHA_EXTENSION_ROOT || process.argv[2] || path.join(__dirname, "..", "extension-src"));
const read = (file) => fs.readFileSync(path.join(extension, file), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const releasePath = path.join(extension, "release-files.json");
const release = fs.existsSync(releasePath) ? JSON.parse(fs.readFileSync(releasePath, "utf8")) : null;

assert.equal(manifest.manifest_version, 3, "O pacote não usa Manifest V3");
assert.equal(manifest.name, "Cobrinha Encasquetada", "Nome inesperado no manifesto");
assert.match(manifest.version, /^\d+\.\d+(?:\.\d+)?$/, "Versão inválida no manifesto");
assert.ok(!manifest.host_permissions.includes("<all_urls>"), "Permissão global proibida");
assert.ok(manifest.host_permissions.every((entry) => /^\*:\/\/slither\.(?:io|com)\//.test(entry) || /^https:\/\/(?:cobrinhaencasquetada\.lovable\.app|api\.github\.com|raw\.githubusercontent\.com)\//.test(entry)), "Domínio inesperado nas permissões");

const resources = [manifest.background.service_worker, manifest.action.default_popup]
  .concat(manifest.content_scripts.flatMap((entry) => (entry.js || []).concat(entry.css || [])))
  .filter(Boolean);
resources.forEach((file) => assert.ok(fs.existsSync(path.join(extension, file)), `Recurso ausente: ${file}`));
if (release) resources.forEach((file) => assert.ok(release.files.includes(file), `Recurso fora da lista de release: ${file}`));

const backup = read("settings-backup.js");
const team = read("team-lovable.js");
const controls = read("panel-controls.js");
const onboarding = read("onboarding.js");
assert.ok(backup.includes("SENSITIVE_KEY"), "Backup não filtra dados privados");
assert.ok(team.includes("cobrinhaBackendStatus"), "Monitor do backend ausente");
assert.ok(controls.includes('aria-expanded'), "Menu de configurações sem estado acessível");
assert.ok(onboarding.includes('aria-labelledby'), "Configuração inicial sem título acessível");

console.log(`OK: extensão v${manifest.version} validada em ${extension}`);
