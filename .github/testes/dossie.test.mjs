// Testes das funções puras do dossiê (index.html), sem dependências: node --test .github/testes/*.test.mjs
// Carrega o <script> do próprio index.html num vm, como o teste da máscara, e chama as funções da página.
// CB-01 a CB-06: achados do lote 'Integridade do dossiê baixado' (31/10/2026), citados no index.html
// como 'CB-0n de 31/10'; não são os CB-xx de laudos anteriores que aparecem nos comentários antigos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const raiz = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', raiz), 'utf8');
const NOMES = ['MATRIZ', 'TEXTOS', 'indiceMotivo', 'dadosDoFormulario', 'montarDossie', 'validarCNPJ', 'formatarCNPJ', 'sanearCampo', 'limparTexto', 'sanearEntrada', 'encontrarVedados',
  'DATA_MIN', 'hojeLocal', 'validarDataFato', 'dataBR', 'ordenarFatos', 'nomeArquivoDossie'];
let src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
src = src.replace(/\}\)\(\);\s*$/, `globalThis.__t = { ${NOMES.map((n) => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')} };})();`);
const ctx = { document: { addEventListener() {} }, console };
vm.createContext(ctx); vm.runInContext(src, ctx);
const { MATRIZ, TEXTOS, indiceMotivo, dadosDoFormulario, montarDossie, validarCNPJ, formatarCNPJ, sanearCampo, limparTexto, sanearEntrada, encontrarVedados,
  DATA_MIN, hojeLocal, validarDataFato, dataBR, ordenarFatos, nomeArquivoDossie } = ctx.__t;

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

// CB-05: CNPJ alfanumérico (IN RFB 2.229/2024). Exemplo oficial da Receita: 12.ABC.345/01DE-35
// (DVs 3 e 5 pelo código do caractere menos 48, com os pesos do CNPJ numérico).
test('CB-05: validarCNPJ aceita o exemplo oficial alfanumérico, com e sem máscara e em minúsculas', () => {
  for (const v of ['12.ABC.345/01DE-35', '12ABC34501DE35', '12.abc.345/01de-35', ' 12.ABC.345/01DE-35 ']) assert.equal(validarCNPJ(v), true, v);
});
test('CB-05: validarCNPJ recusa DV errado, DV com letra, tamanho errado e letra fora de A-Z', () => {
  for (const v of ['12.ABC.345/01DE-36', '12.ABC.345/01DE-53', '12.ABC.345/01DE-3A', '12ABC34501DE3', '12ABC34501DE355', '12.ÁBC.345/01DE-35', '12#ABC#345#01DE#35', '123', '', 'CNPJ 11.222.333/0001-81'])
    assert.equal(validarCNPJ(v), false, v);
});
test('CB-05: validarCNPJ numérico continua como antes', () => {
  for (const v of ['11.222.333/0001-81', '11222333000181', '40000000001935']) assert.equal(validarCNPJ(v), true, v);
  for (const v of ['11.222.333/0001-82', '00.000.000/0000-00', '11111111111111']) assert.equal(validarCNPJ(v), false, v);
});
test('CB-05: formatarCNPJ devolve 00.000.000/0000-00 em maiúsculas', () => {
  assert.equal(formatarCNPJ('12abc34501de35'), '12.ABC.345/01DE-35');
  assert.equal(formatarCNPJ('11222333000181'), '11.222.333/0001-81');
  assert.equal(formatarCNPJ('11.222.333/0001-81'), '11.222.333/0001-81');
});
test('CB-05: CNPJ alfanumérico válido no campo CNPJ fica como está, sem aviso', () => {
  for (const v of ['12.ABC.345/01DE-35', '12ABC34501DE35']) { const r = sanearCampo('cnpj', v); assert.equal(r.texto, v); assert.equal(r.aviso, null); }
});
test('CB-05: CNPJ inválido recusa o dossiê; válido sai formatado', () => {
  for (const v of ['123', '11.222.333/0001-82', '12.ABC.345/01DE-36']) {
    const r = dadosDoFormulario({ ...BASE, cnpj: v });
    assert.equal(r.ok, false, v); assert.equal(r.campo, 'cnpj'); assert.match(r.erro, /CNPJ/);
  }
  assert.equal(dadosDoFormulario({ ...BASE, cnpj: '12abc34501de35' }).dados.cnpj, '12.ABC.345/01DE-35');
  assert.equal(dadosDoFormulario({ ...BASE, cnpj: '11222333000181' }).dados.cnpj, '11.222.333/0001-81');
  assert.equal(dadosDoFormulario({ ...BASE, cnpj: '   ' }).dados.cnpj, '');
  const t = montarDossie(dadosDoFormulario({ ...BASE, cnpj: '12ABC34501DE35' }).dados).texto;
  assert.match(t, /^CNPJ do lojista: 12\.ABC\.345\/01DE-35$/m);
  assert.doesNotMatch(montarDossie(dadosDoFormulario(BASE).dados).texto, /CNPJ do lojista/);
});
// Revisão do lote (decisão C-01): a máscara lê O/o como 0 e I/l como 1. Um CNPJ alfanumérico válido que,
// lido assim, é PAN Diners (prefixo 36 e Luhn) não fica em claro: é mascarado com A-3, como na main.
// O 'i' minúsculo não é lido como 1 no campo, mas vira 'I' no CNPJ formatado do dossiê.
const PAN_COMO_CNPJ = [['36O00000000438', '0438'], ['36.O00.000/0004-38', '0438'], ['36o00000000438', '0438'], ['36O00000001329', '1329'],
  ['36O00000002210', '2210'], ['36l00000000170', '0170'], ['36i00000000154', '0154'], ['36.i00.000/0001-54', '0154']];
test('Revisão CB-05: CNPJ alfanumérico que a máscara lê como PAN é mascarado e devolve o A-3', () => {
  for (const [v, fim] of PAN_COMO_CNPJ) {
    assert.equal(validarCNPJ(v), true, `premissa: ${v} é CNPJ alfanumérico válido`);
    const r = sanearCampo('cnpj', v);
    assert.equal(r.texto, `**** **** **** ${fim}`, v);
    assert.equal(r.aviso, TEXTOS['A-3'], v);
  }
});
test('Revisão CB-05: CNPJ lido como PAN não entra no dossiê', () => {
  for (const [v, fim] of PAN_COMO_CNPJ) {
    const r = dadosDoFormulario({ ...BASE, cnpj: v });
    assert.equal(r.ok, false, v); assert.equal(r.campo, 'cnpj');
    assert.equal(r.valores.cnpj, `**** **** **** ${fim}`, v);
    assert.deepEqual([...r.avisos], [TEXTOS['A-3']], v);
  }
});
// O CNPJ todo numérico segue o parecer B-02 como na main: só é mascarado se os 14 dígitos forem PAN Diners.
// Um CNPJ real em que a máscara acharia PAN numa janela interna (13 dígitos de Visa) continua em claro.
test('Revisão CB-05: CNPJ numérico real não é mascarado por PAN numa janela interna', () => {
  for (const v of ['34975883441890', '46518466315509', '34.975.883/4418-90']) {
    assert.equal(validarCNPJ(v), true, v);
    const r = sanearCampo('cnpj', v);
    assert.equal(r.texto, v); assert.equal(r.aviso, null);
  }
  assert.match(montarDossie(dadosDoFormulario({ ...BASE, cnpj: '34975883441890' }).dados).texto, /^CNPJ do lojista: 34\.975\.883\/4418-90$/m);
  assert.equal(sanearCampo('cnpj', '36000000003820').texto, '**** **** **** 3820', 'B-02: os 14 dígitos são PAN Diners');
});

// CB-04: texto sem caracteres que enganem quem lê o dossiê.
const cp = (...ns) => String.fromCodePoint(...ns);
const INVISIVEIS = [0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069, 0x200E, 0x200F, 0x061C,
  0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF, 0x00AD, 0x180E, 0xE0041, 0xE007F,       // bidi, largura zero, formatação (Cf)
  0x00, 0x01, 0x07, 0x08, 0x0E, 0x1B, 0x1F, 0x7F, 0x80, 0x9B, 0x9F,                // controles C0/C1
  0xE000, 0xF8FF, 0xF0000];                                                          // uso privado
test('CB-04: limparTexto remove bidi, largura zero, formatação, controles C0/C1 e uso privado', () => {
  for (const n of INVISIVEIS) {
    assert.equal(limparTexto(`a${cp(n)}b`), 'ab', `U+${n.toString(16).toUpperCase()}`);
    assert.equal(limparTexto(`a${cp(n)}b`, true), 'ab', `U+${n.toString(16).toUpperCase()} (uma linha)`);
  }
  assert.equal(limparTexto('a\uD800b'), 'ab', 'surrogate isolado');
});
test('CB-04: limparTexto mantém \\n em texto livre e normaliza as outras quebras; tabulação vira espaço', () => {
  assert.equal(limparTexto('a\nb'), 'a\nb');
  for (const q of ['\r\n', '\r', '\v', '\f', cp(0x85), cp(0x2028), cp(0x2029)]) assert.equal(limparTexto(`a${q}b`), 'a\nb', JSON.stringify(q));
  assert.equal(limparTexto('a\tb'), 'a b');
});
test('CB-04: limparTexto de uma linha troca quebras e tabulação por espaço', () => {
  for (const q of ['\n', '\r\n', '\t', cp(0x2028)]) assert.equal(limparTexto(`a${q}b`, true), 'a b', JSON.stringify(q));
});
test('CB-04: limparTexto não mexe em texto comum e é idempotente', () => {
  for (const t of ['Pedido nº 123 — São Paulo, R$ 1.234,56 (ok) ação', 'Entrega no endereço: Rua Á, 10\nSegunda linha', 'café ☕ 🙂', 'a\u00A0b']) {
    assert.equal(limparTexto(t), t);
    assert.equal(limparTexto(limparTexto(t)), limparTexto(t));
  }
});
test('CB-04: nome de arquivo com U+202E aparece com a extensão real', () => {
  const r = sanearEntrada('arquivo', `fatura${cp(0x202E)}fdp.exe`);
  assert.equal(r.texto, 'faturafdp.exe');
  assert.ok(r.texto.endsWith('.exe'));
  assert.equal(sanearEntrada('arquivo', 'nota\nfiscal\t.pdf').texto, 'nota fiscal .pdf');
});
test('CB-04: nome de arquivo com PAN é mascarado e devolve o A-3', () => {
  const r = sanearEntrada('arquivo', 'cartao 4111111111111111.pdf');
  assert.equal(r.texto, 'cartao **** **** **** 1111.pdf');
  assert.equal(r.aviso, TEXTOS['A-3']);
});
test('CB-04: caractere invisível ou de uso privado não parte o PAN nem esconde termo vedado', () => {
  for (const sep of [0xE000, 0x200B, 0x2060, 0x202E, 0xFEFF]) {
    const r = sanearEntrada('fato-desc', `cartão 4111${cp(sep)}1111 1111 1111 usado`);
    assert.equal(r.texto, 'cartão **** **** **** 1111 usado', `U+${sep.toString(16)}`);
    assert.equal(r.aviso, TEXTOS['A-3']);
  }
  assert.deepEqual([...encontrarVedados(sanearEntrada('fato-desc', `abri um pro${cp(0x200B)}cesso`).texto)], ['processo']);
  assert.equal(sanearEntrada('pedido', `PED${cp(0x200B)}-1`).texto, 'PED-1');
  assert.equal(sanearEntrada('cnpj', `12.ABC${cp(0x200B)}.345/01DE-35`).texto, '12.ABC.345/01DE-35');
});
test('CB-04: fato de várias linhas sai recuado e não imita seção nem documento do dossiê', () => {
  const dados = { ...dadosDoFormulario(BASE).dados, fatos: [{ data: '2026-10-03', descricao: 'Entrega feita\n3. Documentos anexados pelo lojista\nD9. falso.pdf (1 bytes)\n\n4. Correspondência' }] };
  const linhas = montarDossie(dados).texto.split('\n');
  assert.equal(linhas.filter((l) => l === '3. Documentos anexados pelo lojista').length, 1);
  assert.equal(linhas.filter((l) => /^4\. Correspond/.test(l)).length, 1);
  assert.ok(!linhas.some((l) => /^D9\./.test(l)));
  const i = linhas.findIndex((l) => l.endsWith(': Entrega feita'));
  assert.deepEqual(linhas.slice(i + 1, i + 5), ['  3. Documentos anexados pelo lojista', '  D9. falso.pdf (1 bytes)', '', '  4. Correspondência']);
});

// CB-06: datas da cronologia entre 01/01/2000 e hoje, exibidas em DD/MM/AAAA; nome de arquivo por disputa.
test('CB-06: hojeLocal usa a data local (AAAA-MM-DD)', () => {
  assert.equal(hojeLocal(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(hojeLocal(new Date(2026, 9, 31, 0, 1)), '2026-10-31');
  assert.match(hojeLocal(), /^\d{4}-\d{2}-\d{2}$/);
});
test('CB-06: validarDataFato aceita de 2000-01-01 até hoje, só data real com ano de 4 dígitos', () => {
  const hoje = '2026-10-31';
  assert.equal(DATA_MIN, '2000-01-01');
  for (const d of ['2000-01-01', '2026-10-31', '2024-02-29', '2026-10-01']) assert.equal(validarDataFato(d, hoje), true, d);
  for (const d of ['1999-12-31', '2026-11-01', '2030-01-01', '10000-01-01', '275760-09-13', '2026-02-29', '2026-13-01', '2026-04-31',
    '2026-00-10', '2026-1-01', '01/10/2026', '', 'abc', undefined]) assert.equal(validarDataFato(d, hoje), false, String(d));
});
test('CB-06: dataBR mostra DD/MM/AAAA', () => {
  assert.equal(dataBR('2026-10-01'), '01/10/2026');
  assert.equal(dataBR('2000-01-31'), '31/01/2000');
});
test('CB-06: ordenarFatos ordena por data válida, estável no mesmo dia, sem alterar a lista', () => {
  const fatos = [{ data: '2026-10-02', descricao: 'b1' }, { data: '2026-01-15', descricao: 'a' }, { data: '10000-01-01', descricao: 'z' },
    { data: '2026-10-02', descricao: 'b2' }, { data: '2025-12-31', descricao: 'c' }];
  const copia = JSON.stringify(fatos);
  assert.deepEqual([...ordenarFatos(fatos).map((f) => f.descricao)], ['c', 'a', 'b1', 'b2', 'z']);
  assert.equal(JSON.stringify(fatos), copia);
});
test('CB-06: dossiê mostra a cronologia em DD/MM/AAAA e em ordem', () => {
  const dados = { ...dadosDoFormulario(BASE).dados, fatos: [{ data: '2026-10-02', descricao: 'Depois' }, { data: '2026-09-30', descricao: 'Antes' }] };
  const t = montarDossie(dados).texto;
  assert.match(t, /^30\/09\/2026: Antes\n02\/10\/2026: Depois$/m);
  assert.doesNotMatch(t, /\d{4}-\d{2}-\d{2}:/);
});
test('CB-06: nome do arquivo traz o pedido saneado e a data', () => {
  const hoje = '2026-10-31';
  assert.equal(nomeArquivoDossie('PED-1', hoje), 'dossie-chargeback-PED-1-2026-10-31.txt');
  assert.equal(nomeArquivoDossie('Pedido nº 123/ABC', hoje), 'dossie-chargeback-Pedido-no-123-ABC-2026-10-31.txt');
  assert.equal(nomeArquivoDossie('Ação ção', hoje), 'dossie-chargeback-Acao-cao-2026-10-31.txt');
  assert.equal(nomeArquivoDossie('**** **** **** 1111', hoje), 'dossie-chargeback-1111-2026-10-31.txt');
  assert.equal(nomeArquivoDossie('../../etc/passwd', hoje), 'dossie-chargeback-etc-passwd-2026-10-31.txt');
  for (const p of ['', '   ', '***', '///']) assert.equal(nomeArquivoDossie(p, hoje), 'dossie-chargeback-2026-10-31.txt', p);
  const longo = nomeArquivoDossie('A'.repeat(39) + '-' + 'B'.repeat(60), hoje);
  assert.equal(longo, `dossie-chargeback-${'A'.repeat(39)}-2026-10-31.txt`);
  for (const p of ['PED-1', 'x'.repeat(100), 'Pedido nº 123/ABC', 'a\u{202E}b', '-a-', '12.ABC.345/01DE-35'])
    assert.match(nomeArquivoDossie(p, hoje), /^dossie-chargeback-(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?-)?\d{4}-\d{2}-\d{2}\.txt$/, p);
});
