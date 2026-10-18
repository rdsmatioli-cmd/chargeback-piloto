#!/usr/bin/env node
// Confere a CSP (meta http-equiv) de cada .html do repositório contra os scripts inline da página.
// Sem dependências: só módulos do Node 22.
//
// Uso: node .github/scripts/conferir-csp.mjs [--corrigir] [raiz]
// A raiz padrão é a do repositório (dois níveis acima deste arquivo), de qualquer pasta em que se
// rode; o argumento raiz serve para conferir outra cópia (testes).
// Fica em .github/ para não ser publicado no site (o Jekyll do Pages ignora pastas com ponto).
//
// Para cada página (todo .html fora de .git/ e node_modules/):
// - calcula o sha256 (base64) de cada <script> inline executável (sem src; type ausente, vazio,
//   JavaScript, module, importmap ou speculationrules) sobre o texto exato entre as tags, como o
//   navegador: o fim do script segue o tokenizador do HTML, CR e CRLF viram LF, NUL vira U+FFFD,
//   entidades não são decodificadas;
// - exige o hash no script-src (ou script-src-elem) de cada CSP do <head>; 'unsafe-inline' não basta;
// - acusa hash do script-src que não corresponde a nenhum script inline da página (sobra);
// - acusa script inline sem CSP, CSP fora do <head>, script antes da CSP e atributo on* (onclick...),
//   que a CSP com hash bloqueia: use addEventListener no script. O <head> acaba, como no navegador,
//   em </head>, numa tag que não é de <head> ou em texto que não é só espaço (fora de title, style,
//   noscript e script); a CSP que vem depois disso é ignorada pelo navegador.
// Blocos de dados (type="application/ld+json" e outros) ficam de fora: o navegador não os executa
// e a CSP não se aplica a eles; <script></script> vazio também (o navegador nem o executa).
// SVG/MathML com "<script" dentro (até em <style>, comentário ou CDATA) é erro: lá o navegador
// decodifica entidades e CDATA antes do hash e <style> não esconde tags; confira essa página à mão.
// SVG/MathML sem script não atrapalha (só se leem as tags dele, para on* e CSP).
// Limites: scripts externos (src) não são conferidos; <script nomodule> e <script> dentro de
// <template> são conferidos como se rodassem (o navegador nem os executa: erro a mais, nunca a
// menos); texto ou tag de corpo dentro de <template> no <head> conta como fim do <head> (idem);
// hash sem o "=" final é acusado, mesmo que o Chromium o aceite (o --corrigir grava o valor
// completo, que todo navegador aceita).
//
// --corrigir: reescreve só os hashes do script-src (ou script-src-elem) da CSP do index.html da raiz
// com os valores certos, sem tocar no resto da CSP nem do arquivo, e confere tudo de novo.
// Saída: 0 sem divergência; 1 com divergência (lista na saída) ou correção impossível; 2 uso errado.
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMANDO = 'node .github/scripts/conferir-csp.mjs';
const USO = `uso: ${COMANDO} [--corrigir] [raiz]`;
const args = process.argv.slice(2);
const corrigir = args.includes('--corrigir');
const posicionais = args.filter((a) => a !== '--corrigir');
if (posicionais.length > 1 || posicionais.some((a) => a.startsWith('-'))) {
  console.error(USO);
  process.exit(2);
}
const raiz = posicionais.length ? resolve(posicionais[0]) : resolve(fileURLToPath(new URL('../..', import.meta.url)));
if (!(await stat(raiz).then((s) => s.isDirectory(), () => false))) {
  console.error(`raiz não encontrada ou não é pasta: ${raiz}\n${USO}`);
  process.exit(2);
}

// ---------- leitura do HTML (o necessário do tokenizador do HTML5) ----------

const ESPACO = /[\t\n\f\r ]/;
const ALFA = /[A-Za-z]/;
const DELIMITADOR = /[\t\n\f\r />]/;
// Conteúdo em texto cru (RAWTEXT/RCDATA): uma tag lá dentro é texto. noscript entra porque o
// navegador, com scripts ligados, lê o conteúdo dele como texto.
const TEXTO_CRU = new Set(['style', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'title', 'textarea']);
// Tags que não fecham o <head> implicitamente.
const DO_HEAD = new Set(['html', 'head', 'meta', 'link', 'title', 'style', 'script', 'noscript', 'base', 'template']);
const JS_MIME = new Set([
  'application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript',
  'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
  'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript',
  'text/x-ecmascript', 'text/x-javascript'
]);
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const minusculas = (s) => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
const aparar = (s) => s.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
const decodificar = (v) => v.replace(/&(#[xX][0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);?/g, (m, r) => {
  if (r[0] !== '#') return Object.hasOwn(ENTIDADES, r) ? ENTIDADES[r] : m;
  const cp = r[1] === 'x' || r[1] === 'X' ? parseInt(r.slice(2), 16) : parseInt(r.slice(1), 10);
  return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '�';
});

// Tag a partir do nome (j aponta para a 1a letra). Devolve null se o arquivo acabar dentro dela.
function lerTag(t, j) {
  const n = t.length;
  let k = j;
  while (k < n && !ESPACO.test(t[k]) && t[k] !== '/' && t[k] !== '>') k++;
  const nome = minusculas(t.slice(j, k));
  const attrs = new Map();
  for (;;) {
    const s = k;
    while (k < n && (ESPACO.test(t[k]) || t[k] === '/')) k++;
    if (k >= n) return null;
    // autoFechada: "/" logo antes do ">", fora de nome ou valor de atributo (<svg/>, <svg a="b"/>).
    if (t[k] === '>') return { nome, attrs, fim: k + 1, autoFechada: k > s && t[k - 1] === '/' };
    const a = k;
    if (t[k] === '=') k++;
    while (k < n && !ESPACO.test(t[k]) && t[k] !== '/' && t[k] !== '>' && t[k] !== '=') k++;
    const nomeAttr = minusculas(t.slice(a, k));
    while (k < n && ESPACO.test(t[k])) k++;
    let valor = { bruto: '', ini: k, fim: k, aspas: '' };
    if (t[k] === '=') {
      k++;
      while (k < n && ESPACO.test(t[k])) k++;
      if (t[k] === '"' || t[k] === "'") {
        const f = t.indexOf(t[k], k + 1);
        if (f < 0) return null;
        valor = { bruto: t.slice(k + 1, f), ini: k + 1, fim: f, aspas: t[k] };
        k = f + 1;
      } else {
        const ini = k;
        while (k < n && !ESPACO.test(t[k]) && t[k] !== '>') k++;
        valor = { bruto: t.slice(ini, k), ini, fim: k, aspas: '' };
      }
    }
    if (!attrs.has(nomeAttr)) attrs.set(nomeAttr, { ...valor, valor: decodificar(valor.bruto) });
  }
}

// Fim de comentário (j logo depois de "<!--"), com os fechamentos abruptos "<!-->" e "<!--->".
function fimComentario(t, j) {
  if (t[j] === '>') return j + 1;
  if (t.startsWith('->', j)) return j + 2;
  const re = /--!?>/g;
  re.lastIndex = j;
  const m = re.exec(t);
  return m ? m.index + m[0].length : t.length;
}

function fimTextoCru(t, j, nome) {
  const re = new RegExp(`</${nome}[\\t\\n\\f\\r />]`, 'gi');
  re.lastIndex = j;
  const m = re.exec(t);
  return m ? m.index : t.length;
}

// Posição do "<" do </script> que fecha o script, pelos estados "script data" do HTML5: dentro de
// "<!--", um "<script" abre o modo duplamente escapado e o "</script>" seguinte não fecha o script.
function fimScript(t, j) {
  const n = t.length;
  const ehScript = (k) => /^script$/i.test(t.slice(k, k + 6)) && DELIMITADOR.test(t[k + 6] ?? '');
  let estado = 0; // 0 normal, 1 escapado (depois de "<!--"), 2 duplamente escapado
  let tracos = 0;
  for (let k = j; k < n; k++) {
    const c = t[k];
    if (estado === 0) {
      if (c !== '<') continue;
      if (t[k + 1] === '/' && ehScript(k + 2)) return k;
      if (t.startsWith('!--', k + 1)) { estado = 1; tracos = 2; k += 3; }
      continue;
    }
    if (c === '-') { tracos++; continue; }
    if (c === '>' && tracos >= 2) { estado = 0; tracos = 0; continue; }
    tracos = 0;
    if (c !== '<') continue;
    if (estado === 1) {
      if (t[k + 1] === '/' && ehScript(k + 2)) return k;
      if (ehScript(k + 1)) { estado = 2; k += 7; }
    } else if (t[k + 1] === '/' && ehScript(k + 2)) {
      estado = 1;
      k += 8;
    }
  }
  return n;
}

function executavel(attrs) {
  let tipo = '';
  if (attrs.has('type')) tipo = attrs.get('type').valor;
  else if (attrs.get('language')?.valor) tipo = 'text/' + attrs.get('language').valor;
  tipo = minusculas(aparar(tipo));
  return tipo === '' || JS_MIME.has(tipo) || ['module', 'importmap', 'speculationrules'].includes(tipo);
}

// Lê a página: scripts inline, metas de CSP e atributos on*.
// SVG/MathML (do <svg> ou <math> até o fechamento correspondente, contando os aninhados) segue
// outras regras: <style> e <title> não são texto cru e o <script> tem entidades e CDATA decodificados
// antes do hash. Lá dentro só se leem tags (on*, CSP); um "<script" qualquer na região vai para
// `estrangeiros` e a página precisa ser conferida à mão.
function analisar(t) {
  const scripts = [];
  const csps = [];
  const manipuladores = [];
  const estrangeiros = [];
  let blocosDeDados = 0;
  let noHead = true;
  let prof = 0; // profundidade de SVG/MathML
  let iniEstrangeiro = 0;
  const fecharEstrangeiro = (fim) => {
    if (/<script[\t\n\f\r />]/i.test(t.slice(iniEstrangeiro, fim))) estrangeiros.push({ pos: iniEstrangeiro });
  };
  let i = 0;
  const n = t.length;
  while (i < n) {
    const lt = t.indexOf('<', i);
    if (lt < 0) break;
    // Texto que não é só espaço fecha o <head>, como no navegador (o BOM do início não conta).
    if (noHead && aparar(decodificar(t.slice(i === 0 && t[0] === '﻿' ? 1 : i, lt))) !== '') noHead = false;
    i = lt;
    const c1 = t[i + 1] ?? '';
    if (t.startsWith('<!--', i)) { i = fimComentario(t, i + 4); continue; }
    if (prof && t.startsWith('<![CDATA[', i)) { const f = t.indexOf(']]>', i + 9); i = f < 0 ? n : f + 3; continue; }
    if (c1 === '!' || c1 === '?') { const g = t.indexOf('>', i); i = g < 0 ? n : g + 1; continue; }
    if (c1 === '/') {
      if (ALFA.test(t[i + 2] ?? '')) {
        const tag = lerTag(t, i + 2);
        if (!tag) break;
        if (tag.nome === 'head') noHead = false;
        i = tag.fim;
        if (prof && (tag.nome === 'svg' || tag.nome === 'math') && --prof === 0) fecharEstrangeiro(i);
      } else if (t[i + 2] === '>') {
        i += 3;
      } else {
        const g = t.indexOf('>', i);
        i = g < 0 ? n : g + 1;
      }
      continue;
    }
    if (!ALFA.test(c1)) { noHead = false; i++; continue; } // "<" solto é texto
    const tag = lerTag(t, i + 1);
    if (!tag) break;
    if (!DO_HEAD.has(tag.nome)) noHead = false;
    for (const [nome] of tag.attrs) if (/^on[a-z]/.test(nome)) manipuladores.push({ nome, pos: lt });
    i = tag.fim;
    if (tag.nome === 'svg' || tag.nome === 'math') {
      if (!tag.autoFechada && prof++ === 0) iniEstrangeiro = lt;
    } else if (tag.nome === 'meta') {
      const equiv = tag.attrs.get('http-equiv');
      const conteudo = tag.attrs.get('content');
      if (equiv && minusculas(aparar(equiv.valor)) === 'content-security-policy' && conteudo && conteudo.valor !== '') {
        csps.push({ pos: lt, noHead, attr: conteudo, politica: lerPolitica(conteudo.valor) });
      }
    } else if (prof) {
      // dentro de SVG/MathML: nem script nem texto cru (ver fecharEstrangeiro)
    } else if (tag.nome === 'script') {
      const fim = fimScript(t, i);
      const texto = t.slice(i, fim).replace(/\r\n?/g, '\n').replace(/\0/g, '�');
      if (tag.attrs.has('src') || texto === '') {
        // externo (o conteúdo é ignorado) ou vazio (o navegador nem executa nem confere na CSP)
      } else if (!executavel(tag.attrs)) {
        blocosDeDados++;
      } else {
        scripts.push({ pos: lt, texto, sha256: digest('sha256', texto) });
      }
      i = fim;
    } else if (TEXTO_CRU.has(tag.nome)) {
      i = fimTextoCru(t, i, tag.nome);
    } else if (tag.nome === 'plaintext') {
      i = n;
    }
  }
  if (prof) fecharEstrangeiro(n);
  return { scripts, csps, manipuladores, blocosDeDados, estrangeiros };
}

// ---------- CSP ----------

const digest = (alg, texto) => createHash(alg).update(texto, 'utf8').digest('base64');
const HASH = /^'(sha256|sha384|sha512)-([A-Za-z0-9+/_-]+={0,2})'$/i;
const lerHash = (token) => {
  const m = HASH.exec(token);
  return m && { alg: m[1].toLowerCase(), valor: m[2].replace(/-/g, '+').replace(/_/g, '/') };
};

// Diretivas com a posição de cada token no valor (a primeira ocorrência de cada nome vale).
function lerPolitica(valor) {
  const diretivas = new Map();
  let base = 0;
  for (const parte of valor.split(';')) {
    const tokens = [];
    for (const m of parte.matchAll(/[^\t\n\f\r ]+/g)) tokens.push({ texto: m[0], ini: base + m.index, fim: base + m.index + m[0].length });
    base += parte.length + 1;
    if (!tokens.length) continue;
    const nome = minusculas(tokens[0].texto);
    if (!diretivas.has(nome)) diretivas.set(nome, { nome, cabeca: tokens[0], fontes: tokens.slice(1) });
  }
  return diretivas;
}

// Diretiva que vale para <script>: script-src-elem, senão script-src, senão default-src.
const diretivaDeScript = (politica) => politica.get('script-src-elem') ?? politica.get('script-src') ?? politica.get('default-src') ?? null;
const casa = (h, script) => digest(h.alg, script.texto) === h.valor;
const fonte = (script) => `'sha256-${script.sha256}'`;

function linhaDe(t, pos) {
  let linha = 1;
  for (let k = 0; k < pos; k++) if (t[k] === '\n' || (t[k] === '\r' && t[k + 1] !== '\n')) linha++;
  return linha;
}

function conferirPagina(t) {
  const { scripts, csps, manipuladores, blocosDeDados, estrangeiros } = analisar(t);
  const problemas = [];
  const linha = (pos) => linhaDe(t, pos);
  for (const e of estrangeiros) {
    problemas.push(`SVG/MathML na linha ${linha(e.pos)} com <script> dentro: o navegador lê esse script com outras regras (entidades, CDATA, <style> que não esconde tags) e o conferir-csp não calcula o hash dele; confira a CSP desta página à mão.`);
  }
  for (const c of csps) {
    if (!c.noHead) problemas.push(`CSP na linha ${linha(c.pos)} fora do <head>: o navegador a ignora.`);
  }
  const politicas = csps.filter((c) => c.noHead);
  if (scripts.length && !politicas.length) {
    for (const s of scripts) {
      problemas.push(`script inline na linha ${linha(s.pos)} sem CSP: inclua no <head> uma CSP com script-src ${fonte(s)}.`);
    }
  }
  for (const c of politicas) {
    const lc = linha(c.pos);
    const dir = diretivaDeScript(c.politica);
    const depois = scripts.filter((s) => s.pos > c.pos);
    for (const s of scripts) {
      const ls = linha(s.pos);
      if (s.pos < c.pos) {
        problemas.push(`script inline na linha ${ls} vem antes da CSP (linha ${lc}): ponha a CSP antes de qualquer script.`);
      } else if (!dir) {
        problemas.push(`script inline na linha ${ls}: a CSP da linha ${lc} não tem script-src; inclua script-src ${fonte(s)}.`);
      } else if (!dir.fontes.some((f) => { const h = lerHash(f.texto); return h && casa(h, s); })) {
        const via = dir.nome === 'default-src' ? ' (a CSP não tem script-src e o default-src vale para scripts)' : '';
        problemas.push(`script inline na linha ${ls} tem hash ${fonte(s)}, que não está no ${dir.nome} da CSP (linha ${lc})${via}: o navegador bloqueia o script.`);
      }
    }
    // Com script em SVG/MathML não dá para saber se um hash sobra: ele pode ser desse script.
    if (dir && dir.nome !== 'default-src' && !estrangeiros.length) {
      for (const f of dir.fontes) {
        const h = lerHash(f.texto);
        if (h && !depois.some((s) => casa(h, s))) {
          problemas.push(`${dir.nome} da CSP (linha ${lc}) tem ${f.texto}, que não corresponde a nenhum script inline da página (sobra).`);
        }
      }
    }
  }
  for (const m of manipuladores) {
    problemas.push(`atributo ${m.nome} na linha ${linha(m.pos)}: manipulador de evento inline, que a CSP só por hash não libera; use addEventListener no script.`);
  }
  return { problemas, scripts, blocosDeDados, politicas };
}

// ---------- arquivos ----------

async function paginas(dir) {
  const saida = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) saida.push(...(await paginas(p)));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.html')) saida.push(p);
  }
  return saida.sort();
}

const nomeRel = (arq) => relative(raiz, arq).split(sep).join('/');

async function lerTexto(arq) {
  const bytes = await readFile(arq);
  const texto = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  return { bytes, texto };
}

// ---------- --corrigir (só o index.html da raiz) ----------

async function corrigirIndex() {
  const arq = join(raiz, 'index.html');
  const falha = (msg) => { console.error(`index.html: não corrigido: ${msg}`); return false; };
  let lido;
  try { lido = await lerTexto(arq); } catch { return falha('arquivo não encontrado na raiz.'); }
  const { bytes, texto: t } = lido;
  if (!conferirPagina(t).problemas.length) {
    console.log('index.html: nada a corrigir.');
    return true;
  }
  if (!Buffer.from(t, 'utf8').equals(bytes)) return falha('o arquivo não é UTF-8 válido; corrija à mão.');
  const { scripts, csps, estrangeiros } = analisar(t);
  if (estrangeiros.length) return falha('há <script> dentro de SVG/MathML, cujo hash o conferir-csp não calcula; corrija à mão.');
  const politicas = csps.filter((c) => c.noHead);
  if (politicas.length !== 1) return falha(politicas.length ? 'há mais de uma CSP no <head>; corrija à mão.' : 'não há CSP no <head>; inclua à mão.');
  const csp = politicas[0];
  if (csp.attr.aspas !== '"' || csp.attr.bruto.includes('&')) return falha('o content da CSP precisa estar entre aspas duplas e sem entidades (&...); corrija à mão.');
  const dir = csp.politica.get('script-src-elem') ?? csp.politica.get('script-src');
  if (!dir) return falha('a CSP não tem script-src; inclua à mão.');

  const alvo = scripts.filter((s) => s.pos > csp.pos);
  const hashes = dir.fontes.filter((f) => lerHash(f.texto));
  const confere = alvo.every((s) => hashes.some((f) => casa(lerHash(f.texto), s)))
    && hashes.every((f) => alvo.some((s) => casa(lerHash(f.texto), s)));
  if (confere) {
    console.log(`index.html: os hashes do ${dir.nome} já conferem; o que falta se corrige à mão (lista abaixo).`);
    return true;
  }
  const novos = [...new Set(alvo.map(fonte))];
  const outras = dir.fontes.filter((f) => !lerHash(f.texto));
  const anterior = (tok) => { const todos = [dir.cabeca, ...dir.fontes]; return todos[todos.indexOf(tok) - 1]; };
  const trocas = []; // { ini, fim, texto } no valor bruto do content
  if (hashes.length) {
    hashes.forEach((f, idx) => {
      if (idx === 0 && novos.length) trocas.push({ ini: f.ini, fim: f.fim, texto: novos.join(' ') });
      else trocas.push({ ini: anterior(f).fim, fim: f.fim, texto: '' });
    });
    if (!novos.length && !outras.length) trocas.push({ ini: dir.cabeca.fim, fim: dir.cabeca.fim, texto: " 'none'" });
  } else {
    const none = outras.find((f) => minusculas(f.texto) === "'none'");
    if (none) trocas.push({ ini: none.ini, fim: none.fim, texto: novos.join(' ') });
    else {
      const ultimo = dir.fontes.at(-1) ?? dir.cabeca;
      trocas.push({ ini: ultimo.fim, fim: ultimo.fim, texto: ' ' + novos.join(' ') });
    }
  }
  let valor = csp.attr.bruto;
  for (const tr of trocas.sort((a, b) => b.ini - a.ini)) valor = valor.slice(0, tr.ini) + tr.texto + valor.slice(tr.fim);
  const novoTexto = t.slice(0, csp.attr.ini) + valor + t.slice(csp.attr.fim);
  await writeFile(arq, novoTexto, 'utf8');
  const antes = hashes.map((f) => f.texto).join(' ') || '(nenhum hash)';
  console.log(`index.html: ${dir.nome} corrigido: ${antes} -> ${novos.join(' ') || "(nenhum script inline: 'none')"}`);
  return true;
}

// ---------- principal ----------

let ok = true;
if (corrigir) ok = (await corrigirIndex()) && ok;

const arquivos = await paginas(raiz);
if (!arquivos.length) {
  console.error(`nenhum .html em ${raiz}`);
  process.exit(1);
}
let totalProblemas = 0;
let paginasComProblema = 0;
let totalScripts = 0;
for (const arq of arquivos) {
  const { texto } = await lerTexto(arq);
  const { problemas, scripts, blocosDeDados, politicas } = conferirPagina(texto);
  totalScripts += scripts.length;
  const nome = nomeRel(arq);
  if (problemas.length) {
    totalProblemas += problemas.length;
    paginasComProblema++;
    for (const p of problemas) console.log(`ERRO  ${nome}: ${p}`);
    continue;
  }
  const dados = blocosDeDados ? `, ${blocosDeDados} bloco(s) de dados ignorado(s)` : '';
  const csp = politicas.length ? 'com CSP' : 'sem CSP';
  const desc = scripts.length ? `${scripts.length} script(s) inline com hash no script-src` : 'sem script inline executável';
  console.log(`ok    ${nome}: ${desc} (${csp}${dados})`);
}
if (totalProblemas) {
  console.log(`\nCSP divergente: ${totalProblemas} problema(s) em ${paginasComProblema} de ${arquivos.length} página(s).`);
  console.log(`Sem o hash certo, o navegador bloqueia o script e o app fica em branco (o <main> só aparece pelo script).`);
  console.log(`Se o script do index.html mudou de propósito, rode: ${COMANDO} --corrigir`);
  console.log('(o --corrigir só reescreve os hashes do script-src do index.html; o resto se corrige à mão)');
  ok = false;
} else {
  console.log(`\nCSP ok: ${arquivos.length} página(s), ${totalScripts} script(s) inline conferido(s).`);
}
process.exit(ok ? 0 : 1);
