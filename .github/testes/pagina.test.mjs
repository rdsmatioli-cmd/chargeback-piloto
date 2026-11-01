// Testes estáticos das páginas (index.html e blog/), sem dependências: node --test .github/testes/*.test.mjs
// CB-13 a CB-17: lote 'Carregamento robusto, endurecimento da CSP e SEO técnico do blog' (01/11/2026), citados no
// index.html como 'CB-1n de 01/11'. O que depende do navegador (avisos visíveis, Trusted Types aplicados, /#form e
// axe-core) fica no fluxo-navegador.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { documentoDe } from './dom-minimo.mjs';

const raiz = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', raiz), 'utf8');
const corpo = html.slice(html.indexOf('<body>'));

// Scripts inline executáveis da página, na ordem (com type, como os blocos de dados, ficam de fora).
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => ({ pos: m.index, src: m[1] }));
const principal = scripts.find((s) => s.src.startsWith('"use strict";'));
const sonda = scripts.find((s) => s !== principal);

// CB-13: sem JavaScript, a página mostrava só o fundo branco (main e footer saem com hidden).
test('CB-13: <noscript> no <body>, antes do <main>, com o aviso de JavaScript', () => {
  const m = corpo.match(/<noscript>([\s\S]*?)<\/noscript>/);
  assert.ok(m, '<noscript> no <body>');
  assert.match(m[1], /^<p class="msg erro">Esta ferramenta precisa de JavaScript ativado\. [^<]+<\/p>$/);
  assert.ok(m.index < corpo.indexOf('<main'), 'o aviso vem antes do <main>');
});

// CB-13: navegador sem lookbehind em regex (Safari < 16.4) recusa o script principal inteiro. Um segundo script, em
// ES5, faz o mesmo teste e mostra o título e o #sem-suporte; no caminho normal nada muda.
function rodarSonda(RegExpDaPagina) {
  const doc = documentoDe(html);
  const ctx = { document: doc };
  if (RegExpDaPagina) ctx.RegExp = RegExpDaPagina;
  vm.createContext(ctx); vm.runInContext(sonda.src, ctx);
  const main = doc.querySelector('main');
  return { main, doc, globais: Object.keys(ctx).filter((k) => !['document', 'RegExp'].includes(k)),
    visiveis: main.children.filter((f) => !f.hidden && f.style.display !== 'none').map((f) => f.id || f.tagName) };
}
test('CB-13: #sem-suporte oculto logo depois do título e o teste de suporte entre o </main> e o script principal', () => {
  assert.match(corpo, /<main hidden>\n<h1 id="titulo">[^<]+<\/h1>\n<p id="sem-suporte" class="msg erro" hidden>[^<]+<\/p>\n/);
  assert.equal(scripts.length, 2, 'dois scripts inline: o teste de suporte e o principal');
  assert.ok(sonda && principal && sonda.pos < principal.pos, 'o teste de suporte vem antes do principal');
  assert.ok(html.indexOf('</main>') < sonda.pos, 'depois do </main> (ele mexe nos filhos do <main>)');
  // ES5: sem arrow, let/const, template, classe nem catch sem parâmetro (o navegador antigo recusaria o próprio teste).
  assert.doesNotMatch(sonda.src.replace(/\/\/.*$/gm, ''), /=>|\blet\b|\bconst\b|`|\bclass\b|catch\s*\{/);
});
test('CB-13: com lookbehind, o teste de suporte não mexe na página nem cria global', () => {
  const r = rodarSonda();
  assert.equal(r.main.hidden, true);
  assert.equal(r.doc.getElementById('sem-suporte').hidden, true);
  assert.deepEqual(r.doc.querySelectorAll('main *').filter((e) => e.style.display !== undefined), []);
  assert.deepEqual(r.globais, []);
});
const semLookbehind = function (p, f) { if (/\(\?<[=!]/.test(String(p))) throw new SyntaxError('Invalid regular expression: invalid group specifier name'); return new RegExp(p, f); };
const semFlagU = function (p, f) { if (String(f).includes('u')) throw new SyntaxError('Invalid flags'); return new RegExp(p, f); };
test('CB-13: sem lookbehind (ou sem \\p{} e flag u), aparecem só o título e o #sem-suporte', () => {
  for (const R of [semLookbehind, semFlagU]) {
    const r = rodarSonda(R);
    assert.equal(r.main.hidden, false);
    assert.deepEqual(r.visiveis, ['titulo', 'sem-suporte']);
    assert.match(r.doc.getElementById('sem-suporte').textContent, /iOS para a versão 16\.4 ou mais recente\.$/);
    assert.equal(r.doc.querySelector('footer').hidden, true);
    assert.deepEqual(r.globais, []);
  }
});

// CB-14: CSP do app com Trusted Types. O script só usa textContent, setAttribute e createObjectURL; com
// require-trusted-types-for, um innerHTML (ou outro destino de HTML ou script) que entrar depois é recusado pelo navegador.
const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)[1];
const diretivas = new Map(csp.split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([nome, ...fontes]) => [nome, fontes]));
test('CB-14: CSP do app com require-trusted-types-for \'script\' e trusted-types \'none\'', () => {
  assert.deepEqual(diretivas.get('require-trusted-types-for'), ["'script'"]);
  assert.deepEqual(diretivas.get('trusted-types'), ["'none'"]);
  // O resto continua como estava: nada sai da página e só os dois scripts com hash rodam.
  assert.deepEqual(diretivas.get('default-src'), ["'none'"]);
  assert.deepEqual(diretivas.get('connect-src'), ["'none'"]);
  assert.equal(diretivas.get('script-src').length, 2);
  assert.ok(diretivas.get('script-src').every((f) => /^'sha256-[A-Za-z0-9+/]+={0,2}'$/.test(f)));
});
test('CB-14: o script principal não usa innerHTML, outerHTML, insertAdjacentHTML, document.write nem eval', () => {
  assert.doesNotMatch(principal.src, /\.(?:inner|outer)HTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\b|setTimeout\(\s*['"`]/);
});

// CB-14: símbolos de nível de topo do script principal sem uso (restos do build antigo, como S01_SHA256). Cada um
// tem de ser usado no próprio script ou pelos testes (vedadosNaPagina e allowlist servem ao teste CB-12).
const testes = ['dossie.test.mjs', 'fluxo.test.mjs', 'mascara.test.mjs'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
function usos(nome, texto) {
  let n = 0;
  for (const m of texto.matchAll(new RegExp(`(?<![\\w$])${nome.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'))) {
    // obj.nome é propriedade de outro objeto; ...nome (espalhamento) é uso.
    if (texto[m.index - 1] !== '.' || texto.slice(m.index - 3, m.index) === '...') n++;
  }
  return n;
}
test('CB-14: todo símbolo de nível de topo do script principal é usado no script ou nos testes', () => {
  const nomes = [...principal.src.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  assert.ok(nomes.length > 50, `${nomes.length} símbolos lidos`);
  assert.deepEqual(nomes.filter((n) => usos(n, principal.src) < 2 && usos(n, testes) === 0), []);
});
