// Testes da máscara de cartão do app (index.html), sem dependências: node --test .github/testes/*.test.mjs
// Carrega o <script> do próprio index.html num vm e chama sanearCampo/sanear como a página.
// Matriz: os 171 casos do laudo QA app-retro-20fa739 (2026-10-28); C-01 exige 0 PAN em claro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const raiz = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', raiz), 'utf8');
let src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
src = src.replace(/\}\)\(\);\s*$/, 'globalThis.__t = { sanearCampo, sanear, mascararCartao };})();');
const ctx = { document: { addEventListener() {} }, console };
vm.createContext(ctx); vm.runInContext(src, ctx);
const { sanearCampo, sanear, mascararCartao } = ctx.__t;

const ascii = (t) => t.replace(/[\uFF10-\uFF19]/g, (c) => String(c.charCodeAt(0) - 0xFF10));
const digitos = (t) => ascii(t).replace(/\D/g, '');
function luhnCompleta(base) { for (let c = 0; c < 10; c++) { const n = base + c; let s = 0; for (let i = 0; i < n.length; i++) { let x = +n[n.length - 1 - i]; if (i % 2) { x *= 2; if (x > 9) x -= 9; } s += x; } if (s % 10 === 0) return n; } }

const matriz = JSON.parse(readFileSync(new URL('.github/testes/matriz-qa-20fa739.json', raiz), 'utf8'));
test('matriz QA tem 171 casos', () => assert.equal(matriz.length, 171));
for (const c of matriz) {
  test(`QA ${c.id} (${c.esperado})`, () => {
    const r = sanearCampo(c.campo, c.entrada);
    if (c.esperado === 'keep') { assert.equal(r.texto, c.entrada); return; }
    assert.notEqual(r.texto, c.entrada);
    // nenhuma sequência de 13+ dígitos da entrada sobrevive inteira; os 4 últimos ficam visíveis
    const seq = digitos(c.entrada).match(/\d{13,}/g) || [];
    assert.ok(/\*\*\*\* \*\*\*\* \*\*\*\* \d{4}/.test(r.texto), r.texto);
    // o PAN da entrada (16 dígitos de teste mais comuns da matriz) não sobrevive inteiro
    for (const d of seq) assert.ok(!digitos(r.texto).includes(d.length <= 19 ? d : '-'), r.texto);
  });
}
test('C-01: dossiê do fluxo real sem PAN (pedido 123 e ano antes)', () => {
  for (const [campo, t] of [['pedido', 'Pedido 123 4111 0000 0000 0008'], ['fato-desc', 'em 2026 4111 0000 0000 0008']]) {
    const r = campo === 'pedido' ? sanearCampo(campo, t) : sanear(t);
    assert.ok(!digitos(r.texto).includes('4111000000000008'), r.texto);
    assert.ok(r.texto.endsWith('**** **** **** 0008'));
  }
});

// Parecer B-01: prefixo 1 (UATP) e 2200-2220 (Mir) mascarados em texto livre; no Pedido seguem como antes.
const uatp = luhnCompleta('10000000000000');       // 15 dígitos
const mir = luhnCompleta('220000000000000');       // 16 dígitos
test('B-01: UATP e Mir em fato são mascarados', () => {
  for (const p of [uatp, mir]) {
    const r = sanear(`cartão ${p} usado`);
    assert.equal(r.texto, `cartão **** **** **** ${p.slice(-4)} usado`);
  }
});
test('B-01: UATP e Mir no Pedido não são mascarados (filtro CB-01 mantido)', () => {
  for (const p of [uatp, mir]) assert.equal(sanearCampo('pedido', p).texto, p);
});

// Parecer B-02: exceção de CNPJ no campo CNPJ.
test('B-02: CNPJ válido comum no campo CNPJ fica em claro', () => {
  assert.equal(sanearCampo('cnpj', '11.222.333/0001-81').texto, '11.222.333/0001-81');
  assert.equal(sanearCampo('cnpj', '40000000001935').texto, '40000000001935');
});
test('B-02: CNPJ válido que também é PAN Diners (36, Luhn ok) é mascarado no campo CNPJ', () => {
  assert.equal(sanearCampo('cnpj', '36000000003820').texto, '**** **** **** 3820');
  assert.equal(sanearCampo('cnpj', '36.000.000/0038-20').texto, '**** **** **** 3820');
});

// Laudo QA PR #9 (588aed0c), C-02: 25 casos adversariais (20 com PAN, 5 sem).
const PANS = ['4111000000000008', '378282246310005', '122000000000003'];
const extra = JSON.parse(readFileSync(new URL('.github/testes/extra-qa-pr9-588aed0c.json', raiz), 'utf8'));
test('extra QA tem 25 casos', () => assert.equal(extra.length, 25));
for (const c of extra) {
  test(`C-02 ${c.id} (${c.esperado}) ${JSON.stringify(c.entrada).slice(0, 40)}`, () => {
    const r = sanearCampo(c.campo, c.entrada);
    if (c.esperado === 'keep') { assert.equal(r.texto, c.entrada); return; }
    const so = digitos(r.texto);
    for (const p of PANS) assert.ok(!so.includes(p), `PAN em claro: ${r.texto}`);
    assert.match(r.texto, /\*\*\*\* \*\*\*\* \*\*\*\* \d{4}/);
  });
}

// Laudo QA PR #9 (84c7ce26), C-03 / A-04 / M-04: 33 casos adversariais (24 com PAN, 9 sem).
// Oráculo do QA: o PAN não pode aparecer nos dígitos da saída, lendo o/O como 0 e l como 1.
const PANS2 = ['4111000000000008', '5555555555554444', '378282246310005', '6062826786276634', '5067230000000002'];
const dig2 = (t) => [...t.replace(/[oO]/g, '0').replace(/l/g, '1')].map((c) => {
  if (/[0-9]/.test(c)) return c; const n = c.codePointAt(0);
  for (const z of [0x0660, 0x06F0, 0x0966, 0x09E6, 0xFF10]) if (n >= z && n <= z + 9) return String(n - z);
  return '';
}).join('');
const adv2 = JSON.parse(readFileSync(new URL('.github/testes/adv2-qa-pr9-84c7ce26.json', raiz), 'utf8'));
test('adv2 QA tem 33 casos', () => assert.equal(adv2.length, 33));
for (const c of adv2) {
  test(`C-03/A-04/M-04 ${c.id} (${c.esperado})`, () => {
    const r = sanearCampo(c.campo, c.entrada);
    if (c.esperado === 'keep') { assert.equal(r.texto, c.entrada); return; }
    const so = dig2(r.texto);
    for (const p of PANS2) assert.ok(!so.includes(p), `PAN em claro: ${r.texto}`);
  });
}

// A-03: mascaramento linear. Cada entrada abaixo em menos de 100 ms (melhor de 5 execuções, para
// não oscilar em runner compartilhado: laudo 84c7ce26 B-04), e o tempo cresce de forma linear.
const V = '4111000000000008';
const ENTRADAS = [
  ['20.000 grupos de 1 dígito', Array(20000).fill('1').join(' ')],
  ['20.000 grupos de 4 dígitos', Array(20000).fill('4111').join(' ')],
  ['20.000 grupos de 1 dígito com |', Array(20000).fill('5').join('|')],
  ['grupo único de 200.000 dígitos', '4'.repeat(200000)],
  ['"1O" x 50.000', '1O'.repeat(50000)],
  ['5.000 quase-PANs', Array(5000).fill(V.slice(0, -1) + '9').join(' ')],
  ['5.000 PANs colados', V.repeat(5000)]
];
function melhorDe5(t) { let m = Infinity; for (let i = 0; i < 5; i++) { const t0 = performance.now(); sanearCampo('fato-desc', t); m = Math.min(m, performance.now() - t0); } return m; }
for (const [nome, big] of ENTRADAS) {
  test(`A-03: ${nome} em < 100 ms`, () => { const dt = melhorDe5(big); assert.ok(dt < 100, `${dt.toFixed(1)} ms`); });
}
test('A-03: tempo linear (4x a entrada custa menos de 8x)', () => {
  const pequeno = Array(10000).fill('1').join(' '), grande = Array(40000).fill('1').join(' ');
  const a = melhorDe5(pequeno), b = melhorDe5(grande);
  assert.ok(b < Math.max(8 * a, 20), `${a.toFixed(1)} ms -> ${b.toFixed(1)} ms`);
});
