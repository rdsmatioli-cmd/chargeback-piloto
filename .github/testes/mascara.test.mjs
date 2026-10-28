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

const ZEROS_T = [0x0660, 0x06F0, 0x0966, 0x09E6, 0xFF10];
const ascii = (t) => t.replace(/\p{Nd}/gu, (c) => { const n = c.codePointAt(0); for (const z of ZEROS_T) if (n >= z && n <= z + 9) return String(n - z); return c; });
// Adendo 2, M-02: caso 'mask' só passa se a saída mudou, tem '**** **** **** dddd' e nenhum PAN
// aparece nos dígitos puros; o/O -> 0 e I/l -> 1 só dentro de palavra de dígitos e dessas letras.
const comLetras = (t) => ascii(t).replace(/(?<![\p{L}\p{N}])(?=[0-9OoIl]*[0-9])[0-9OoIl]+(?![\p{L}\p{N}])/gu, (w) => w.replace(/[Oo]/g, '0').replace(/[Il]/g, '1'));
function confereMascara(entrada, saida, pans) {
  assert.notEqual(saida, entrada, 'saída igual à entrada');
  assert.match(saida, /\*\*\*\* \*\*\*\* \*\*\*\* \d{4}/);
  const puros = ascii(saida).replace(/\D/g, ''), mapeados = comLetras(saida).replace(/\D/g, '');
  for (const p of pans) { assert.ok(!puros.includes(p), `PAN em claro: ${saida}`); assert.ok(!mapeados.includes(p), `PAN em claro (o/l): ${saida}`); }
}
const digitos = (t) => ascii(t).replace(/\D/g, '');
function luhnCompleta(base) { for (let c = 0; c < 10; c++) { const n = base + c; let s = 0; for (let i = 0; i < n.length; i++) { let x = +n[n.length - 1 - i]; if (i % 2) { x *= 2; if (x > 9) x -= 9; } s += x; } if (s % 10 === 0) return n; } }

const matriz = JSON.parse(readFileSync(new URL('.github/testes/matriz-qa-20fa739.json', raiz), 'utf8'));
// Laudo 133315fc A-06: Maestro6759-luhn-invalido e pedido-numerico reclassificados para mask (nota no JSON).
test('matriz QA tem 171 casos', () => assert.equal(matriz.length, 171));
for (const c of matriz) {
  test(`QA ${c.id} (${c.esperado})`, () => {
    const r = sanearCampo(c.campo, c.entrada);
    if (c.esperado === 'keep') { assert.equal(r.texto, c.entrada); return; }
    confereMascara(c.entrada, r.texto, (ascii(c.entrada).replace(/\D/g, '').match(/\d{13,19}/g) || []).filter((d) => d.length <= 19));
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
    confereMascara(c.entrada, r.texto, PANS);
  });
}

// Laudo QA PR #9 (84c7ce26), C-03 / A-04 / M-04: 33 casos adversariais (24 com PAN, 9 sem).
const PANS2 = ['4111000000000008', '5555555555554444', '378282246310005', '6062826786276634', '5067230000000002'];
const adv2 = JSON.parse(readFileSync(new URL('.github/testes/adv2-qa-pr9-84c7ce26.json', raiz), 'utf8'));
test('adv2 QA tem 33 casos + 1 (fullwidth-16)', () => assert.equal(adv2.length, 34));
for (const c of adv2) {
  test(`C-03/A-04/M-04 ${c.id} (${c.esperado})`, () => {
    const r = sanearCampo(c.campo, c.entrada);
    if (c.esperado === 'keep') { assert.equal(r.texto, c.entrada); return; }
    confereMascara(c.entrada, r.texto, PANS2);
  });
}

// Adendo 2 do Advogado (d8158468), M-01 e S-01: PAN separado por palavras ou pontuação.
const ADENDO2 = ['4111 0000 e os últimos 0000 0008', 'primeiros 4111 0000 e os últimos 0000 0008', '4111 0000 depois disso 0000 0008',
  '4111 0000 (meio) 0000 0008', '4111 0000. Últimos: 0000 0008', '4111 0000\nlinha\n0000 0008', 'os 8 primeiros 41110000 e os 8 últimos 00000008'];
for (const t of ADENDO2) {
  test(`M-01 adendo 2: ${JSON.stringify(t)}`, () => {
    const r = sanearCampo('fato-desc', t);
    confereMascara(t, r.texto, ['4111000000000008']);
    assert.ok(r.texto.includes('**** **** **** 0008'), r.texto);
  });
}
// Sem PAN: frases com vários números e palavras não podem ser mascaradas.
for (const t of ['Pedido 1234 de 2026 valor 5000 em 3x, NF 000123 série 1 e lote 4455',
  'Compra em 10/10/2026 às 14:32, pedido 987654, valor R$ 1.234,56, parcela 3 de 12',
  'tel 11 98765-4321 ou 21 3456-7890, CEP 01310-100, nº 1578 apto 42',
  'Entrega 2026 lote 3344 caixa 5566 palete 7788 doca 12',
  'CPF 529.982.247-25 CNPJ 11.222.333/0001-81']) {
  test(`M-01 sem excesso: ${JSON.stringify(t).slice(0, 50)}`, () => assert.equal(sanearCampo('fato-desc', t).texto, t));
}

// Laudo QA PR #9 (d8158468), C-04 / A-05 / M-04: os 47 casos adv3 do QA, com o oráculo estrito.
const PANS3 = ['4111111111111111', '4012888888881881', '5555555555554444', '2223003122003222', '378282246310005', '371449635398431',
  '5067230000000002', '6062826786276634', '30569309025904', '6011111111111117', '3530111333300000', '4222222222222'];
const adv3 = JSON.parse(readFileSync(new URL('.github/testes/adv3-qa-pr9-d8158468.json', raiz), 'utf8')).casos;
test('adv3 QA tem 47 casos', () => assert.equal(adv3.length, 47));
for (const c of adv3) {
  test(`C-04/A-05/M-04 adv3 ${c.id} (${c.esperado})`, () => {
    const r = sanearCampo(c.campo, c.entrada);
    if (c.esperado === 'keep') { assert.equal(r.texto, c.entrada); return; }
    if (r.texto === '') { assert.ok(sanear(c.entrada).limpo, 'campo limpo sem aviso de valor de cartão'); return; }  // PAN + validade/CVV: campo limpo (CB-07)
    confereMascara(c.entrada, r.texto, PANS3.filter((p) => digitos(c.entrada).includes(p)));
  });
}
// Padrões vizinhos aos do laudo d8158468 (C-04 e A-05) e B-01 do adendo 3 (até 6 palavras / 60 caracteres).
const VIZINHOS = [
  ['cartão 5555555555554444123', '5555555555554444'], ['41111111111111110829', '4111111111111111'], ['411111111111111108', '4111111111111111'],
  ['PAN 4111111111111111/0829', '4111111111111111'], ['41111111111111110829123', '4111111111111111'], ['124111111111111111', '4111111111111111'],
  ['34111111111111111', '4111111111111111'], ['3782822463100051234', '378282246310005'], ['93530111333300000', '3530111333300000'],
  ['4111 0000 e depois os últimos 0000 0008', '4111000000000008'], ['4111 0000 os quatro números seguintes: 0000 0008', '4111000000000008'],
  ['4111 0000 extraordinariamente 0000 0008', '4111000000000008'], ['4111 1111. Depois mando o resto: 1111 1111', '4111111111111111'],
  ['4111<br/>1111<br />1111<br>1111', '4111111111111111'], ['4111&nbsp;1111&nbsp;1111&nbsp;1111', '4111111111111111'],
  ['4111\n1111\n1111\n1111', '4111111111111111'], ['<p>4111 1111</p><p>1111 1111</p>', '4111111111111111']];
for (const [t, pan] of VIZINHOS) {
  test(`C-04/A-05 vizinho: ${JSON.stringify(t).slice(0, 50)}`, () => confereMascara(t, sanearCampo('fato-desc', t).texto, [pan]));
}
// M-04 vizinhos: códigos que não são cartão ficam como estão.
for (const t of ['IMEI: 35-693803-564380-9', 'IMEI1 356938035643809 IMEI2 356938035643817', 'nº de série 356938035643809',
  '+5511912345678', '+55 (11) 91234-5678', 'tel 11 91234-5678 e 11 3456-7890 e 0800 123 4567', '0300 123 4567 ou 4004-0001',
  'ISBN 978-85-359-0277-8', 'linha 83600000001-5 12340000000-1 00000000000-0 00000000000-0',
  '836000000015123400000001000000000000000000000000', 'CNPJ 33000167000101 e 60746948000112',
  '23793381286008267713976000063305984410000012345', '35261012345678000190550010000012341000123456']) {
  test(`M-04 vizinho sem cartão: ${JSON.stringify(t).slice(0, 50)}`, () => assert.equal(sanearCampo('fato-desc', t).texto, t));
}

// Laudo QA PR #9 (133315fc), A-06 / A-07: os 31 casos adv4 do QA.
const PANS4 = ['4111111111111111', '5555555555554444', '378282246310005', '5067230000000002', '6062826786276634', '6011111111111117', '4012888888881881', '2223003122003222'];
const adv4 = JSON.parse(readFileSync(new URL('.github/testes/adv4-qa-pr9-133315fc.json', raiz), 'utf8')).casos;
test('adv4 QA tem 31 casos', () => assert.equal(adv4.length, 31));
for (const c of adv4) {
  test(`A-06/A-07 adv4 ${c.id} (${c.esperado})`, () => {
    const r = sanearCampo(c.campo, c.entrada);
    if (c.esperado === 'keep') { assert.equal(r.texto, c.entrada); return; }
    if (r.texto === '') { assert.ok(sanear(c.entrada).limpo); return; }   // PAN + validade/CVV: campo limpo (CB-07)
    const pans = PANS4.filter((p) => digitos(c.entrada).includes(p));
    if (!pans.length) { assert.equal(r.texto, c.entrada, 'sem PAN completo na entrada (ditado parcial): nada a mascarar'); return; }
    confereMascara(c.entrada, r.texto, pans);
  });
}
// A-07: identificadores rotulados ou de 44/47/48 dígitos ficam como estão.
const nfe = '35261012345678000190550010000012341000123456';
for (const t of ['Protocolo de atendimento 20261028123456789012', 'protocolo 4111111111111112', 'Protocolo nº 5555555555554443',
  'NSU 41111111111111119', `chave ${nfe}`, `Chave de acesso: ${nfe.match(/\d{4}/g).join(' ')}`, `NF-e ${nfe.match(/\d{4}/g).join(' ')}`,
  'boleto 34112345678901234567890123456789012345678901234', '34112.34567 89012.345678 90123.456789 0 12345678901234',
  'linha digitável 836000000015123400000001000000000000000000000000', 'nº 4111222233334444', '41112222333344445555666677778888999900001111',
  '41112222333344445555666677778888999900001111222', '+55 11 91234-5678 e +55 21 99876-5432']) {
  test(`A-07 sem excesso: ${JSON.stringify(t).slice(0, 50)}`, () => assert.equal(sanearCampo('fato-desc', t).texto, t));
}
// Limite do adendo 4: com rótulo, número que passa no Luhn e tem prefixo de bandeira segue mascarado.
for (const t of ['protocolo 4111111111111111', 'NSU 5555555555554444', 'nº 4111 1111 1111 1111', 'chave 378282246310005',
  'nº 4111-1111-1111-1111', 'NSU: 4111.1111.1111.1111', 'boleto 4111 1111 1111 1111', 'chave 4111 0000 e os últimos 0000 0008']) {
  test(`A-07 rótulo + PAN: ${t}`, () => confereMascara(t, sanearCampo('fato-desc', t).texto, [digitos(t).slice(-16).length === 16 && /378/.test(t) ? '378282246310005' : digitos(t).slice(-16)]));
}
test('A-07 rótulo + PAN depois de outro número: protocolo 123 4111 1111 1111 1111', () => { const t = 'protocolo 123 4111 1111 1111 1111'; assert.equal(sanearCampo('fato-desc', t).texto, 'protocolo 123 **** **** **** 1111'); });
// A-06: no Pedido, PAN + CVV, PAN + mês e dígito + PAN são mascarados.
for (const [t, pan] of [['5555555555554444123', '5555555555554444'], ['411111111111111112', '4111111111111111'], ['34111111111111111', '4111111111111111'],
  ['41111111111111110829', '4111111111111111'], ['3782822463100051234', '378282246310005'], ['5555 5555 5555 4444 123', '5555555555554444']]) {
  test(`A-06 Pedido: ${t}`, () => confereMascara(t, sanearCampo('pedido', t).texto, [pan]));
}
// B-03 (adendo 4): dígitos colados depois do PAN (até 7) também viram '*'.
for (const [t, s] of [['4111000000000008123', '**** **** **** 0008***'], ['41110000000000081231226', '**** **** **** 0008*******'],
  ['dados 5555555555554444123 ok', 'dados **** **** **** 4444*** ok'], ['5555555555554444123', '**** **** **** 4444***']]) {
  test(`B-03: ${t}`, () => { assert.equal(sanearCampo('fato-desc', t).texto, s); assert.equal(sanearCampo('pedido', t.replace(/\D/g, '')).texto.replace(/^.*?\*/, '*'), s.replace(/^.*?\*/, '*').replace(/ ok$/, '')); });
}
// B-02 (adendo 4): até 10 palavras num vão de até 100 caracteres.
for (const t of ['4111 0000 e então eu digitei depois os últimos 0000 0008', '4111 0000 e aí o cliente mandou por mensagem os quatro últimos 0000 0008']) {
  test(`B-02: ${JSON.stringify(t).slice(0, 50)}`, () => confereMascara(t, sanearCampo('fato-desc', t).texto, ['4111000000000008']));
}
for (const t of ['Pedido 1234 entregue no dia combinado ao cliente pela transportadora com nota 5678 e lote 9012 e caixa 3456',
  'tel 11 3456-7890 ramal 12 falar com Ana no setor de compras depois das 14 horas e pedir o número 5566']) {
  test(`B-02 sem excesso: ${JSON.stringify(t).slice(0, 50)}`, () => assert.equal(sanearCampo('fato-desc', t).texto, t));
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
  ['5.000 PANs colados', V.repeat(5000)],
  ['20.000 grupos com palavras entre eles', Array(20000).fill('4111 e os').join(' ')],
  ['20.000 números entre palavras', Array(20000).fill('12 casa 3').join(' ')],
  ['5.000 grupos de 17 dígitos com prefixo', Array(5000).fill('34111111111111112').join(' ')],
  ['5.000 protocolos rotulados', Array(5000).fill('protocolo 4111111111111112 nº 20261028123456789012').join(' ')],
  ['5.000 PANs no Pedido com CVV', Array(5000).fill('5555555555554444123').join(' ')],
  ['5.000 telefones e boletos', Array(5000).fill('+55 11 91234-5678 34191790010104351004791020150008196610000012345').join(' ')]
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
