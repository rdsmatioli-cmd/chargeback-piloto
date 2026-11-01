// DOM mínimo para o teste de fluxo do app (index.html), sem dependências. Cobre só o que o <script>
// da página usa: getElementById, createElement, querySelector(All) com seletores simples, eventos com
// propagação, textContent, value/checked/disabled/hidden, dataset, atributos (set/get/has/remove), select
// com options, foco, scrollIntoView (registrado em document.rolagens), style (só guarda o que se grava; o teste de
// suporte do CB-13 usa) e download por <a download>. A árvore vem do <body> do próprio HTML, para os ids e a
// estrutura serem os da página.
const VAZIOS = new Set(['input', 'meta', 'br', 'hr', 'img', 'link', 'source', 'wbr']);
const SEM_BOLHA = new Set(['focus', 'blur']);
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u{A0}' };
const decodificar = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e] ?? m));
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class Evento {
  constructor(type, init = {}) { this.type = type; this.bubbles = init.bubbles ?? !SEM_BOLHA.has(type); this.target = null; this.defaultPrevented = false; this.parado = false; }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.parado = true; }
}

class No {
  constructor(doc) { this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; this.ouvintes = {}; }
  addEventListener(tipo, fn) { (this.ouvintes[tipo] ||= []).push(fn); }
  removeEventListener(tipo, fn) { this.ouvintes[tipo] = (this.ouvintes[tipo] || []).filter((f) => f !== fn); }
  dispatchEvent(ev) {
    ev.target = this;
    const caminho = [];
    for (let n = this; n; n = n.parentNode) caminho.push(n);
    if (caminho[caminho.length - 1] !== this.ownerDocument && this.ownerDocument && this.isConnected) caminho.push(this.ownerDocument);
    for (const n of ev.bubbles ? caminho : [this]) {
      ev.currentTarget = n;
      for (const fn of [...(n.ouvintes[ev.type] || [])]) fn.call(n, ev);
      if (ev.parado) break;
    }
    return !ev.defaultPrevented;
  }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument; }
}

class Texto extends No {
  constructor(doc, t) { super(doc); this.data = t; }
  get textContent() { return this.data; }
  set textContent(t) { this.data = String(t); }
}

class Elemento extends No {
  constructor(doc, tag, attrs = {}) {
    super(doc);
    this.tagName = tag.toUpperCase(); this.attrs = {}; this.dataset = {}; this.files = []; this.style = {};
    this._valor = null; this._sel = null;
    for (const [k, v] of Object.entries(attrs)) this.setAttribute(k, v);
    this.checked = 'checked' in attrs; this.disabled = 'disabled' in attrs; this.hidden = 'hidden' in attrs;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith('data-')) this.dataset[camel(k.slice(5))] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  removeAttribute(k) { delete this.attrs[k]; if (k.startsWith('data-')) delete this.dataset[camel(k.slice(5))]; }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = String(v); }
  get type() { return (this.attrs.type || (this.tagName === 'INPUT' ? 'text' : this.tagName === 'BUTTON' ? 'submit' : '')).toLowerCase(); }
  set type(v) { this.attrs.type = String(v); }
  get min() { return this.attrs.min || ''; }
  set min(v) { this.attrs.min = String(v); }
  get max() { return this.attrs.max || ''; }
  set max(v) { this.attrs.max = String(v); }
  get download() { return this.attrs.download || ''; }
  set download(v) { this.attrs.download = String(v); }
  get href() { return this.attrs.href || ''; }
  set href(v) { this.attrs.href = String(v); }
  get children() { return this.childNodes.filter((n) => n instanceof Elemento); }
  get parentElement() { return this.parentNode instanceof Elemento ? this.parentNode : null; }
  get firstChild() { return this.childNodes[0] || null; }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(t) { for (const n of this.childNodes) n.parentNode = null; this.childNodes = []; if (String(t) !== '') this.appendChild(new Texto(this.ownerDocument, String(t))); }
  appendChild(n) { if (n.parentNode) n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1); n.parentNode = this; this.childNodes.push(n); return n; }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new Texto(this.ownerDocument, n) : n); }
  // select: options e valor; option: valor do atributo ou o texto.
  get options() { return this.querySelectorAll('option'); }
  get selectedIndex() { const os = this.options; if (this._sel !== null && this._sel < os.length) return this._sel; const i = os.findIndex((o) => o.hasAttribute('selected')); return i >= 0 ? i : os.length ? 0 : -1; }
  set selectedIndex(i) { this._sel = i; }
  get value() {
    if (this.tagName === 'SELECT') { const i = this.selectedIndex; return i >= 0 ? this.options[i].value : ''; }
    if (this.tagName === 'OPTION') return this.attrs.value ?? this.textContent;
    if (this.tagName === 'INPUT' && this.type === 'checkbox') return this.attrs.value ?? 'on';
    if (this._valor !== null) return this._valor;
    return this.tagName === 'TEXTAREA' ? this.textContent : this.attrs.value ?? '';
  }
  set value(v) {
    if (this.tagName === 'SELECT') { this._sel = this.options.findIndex((o) => o.value === String(v)); return; }
    if (this.tagName === 'OPTION') { this.attrs.value = String(v); return; }
    // Como no navegador: input de uma linha descarta quebras de linha; textarea normaliza CRLF.
    let s = String(v);
    if (this.tagName === 'INPUT') s = s.replace(/[\r\n]/g, ''); else s = s.replace(/\r\n?/g, '\n');
    this._valor = s;
  }
  focus() { this.ownerDocument.activeElement = this; }
  scrollIntoView(opcoes) { this.ownerDocument.rolagens.push({ el: this, opcoes }); }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  click() {
    if (this.disabled) return;
    if (this.tagName === 'A' && this.hasAttribute('download')) { this.ownerDocument.downloads.push({ nome: this.download, href: this.href }); return; }
    this.dispatchEvent(new Evento('click'));
  }
  matches(sel) { return sel.split(',').some((s) => casa(this, s.trim())); }
  querySelectorAll(sel) { const r = []; const visita = (n) => { for (const f of n.children) { if (f.matches(sel)) r.push(f); visita(f); } }; visita(this); return r; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

// Seletor: compostos separados por espaço (descendente); composto = tag, #id, [attr=valor], :checked, :disabled.
function casaComposto(el, comp) {
  const re = /^([a-z][\w-]*|\*)?((?:#[\w-]+|\.[\w-]+|\[[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\]]+))?\]|:checked|:disabled)*)$/i;
  const m = comp.match(re);
  if (!m) throw new Error(`seletor não suportado no DOM mínimo: ${comp}`);
  if (m[1] && m[1] !== '*' && el.tagName !== m[1].toUpperCase()) return false;
  for (const p of m[2].match(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:checked|:disabled/g) || []) {
    if (p[0] === '#' && el.id !== p.slice(1)) return false;
    if (p[0] === '.' && !(el.getAttribute('class') || '').split(/\s+/).includes(p.slice(1))) return false;
    if (p === ':checked' && !el.checked) return false;
    if (p === ':disabled' && !el.disabled) return false;
    if (p[0] === '[') {
      const [, k, v] = p.match(/^\[([\w-]+)(?:=(.*))?\]$/);
      const atual = k === 'type' ? el.type : el.getAttribute(k);
      if (v === undefined ? atual === null : atual !== v.replace(/^["']|["']$/g, '')) return false;
    }
  }
  return true;
}
function casa(el, sel) {
  const partes = sel.split(/\s+/);
  if (!casaComposto(el, partes[partes.length - 1])) return false;
  let n = el.parentElement;
  for (let i = partes.length - 2; i >= 0; i--) { while (n && !casaComposto(n, partes[i])) n = n.parentElement; if (!n) return false; n = n.parentElement; }
  return true;
}

class Documento extends No {
  constructor() { super(null); this.ownerDocument = this; this.downloads = []; this.rolagens = []; this.title = ''; this.body = new Elemento(this, 'body'); this.body.parentNode = this; this.activeElement = this.body; }
  createElement(tag) { return new Elemento(this, tag); }
  getElementById(id) { return this.body.querySelectorAll(`#${id}`)[0] || null; }
  querySelectorAll(sel) { return this.body.querySelectorAll(sel); }
  querySelector(sel) { return this.body.querySelector(sel); }
  get isConnected() { return true; }
}

// Monta o <body> do HTML (sem os <script>) num Documento.
export function documentoDe(html) {
  const doc = new Documento();
  const corpo = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/gi, '');
  const pilha = [doc.body];
  const re = /<!--[\s\S]*?-->|<\/([a-z][\w-]*)\s*>|<([a-z][\w-]*)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>|([^<]+)/gi;
  for (const m of corpo.matchAll(re)) {
    const topo = pilha[pilha.length - 1];
    if (m[1]) { const tag = m[1].toUpperCase(); const i = pilha.map((e) => e.tagName).lastIndexOf(tag); if (i > 0) pilha.length = i; continue; }
    if (m[2]) {
      const attrs = {};
      for (const a of m[3].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) attrs[a[1].toLowerCase()] = decodificar(a[2] ?? a[3] ?? a[4] ?? '');
      const el = new Elemento(doc, m[2], attrs);
      topo.appendChild(el);
      if (!VAZIOS.has(m[2].toLowerCase())) pilha.push(el);
      continue;
    }
    if (m[4] && m[4].trim()) topo.appendChild(new Texto(doc, decodificar(m[4])));
  }
  return doc;
}

// Contexto para o vm: document, Blob, URL, location (só o hash; CB-17), ouvintes da janela (addEventListener global,
// disparados por dispararNaJanela) e setTimeout síncrono (o paste e o revokeObjectURL usam).
export function contextoDe(doc, { hash = '' } = {}) {
  const blobs = new Map();
  class Blob { constructor(partes = [], opcoes = {}) { this.partes = partes; this.type = opcoes.type || ''; } texto() { return this.partes.join(''); } }
  let n = 0;
  const URL = { createObjectURL(b) { const u = `blob:teste/${++n}`; blobs.set(u, b); return u; }, revokeObjectURL() {} };
  const janela = {};
  return { document: doc, Blob, URL, location: { hash }, console, setTimeout: (fn) => { fn(); return 0; }, clearTimeout() {}, blobs, Evento,
    addEventListener(tipo, fn) { (janela[tipo] ||= []).push(fn); }, janela };
}
// Evento na janela (como o load, que vem depois do DOMContentLoaded): roda e descarta os ouvintes daquele tipo.
export function dispararNaJanela(ctx, tipo) { for (const fn of (ctx.janela[tipo] || []).splice(0)) fn(new Evento(tipo)); }
export { Evento };
