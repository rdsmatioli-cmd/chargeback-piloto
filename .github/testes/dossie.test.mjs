// Testes das funções puras do dossiê (index.html), sem dependências: node --test .github/testes/*.test.mjs
// Carrega o <script> do próprio index.html num vm, como o teste da máscara, e chama as funções da página.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const raiz = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', raiz), 'utf8');
const NOMES = ['MATRIZ', 'TEXTOS', 'indiceMotivo', 'dadosDoFormulario', 'montarDossie'];
let src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
src = src.replace(/\}\)\(\);\s*$/, `globalThis.__t = { ${NOMES.map((n) => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')} };})();`);
const ctx = { document: { addEventListener() {} }, console };
vm.createContext(ctx); vm.runInContext(src, ctx);
const { MATRIZ, TEXTOS, indiceMotivo, dadosDoFormulario, montarDossie } = ctx.__t;

// CB-03: índice do motivo validado (inteiro dentro da matriz); vazio ou qualquer outro valor é -1.
test('CB-03: indiceMotivo aceita só inteiro canônico dentro da matriz', () => {
  assert.equal(indiceMotivo('0'), 0);
  assert.equal(indiceMotivo(String(MATRIZ.length - 1)), MATRIZ.length - 1);
  for (const v of ['', ' ', '-1', '1.5', '01', ' 1', '1e1', 'NaN', String(MATRIZ.length), '99999999999999999999', undefined, null])
    assert.equal(indiceMotivo(v), -1, JSON.stringify(v));
});

// CB-01: dadosDoFormulario() é pura (só lê o que recebe) e é a mesma para gerar() e baixar().
const i104 = MATRIZ.findIndex((m) => m.bandeira === 'Visa' && m.codigo === '10.4');
const BASE = { pedido: 'PED-1', ultimos4: '', cnpj: '', gateway: '', motivo: String(i104), fatos: [{ data: '2026-10-01', descricao: 'Primeiro fato' }],
  documentos: [{ nome: 'nota.pdf', tamanho: 10 }, { nome: 'rastreio.pdf', tamanho: 20 }], marcados: [] };
test('CB-01: dadosDoFormulario monta os dados do dossiê sem alterar a entrada', () => {
  const entrada = JSON.parse(JSON.stringify(BASE));
  const r = dadosDoFormulario(entrada);
  assert.equal(r.ok, true);
  assert.deepEqual(entrada, BASE, 'entrada intacta');
  assert.equal(r.dados.pedido, 'PED-1');
  assert.equal(r.dados.motivo, MATRIZ[i104]);
  assert.equal(montarDossie(r.dados).texto, montarDossie(dadosDoFormulario(BASE).dados).texto, 'mesma entrada, mesmo texto');
});
test('CB-01: dadosDoFormulario recusa sem pedido, com 4 últimos inválidos e sem motivo', () => {
  for (const [mud, campo] of [[{ pedido: '  ' }, 'pedido'], [{ ultimos4: '12' }, 'ultimos4'], [{ motivo: '' }, 'motivo'], [{ motivo: '-1' }, 'motivo']]) {
    const r = dadosDoFormulario({ ...BASE, ...mud });
    assert.equal(r.ok, false, JSON.stringify(mud));
    assert.equal(r.campo, campo);
    assert.ok(r.erro.length > 0);
  }
});
test('CB-01: dadosDoFormulario saneia o pedido e devolve o A-3 junto da recusa', () => {
  const r = dadosDoFormulario({ ...BASE, pedido: 'PED 4111 1111 1111 1111' });
  assert.equal(r.valores.pedido, 'PED **** **** **** 1111');
  assert.equal(r.dados.pedido, 'PED **** **** **** 1111');
  assert.deepEqual([...r.avisos], [TEXTOS['A-3']]);
  const s = dadosDoFormulario({ ...BASE, pedido: 'cvv 123', motivo: '' });
  assert.equal(s.ok, false);
  assert.equal(s.campo, 'pedido');
  assert.deepEqual([...s.avisos], [TEXTOS['A-3']]);
});
test('CB-01: vínculos só com evidência e documento existentes, sem repetição, em ordem', () => {
  const r = dadosDoFormulario({ ...BASE, marcados: [[0, 1], [0, 0], [0, 1], [1, 5], [99, 0], [-1, 0], [0.5, 0], [Number.NaN, 1]] });
  assert.deepEqual(JSON.parse(JSON.stringify(r.dados.vinculos[0])), [0, 1]);
  assert.ok(r.dados.vinculos.slice(1).every((v) => v.length === 0));
  assert.equal(r.dados.vinculos.length, MATRIZ[i104].evidencias.length);
});
test('CB-01: gateway fora da lista não entra no dossiê', () => {
  assert.equal(dadosDoFormulario({ ...BASE, gateway: 'Stripe' }).dados.gateway, 'Stripe');
  assert.equal(dadosDoFormulario({ ...BASE, gateway: 'Outro\n3. Documentos' }).dados.gateway, '');
});
