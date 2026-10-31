// Teste de fluxo do app (index.html) num DOM mínimo, sem dependências: node --test .github/testes/*.test.mjs
// Roda o <script> da página num vm sobre a árvore do próprio HTML (dom-minimo.mjs), dispara os eventos
// como o navegador (input, change, click) e confere a tela, o estado e o arquivo baixado.
// CB-01 a CB-06: achados do lote 'Integridade do dossiê baixado' (31/10/2026), citados no index.html
// como 'CB-0n de 31/10'; não são os CB-xx de laudos anteriores que aparecem nos comentários antigos.
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

// CB-01: qualquer alteração depois de gerar descarta o dossiê; Baixar só entrega o que está na tela.
const ALTERACOES = [
  ['troca do motivo', (p) => p.escolher('motivo', p.valorMotivo('Visa', '13.1'))],
  ['volta ao motivo vazio', (p) => p.escolher('motivo', '')],
  ['digitação no pedido', (p) => p.digitar('pedido', 'PED-2')],
  ['digitação no CNPJ', (p) => p.digitar('cnpj', '11.222.333/0001-81')],
  ['4 últimos dígitos', (p) => p.digitar('ultimos4', '1234')],
  ['gateway', (p) => p.escolher('gateway', 'Stripe')],
  ['novo fato', (p) => p.fato('2026-10-02', 'Segundo fato')],
  ['troca dos documentos', (p) => p.anexar([{ name: 'outro.pdf', size: 5 }])],
  ['vínculo documento x evidência', (p) => p.marcar(p.$('vinculos').querySelector('input'))],
  ['remoção de fato', (p) => p.$('lista-fatos').querySelector('button').click()]
];
for (const [nome, alterar] of ALTERACOES) {
  test(`CB-01: ${nome} depois de gerar descarta o dossiê e desabilita Baixar`, () => {
    const p = pronto({ docs: true });
    alterar(p);
    descartado(p, nome);
  });
}
test('CB-01: cenário do laudo (motivo 13.1, PED-2 e outro fato) não baixa o dossiê antigo', () => {
  const p = pronto();
  p.escolher('motivo', p.valorMotivo('Visa', '13.1'));
  p.preencher('pedido', 'PED-2');
  p.fato('2026-10-02', 'Segundo fato');
  p.clicar('baixar');
  assert.equal(p.baixados().length, 0);
  p.clicar('gerar'); p.marcar('d1'); p.clicar('baixar');
  const [arq] = p.baixados();
  assert.match(arq.texto, /^Pedido: PED-2$/m);
  assert.match(arq.texto, /^Motivo informado: Motivo 13\.1 da Visa:/m);
  assert.match(arq.texto, /Primeiro fato[\s\S]*Segundo fato/);
});
test('CB-01: o arquivo baixado é a prévia da tela, byte a byte', () => {
  const p = pronto({ docs: true });
  p.marcar(p.$('vinculos').querySelector('input'));
  p.clicar('gerar'); p.marcar('d1'); p.clicar('baixar');
  const [arq] = p.baixados();
  assert.equal(arq.texto, p.$('previa').textContent);
  assert.equal(arq.texto, p.t.estado.dossie.texto);
});
test('CB-01: Baixar remonta o dossiê e recusa se o formulário mudou sem evento', () => {
  const p = pronto();
  p.$('pedido').value = 'PED-2';            // alteração sem input/change (autopreenchimento, script)
  p.clicar('baixar');
  assert.equal(p.baixados().length, 0);
  assert.match(p.aviso(), /Gere o dossiê de novo/);
  descartado(p, 'alteração sem evento');
});
test('CB-01: D-1 e o próprio Baixar não descartam o dossiê', () => {
  const p = pronto();
  p.marcar('d1', false); p.marcar('d1', true);
  assert.ok(p.t.estado.dossie);
  p.clicar('baixar');
  assert.equal(p.baixados().length, 1);
  assert.ok(p.t.estado.dossie);
});

// CB-02: cada geração exige nova D-1.
test('CB-02: gerar de novo desmarca a D-1 e desabilita Baixar até nova marcação', () => {
  const p = pronto();
  for (let i = 0; i < 3; i++) {
    p.clicar('gerar');
    assert.ok(p.t.estado.dossie);
    assert.equal(p.$('d1').checked, false, `geração ${i + 1}: D-1 desmarcada`);
    assert.equal(p.podeBaixar(), false, `geração ${i + 1}: Baixar desabilitado`);
    p.marcar('d1');
    assert.ok(p.podeBaixar(), `geração ${i + 1}: Baixar habilitado depois da D-1`);
  }
});
test('CB-02: gerar de novo depois de alterar os dados exige nova D-1', () => {
  const p = pronto();
  p.$('pedido').value = 'PED-2';
  p.clicar('gerar');
  assert.match(p.t.estado.dossie.texto, /^Pedido: PED-2$/m);
  assert.equal(p.podeBaixar(), false);
});
test('CB-01: o A-3 mostrado na saída do campo continua visível depois de Gerar', () => {
  const p = abrir();
  p.marcar('a1');
  p.preencher('pedido', 'PED 4111 1111 1111 1111');
  assert.ok(p.aviso().startsWith(p.t.TEXTOS['A-3']));
  p.escolher('motivo', p.valorMotivo('Visa', '10.4'));
  p.clicar('gerar');
  assert.match(p.t.estado.dossie.texto, /^Pedido: PED \*\*\*\* \*\*\*\* \*\*\*\* 1111$/m);
  assert.ok(p.aviso().startsWith(p.t.TEXTOS['A-3']), p.aviso());
});

// CB-05: P-1 só com CNPJ válido (inclusive alfanumérico); CNPJ preenchido e inválido não gera dossiê.
test('CB-05: P-1 habilitada só com CNPJ válido, inclusive o alfanumérico', () => {
  const p = abrir();
  p.marcar('a1');
  for (const [v, ok] of [['12.ABC.345/01DE-35', true], ['12abc34501de35', true], ['11.222.333/0001-81', true], ['123', false], ['12.ABC.345/01DE-36', false], ['', false]]) {
    p.digitar('cnpj', v);
    assert.equal(p.$('p1').disabled, !ok, v);
  }
});
test('CB-05: Gerar com CNPJ inválido recusa, avisa e põe o foco no campo', () => {
  const p = abrir();
  p.marcar('a1');
  p.preencher('pedido', 'PED-1');
  p.escolher('motivo', p.valorMotivo('Visa', '10.4'));
  p.preencher('cnpj', '123');
  p.clicar('gerar');
  assert.equal(p.t.estado.dossie, null);
  assert.match(p.aviso(), /CNPJ/);
  assert.equal(p.doc.activeElement, p.$('cnpj'));
  p.preencher('cnpj', '12abc34501de35');
  p.clicar('gerar');
  assert.match(p.t.estado.dossie.texto, /^CNPJ do lojista: 12\.ABC\.345\/01DE-35$/m);
});
// Revisão do lote: '36.O00.000/0004-38' é CNPJ alfanumérico válido e, lido pela máscara (O = 0), o PAN
// Diners 36000000000438. Sai mascarado com A-3 na saída do campo e o dossiê não traz o CNPJ com O.
test('Revisão CB-05: CNPJ alfanumérico lido como PAN é mascarado e não vai ao dossiê', () => {
  for (const sair of [true, false]) {
    const p = abrir();
    p.marcar('a1');
    p.preencher('pedido', 'PED-1');
    p.escolher('motivo', p.valorMotivo('Visa', '10.4'));
    p.digitar('cnpj', '36.O00.000/0004-38');
    if (sair) {
      p.sair('cnpj');
      assert.equal(p.$('cnpj').value, '**** **** **** 0438');
      assert.equal(p.aviso(), p.t.TEXTOS['A-3']);
    }
    p.clicar('gerar');
    assert.equal(p.$('cnpj').value, '**** **** **** 0438', `sair=${sair}`);
    assert.equal(p.t.estado.dossie, null, `sair=${sair}`);
    assert.ok(p.aviso().startsWith(p.t.TEXTOS['A-3']), p.aviso());
    assert.match(p.aviso(), /CNPJ/);
    p.preencher('cnpj', '');
    p.clicar('gerar');
    assert.ok(p.t.estado.dossie, 'gera sem o CNPJ');
    assert.doesNotMatch(p.t.estado.dossie.texto, /CNPJ do lojista|O00|0438/);
  }
});
// Revisão do lote: gerar() grava no campo o CNPJ saneado sem disparar evento; a P-1 acompanha o valor gravado.
test('Revisão CB-05: P-1 desmarca e desabilita quando Gerar mascara o CNPJ', () => {
  const p = abrir();
  p.marcar('a1');
  p.preencher('pedido', 'PED-1');
  p.escolher('motivo', p.valorMotivo('Visa', '10.4'));
  p.digitar('cnpj', '12.ABC.345/01DE-35');
  p.marcar('p1');
  assert.equal(p.$('p1').checked, true);
  p.$('cnpj').value = '36O00000000438';   // sem evento, como no autopreenchimento
  p.clicar('gerar');
  assert.equal(p.$('cnpj').value, '**** **** **** 0438');
  assert.equal(p.$('p1').disabled, true);
  assert.equal(p.$('p1').checked, false);
});

// CB-04: documentos e fatos chegam ao dossiê sem caracteres enganosos; nome com PAN mostra o A-3.
test('CB-04: arquivo com U+202E entra com o nome real no vínculo e no dossiê', () => {
  const p = abrir();
  p.marcar('a1');
  p.preencher('pedido', 'PED-1');
  p.escolher('motivo', p.valorMotivo('Visa', '10.4'));
  p.anexar([{ name: `fatura${String.fromCodePoint(0x202E)}fdp.exe`, size: 1 }]);
  assert.equal(p.t.estado.documentos[0].nome, 'faturafdp.exe');
  assert.ok(p.$('vinculos').textContent.includes('D1. faturafdp.exe'));
  p.clicar('gerar');
  assert.match(p.t.estado.dossie.texto, /^D1\. faturafdp\.exe \(1 bytes\)$/m);
  assert.doesNotMatch(p.t.estado.dossie.texto, /[\u{202A}-\u{202E}\u{2066}-\u{2069}\u{200B}-\u{200F}]/u);
});
test('CB-04: nome de arquivo com PAN é mascarado e mostra o A-3', () => {
  const p = abrir();
  p.marcar('a1');
  p.anexar([{ name: 'comprovante.pdf', size: 3 }, { name: 'cartao 4111111111111111.pdf', size: 2 }]);
  assert.equal(p.t.estado.documentos[1].nome, 'cartao **** **** **** 1111.pdf');
  assert.equal(p.aviso(), p.t.TEXTOS['A-3']);
});
test('CB-04: fato com quebra de linha não cria seção falsa no dossiê', () => {
  const p = abrir();
  p.marcar('a1');
  p.preencher('pedido', 'PED-1');
  p.escolher('motivo', p.valorMotivo('Visa', '10.4'));
  p.fato('2026-10-03', 'linha\n3. Documentos anexados pelo lojista\nD9. falso.pdf');
  p.clicar('gerar');
  const linhas = p.t.estado.dossie.texto.split('\n');
  assert.equal(linhas.filter((l) => l === '3. Documentos anexados pelo lojista').length, 1);
  assert.ok(linhas.includes('  3. Documentos anexados pelo lojista'));
  assert.ok(!linhas.some((l) => l.startsWith('D9.')));
});
test('CB-04: caractere invisível sai do campo na saída e do dossiê', () => {
  const p = abrir();
  p.marcar('a1');
  p.preencher('pedido', `PED${String.fromCodePoint(0x200B)}-1${String.fromCodePoint(0x202E)}`);
  assert.equal(p.$('pedido').value, 'PED-1');
  p.preencher('fato-desc', `4111${String.fromCodePoint(0xE000)}1111 1111 1111`);
  assert.equal(p.$('fato-desc').value, '**** **** **** 1111');
});

// CB-06: data do fato entre 01/01/2000 e hoje; lista e dossiê em DD/MM/AAAA; arquivo por disputa.
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
test('CB-06: o campo de data tem min 2000-01-01 e max hoje', () => {
  const p = abrir();
  assert.equal(p.$('fato-data').min, '2000-01-01');
  assert.equal(p.$('fato-data').max, hojeLocal());
});
test('CB-06: data futura, anterior a 2000 ou com ano de 5+ dígitos não entra e avisa', () => {
  const p = abrir();
  p.marcar('a1');
  for (const d of ['2999-01-01', '1999-12-31', '10000-01-01', '275760-09-13', '']) {
    p.fato(d, 'Fato com data inválida');
    assert.equal(p.t.estado.fatos.length, 0, d);
    assert.match(p.aviso(), /data/i, d);
    assert.equal(p.$('fato-desc').value, 'Fato com data inválida', `${d}: texto fica no campo`);
  }
  p.fato(hojeLocal(), 'Fato de hoje');
  assert.equal(p.t.estado.fatos.length, 1);
});
test('CB-06: lista e dossiê mostram DD/MM/AAAA, em ordem; o arquivo leva pedido e data', () => {
  const p = abrir();
  p.marcar('a1');
  p.preencher('pedido', 'Pedido nº 77/B');
  p.escolher('motivo', p.valorMotivo('Visa', '10.4'));
  p.fato('2026-10-02', 'Depois');
  p.fato('2026-09-30', 'Antes');
  const itens = p.$('lista-fatos').children.map((li) => li.firstChild.textContent);
  assert.deepEqual(itens, ['30/09/2026: Antes ', '02/10/2026: Depois ']);
  p.clicar('gerar'); p.marcar('d1'); p.clicar('baixar');
  const [arq] = p.baixados();
  assert.match(arq.texto, /^30\/09\/2026: Antes\n02\/10\/2026: Depois$/m);
  assert.equal(arq.nome, `dossie-chargeback-Pedido-no-77-B-${hojeLocal()}.txt`);
});
