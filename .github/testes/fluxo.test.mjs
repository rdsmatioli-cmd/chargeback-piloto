// Teste de fluxo do app (index.html) num DOM mínimo, sem dependências: node --test .github/testes/*.test.mjs
// Roda o <script> da página num vm sobre a árvore do próprio HTML (dom-minimo.mjs), dispara os eventos
// como o navegador (input, change, click) e confere a tela, o estado e o arquivo baixado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { documentoDe, contextoDe, Evento } from './dom-minimo.mjs';

const raiz = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', raiz), 'utf8');
const INTERNOS = ['estado', 'MATRIZ', 'TEXTOS'];

function abrir() {
  const doc = documentoDe(html);
  const ctx = contextoDe(doc);
  let src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  src = src.replace(/\}\)\(\);\s*$/, `globalThis.__t = { ${INTERNOS.map((n) => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')} };})();`);
  vm.createContext(ctx); vm.runInContext(src, ctx);
  doc.dispatchEvent(new Evento('DOMContentLoaded'));
  const $ = (id) => doc.getElementById(id);
  const el = (x) => (typeof x === 'string' ? $(x) : x);
  const disparar = (x, ...tipos) => { for (const t of tipos) el(x).dispatchEvent(new Evento(t)); };
  const p = {
    doc, ctx, $, t: ctx.__t,
    digitar(id, v) { $(id).focus(); $(id).value = v; disparar(id, 'input'); },
    sair(id) { disparar(id, 'change', 'blur'); },
    preencher(id, v) { p.digitar(id, v); p.sair(id); },
    escolher(id, v) { $(id).value = v; disparar(id, 'input', 'change'); },
    // Como o clique do navegador: o estado muda antes do click, depois vêm input e change.
    marcar(x, v = true) { const c = el(x); if (c.disabled || c.checked === v) return; c.checked = v; disparar(c, 'click', 'input', 'change'); },
    clicar(id) { $(id).click(); },
    anexar(arquivos) { $('docs').files = arquivos; disparar('docs', 'input', 'change'); },
    valorMotivo(bandeira, codigo) { const o = $('motivo').options.find((x) => x.textContent.startsWith(`Motivo ${codigo} da ${bandeira}:`)); return o.value; },
    fato(data, desc) { p.preencher('fato-data', data); p.preencher('fato-desc', desc); p.clicar('add-fato'); },
    baixados() { return doc.downloads.map((d) => ({ nome: d.nome, texto: ctx.blobs.get(d.href).texto() })); },
    aviso() { return $('aviso').hidden ? '' : $('aviso').textContent; },
    podeBaixar() { return !$('baixar').disabled; }
  };
  return p;
}

// Dossiê gerado, D-1 marcada e Baixar habilitado.
function pronto({ docs = false } = {}) {
  const p = abrir();
  p.marcar('a1');
  p.preencher('pedido', 'PED-1');
  p.escolher('motivo', p.valorMotivo('Visa', '10.4'));
  p.fato('2026-10-01', 'Primeiro fato');
  if (docs) p.anexar([{ name: 'nota-fiscal.pdf', size: 10 }, { name: 'rastreio.pdf', size: 20 }]);
  p.clicar('gerar');
  assert.ok(p.t.estado.dossie, 'dossiê gerado');
  p.marcar('d1');
  assert.ok(p.podeBaixar(), 'Baixar habilitado com D-1');
  return p;
}
function descartado(p, oQue) {
  assert.equal(p.t.estado.dossie, null, `${oQue}: estado.dossie zerado`);
  assert.equal(p.$('previa').textContent, '', `${oQue}: prévia limpa`);
  assert.ok(p.$('etapa-d1').hidden, `${oQue}: etapa D-1 oculta`);
  assert.equal(p.$('d1').checked, false, `${oQue}: D-1 desmarcada`);
  assert.equal(p.podeBaixar(), false, `${oQue}: Baixar desabilitado`);
}

test('fluxo: a página inicia no DOM mínimo e o aceite A-1 mostra o formulário', () => {
  const p = abrir();
  assert.equal(p.doc.querySelector('main').hidden, false);
  assert.ok(p.$('form').hidden);
  p.marcar('a1');
  assert.equal(p.$('form').hidden, false);
});

// CB-03: o motivo não vem pré-selecionado e o dossiê não sai sem motivo escolhido.
test('CB-03: o select de motivo abre vazio, sem evidências listadas', () => {
  const p = abrir();
  assert.equal(p.$('motivo').value, '');
  assert.equal(p.$('motivo').options[0].textContent, '(selecione o motivo)');
  assert.equal(p.$('vinculos').children.length, 0);
  assert.equal(p.$('fonte-motivo').textContent, '');
  assert.equal(p.$('rodape-prazos').hidden, false);
  assert.ok(p.$('rodape-prazos').textContent.length > 0);
});
test('CB-03: gerar sem motivo não cria estado.dossie, avisa e põe o foco no select', () => {
  const p = abrir();
  p.marcar('a1');
  p.preencher('pedido', 'PED-1');
  p.fato('2026-10-01', 'Primeiro fato');
  p.clicar('gerar');
  assert.equal(p.t.estado.dossie, null);
  assert.equal(p.$('previa').textContent, '');
  assert.ok(p.$('etapa-d1').hidden);
  assert.match(p.aviso(), /motivo/i);
  assert.equal(p.doc.activeElement, p.$('motivo'));
});
test('CB-03: com o motivo escolhido, as evidências aparecem e o dossiê sai com ele', () => {
  const p = abrir();
  p.marcar('a1');
  p.preencher('pedido', 'PED-1');
  p.escolher('motivo', p.valorMotivo('Visa', '13.1'));
  assert.ok(p.$('vinculos').children.length > 0);
  p.clicar('gerar');
  assert.match(p.t.estado.dossie.texto, /^Motivo informado: Motivo 13\.1 da Visa:/m);
  p.escolher('motivo', '');
  assert.equal(p.$('vinculos').children.length, 0);
});
