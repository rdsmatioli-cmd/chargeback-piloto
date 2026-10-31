#!/usr/bin/env node
// Fluxo do app (index.html) no Chrome de verdade, com o formulário visível, em 390 e 1280 px (CB-12 de 31/10).
// O Lighthouse e o html-validate só veem o estado inicial (main e #form com hidden); este teste marca o A-1,
// passa pelas recusas, adiciona fato, seleciona arquivos, gera, altera e confere a invalidação, e roda o
// axe-core em cada etapa, exigindo 0 violação (WCAG 2.0/2.1/2.2 A e AA e best-practice).
//
// Sem dependências: Chrome headless controlado por CDP com o WebSocket nativo do Node 22, e axe-core baixado
// por `npm pack` na versão fixa, com o sha512 do tarball conferido antes de usar (o mesmo do `integrity` do npm).
// O nome não termina em .test.mjs para o `node --test .github/testes/*.test.mjs` não depender de Chrome nem de rede.
//
// Uso, da raiz: node .github/testes/fluxo-navegador.mjs   (saída 0 ok, 1 falha)
// Variáveis opcionais: CHROME_PATH (Chrome ou Chromium; padrão: CHROME_BIN do runner do GitHub ou
// google-chrome/chromium no PATH) e AXE_TGZ (tarball do axe-core já baixado; conferido do mesmo jeito).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve, extname, delimiter, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const AXE = { pacote: 'axe-core@4.14.0', sha512: '9WTZxEjsZ7b13TH8JPmbV2z8CHbl80/2hm3XPEG4JgNdQLK81IBRXmSxHfMAOkSqQeRxT/0dwNDz2GOm3zzpcQ==' };
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const TELAS = [{ nome: '390 px', width: 390, height: 844, mobile: true, deviceScaleFactor: 3 }, { nome: '1280 px', width: 1280, height: 900, mobile: false, deviceScaleFactor: 1 }];
const raiz = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const tmp = mkdtempSync(join(tmpdir(), 'fluxo-navegador-'));

// axe-core: npm pack na versão fixa, sha512 conferido e axe.min.js tirado do tar (formato ustar) sem dependências.
function axeFonte() {
  let tgz = process.env.AXE_TGZ;
  if (!tgz) {
    const r = spawnSync('npm', ['pack', AXE.pacote, '--pack-destination', tmp, '--json'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`npm pack ${AXE.pacote} falhou: ${r.stderr || r.error}`);
    tgz = join(tmp, JSON.parse(r.stdout)[0].filename);
  }
  const buf = readFileSync(tgz);
  const sha = createHash('sha512').update(buf).digest('base64');
  if (sha !== AXE.sha512) throw new Error(`${AXE.pacote}: sha512 do tarball não confere (${sha})`);
  const tar = gunzipSync(buf);
  for (let off = 0; off + 512 <= tar.length;) {
    const campo = (i, n) => tar.toString('utf8', off + i, off + i + n).replace(/\0.*$/s, '');
    const nome = campo(0, 100);
    if (!nome) break;
    const tam = parseInt(campo(124, 12).trim() || '0', 8);
    const prefixo = campo(345, 155);
    if ((prefixo ? `${prefixo}/${nome}` : nome) === 'package/axe.min.js') return tar.toString('utf8', off + 512, off + 512 + tam);
    off += 512 + Math.ceil(tam / 512) * 512;
  }
  throw new Error(`${AXE.pacote}: package/axe.min.js não está no tarball`);
}

// Chrome: CHROME_PATH, CHROME_BIN (runner do GitHub) ou o primeiro do PATH.
function chrome() {
  for (const v of [process.env.CHROME_PATH, process.env.CHROME_BIN]) if (v && existsSync(v)) return v;
  for (const nome of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) {
    for (const dir of (process.env.PATH || '').split(delimiter)) if (dir && existsSync(join(dir, nome))) return join(dir, nome);
  }
  throw new Error('Chrome não encontrado: defina CHROME_PATH');
}

// Servidor estático da raiz do repositório, como o GitHub Pages (pasta -> index.html).
const TIPOS = { '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.png': 'image/png' };
function servidor() {
  return createServer(async (req, res) => {
    try {
      const caminho = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      let arq = resolve(raiz, '.' + caminho);
      if (caminho.split('/').some((p) => p.startsWith('.')) || (arq !== raiz && !arq.startsWith(raiz + sep))) { res.writeHead(404); return res.end(); }
      if (statSync(arq, { throwIfNoEntry: false })?.isDirectory()) arq = join(arq, 'index.html');
      const corpo = await readFile(arq);
      res.writeHead(200, { 'Content-Type': TIPOS[extname(arq)] || 'application/octet-stream' });
      res.end(corpo);
    } catch { res.writeHead(404); res.end(); }
  });
}

// Cliente CDP mínimo: comandos com id, eventos para quem espera, sessões planas (flatten).
class CDP {
  constructor(url) { this.url = url; this.n = 0; this.pendentes = new Map(); this.ouvintes = new Set(); }
  abrir() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pendentes.has(m.id)) {
        const p = this.pendentes.get(m.id); this.pendentes.delete(m.id);
        if (m.error) p.erro(new Error(`${p.metodo}: ${m.error.message}`)); else p.ok(m.result);
      } else for (const f of this.ouvintes) f(m);
    };
    return new Promise((ok, erro) => { this.ws.onopen = ok; this.ws.onerror = () => erro(new Error('CDP: WebSocket não abriu')); });
  }
  enviar(metodo, params = {}, sessionId) {
    const id = ++this.n;
    this.ws.send(JSON.stringify({ id, method: metodo, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((ok, erro) => this.pendentes.set(id, { ok, erro, metodo }));
  }
  esperar(metodo, sessionId, ms = 15000) {
    return new Promise((ok, erro) => {
      const f = (m) => { if (m.method === metodo && m.sessionId === sessionId) { this.ouvintes.delete(f); clearTimeout(t); ok(m.params); } };
      const t = setTimeout(() => { this.ouvintes.delete(f); erro(new Error(`CDP: ${metodo} não chegou em ${ms} ms`)); }, ms);
      this.ouvintes.add(f);
    });
  }
  fechar() { this.ws?.close(); }
}

let srv, base, proc, cdp, axe;
before(async () => {
  axe = axeFonte();
  srv = servidor();
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${srv.address().port}`;
  proc = spawn(chrome(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${join(tmp, 'perfil')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const ws = await new Promise((ok, erro) => {
    let saida = '';
    const t = setTimeout(() => erro(new Error(`Chrome não abriu a porta de depuração:\n${saida}`)), 30000);
    proc.stderr.on('data', (d) => { saida += d; const m = saida.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); ok(m[1]); } });
    proc.on('exit', (c) => { clearTimeout(t); erro(new Error(`Chrome saiu com ${c}:\n${saida}`)); });
  });
  cdp = new CDP(ws);
  await cdp.abrir();
});
after(() => {
  cdp?.fechar();
  proc?.kill('SIGKILL');
  srv?.close();
  rmSync(tmp, { recursive: true, force: true });
});

// Abre o app numa aba com a tela dada e devolve as ações do usuário e as consultas à página.
async function abrir(tela) {
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true });
  const env = (m, p) => cdp.enviar(m, p, sessionId);
  const erros = [];
  cdp.ouvintes.add((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') erros.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') erros.push(m.params.entry.text);
  });
  await Promise.all([env('Page.enable'), env('Runtime.enable'), env('Log.enable'), env('DOM.enable')]);
  await env('Emulation.setDeviceMetricsOverride', { width: tela.width, height: tela.height, deviceScaleFactor: tela.deviceScaleFactor, mobile: tela.mobile });
  const carregou = cdp.esperar('Page.loadEventFired', sessionId);
  await env('Page.navigate', { url: `${base}/` });
  await carregou;
  const js = async (expr) => {
    const r = await env('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`na página: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}\n${expr}`);
    return r.result.value;
  };
  const p = {
    js, erros,
    async fechar() { await cdp.enviar('Target.closeTarget', { targetId }); },
    // Clique de mouse no centro do elemento, depois de trazê-lo para a tela: se outro elemento o cobre, o clique
    // vai para o outro e o teste percebe.
    async clicar(id) {
      const r = await js(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
      for (const type of ['mousePressed', 'mouseReleased']) await env('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
    },
    // Digitação: foco pelo clique, texto atual selecionado e o novo inserido como teclado (gera input).
    async digitar(id, texto) {
      await p.clicar(id);
      await js(`document.getElementById(${JSON.stringify(id)}).select()`);
      await env('Input.insertText', { text: texto });
    },
    // select e data: o seletor nativo não se controla pelo CDP; valor e eventos como o navegador os dispara.
    async escolher(id, valor) {
      await js(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.focus(); e.value = ${JSON.stringify(valor)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    },
    async anexar(nomes) {
      const arquivos = nomes.map((n) => { const f = join(tmp, n); writeFileSync(f, 'teste'); return f; });
      const { root } = await env('DOM.getDocument', { depth: 0 });
      const { nodeId } = await env('DOM.querySelector', { nodeId: root.nodeId, selector: '#docs' });
      await env('DOM.setFileInputFiles', { nodeId, files: arquivos });
    },
    valorMotivo: (bandeira, codigo) => js(`[...document.getElementById('motivo').options].find((o) => o.textContent.startsWith('Motivo ${codigo} da ${bandeira}:')).value`),
    foco: () => js('document.activeElement.id'),
    visivel: (id) => js(`(() => { const e = document.getElementById(${JSON.stringify(id)}); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; })()`),
    texto: (id) => js(`document.getElementById(${JSON.stringify(id)}).textContent`),
    // Elemento inteiro dentro da janela (é o que o usuário de celular vê sem rolar).
    naTela: (id) => js(`(() => { const b = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return b.height > 0 && b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth; })()`),
    // axe-core injetado pelo CDP (o Runtime.evaluate não passa pela CSP da página) e rodado no documento inteiro.
    async axe() {
      if (!(await js('typeof axe !== "undefined"'))) await js(axe);
      return js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(AXE_TAGS)} }, resultTypes: ['violations'] })
        .then((r) => r.violations.map((v) => \`\${v.id} (\${v.impact}): \${v.nodes.map((n) => n.target.join(' ')).join(', ')}\`))`);
    },
    // CB-11: fonte dos controles >= 16 px e alvo >= 44 px de altura (caixa de seleção >= 24 x 24), nos visíveis.
    controlesPequenos: () => js(`[...document.querySelectorAll('input, select, textarea, button')].filter((e) => e.getClientRects().length).flatMap((e) => {
      const s = getComputedStyle(e), b = e.getBoundingClientRect(), nome = e.id || e.getAttribute('aria-label') || e.type, r = [];
      if (parseFloat(s.fontSize) < 16) r.push(\`\${nome}: fonte \${s.fontSize}\`);
      if (e.type === 'checkbox') { if (b.width < 24 || b.height < 24) r.push(\`\${nome}: \${b.width}x\${b.height}\`); }
      else if (b.height < 44) r.push(\`\${nome}: altura \${b.height}\`);
      return r;
    })`)
  };
  await js(`new Promise((ok, erro) => { const t = Date.now(); (function v() { if (!document.querySelector('main').hidden) return ok(); if (Date.now() - t > 10000) return erro(new Error('main continua oculto: o script não rodou (CSP?)')); setTimeout(v, 50); })(); })`);
  return p;
}

async function semViolacoes(p, etapa) {
  assert.deepEqual(await p.axe(), [], `axe-core em "${etapa}"`);
}
// Mensagem do campo (CB-08): visível, dentro da tela, ligada ao campo, com o campo focado.
async function erroNoCampo(p, id, re) {
  assert.ok(await p.visivel(`${id}-erro`), `${id}-erro visível`);
  assert.match(await p.texto(`${id}-erro`), re);
  assert.ok(await p.naTela(`${id}-erro`), `${id}-erro dentro da tela`);
  assert.ok(await p.naTela(id), `${id} dentro da tela`);
  assert.equal(await p.foco(), id);
  assert.equal(await p.js(`document.getElementById('${id}').getAttribute('aria-invalid')`), 'true');
  assert.equal(await p.js(`document.getElementById('${id}').getAttribute('aria-describedby')`), `${id}-erro`);
}

for (const tela of TELAS) {
  test(`fluxo no Chrome em ${tela.nome}: formulário visível, mensagens junto do campo e axe-core sem violação`, async () => {
    const p = await abrir(tela);
    try {
      await semViolacoes(p, 'estado inicial');
      assert.equal(await p.visivel('form'), false);

      await p.clicar('a1');
      assert.ok(await p.visivel('form'), 'A-1 mostra o formulário');
      await semViolacoes(p, 'formulário visível');
      assert.deepEqual(await p.controlesPequenos(), [], 'CB-11: fonte e alvo dos controles');
      assert.equal(await p.visivel('previa'), false, 'CB-11: prévia vazia oculta');

      // CB-08: Gerar sem pedido.
      await p.clicar('gerar');
      await erroNoCampo(p, 'pedido', /^Informe a identificação do pedido\.$/);
      await semViolacoes(p, 'erro no pedido');
      await p.digitar('pedido', 'PED-1');
      assert.equal(await p.visivel('pedido-erro'), false, 'digitar limpa a mensagem');

      // CB-08: Gerar sem motivo; depois o motivo.
      await p.clicar('gerar');
      await erroNoCampo(p, 'motivo', /motivo/);
      await p.escolher('motivo', await p.valorMotivo('Visa', '10.4'));
      assert.equal(await p.visivel('motivo-erro'), false);

      // CB-09: fato sem data e sem descrição; depois o fato completo.
      await p.clicar('add-fato');
      await erroNoCampo(p, 'fato-data', /^Informe a data do fato/);
      assert.match(await p.texto('fato-desc-erro'), /^Descreva o fato\.$/);
      await semViolacoes(p, 'erros do fato');
      await p.escolher('fato-data', '2026-10-01');
      await p.digitar('fato-desc', 'Pedido entregue no endereço informado');
      await p.clicar('add-fato');
      assert.equal(await p.js(`document.querySelectorAll('#lista-fatos li').length`), 1);
      assert.equal(await p.texto('fato-status'), 'Fato adicionado.');
      assert.equal(await p.foco(), 'fato-data');

      // CB-10: nome de arquivo com termo vedado avisa na seleção; a nova seleção sem ele limpa.
      await p.anexar(['nota-fiscal.pdf', 'processo-entrega.pdf']);
      assert.ok(await p.visivel('docs-erro'));
      assert.match(await p.texto('docs-erro'), /D2 \(processo-entrega\.pdf\).*Renomeie o arquivo/);
      assert.ok(await p.naTela('docs-erro'), 'docs-erro dentro da tela');
      await semViolacoes(p, 'erro nos documentos');
      await p.anexar(['nota-fiscal.pdf', 'rastreio.pdf']);
      assert.equal(await p.visivel('docs-erro'), false);
      await p.js(`document.querySelector('#vinculos input').id = 'vinculo-1'`);
      await p.clicar('vinculo-1');

      // Gera, marca a D-1, Baixar habilitado; alteração descarta tudo (CB-01) e a prévia vazia some (CB-11).
      await p.clicar('gerar');
      assert.match(await p.texto('previa'), /^Pedido: PED-1$/m);
      assert.ok(await p.visivel('etapa-d1'));
      assert.equal(await p.js(`document.getElementById('baixar').disabled`), true);
      await p.clicar('d1');
      assert.equal(await p.js(`document.getElementById('baixar').disabled`), false);
      await semViolacoes(p, 'dossiê gerado');
      assert.deepEqual(await p.controlesPequenos(), [], 'CB-11: fonte e alvo com o dossiê gerado');
      await p.digitar('pedido', 'PED-2');
      assert.equal(await p.visivel('previa'), false, 'alteração descarta a prévia');
      assert.equal(await p.visivel('etapa-d1'), false);
      assert.equal(await p.js(`document.getElementById('baixar').disabled`), true);

      // CB-10: termo vedado no pedido: o dossiê sai na tela, sem Baixar, e o campo é apontado.
      await p.digitar('pedido', 'processo 77');
      await p.clicar('gerar');
      await erroNoCampo(p, 'pedido', /processo/);
      assert.match(await p.texto('aviso'), /processo \(no pedido\)/);
      await semViolacoes(p, 'termo vedado no pedido');

      assert.deepEqual(p.erros, [], 'nenhum erro no console');
    } finally {
      await p.fechar();
    }
  });
}
