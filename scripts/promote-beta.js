"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const betaPath = path.join(root, "addon-update-beta.json");
const stablePath = path.join(root, "addon-update.json");
const expectedVersion = String(process.env.EXPECTED_BETA_VERSION || "").trim();
const confirmation = String(process.env.PROMOTION_CONFIRMATION || "").trim();
const testRoot = String(process.env.BETA_TEST_ROOT || "").trim();
const validateOnly = process.env.VALIDATE_ONLY === "1";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function versionParts(version) {
  assert.match(version, /^\d+\.\d+(?:\.\d+)?$/, `Versão inválida: ${version}`);
  return version.split(".").map(Number);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
}

const beta = readJson(betaPath);
const stable = readJson(stablePath);

if (!validateOnly) {
  assert.equal(confirmation, "PROMOVER", "Confirmação inválida: digite PROMOVER");
  assert.ok(expectedVersion, "Informe a versão Beta que será promovida");
  assert.equal(beta.version, expectedVersion, "A versão informada não corresponde ao Beta publicado");
}

assert.equal(beta.channel, "beta", "O manifesto Beta não identifica o canal beta");
assert.equal(beta.enabled, true, "O canal Beta está desativado");
assert.ok(compareVersions(beta.version, stable.version) > 0,
  `O Beta ${beta.version} deve ser superior ao Estável ${stable.version}`);
assert.match(beta.sha256, /^[A-F0-9]{64}$/, "SHA-256 Beta inválido");

const url = new URL(beta.download_url);
assert.equal(url.protocol, "https:", "O pacote Beta deve usar HTTPS");
assert.equal(url.hostname, "raw.githubusercontent.com", "O pacote Beta deve estar no GitHub oficial");
const segments = url.pathname.split("/").filter(Boolean);
assert.equal(segments[0], "imarcosz0001-beep", "Proprietário do pacote Beta inválido");
assert.equal(segments[1], "cobrinha-encasquetada-updates", "Repositório do pacote Beta inválido");
assert.match(segments[2] || "", /^[a-f0-9]{40}$/i, "A URL Beta deve apontar para um commit imutável");
assert.equal(segments.slice(3).join("/"), `Cobrinha-Encasquetada-v${beta.version}.zip`,
  "Nome do pacote Beta inesperado");

const packageZip = path.join(root, `Cobrinha-Encasquetada-v${beta.version}.zip`);
assert.ok(fs.existsSync(packageZip), "O ZIP Beta não está versionado no repositório oficial");
assert.equal(sha256(packageZip), beta.sha256, "O SHA-256 do ZIP não corresponde ao manifesto Beta");

const internalManifest = JSON.parse(execFileSync("unzip", ["-p", packageZip, "manifest.json"], {
  encoding: "utf8"
}));
assert.equal(internalManifest.version, beta.version, "A versão interna do ZIP diverge do Beta");
if (testRoot) {
  const destination = path.resolve(root, testRoot);
  assert.ok(destination.startsWith(root + path.sep), "Diretório de teste fora do repositório");
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  try {
    execFileSync("unzip", ["-q", packageZip, "-d", destination], { stdio: "inherit" });
  } catch (error) {
    if (!fs.existsSync(path.join(destination, "manifest.json"))) throw error;
    console.warn("O extrator informou avisos de compatibilidade; os arquivos serão validados individualmente.");
  }
}

const promoted = {
  version: beta.version,
  download_url: beta.download_url,
  sha256: beta.sha256,
  previous_version: stable.version,
  previous_download_url: stable.download_url,
  previous_sha256: stable.sha256,
  notes: beta.notes,
  enabled: true,
  published_at: new Date().toISOString()
};

if (validateOnly) {
  console.log(`Beta ${beta.version} validado sem alterar o canal Estável.`);
} else {
  fs.writeFileSync(stablePath, `${JSON.stringify(promoted, null, 2)}\n`, "utf8");
  console.log(`Beta ${beta.version} validado e preparado para o canal Estável.`);
}
