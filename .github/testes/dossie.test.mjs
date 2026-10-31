// Testes das funções puras do dossiê (index.html), sem dependências: node --test .github/testes/*.test.mjs
// Carrega o <script> do próprio index.html num vm, como o teste da máscara, e chama as funções da página.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const raiz = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', raiz), 'utf8');
const NOMES = ['MATRIZ', 'indiceMotivo'];
let src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
src = src.replace(/\}\)\(\);\s*$/, `globalThis.__t = { ${NOMES.map((n) => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')} };})();`);
const ctx = { document: { addEventListener() {} }, console };
vm.createContext(ctx); vm.runInContext(src, ctx);
const { MATRIZ, indiceMotivo } = ctx.__t;

// CB-03: índice do motivo validado (inteiro dentro da matriz); vazio ou qualquer outro valor é -1.
test('CB-03: indiceMotivo aceita só inteiro canônico dentro da matriz', () => {
  assert.equal(indiceMotivo('0'), 0);
  assert.equal(indiceMotivo(String(MATRIZ.length - 1)), MATRIZ.length - 1);
  for (const v of ['', ' ', '-1', '1.5', '01', ' 1', '1e1', 'NaN', String(MATRIZ.length), '99999999999999999999', undefined, null])
    assert.equal(indiceMotivo(v), -1, JSON.stringify(v));
});
