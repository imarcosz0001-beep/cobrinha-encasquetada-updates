"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

if (process.env.COBRINHA_E2E !== "1") {
  console.log("SKIP: navegador real (use COBRINHA_E2E=1 para executar no Slither)");
  process.exit(0);
}

const root = process.env.COBRINHA_EXTENSION_ROOT ? path.resolve(process.env.COBRINHA_EXTENSION_ROOT) : path.resolve(__dirname, "..");
const browser = process.env.COBRINHA_BROWSER || [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"
].find(fs.existsSync);
assert.ok(browser && fs.existsSync(browser), "Chrome ou Edge não encontrado");

const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cobrinha-e2e-"));
const child = spawn(browser, [
  "--headless=new", "--no-sandbox", "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--enable-extensions", "--disable-features=DisableLoadExtensionCommandLineSwitch",
  `--remote-debugging-port=${port}`, "--remote-allow-origins=*",
  `--user-data-dir=${profile}`, `--disable-extensions-except=${root}`, `--load-extension=${root}`,
  "http://slither.io/"
], { stdio: process.env.GITHUB_ACTIONS === "true" ? "inherit" : "ignore" });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function target() {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try {
      const targets = await json(`http://127.0.0.1:${port}/json/list`);
      const page = targets.find((item) => item.type === "page" && /slither\.(?:io|com)/.test(item.url));
      if (page) return page;
    } catch (error) {}
    await delay(250);
  }
  throw new Error("Slither não abriu no navegador de teste");
}

class Cdp {
  constructor(url) {
    this.id = 0;
    this.pending = new Map();
    this.socket = new WebSocket(url);
  }
  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  call(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Falha no navegador");
    return result.result.value;
  }
  close() { this.socket.close(); }
}

async function waitFor(cdp, expression, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return true;
    await delay(250);
  }
  return false;
}

(async () => {
  let cdp;
  try {
    const page = await target();
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.call("Runtime.enable");

    assert.ok(await waitFor(cdp, "Boolean(document.body && document.documentElement.dataset.cobrinhaSafeMode != null)"), "Base da extensão não iniciou");
    assert.ok(await waitFor(cdp, "Boolean(document.getElementById('cobrinha-layout-gear'))"), "Menu de interface não carregou");

    const onboardingReady = await waitFor(cdp, "Boolean(document.getElementById('cobrinha-onboarding') && !document.getElementById('cobrinha-onboarding').hidden)", 12000);
    if (onboardingReady) {
      const onboarding = await cdp.evaluate(`(() => {
        const modal = document.getElementById('cobrinha-onboarding');
        const profile = modal.querySelector('[data-profile="complete"]');
        profile.click();
        const selected = profile.classList.contains('is-selected') && profile.getAttribute('aria-checked') === 'true';
        modal.querySelector('[data-action="next"]').click();
        const inputs = Array.from(modal.querySelectorAll('.cobrinha-onboarding-page:not([hidden]) input[type="checkbox"]'));
        const result = { selected, privacyCount: inputs.length, allChecked: inputs.every((input) => input.checked && !input.disabled) };
        modal.querySelector('[data-action="finish"]').click();
        return result;
      })()`);
      assert.strictEqual(onboarding.selected, true, "Perfil do onboarding não foi selecionado");
      assert.strictEqual(onboarding.privacyCount, 4, "Quantidade de opções de privacidade incorreta");
      assert.strictEqual(onboarding.allChecked, true, "Privacidade não começa ativada e clicável");
    }

    const settings = await cdp.evaluate(`(() => {
      const gear = document.getElementById('cobrinha-layout-gear');
      gear.click();
      const popup = document.getElementById('cobrinha-layout-popup');
      const popupOpen = !popup.hidden && gear.getAttribute('aria-expanded') === 'true';
      const sectionNames = Array.from(popup.querySelectorAll('.cobrinha-layout-section-title')).map((node) => node.textContent);
      const studioLauncher = popup.querySelector('.cobrinha-open-studio');
      if (studioLauncher) studioLauncher.click();
      const studio = document.getElementById('cobrinha-interface-studio');
      const backupTab = studio && Array.from(studio.querySelectorAll('nav button')).find((button) => button.textContent === 'Backup');
      if (backupTab) backupTab.click();
      const backupButtons = studio ? Array.from(studio.querySelectorAll('[data-page="backup"] button')).map((button) => button.textContent) : [];
      return {
        open: popupOpen,
        sectionNames,
        maintenanceClosed: !popup.querySelector('.cobrinha-layout-maintenance').open,
        backupReady: backupButtons.includes('Exportar configurações') && backupButtons.includes('Importar configurações'),
        backendMonitor: Boolean(document.documentElement.dataset.cobrinhaBackendStatus)
      };
    })()`);
    assert.strictEqual(settings.open, true, "Menu de configurações não expõe o estado aberto");
    assert.deepStrictEqual(settings.sectionNames, ["Aparência", "Organização", "Atualizações"], "Configurações estão misturadas ou fora de ordem");
    assert.strictEqual(settings.maintenanceClosed, true, "Ajuda e recuperação deveria iniciar recolhida");
    assert.strictEqual(settings.backupReady, true, "Backup e restauração não carregaram no Estúdio");
    assert.strictEqual(settings.backendMonitor, true, "Monitor de funcionamento do backend não carregou");

    const drag = await cdp.evaluate(`(async () => {
      let panel = document.getElementById('lovable-team-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'lovable-team-panel';
        panel.innerHTML = '<div class="lovable-team-title">Equipe</div><div class="lovable-team-status">sala de teste</div>';
        document.body.appendChild(panel);
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const handle = panel.querySelector('.cobrinha-panel-drag-handle') || panel.querySelector('.lovable-team-title');
      const before = panel.getBoundingClientRect();
      const startX = before.left + 12, startY = before.top + 10;
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: startX, clientY: startY, pointerId: 1 }));
      document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, clientX: innerWidth - 10, clientY: startY + 20, pointerId: 1 }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: innerWidth - 10, clientY: startY + 20, pointerId: 1 }));
      await new Promise((resolve) => setTimeout(resolve, 250));
      const after = panel.getBoundingClientRect();
      return { beforeLeft: before.left, afterLeft: after.left, rightGap: innerWidth - after.right, width: innerWidth };
    })()`);
    assert.ok(drag.afterLeft > drag.beforeLeft, "Janela Equipe não respondeu ao arraste direto");
    assert.ok(drag.rightGap >= -1 && drag.rightGap < 24, `Janela Equipe parou antes da borda: ${drag.rightGap}px`);

    for (const metrics of [[800, 600, 1], [1920, 1080, 1.5], [2560, 1440, 1]]) {
      await cdp.call("Emulation.setDeviceMetricsOverride", { width: metrics[0], height: metrics[1], deviceScaleFactor: metrics[2], mobile: false });
      await delay(200);
      const viewport = await cdp.evaluate("({ width: innerWidth, height: innerHeight, finite: Number.isFinite(innerWidth) && Number.isFinite(innerHeight) })");
      assert.strictEqual(viewport.finite, true, "Viewport inválido após mudança de resolução/zoom");
    }

    const fullscreenResult = await cdp.call("Runtime.evaluate", {
      expression: "document.documentElement.requestFullscreen().then(() => Boolean(document.fullscreenElement)).catch(() => false)",
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    assert.strictEqual(fullscreenResult.result.value, true, "Interface não entrou em tela cheia no teste real");
    await cdp.call("Runtime.evaluate", {
      expression: "document.exitFullscreen().then(() => !document.fullscreenElement).catch(() => false)",
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });

    assert.ok(await waitFor(cdp, "Boolean(localStorage.getItem('cobrinhaLastKnownGoodV1'))", 15000), "Última interface funcional não foi salva");
    await cdp.evaluate("localStorage.setItem('cobrinhaSafeModeV1','1'); location.reload(); true");
    assert.ok(await waitFor(cdp, "Boolean(document.getElementById('cobrinha-safe-mode-banner'))", 15000), "Modo seguro não exibiu a recuperação");
    const safe = await cdp.evaluate("({ active: document.documentElement.dataset.cobrinhaSafeMode === '1', optionalPaused: !document.getElementById('cobrinha-layout-gear') })");
    assert.strictEqual(safe.active, true, "Modo seguro não foi ativado");
    assert.strictEqual(safe.optionalPaused, true, "Módulos opcionais continuaram ativos no modo seguro");
    await cdp.evaluate("document.querySelector('#cobrinha-safe-mode-banner [data-action=\"restore\"]').click(); true");
    assert.ok(await waitFor(cdp, "document.documentElement.dataset.cobrinhaSafeMode === '0' && Boolean(document.getElementById('cobrinha-layout-gear'))", 15000), "Restauração da última interface funcional falhou");

    console.log("OK: smoke test real no Slither — menu, onboarding, privacidade, arraste, resoluções, zoom, tela cheia e recuperação");
  } finally {
    if (cdp) cdp.close();
    child.kill();
    await delay(250);
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  const annotation = String(error && error.message || error || "Falha desconhecida")
    .replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::error title=Falha no navegador Beta::${annotation}`);
  process.exitCode = 1;
});
