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

// ---------- blog (CB-15 e CB-16) ----------
const SITE = 'https://chargeback.contacertabr.com.br';
const ler = (rel) => readFileSync(new URL(rel, raiz), 'utf8');
const POSTS = ['o-que-e-chargeback', 'quem-paga-chargeback', 'como-evitar-chargeback', 'como-contestar-chargeback'];
const BLOG = [{ rel: 'blog/index.html', url: `${SITE}/blog/` }, ...POSTS.map((p) => ({ rel: `blog/${p}/index.html`, url: `${SITE}/blog/${p}/` }))];
const decodificar = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function metas(h) {
  const r = new Map();
  for (const m of h.matchAll(/<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)">/g)) r.set(m[1], decodificar(m[2]));
  return r;
}
const jsonLd = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const canonical = (h) => h.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
const titulo = (h) => decodificar(h.match(/<title>([^<]+)<\/title>/)[1]);
// Dimensões do PNG (cabeçalho IHDR).
function png(rel) { const b = readFileSync(new URL(rel, raiz)); return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) }; }
function confereTrilha(trilha, url, nome) {
  assert.equal(trilha['@context'], 'https://schema.org', nome);
  const itens = trilha.itemListElement;
  assert.ok(itens.length >= 2, `${nome}: o Google pede ao menos 2 itens`);
  itens.forEach((it, i) => {
    assert.equal(it['@type'], 'ListItem', nome);
    assert.equal(it.position, i + 1, `${nome}: posições 1..n`);
    assert.ok(it.name, `${nome}: item ${i + 1} com nome`);
    assert.ok(it.item.startsWith(`${SITE}/`), `${nome}: item ${i + 1} com URL absoluta do site`);
  });
  assert.equal(itens.at(-1).item, url, `${nome}: o último item é a própria página`);
}

test('CB-15: JSON-LD de todas as páginas é JSON válido com @context do schema.org', () => {
  for (const rel of ['index.html', ...BLOG.map((b) => b.rel)]) for (const d of jsonLd(ler(rel))) assert.equal(d['@context'], 'https://schema.org', rel);
});
test('CB-15: índice do blog com og:locale, og:site_name, og:image (1200x630), twitter:card e theme-color, como o post', () => {
  const h = ler('blog/index.html'), m = metas(h), post = metas(ler(`blog/${POSTS[0]}/index.html`));
  assert.equal(m.get('og:locale'), 'pt_BR');
  assert.equal(m.get('og:site_name'), post.get('og:site_name'));
  assert.equal(m.get('theme-color'), post.get('theme-color'));
  assert.equal(m.get('twitter:card'), 'summary_large_image');
  const img = m.get('og:image');
  assert.ok(img.startsWith(`${SITE}/blog/`), 'og:image absoluta no site');
  assert.equal(m.get('twitter:image'), img);
  const { largura, altura } = png(img.slice(SITE.length + 1));
  assert.deepEqual([m.get('og:image:width'), m.get('og:image:height')], [String(largura), String(altura)]);
  assert.deepEqual([largura, altura], [1200, 630]);
  assert.ok(m.get('og:image:alt'));
  assert.equal(m.get('og:url'), canonical(h));
});
test('CB-15: índice do blog com JSON-LD Blog (blogPost de cada post) e BreadcrumbList', () => {
  const h = ler('blog/index.html'), d = jsonLd(h), m = metas(h);
  const blog = d.find((x) => x['@type'] === 'Blog');
  assert.ok(blog, 'Blog');
  assert.equal(blog.url, canonical(h));
  assert.equal(blog.name, titulo(h));
  assert.equal(blog.description, m.get('description'));
  assert.equal(blog.inLanguage, 'pt-BR');
  assert.equal(blog.blogPost.length, POSTS.length);
  for (const p of POSTS) {
    const ph = ler(`blog/${p}/index.html`), art = jsonLd(ph).find((x) => x['@type'] === 'Article');
    const bp = blog.blogPost.find((x) => x.url === canonical(ph));
    assert.ok(bp, `blogPost de ${p}`);
    assert.equal(bp['@type'], 'BlogPosting');
    assert.equal(bp.headline, art.headline);
    assert.equal(bp.datePublished, art.datePublished);
    assert.equal(bp.dateModified, art.dateModified);
    // O índice lista o post com link interno.
    assert.ok(h.includes(`<a href="/blog/${p}/">`), `link para ${p}`);
  }
  confereTrilha(d.find((x) => x['@type'] === 'BreadcrumbList'), canonical(h), 'blog/index.html');
});
test('CB-15: post com publisher.url e BreadcrumbList até ele, passando pelo blog', () => {
  for (const p of POSTS) {
    const h = ler(`blog/${p}/index.html`), d = jsonLd(h);
    const art = d.find((x) => x['@type'] === 'Article');
    assert.equal(art.publisher['@type'], 'Organization');
    assert.equal(art.publisher.url, `${SITE}/`);
    const trilha = d.find((x) => x['@type'] === 'BreadcrumbList');
    confereTrilha(trilha, canonical(h), p);
    assert.equal(trilha.itemListElement.at(-2).item, `${SITE}/blog/`, `${p}: o item antes do post é o blog`);
    assert.equal(trilha.itemListElement.at(-1).name, art.headline);
  }
});
test('CB-15: sitemap com lastmod em todas as URLs; o do post é o dateModified dele', () => {
  const s = ler('sitemap.xml');
  const urls = [...s.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)].map((m) => ({ loc: m[1], lastmod: m[2] }));
  assert.deepEqual(urls.map((u) => u.loc), BLOG.map((b) => b.url));
  for (const u of urls) assert.match(u.lastmod ?? '', /^\d{4}-\d{2}-\d{2}$/, `${u.loc} sem lastmod`);
  assert.equal(urls[0].lastmod, '2026-11-12'); // índice do blog: lote 2 (3 posts) em 12/11/2026
  for (const p of POSTS) {
    const art = jsonLd(ler(`blog/${p}/index.html`)).find((x) => x['@type'] === 'Article');
    assert.equal(urls.find((u) => u.loc === `${SITE}/blog/${p}/`).lastmod, art.dateModified);
  }
});
test('CB-15: app com og:title e og:description iguais ao TITULO e ao O-1 do script, sem canonical e ainda noindex', () => {
  const m = metas(html);
  const TITULO = JSON.parse(principal.src.match(/^const TITULO = ("[^"\n]*");$/m)[1]);
  const O1 = JSON.parse(principal.src.match(/^ {2}"O-1": ("[^"\n]*"),$/m)[1]);
  assert.equal(m.get('og:title'), TITULO);
  assert.equal(m.get('og:description'), O1);
  assert.equal(titulo(html), TITULO);
  assert.equal(canonical(html), undefined);
  assert.equal(m.get('robots'), 'noindex, nofollow');
  assert.doesNotMatch(html, /<meta property="og:url"/);
});

// CB-16: links internos do blog (âncoras, '/' e '/blog/') sem rel: nofollow cortava o sinal para o índice do blog e
// noopener/noreferrer não fazem nada na mesma origem. Os externos mantêm 'noopener noreferrer nofollow'.
test('CB-16: no blog, link interno sem rel e link externo com noopener, noreferrer e nofollow', () => {
  let internos = 0, externos = 0;
  for (const { rel: arq } of BLOG) {
    for (const m of ler(arq).matchAll(/<a\s([^>]*)>/g)) {
      const href = m[1].match(/href="([^"]*)"/)[1];
      const rel = m[1].match(/rel="([^"]*)"/)?.[1];
      if (/^(?:\/(?!\/)|#)/.test(href) || href.startsWith(`${SITE}/`)) {
        internos++;
        assert.equal(rel, undefined, `${arq}: link interno ${href} com rel="${rel}"`);
      } else {
        externos++;
        assert.ok(/^https:\/\//.test(href), `${arq}: ${href}`);
        assert.deepEqual((rel ?? '').split(/\s+/).sort(), ['nofollow', 'noopener', 'noreferrer'], `${arq}: link externo ${href}`);
      }
    }
  }
  assert.ok(internos >= 8 && externos >= 10, `${internos} internos, ${externos} externos`);
});
