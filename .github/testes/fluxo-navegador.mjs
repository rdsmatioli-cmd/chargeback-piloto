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
// Fecha o Chrome pelo CDP e espera o processo sair antes de apagar o perfil: com o SIGKILL direto, os processos filhos
// ainda gravavam em perfil/Default e o rmSync falhava com ENOTEMPTY (o arquivo de teste saía com erro, com os testes ok).
// O rm ainda tenta de novo, para o que um filho gravar no último instante.
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
after(async () => {
  const vivo = () => proc && proc.exitCode === null && proc.signalCode === null;
  if (vivo()) {
    const saiu = new Promise((ok) => proc.once('exit', ok));
    cdp?.enviar('Browser.close').catch(() => {});
    await Promise.race([saiu, esperar(5000)]);
    if (vivo()) { proc.kill('SIGKILL'); await Promise.race([saiu, esperar(2000)]); }
  }
  cdp?.fechar();
  srv?.close();
  rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

// Abre o app numa aba com a tela dada e devolve as ações do usuário e as consultas à página.
// Opções (CB-13 e CB-17 de 01/11): caminho (com fragmento, como o '/#form' do blog), semJs (scripts da página
// desligados), antes (script que roda antes dos da página) e esperarMain (false: não espera o <main> aparecer).
async function abrir(tela, { caminho = '/', semJs = false, antes = null, esperarMain = true } = {}) {
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
  // Tela de celular aceita toque (Input.dispatchTouchEvent); o mouse continua valendo.
  if (tela.mobile) await env('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (semJs) await env('Emulation.setScriptExecutionDisabled', { value: true });
  if (antes) await env('Page.addScriptToEvaluateOnNewDocument', { source: antes });
  const carregou = cdp.esperar('Page.loadEventFired', sessionId);
  await env('Page.navigate', { url: `${base}${caminho}` });
  await carregou;
  const js = async (expr) => {
    const r = await env('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`na página: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}\n${expr}`);
    return r.result.value;
  };
  const p = {
    js, erros, sessionId,
    async fechar() { await cdp.enviar('Target.closeTarget', { targetId }); },
    // Clique de mouse no centro do elemento, depois de trazê-lo para a tela: se outro elemento o cobre, o clique
    // vai para o outro e o teste percebe.
    // rolar=false: clica onde o elemento está, sem trazê-lo ao meio da tela.
    async clicar(id, rolar = true) {
      const r = await p.centro(id, rolar);
      for (const type of ['mousePressed', 'mouseReleased']) await env('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
    },
    // Toque no centro do elemento (só em tela mobile): o Chrome gera mousedown, mouseup e click depois do touchend.
    async tocar(id, rolar = true) {
      const r = await p.centro(id, rolar);
      await env('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
      await env('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    centro: (id, rolar = true) => js(`(() => { const e = document.getElementById(${JSON.stringify(id)}); if (${rolar}) e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`),
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
    // Tab do teclado (o Chrome move o foco e rola até o elemento, como no uso real).
    async tab() {
      for (const type of ['rawKeyDown', 'keyUp']) await env('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
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
  if (esperarMain) await js(`new Promise((ok, erro) => { const t = Date.now(); (function v() { if (!document.querySelector('main').hidden) return ok(); if (Date.now() - t > 10000) return erro(new Error('main continua oculto: o script não rodou (CSP?)')); setTimeout(v, 50); })(); })`);
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
      // CB-13: no caminho normal, nem o aviso de navegador sem suporte nem o do <noscript> aparecem.
      assert.equal(await p.visivel('sem-suporte'), false, 'CB-13: #sem-suporte oculto');
      assert.equal(await p.js(`document.body.innerText.includes('precisa de JavaScript')`), false, 'CB-13: <noscript> não aparece');

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
      // Revisão do lote 2: o seletor com erro ganha a borda de erro (input[type=file]{border:0} vencia o [aria-invalid]).
      assert.deepEqual(await p.js(`(({ borderTopWidth: w, borderTopColor: c }) => [w, c])(getComputedStyle(document.getElementById('docs')))`), ['2px', 'rgb(176, 0, 32)']);
      await semViolacoes(p, 'erro nos documentos');
      await p.anexar(['nota-fiscal.pdf', 'rastreio.pdf']);
      assert.equal(await p.visivel('docs-erro'), false);
      // Revisão do lote 2: legenda de evidência em várias linhas fica dentro do fieldset (a borda de cima a cortava).
      assert.deepEqual(await p.js(`[...document.querySelectorAll('#vinculos fieldset')].filter((f) => { const l = f.querySelector('legend').getBoundingClientRect(), b = f.getBoundingClientRect(); return l.top < b.top + parseFloat(getComputedStyle(f).borderTopWidth) || l.right > b.right; }).map((f) => f.querySelector('legend').textContent.slice(0, 40))`), []);
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

// Revisão do lote 2: a saída do campo com número de cartão mostrava a nota A-3 junto do campo no mousedown do botão;
// o botão descia antes do mouseup, o clique (ou o toque) caía na nota e não chegava ao botão. O fato com cartão entra
// no primeiro clique e no primeiro toque; sem data, o mesmo clique mostra o erro da data (CB-09).
async function fatoComCartao(p, acionar) {
  const n = await p.js(`document.querySelectorAll('#lista-fatos li').length`);
  await p.escolher('fato-data', '2026-10-01');
  await p.digitar('fato-desc', 'Cliente pagou com 5555 5555 5555 4444 e recebeu');
  await acionar('add-fato');
  assert.equal(await p.js(`document.querySelectorAll('#lista-fatos li').length`), n + 1, 'o fato entra no primeiro clique');
  assert.match(await p.texto('lista-fatos'), /Cliente pagou com \*{4} \*{4} \*{4} 4444 e recebeu/);
  assert.match(await p.texto('fato-status'), /^Fato adicionado\. Removemos um dado de cartão do texto\./);
  assert.equal(await p.visivel('fato-desc-erro'), false, 'o campo vazio fica sem nota');
  await p.escolher('fato-data', '');
  await p.digitar('fato-desc', 'Outro pagamento com 4111 1111 1111 1111');
  await acionar('add-fato');
  await erroNoCampo(p, 'fato-data', /^Informe a data do fato/);
  assert.match(await p.texto('fato-desc-erro'), /^Removemos um dado de cartão do texto\./, 'A-3 junto do fato');
  assert.equal(await p.js(`document.getElementById('fato-desc').getAttribute('aria-invalid')`), null);
  assert.equal(await p.js(`document.querySelectorAll('#lista-fatos li').length`), n + 1);
}
for (const tela of TELAS) {
  test(`fato com número de cartão entra no primeiro clique${tela.mobile ? ' e no primeiro toque' : ''} em ${tela.nome}`, async () => {
    const p = await abrir(tela);
    try {
      await p.clicar('a1');
      await fatoComCartao(p, p.clicar);
      if (tela.mobile) await fatoComCartao(p, p.tocar);
      await semViolacoes(p, 'fato com cartão');
      assert.deepEqual(p.erros, [], 'nenhum erro no console');
    } finally {
      await p.fechar();
    }
  });
}

// O mesmo com o pedido e o CNPJ antes do Gerar, em tela alta (o campo e o botão visíveis juntos): na base, o clique em
// Gerar também se perdia. Gerar recusa no campo seguinte (CNPJ inválido ou motivo), e o A-3 vai para o aviso geral.
const ALTAS = [{ nome: '1280 x 1400 px', width: 1280, height: 1400, mobile: false, deviceScaleFactor: 1 }, { nome: '390 x 1400 px', width: 390, height: 1400, mobile: true, deviceScaleFactor: 3 }];
for (const tela of ALTAS) {
  for (const campo of ['pedido', 'cnpj']) {
    test(`cartão no ${campo} e Gerar no primeiro ${tela.mobile ? 'toque' : 'clique'} em ${tela.nome}`, async () => {
      const p = await abrir(tela);
      try {
        await p.clicar('a1');
        if (campo === 'cnpj') await p.digitar('pedido', 'PED-1');
        await p.digitar(campo, 'PED 5555 5555 5555 4444');
        await p.js(`document.getElementById('gerar').scrollIntoView({ block: 'end' })`);
        assert.ok(await p.naTela(campo) && await p.naTela('gerar'), 'campo e Gerar na mesma tela');
        await (tela.mobile ? p.tocar('gerar', false) : p.clicar('gerar', false));
        // Gerar chegou: recusa o CNPJ (não é CNPJ válido) ou, com o pedido, o motivo que falta.
        if (campo === 'cnpj') await erroNoCampo(p, 'cnpj', /^CNPJ inválido/); else await erroNoCampo(p, 'motivo', /motivo/);
        assert.match(await p.texto('aviso'), /^Removemos um dado de cartão do texto\./);
        assert.equal(await p.js(`document.getElementById(${JSON.stringify(campo)}).value`), 'PED **** **** **** 4444');
        assert.deepEqual(p.erros, [], 'nenhum erro no console');
      } finally {
        await p.fechar();
      }
    });
  }
}

// CB-13 de 01/11: sem JavaScript, a página ficava em branco (main e footer saem do HTML com hidden). O <noscript> avisa.
for (const tela of TELAS) {
  test(`CB-13: sem JavaScript, o aviso do <noscript> aparece em ${tela.nome}`, async () => {
    const p = await abrir(tela, { semJs: true, esperarMain: false });
    try {
      const texto = await p.js('document.body.innerText.trim()');
      assert.match(texto, /^Esta ferramenta precisa de JavaScript ativado\./);
      assert.equal(await p.js(`document.querySelector('main').hidden`), true);
    } finally {
      await p.fechar();
    }
  });
}

// CB-13 de 01/11: navegador sem lookbehind em regex (Safari < 16.4) recusa o script principal ao ler. Aqui, o RegExp
// que recusa lookbehind roda antes da página: o script principal para no primeiro RegExp com lookbehind (no navegador
// antigo ele nem começa) e o teste de suporte mostra o aviso, em vez da página em branco.
const SEM_LOOKBEHIND = `(() => {
  const Original = RegExp;
  globalThis.RegExp = new Proxy(Original, { construct(alvo, args) {
    if (/\\(\\?<[=!]/.test(String(args[0]))) throw new SyntaxError('Invalid regular expression: invalid group specifier name');
    return Reflect.construct(alvo, args);
  } });
})();`;
for (const tela of TELAS) {
  test(`CB-13: navegador sem lookbehind mostra o aviso de navegador sem suporte em ${tela.nome}`, async () => {
    const p = await abrir(tela, { antes: SEM_LOOKBEHIND, esperarMain: false });
    try {
      assert.ok(await p.visivel('sem-suporte'), '#sem-suporte visível');
      assert.match(await p.texto('sem-suporte'), /iOS para a versão 16\.4 ou mais recente/);
      assert.equal(await p.texto('o1'), '', 'o script principal não rodou');
      // Só o título e o aviso: o aceite A-1 (label.opcao com display:flex) e os Termos somem.
      assert.equal(await p.js(`document.body.innerText.trim()`), `${await p.texto('titulo')}\n\n${await p.texto('sem-suporte')}`);
      assert.ok(await p.naTela('sem-suporte'), 'o aviso está na tela');
      await semViolacoes(p, 'navegador sem suporte');
    } finally {
      await p.fechar();
    }
  });
}

// CB-14 de 01/11: a CSP do app exige Trusted Types. HTML em texto num destino como o innerHTML é recusado pelo navegador
// (o script da página não usa nenhum: o fluxo acima roda sem erro no console); sem a diretiva, era aceito em silêncio.
test('CB-14: Trusted Types aplicados no app (innerHTML com texto é recusado)', async () => {
  const p = await abrir(TELAS[1]);
  try {
    const r = await p.js(`(() => { try { document.createElement('div').innerHTML = '<b>x</b>'; return 'aceito'; } catch (e) { return e.name + ': ' + e.message; } })()`);
    assert.match(r, /^TypeError: .*TrustedHTML/);
    assert.equal(await p.js(`(() => { try { trustedTypes.createPolicy('x', {}); return 'criada'; } catch (e) { return e.name; } })()`), 'TypeError', "trusted-types 'none': nenhuma política");
  } finally {
    await p.fechar();
  }
});

// CB-17 de 01/11: o 'Monte o seu dossiê no formulário do piloto' do blog aponta para /#form, que fica oculto até o
// aceite A-1; o usuário caía no topo. Agora o A-1 recebe o foco e vem para a tela; marcado, o formulário aparece.
for (const tela of TELAS) {
  test(`CB-17: /#form leva ao aceite A-1 em ${tela.nome}`, async () => {
    const p = await abrir(tela, { caminho: '/#form' });
    try {
      assert.equal(await p.foco(), 'a1');
      assert.ok(await p.naTela('a1'), 'caixa do A-1 na tela');
      // O texto do A-1 começa na tela (a caixa fica no alto do rótulo).
      assert.ok(await p.js(`(() => { const b = document.getElementById('a1-texto').getBoundingClientRect(); return b.top >= 0 && b.top < innerHeight / 2; })()`), 'início do A-1 na metade de cima da tela');
      assert.equal(await p.visivel('form'), false);
      await semViolacoes(p, '/#form');
      const antes = await p.js('scrollY');
      await p.clicar('a1', false);
      assert.ok(await p.visivel('form'), 'A-1 mostra o formulário');
      assert.equal(await p.js('scrollY'), antes, 'marcar o A-1 não faz a página saltar para o #form');
      assert.deepEqual(p.erros, [], 'nenhum erro no console');
    } finally {
      await p.fechar();
    }
  });
}

// WCAG 2.2, 2.4.11 (revisão de 12/11): no celular, a barra do Gerar fica presa no pé da tela (.concluir sticky) e o
// campo que recebia o foco pelo Tab parava embaixo dela (o Chrome só rola até o campo entrar na janela). Percorre o
// formulário com Tab a partir do A-1 e confere, em cada controle focado antes da barra, que o ponto do meio dele é
// dele, e não da barra. Também com o aviso de termo vedado em duas origens, que deixa a barra mais alta.
const TELAS_TAB = [TELAS[0], { nome: '700 x 900 px', width: 700, height: 900, mobile: false, deviceScaleFactor: 1 }, { nome: '360 x 640 px', width: 360, height: 640, mobile: true, deviceScaleFactor: 3 }];
async function percorrerComTab(p) {
  await p.js(`document.getElementById('a1').focus()`);
  const cobertos = [], vistos = [];
  for (let i = 0; i < 80; i++) {
    await p.tab();
    const r = await p.js(`(() => {
      const e = document.activeElement, barra = document.querySelector('#form .concluir');
      if (!document.getElementById('form').contains(e)) return { fim: true };
      if (barra.contains(e)) return { barra: true, id: e.id };
      const b = e.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2, no = document.elementFromPoint(x, y);
      return { id: e.id || e.closest('[id]').id + ' ' + e.tagName.toLowerCase(), coberto: !no || barra.contains(no), y: Math.round(y), barraTopo: Math.round(barra.getBoundingClientRect().top) };
    })()`);
    if (r.fim || r.barra) break;
    vistos.push(r.id);
    if (r.coberto) cobertos.push(`${r.id} (meio em y=${r.y}, barra a partir de y=${r.barraTopo})`);
  }
  return { cobertos, vistos };
}
for (const tela of TELAS_TAB) {
  test(`WCAG 2.4.11: com Tab, nenhum campo focado fica sob a barra do Gerar em ${tela.nome}`, async () => {
    const p = await abrir(tela);
    try {
      await p.clicar('a1');
      const inicial = await percorrerComTab(p);
      assert.ok(inicial.vistos.includes('pedido') && inicial.vistos.includes('docs'), `o Tab passou pelo formulário: ${inicial.vistos.join(', ')}`);
      assert.deepEqual(inicial.cobertos, [], 'formulário vazio');
      // Termo vedado no pedido e no nome de um documento: o aviso geral entra na barra.
      await p.digitar('pedido', 'processo 77');
      await p.escolher('motivo', await p.valorMotivo('Visa', '10.4'));
      await p.anexar(['nota-fiscal.pdf', 'processo-entrega.pdf']);
      await p.clicar('gerar');
      assert.match(await p.texto('aviso'), /processo \(no pedido\).*processo-entrega\.pdf/);
      const comAviso = await percorrerComTab(p);
      assert.ok(comAviso.vistos.some((id) => id.startsWith('vinculos')), `o Tab passou pelas evidências: ${comAviso.vistos.join(', ')}`);
      assert.deepEqual(comAviso.cobertos, [], 'com o aviso de termo vedado');
      assert.deepEqual(p.erros, [], 'nenhum erro no console');
    } finally {
      await p.fechar();
    }
  });
}

// WCAG 1.4.11 (revisão de 12/11): a borda é o que identifica o campo de texto branco sobre o cartão branco e a caixa de
// seleção desmarcada (appearance:none). Ela tem de ter contraste >= 3:1 com o fundo de fora (o do primeiro ancestral
// com cor de fundo) e com o de dentro (o do próprio controle). Desabilitados e marcados ficam de fora (a marca é o fundo).
const BORDAS_FRACAS = `(() => {
  const rgba = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [r, g, b, a]; };
  const sobre = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contraste = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((m, n) => n - m); return (a + 0.05) / (b + 0.05); };
  const fundo = (e) => { for (let n = e; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0) return sobre(c, [255, 255, 255]); } return [255, 255, 255]; };
  return [...document.querySelectorAll('#form input, #form select, #form textarea, .inicio-col input')]
    .filter((e) => e.getClientRects().length && e.type !== 'file' && !e.disabled && !e.checked)
    .flatMap((e) => {
      const s = getComputedStyle(e), fora = fundo(e.parentElement), dentro = fundo(e), borda = sobre(rgba(s.borderTopColor), fora);
      const r = Math.min(contraste(borda, fora), contraste(borda, dentro));
      return r >= 3 ? [] : [\`\${e.id || e.closest('[id]').id + ' ' + e.type}: \${r.toFixed(2)}:1 (borda \${s.borderTopColor})\`];
    });
})()`;
for (const tela of TELAS) {
  test(`WCAG 1.4.11: borda dos campos e das caixas de seleção com contraste >= 3:1 em ${tela.nome}`, async () => {
    const p = await abrir(tela);
    try {
      // Mouse fora dos controles: o estado normal primeiro.
      const fora = async () => p.js(`document.querySelector('.topo').scrollIntoView()`).then(() => cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }, p.sessionId));
      await fora();
      assert.deepEqual(await p.js(BORDAS_FRACAS), [], 'A-1 desmarcado');
      await p.clicar('a1');
      await p.escolher('motivo', await p.valorMotivo('Visa', '10.4'));
      await p.anexar(['nota-fiscal.pdf', 'rastreio.pdf']);
      await p.digitar('pedido', 'PED-1');
      await p.clicar('gerar');
      assert.ok(await p.visivel('etapa-d1'), 'D-1 visível');
      await fora();
      const vistos = await p.js(`[...document.querySelectorAll('#form input:not([type=file]):not(:disabled):not(:checked), #form select, #form textarea')].filter((e) => e.getClientRects().length).length`);
      assert.ok(vistos >= 9, `campos, evidências e D-1 conferidos (${vistos})`);
      assert.deepEqual(await p.js(BORDAS_FRACAS), [], 'formulário com evidências e D-1');
      // Com o mouse em cima (hover), a borda não pode clarear abaixo de 3:1.
      const c = await p.centro('pedido');
      await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y }, p.sessionId);
      assert.deepEqual((await p.js(BORDAS_FRACAS)).filter((t) => t.startsWith('pedido')), [], 'pedido com hover');
      assert.deepEqual(p.erros, [], 'nenhum erro no console');
    } finally {
      await p.fechar();
    }
  });
}
