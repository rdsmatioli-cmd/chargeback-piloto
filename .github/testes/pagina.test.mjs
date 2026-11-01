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
