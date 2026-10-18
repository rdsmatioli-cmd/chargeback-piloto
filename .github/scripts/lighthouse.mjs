#!/usr/bin/env node
// Lighthouse 13.5.0 nas páginas do repositório, servidas localmente. Sem dependências:
// só módulos do Node e `npx --yes lighthouse@13.5.0` (versão fixa).
//
// Uso: node .github/scripts/lighthouse.mjs [raiz]   (raiz padrão: diretório atual)
// Fica em .github/ para não ser publicado no site (o Jekyll do Pages ignora pastas com ponto).
// Pede Node >= 22.19 (exigência do lighthouse@13.5.0).
// Variáveis opcionais: CHROME_PATH (Chromium a usar), LH_FORMATOS (padrão "mobile,desktop"),
// LH_SAIDA (pasta dos relatórios JSON; padrão: pasta temporária nova), LH_HTML_PEDACO_BYTES e
// LH_HTML_INTERVALO_MS (HTML em pedaços, ver abaixo; LH_HTML_INTERVALO_MS=0 manda tudo de uma vez).
//
// O HTML sai em pedaços de 14.600 bytes (a janela inicial do TCP), com 200 ms entre eles, como
// numa rede real. Com o arquivo inteiro de uma vez, o CLS do app sai 0 mesmo quando, na rede real,
// o navegador pinta o markup antes de o script chegar e o conteúdo desce depois.
//
// Metas (saída 1 se alguma falhar):
// - blog (/blog/ e cada /blog/<post>/): SEO >= 0,90; Acessibilidade >= 0,95; CLS < 0,1;
//   robots.txt e llms.txt lidos e válidos (a CSP da página não pode bloquear a leitura).
// - app (/): Acessibilidade >= 0,95 e CLS < 0,1. O app é noindex de propósito: SEO não entra.
import { createServer } from 'node:http';
import { readFile, stat, readdir, mkdir, mkdtemp, appendFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';

const LIGHTHOUSE = 'lighthouse@13.5.0';
const raiz = resolve(process.argv[2] || '.');
const formatos = (process.env.LH_FORMATOS || 'mobile,desktop').split(',').map((f) => f.trim()).filter(Boolean);
const numero = (v, padrao) => (v === undefined || v === '' ? padrao : Number(v));
const PEDACO_BYTES = numero(process.env.LH_HTML_PEDACO_BYTES, 14600);
const INTERVALO_MS = numero(process.env.LH_HTML_INTERVALO_MS, 200);
if (!(PEDACO_BYTES >= 1) || !(INTERVALO_MS >= 0)) throw new Error('LH_HTML_PEDACO_BYTES deve ser >= 1 e LH_HTML_INTERVALO_MS >= 0');
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Servidor estático mínimo, no formato do GitHub Pages: pasta -> index.html, pasta sem barra -> 301.
function servidor() {
  return createServer(async (req, res) => {
    const fim = (codigo, corpo = '', cab = {}) => { res.writeHead(codigo, { 'Content-Type': 'text/plain; charset=utf-8', ...cab }); res.end(corpo); };
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return fim(405);
      const caminho = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (caminho.split('/').some((p) => p.startsWith('.'))) return fim(404, 'não encontrado');
      let arq = resolve(raiz, '.' + caminho);
      if (arq !== raiz && !arq.startsWith(raiz + sep)) return fim(404, 'não encontrado');
      let info = await stat(arq).catch(() => null);
      if (info?.isDirectory()) {
        if (!caminho.endsWith('/')) return fim(301, '', { Location: caminho + '/' });
        arq = join(arq, 'index.html');
        info = await stat(arq).catch(() => null);
      }
      if (!info?.isFile()) return fim(404, 'não encontrado');
      const corpo = await readFile(arq);
      res.writeHead(200, { 'Content-Type': TIPOS[extname(arq)] || 'application/octet-stream', 'Content-Length': corpo.length });
      if (req.method === 'HEAD') return res.end();
      if (extname(arq) !== '.html' || !INTERVALO_MS) return res.end(corpo);
      // HTML em pedaços, com intervalo entre eles (ver o cabeçalho).
      for (let i = 0; i < corpo.length; i += PEDACO_BYTES) {
        if (i) await espera(INTERVALO_MS);
        if (res.destroyed) return;
        res.write(corpo.subarray(i, i + PEDACO_BYTES));
      }
      res.end();
    } catch (e) {
      if (res.headersSent) res.destroy();
      else fim(500, String(e && e.message));
    }
  });
}

async function paginas() {
  const lista = [{ caminho: '/', tipo: 'app' }, { caminho: '/blog/', tipo: 'blog' }];
  const itens = await readdir(join(raiz, 'blog'), { withFileTypes: true }).catch(() => []);
  for (const d of itens.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!d.isDirectory() || d.name.startsWith('.')) continue;
    if (await stat(join(raiz, 'blog', d.name, 'index.html')).catch(() => null)) lista.push({ caminho: `/blog/${d.name}/`, tipo: 'blog' });
  }
  return lista;
}

function lighthouse(url, saida, formato) {
  const args = ['--yes', LIGHTHOUSE, url, '--output=json', `--output-path=${saida}`, '--quiet',
    '--chrome-flags=--headless=new --no-sandbox', '--max-wait-for-load=60000'];
  if (formato === 'desktop') args.push('--preset=desktop');
  return new Promise((ok) => {
    const p = spawn('npx', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    const limite = setTimeout(() => p.kill('SIGKILL'), 300_000);
    p.on('error', (e) => { clearTimeout(limite); ok(`npx não rodou: ${e.message}`); });
    p.on('close', (codigo, sinal) => { clearTimeout(limite); ok(codigo === 0 ? null : `lighthouse saiu com ${sinal || codigo}`); });
  });
}

// Auditoria binária aprovada de fato: 404 do llms.txt dá score 1 como "notApplicable", e isso não conta.
const aprovada = (r, id) => r.audits[id]?.score === 1 && r.audits[id]?.scoreDisplayMode === 'binary';
const motivo = (r, id) => r.audits[id]?.explanation || r.audits[id]?.displayValue || r.audits[id]?.scoreDisplayMode || 'ausente';

const METAS = {
  blog: [
    { nome: 'SEO', valor: (r) => r.categories.seo?.score, ok: (v) => v >= 0.9, meta: '>= 0.90' },
    { nome: 'Acessibilidade', valor: (r) => r.categories.accessibility?.score, ok: (v) => v >= 0.95, meta: '>= 0.95' },
    { nome: 'CLS', valor: (r) => r.audits['cumulative-layout-shift']?.numericValue, ok: (v) => v < 0.1, meta: '< 0.1' },
    { nome: 'robots.txt', valor: (r) => (aprovada(r, 'robots-txt') ? 'ok' : motivo(r, 'robots-txt')), ok: (v) => v === 'ok', meta: 'lido e válido' },
    { nome: 'llms.txt', valor: (r) => (aprovada(r, 'llms-txt') ? 'ok' : motivo(r, 'llms-txt')), ok: (v) => v === 'ok', meta: 'lido e válido' }
  ],
  app: [
    { nome: 'Acessibilidade', valor: (r) => r.categories.accessibility?.score, ok: (v) => v >= 0.95, meta: '>= 0.95' },
    { nome: 'CLS', valor: (r) => r.audits['cumulative-layout-shift']?.numericValue, ok: (v) => v < 0.1, meta: '< 0.1' }
  ]
};

// Auditorias reprovadas nas categorias avaliadas, para o log dizer o porquê.
function reprovadas(r, categorias) {
  const ids = new Set(categorias.flatMap((c) => (r.categories[c]?.auditRefs || []).filter((a) => a.weight > 0).map((a) => a.id)));
  return [...ids].filter((id) => {
    const a = r.audits[id];
    return a && a.score !== null && a.score < 1 && ['binary', 'numeric', 'metricSavings'].includes(a.scoreDisplayMode);
  }).map((id) => `${id}=${r.audits[id].score}${r.audits[id].displayValue ? ` (${r.audits[id].displayValue})` : ''}`);
}

const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v));

const dir = process.env.LH_SAIDA ? resolve(process.env.LH_SAIDA) : await mkdtemp(join(tmpdir(), 'lighthouse-'));
await mkdir(dir, { recursive: true });
const srv = servidor();
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}`;
console.log(`Servindo ${raiz} em ${base} (HTML em pedaços de ${PEDACO_BYTES} bytes a cada ${INTERVALO_MS} ms); relatórios em ${dir}`);

const linhas = [];
let falhas = 0;
try {
  for (const pag of await paginas()) {
    for (const formato of formatos) {
      const arquivo = join(dir, `${pag.caminho.replace(/^\/|\/$/g, '').replace(/\//g, '_') || 'app'}-${formato}.json`);
      const erroExec = await lighthouse(base + pag.caminho, arquivo, formato);
      const r = erroExec ? null : JSON.parse(await readFile(arquivo, 'utf8'));
      const erro = erroExec || r.runtimeError?.message;
      if (erro) {
        falhas++;
        linhas.push({ pagina: pag.caminho, formato, tipo: pag.tipo, erro });
        console.log(`FALHA ${pag.caminho} ${formato}: ${erro}`);
        continue;
      }
      const cat = Object.fromEntries(Object.entries(r.categories).map(([k, c]) => [k, c.score]));
      const res = METAS[pag.tipo].map((m) => { const v = m.valor(r); return { ...m, v, passou: v !== undefined && v !== null && m.ok(v) }; });
      const ruins = res.filter((m) => !m.passou);
      falhas += ruins.length;
      linhas.push({ pagina: pag.caminho, formato, tipo: pag.tipo, cat, res });
      console.log(`${ruins.length ? 'FALHA' : 'ok   '} ${pag.caminho} ${formato} [${pag.tipo}] ` +
        res.map((m) => `${m.nome}=${fmt(m.v)}${m.passou ? '' : ` (meta ${m.meta})`}`).join(' | ') +
        ` || categorias: ${Object.entries(cat).map(([k, v]) => `${k}=${fmt(v)}`).join(' ')}`);
      if (ruins.length) {
        const cats = pag.tipo === 'blog' ? ['seo', 'accessibility', 'agentic-browsing'] : ['accessibility'];
        console.log(`      reprovadas: ${reprovadas(r, cats).join('; ') || '(nenhuma auditoria com peso)'}`);
      }
    }
  }
} finally {
  srv.close();
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ['### Lighthouse 13.5.0', '', '| Página | Formato | Resultado | Metas |', '|---|---|---|---|',
    ...linhas.map((l) => `| ${l.pagina} | ${l.formato} | ${l.erro ? 'erro' : l.res.every((m) => m.passou) ? 'ok' : 'falha'} | ${l.erro ? l.erro : l.res.map((m) => `${m.nome} ${fmt(m.v)} (${m.meta})`).join('; ')} |`), ''];
  await appendFile(process.env.GITHUB_STEP_SUMMARY, md.join('\n'));
}

console.log(falhas ? `\n${falhas} meta(s) não atingida(s).` : '\nTodas as metas atingidas.');
process.exit(falhas ? 1 : 0);
