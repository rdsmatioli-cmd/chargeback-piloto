// Testes dos textos jurídicos e regulatórios do site (app, blog, llms.txt, sitemap), sem dependências:
// node --test .github/testes/*.test.mjs
// Cada teste falha se o texto voltar a citar fonte vencida, prometer prazo sem fonte ou divergir da
// constante do app (matriz S01, rodapés e termos). Dossiê dos itens CB-TXT-nn: PR "aguarda parecer".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const raiz = new URL('../../', import.meta.url);
const ler = (p) => readFileSync(new URL(p, raiz), 'utf8');
const app = ler('index.html');
const blog = ler('blog/o-que-e-chargeback/index.html');
const blogIndice = ler('blog/index.html');
const llms = ler('llms.txt');
const sitemap = ler('sitemap.xml');

// Constantes do app, lidas do próprio <script> num vm (como o teste da máscara).
let src = app.match(/<script>([\s\S]*?)<\/script>/)[1];
src = src.replace(/\}\)\(\);\s*$/, 'globalThis.__t = { TEXTOS, MATRIZ, RODAPE_MATRIZ, RODAPE_PRAZOS, RODAPE_ELO, VEDADOS, COBRANCA, encontrarVedados };})();');
const ctx = { document: { addEventListener() {} }, console };
vm.createContext(ctx); vm.runInContext(src, ctx);
const { TEXTOS, MATRIZ, RODAPE_MATRIZ } = ctx.__t;

// Texto visível de uma página: sem tags, com as entidades usuais decodificadas.
const texto = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<\/?(?:a|strong|em|small)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const jsonLd = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const visa = MATRIZ.filter((m) => m.bandeira === 'Visa');
const motivo = (b, c) => MATRIZ.find((m) => m.bandeira === b && m.codigo === c);

// CB-TXT-01: a URL oficial da Visa passou a servir o "Visa Dispute Management Guide for Merchants" de
// outubro de 2026, e as Visa Core Rules estão na edição de 24/10/2026. A versão de junho de 2024 não
// pode mais ser citada, e o blog cita a mesma versão que a matriz do app.
const VISA_GUIA = 'Visa Dispute Management Guide for Merchants, versão de outubro de 2026';
const VISA_REGRAS = 'Visa Core Rules and Visa Product and Service Rules, edição de 24 de outubro de 2026';
test('CB-TXT-01: matriz Visa cita o guia de outubro de 2026 e as Core Rules de 24/10/2026', () => {
  assert.equal(visa.length, 18);
  for (const m of visa) {
    assert.ok(m.rodape_linha.includes(VISA_GUIA), m.id);
    assert.ok(m.rodape_linha.includes(VISA_REGRAS), m.id);
  }
});
test('CB-TXT-01: nenhuma página cita a versão de junho de 2024 nem o título antigo do guia da Visa', () => {
  for (const [nome, h] of [['app', app], ['blog', blog], ['índice do blog', blogIndice], ['llms.txt', llms]]) {
    assert.ok(!/junho de 2024|Guidelines for Visa Merchants/.test(h), nome);
  }
});
test('CB-TXT-01: blog cita as mesmas versões da Visa que a matriz', () => {
  const t = texto(blog);
  assert.ok(t.includes('Visa Dispute Management Guide for Merchants (versão de outubro de 2026)'));
  assert.ok(t.includes('Visa Core Rules and Visa Product and Service Rules (edição de 24 de outubro de 2026)'));
  assert.ok(blog.includes('href="https://usa.visa.com/dam/VCOM/download/about-visa/visa-rules-public.pdf"'));
});
// Visa Core Rules (24/10/2026), Table 11-29 e notas 5, 6 e 9: 2 compras anteriores não informadas
// como fraude, processadas mais de 120 e no máximo 365 dias antes da disputa; ID ou impressão digital
// do dispositivo, ou IP, e mais um identificador iguais; ID e impressão digital contam como um só.
test('CB-TXT-01: 10.4 (CE3.0) segue a regra de 24/10/2026 no app e no blog', () => {
  const ce = motivo('Visa', '10.4').evidencias.find((e) => e.startsWith('Ou: dados de 2 compras anteriores'));
  assert.ok(ce, 'item CE3.0 ausente');
  for (const trecho of ['mais de 120 e no máximo 365 dias antes da disputa', 'não informadas como fraude',
    'o ID ou a impressão digital do dispositivo, ou o endereço IP, mais pelo menos 1 destes',
    'ID e impressão digital do dispositivo contam como um só']) assert.ok(ce.includes(trecho), trecho);
  const t = texto(blog);
  assert.ok(t.includes('mais de 120 e no máximo 365 dias antes da disputa'));
  assert.ok(t.includes('com ECI 5 e CAVV na autorização'));
  // regra antiga e imprecisa: "pelo menos 2 elementos" só entre dispositivo e IP
  for (const h of [app, blog]) assert.ok(!/pelo menos (2|dois) elementos iguais/.test(h));
});
test('CB-TXT-01: 11.1 inclui o registro do boletim de recuperação (CRB) na data-chave', () => {
  assert.ok(motivo('Visa', '11.1').evidencias[0].startsWith('Registro de que o cartão não constava do boletim de recuperação de cartões (CRB) na data-chave'));
});
// Visa Core Rules (24/10/2026), 13.5, pré-arbitragem: aviso de cobranças futuras pelo menos 7 dias antes.
test('CB-TXT-01: único prazo em dias da matriz Visa é o aviso de 7 dias da 13.5, com fonte', () => {
  for (const m of visa) {
    const dias = m.evidencias.join(' ').match(/\d+ dias/g) || [];
    if (m.codigo === '13.5') assert.deepEqual(dias, ['7 dias']);
    else if (m.codigo === '10.4') assert.deepEqual(dias, ['365 dias']);
    else assert.deepEqual(dias, [], m.id);
  }
});

// Coerência de datas e do JSON-LD do artigo (vale para todo item que muda o texto do blog).
const REVISAO = { br: '31/10/2026', iso: '2026-10-31' };
test('datas de revisão do artigo, do índice do blog e do sitemap são as mesmas', () => {
  const art = jsonLd(blog).find((j) => j['@type'] === 'Article');
  assert.equal(art.dateModified, REVISAO.iso);
  assert.ok(blog.includes(`Revisado em ${REVISAO.br}.`));
  assert.ok(blog.includes(`revisado em ${REVISAO.br}.`));
  assert.ok(blogIndice.includes(`(revisado em ${REVISAO.br})`));
  assert.ok(sitemap.includes(`<lastmod>${REVISAO.iso}</lastmod>`));
});
test('wordCount do JSON-LD confere com o texto do artigo', () => {
  const a = blog.match(/<article>([\s\S]*?)<\/article>/)[1].replace(/<aside[\s\S]*?<\/aside>/, '');
  const n = a.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').split(/\s+/).filter(Boolean).length;
  assert.equal(jsonLd(blog).find((j) => j['@type'] === 'Article').wordCount, n);
});
test('FAQ do JSON-LD repete literalmente as respostas visíveis do artigo', () => {
  const faq = jsonLd(blog).find((j) => j['@type'] === 'FAQPage');
  const t = texto(blog);
  for (const q of faq.mainEntity) {
    assert.ok(t.includes(q.name), q.name);
    assert.ok(t.includes(q.acceptedAnswer.text), q.name);
  }
});

// CB-TXT-02: Resolução BCB nº 522/2025 (DOU de 12/11/2025, em vigor na publicação). Art. 35-G: os
// regulamentos limitam a responsabilidade financeira dos participantes às contestações iniciadas até
// 180 dias da autorização. Art. 3º: 180 dias para pedir a adequação; o regulamento vigente vale até a
// aprovação. O limite de 180 dias não é o prazo do lojista, e o rodapé do app cita a mesma resolução.
const RES_522 = { citacao: 'Resolução BCB nº 522/2025', data: '10 de novembro de 2025', dou: '12/11/2025', limite: '180 dias da autorização da transação' };
test('CB-TXT-02: rodapé da matriz e blog citam a mesma Resolução BCB nº 522/2025', () => {
  assert.ok(RODAPE_MATRIZ.includes(RES_522.citacao));
  const t = texto(blog);
  assert.ok(t.includes(`Resolução BCB nº 522, de ${RES_522.data}`));
  assert.ok(t.includes(`publicada no Diário Oficial da União em ${RES_522.dou}`));
  assert.ok(t.includes(RES_522.limite));
  assert.ok(t.includes('Esse limite não é o prazo do lojista para responder'));
  assert.ok(blog.includes('href="https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o%20BCB&amp;numero=522"'));
});
test('CB-TXT-02: nenhum texto apresenta os 180 dias como prazo de resposta do lojista', () => {
  for (const h of [texto(app), texto(blog), llms]) {
    assert.ok(!/(lojista|você|voce)[^.]{0,80}180 dias/i.test(h.replace('Esse limite não é o prazo do lojista para responder', '')));
  }
});

// CB-TXT-03: promessas e generalizações sem fonte no blog.
// - Quem decide: Regulamento Elo (versão 11.0, arts. 106 a 108) e Visa Core Rules (cap. 11) preveem
//   pré-arbitragem e arbitragem pela bandeira; o termo T-2 do app já diz emissor, bandeira e adquirente.
// - Evidências da Elo vêm da lista de uma adquirente, não do manual da bandeira (não público).
// - Nenhuma fonte primária diz que o prazo da adquirente é sempre menor que o da bandeira.
test('CB-TXT-03: blog não diz que a decisão é sempre do emissor e cita a bandeira, como o T-2', () => {
  const t = texto(blog);
  assert.ok(!/sempre do banco emissor/.test(t));
  assert.ok(t.includes('A decisão cabe ao banco emissor e, se a disputa chegar à arbitragem, à bandeira'));
  assert.ok(TEXTOS['T-2'].includes('emissor, à bandeira e à adquirente'));
});
test('CB-TXT-03: blog não atribui ao manual da bandeira as evidências da Elo', () => {
  const t = texto(blog);
  assert.ok(!/aceitas pelo manual da bandeira/.test(t));
  assert.ok(t.includes('para a Elo, a lista de uma adquirente'));
  for (const m of MATRIZ.filter((x) => x.bandeira === 'Elo')) assert.ok(m.rodape_linha.startsWith('Fonte: Adyen (adquirente)'), m.id);
});
test('CB-TXT-03: prazo da adquirente "costuma ser" menor que o da bandeira (sem afirmação absoluta)', () => {
  const t = texto(blog);
  assert.ok(!/Ele é menor que o prazo da bandeira/.test(t));
  assert.ok(t.includes('Ele costuma ser menor que o prazo da bandeira'));
});

// CB-TXT-04: versões das fontes Mastercard e Elo fixadas e iguais no app e no blog.
// Regulamento Elo versão 11.0 (29/01/2025), Cap. VII, Seção II, Subseção IV, art. 97, parágrafo único
// (conferido no PDF oficial em 31/10/2026; na versão em aprovação no BCB o artigo é renumerado).
// Mastercard: versão de 13/05/2025, conferida em 15/10/2026 (o PDF não abriu na reconferência).
test('CB-TXT-04: Elo cita a versão 11.0 do Regulamento no app e no blog', () => {
  for (const m of MATRIZ.filter((x) => x.bandeira === 'Elo')) assert.ok(m.observacao.includes('versão 11.0, de 29/01/2025, Cap. VII, Seção II, Subseção IV, art. 97, parágrafo único'), m.id);
  const t = texto(blog);
  assert.equal((t.match(/Regulamento Elo \(versão 11\.0, de 29 de janeiro de 2025\)/g) || []).length, 2);
});
test('CB-TXT-04: Mastercard com a mesma versão e data de conferência no app e no blog, sem jargão interno', () => {
  for (const m of MATRIZ.filter((x) => x.bandeira === 'Mastercard')) assert.ok(m.rodape_linha.includes('versão de 13 May 2025, conferido em 15/10/2026'), m.id);
  const t = texto(blog);
  assert.equal((t.match(/Merchant Edition \(versão de 13 de maio de 2025, conferida em 15\/10\/2026\)/g) || []).length, 2);
  assert.ok(!/matriz S-01/.test(t));
});
