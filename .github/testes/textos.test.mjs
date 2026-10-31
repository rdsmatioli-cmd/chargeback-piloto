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
src = src.replace(/\}\)\(\);\s*$/, 'globalThis.__t = { TEXTOS, MATRIZ, RODAPE_MATRIZ, RODAPE_PRAZOS, RODAPE_ELO, VEDADOS, COBRANCA, encontrarVedados, S01_RODAPE_MATRIZ };})();');
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
// outubro de 2026, e as Visa Core Rules estão na edição de 24/10/2026. Só os motivos revistos item a
// item contra as tabelas dessa edição citam a edição nova (10.4, 11.1 e 13.2). Os outros 15 citam a
// versão de junho de 2024 e avisam que a lista ainda não foi revista pelas regras novas; o blog cita
// só a edição nova, porque o texto dele sobre a Visa foi revisto por ela.
const VISA_GUIA = 'Visa Dispute Management Guide for Merchants, versão de outubro de 2026';
const VISA_REGRAS = 'Visa Core Rules and Visa Product and Service Rules, edição de 24 de outubro de 2026';
const VISA_REVISTOS = ['10.4', '11.1', '13.2'];
const VISA_ANTIGA = 'Fonte: Visa, Dispute Management Guidelines for Visa Merchants, versão de junho de 2024. A Visa publicou regras novas em 24/10/2026, e esta lista ainda não foi revista por elas. Confira no painel da sua adquirente; o prazo dela prevalece.';
test('CB-TXT-01: só os motivos Visa revistos citam a edição de 24/10/2026; os outros avisam que não foram revistos', () => {
  assert.equal(visa.length, 18);
  for (const m of visa) {
    if (VISA_REVISTOS.includes(m.codigo)) {
      assert.ok(m.rodape_linha.includes(VISA_GUIA), m.id);
      assert.ok(m.rodape_linha.includes(VISA_REGRAS), m.id);
    } else assert.equal(m.rodape_linha, VISA_ANTIGA, m.id);
  }
});
test('CB-TXT-01: blog, índice do blog e llms.txt não citam a versão de junho de 2024 da Visa', () => {
  for (const [nome, h] of [['blog', blog], ['índice do blog', blogIndice], ['llms.txt', llms]]) {
    assert.ok(!/junho de 2024|Guidelines for Visa Merchants/.test(h), nome);
  }
});
test('CB-TXT-01: blog cita as mesmas versões da Visa que os motivos revistos da matriz', () => {
  const t = texto(blog);
  assert.ok(t.includes('Visa Dispute Management Guide for Merchants (versão de outubro de 2026)'));
  assert.ok(t.includes('Visa Core Rules and Visa Product and Service Rules (edição de 24 de outubro de 2026)'));
  assert.ok(blog.includes('href="https://usa.visa.com/dam/VCOM/download/about-visa/visa-rules-public.pdf"'));
});
// Visa Core Rules (24/10/2026), Table 11-29 (disputa inválida) e Table 11-32 (pré-arbitragem), regra
// para disputas processadas a partir de 24/10/2026: 2 compras anteriores não informadas como fraude,
// processadas mais de 120 e no máximo 365 dias antes da disputa (notas 5 e 3), só com dados da mesma
// adquirente (Table 11-32, nota 5); descrição detalhada das compras (cumulativa); ID ou impressão digital
// do dispositivo, ou IP, e mais um identificador iguais; ID e impressão digital contam como um só
// (nota 9). A certificação da data da entrega só existia na regra que valeu até 23/10/2026.
test('CB-TXT-01: 10.4 (CE3.0) segue a regra de 24/10/2026 no app e no blog', () => {
  const ce = motivo('Visa', '10.4').evidencias.find((e) => e.startsWith('Ou: dados de 2 compras anteriores'));
  assert.ok(ce, 'item CE3.0 ausente');
  for (const trecho of ['não informadas como fraude', 'processadas pela mesma adquirente da compra contestada mais de 120 e no máximo 365 dias antes da disputa',
    'a descrição detalhada do que foi comprado nelas e na compra contestada',
    'o ID ou a impressão digital do dispositivo, ou o endereço IP, mais pelo menos 1 destes',
    'ID e impressão digital do dispositivo contam como um só']) assert.ok(ce.includes(trecho), trecho);
  assert.ok(!/data da entrega/.test(ce), 'a regra de 24/10/2026 não pede a data da entrega no CE3.0');
  const t = texto(blog);
  for (const trecho of ['processadas pela mesma adquirente mais de 120 e no máximo 365 dias antes da disputa',
    'desde que a loja apresente a descrição detalhada do que foi comprado nas três compras', 'com ECI 5 e CAVV na autorização']) assert.ok(t.includes(trecho), trecho);
  // FAQ de fraude: janela, fraude não informada, mesma adquirente e descrição das compras (visível e JSON-LD)
  const faq = jsonLd(blog).find((j) => j['@type'] === 'FAQPage').mainEntity.find((q) => q.name.includes('fraude')).acceptedAnswer.text;
  for (const trecho of ['não informadas como fraude e processadas pela mesma adquirente mais de 120 e no máximo 365 dias antes da disputa',
    'com a descrição do que foi comprado']) assert.ok(faq.includes(trecho), trecho);
  for (const h of [app, blog]) assert.ok(!/pelo menos (2|dois) elementos iguais/.test(h));
});
// Core Rules (24/10/2026), seções 11.9.1.1 a 11.9.1.4: o motivo 11.1 só vale para disputas processadas
// até 23/10/2026; a prova do CRB na data-chave vale para hotel, locadora e cruzeiro com várias
// autorizações (Table 11-40).
test('CB-TXT-01: 11.1 avisa que só vale para disputas processadas até 23/10/2026 e restringe o CRB', () => {
  const m = motivo('Visa', '11.1');
  assert.ok(m.motivo.includes('(disputas até 23/10/2026)'));
  assert.ok(m.observacao.startsWith('Pelas regras da Visa de 24/10/2026 (seção 11.9.1), este motivo só vale para disputas processadas até 23/10/2026.'));
  const crb = m.evidencias.filter((e) => /CRB/.test(e));
  assert.equal(crb.length, 1);
  assert.ok(crb[0].startsWith('Para hotel, locadora de veículos ou cruzeiro com mais de uma autorização:'));
});
// Core Rules (24/10/2026), Table 11-102 (13.2, resposta à disputa, "Last Updated: Oct 2026").
test('CB-TXT-01: 13.2 traz as defesas da Table 11-102', () => {
  const ev = motivo('Visa', '13.2').evidencias.join(' ');
  for (const trecho of ['usou o serviço depois da data em que retirou a autorização de cobrança',
    'pediu o cancelamento para outra data e de que o serviço foi prestado até essa data',
    'a cobrança é lançada depois da prestação do serviço',
    'Se o emissor alegar que a loja foi avisada do encerramento da conta']) assert.ok(ev.includes(trecho), trecho);
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

// CB-TXT-02: Resolução BCB nº 522/2025 (DOU de 12/11/2025, em vigor na publicação). O art. 2º dela
// incluiu o art. 35-G no Anexo I à Resolução BCB nº 150/2021: responsabilidade financeira dos
// participantes do arranjo limitada às solicitações iniciadas até 180 dias da autorização; depois, do
// instituidor, observado o prazo máximo do regulamento. Art. 3º, § 1º: o regulamento vigente vale até
// a aprovação. Visa (Core Rules de 24/10/2026, Summary of Changes, LAC Brazil): regras de disputa do
// Brasil atualizadas para a Resolução 522 a partir de 24/10/2026. Elo: versão em aprovação publicada
// junto da 13.0, com o limite de 180 dias (art. 194, parágrafo único). O limite não é prazo do lojista.
const RES_522 = { citacao: 'Resolução BCB nº 522/2025', data: '10 de novembro de 2025', dou: '12/11/2025', limite: '180 dias da autorização da transação' };
test('CB-TXT-02: rodapé da matriz e blog citam a mesma Resolução BCB nº 522/2025 e separam Visa e Elo', () => {
  assert.equal(RODAPE_MATRIZ, ctx.__t.S01_RODAPE_MATRIZ);
  assert.ok(RODAPE_MATRIZ.includes(RES_522.citacao));
  assert.ok(!/está em adequação/.test(RODAPE_MATRIZ));
  for (const trecho of ['a Visa informa ter atualizado suas regras de disputa no Brasil a partir de 24/10/2026', 'a Elo publicou a versão em aprovação no Banco Central']) assert.ok(RODAPE_MATRIZ.includes(trecho), trecho);
  const t = texto(blog);
  assert.ok(t.includes(`Resolução BCB nº 522, de ${RES_522.data}`));
  assert.ok(t.includes(`publicada no Diário Oficial da União em ${RES_522.dou}`));
  assert.ok(t.includes(RES_522.limite));
  assert.ok(t.includes('Esse limite não é o prazo do lojista para responder'));
  assert.ok(blog.includes('href="https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o%20BCB&amp;numero=522"'));
  assert.ok(t.includes('A Visa informa que atualizou suas regras de disputa no Brasil para atender à resolução a partir de 24/10/2026'));
});
test('CB-TXT-02: blog atribui o art. 35-G ao Anexo I da Res. 150 e não reduz os participantes', () => {
  const t = texto(blog);
  assert.ok(t.includes('art. 35-G do Anexo I à Resolução BCB nº 150/2021, incluído pela Resolução BCB nº 522/2025'));
  assert.ok(t.includes('participantes do arranjo, como emissor, credenciador e subcredenciador'));
  assert.ok(t.includes('observado o prazo máximo previsto no regulamento do arranjo'));
  assert.ok(!/\(emissor e credenciador\)/.test(t));
});
test('CB-TXT-02: nenhum texto apresenta os 180 dias como prazo de resposta do lojista', () => {
  for (const h of [texto(app), texto(blog), llms]) {
    assert.ok(!/(lojista|você|voce)[^.]{0,80}180 dias/i.test(h.replace('Esse limite não é o prazo do lojista para responder', '')));
  }
});

// CB-TXT-03: promessas e generalizações sem fonte no blog.
// - Quem decide: Regulamento Elo (versão 13.0, arts. 103 a 105) e Visa Core Rules (cap. 11) preveem
//   pré-arbitragem (a adquirente aceita ou recusa) e arbitragem pela bandeira. O-1, T-2 e blog usam a
//   mesma frase (proposta ao Advogado; o T-2 já a usava).
// - Evidências da Elo vêm da lista de uma adquirente, não do manual da bandeira (não público).
// - Nenhuma fonte primária diz que o prazo da adquirente é sempre menor que o da bandeira.
const QUEM_DECIDE = 'A decisão da disputa cabe ao emissor, à bandeira e à adquirente.';
test('CB-TXT-03: O-1, T-2 e blog dizem quem decide com a mesma frase', () => {
  const t = texto(blog);
  assert.ok(!/sempre do banco emissor/.test(t));
  assert.ok(TEXTOS['O-1'].endsWith(QUEM_DECIDE));
  assert.ok(TEXTOS['T-2'].startsWith(QUEM_DECIDE));
  assert.ok(t.includes(QUEM_DECIDE.slice(0, -1) + ', cada um na sua etapa: o emissor analisa a resposta da loja; na pré-arbitragem, a adquirente aceita ou recusa o novo pedido do emissor; na arbitragem, decide a bandeira'));
  for (const h of [TEXTOS['O-1'], t]) assert.ok(!/decidido pelo banco emissor|A decisão cabe ao banco emissor/.test(h));
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
// Regulamento Elo versão 13.0 (11/05/2026), Cap. VII, Seção II, Subseção IV, art. 94, parágrafo único,
// no PDF ligado ao menu "Regulamento Elo" de www.elo.com.br (conferido em 31/10/2026). A versão em
// aprovação no BCB, no mesmo PDF, lista motivos e prazos (art. 192) e o limite de 180 dias (art. 194).
// Mastercard: versão de 13/05/2025, conferida em 15/10/2026 (o PDF não abriu na reconferência).
const ELO_PDF = 'https://media.elo.com.br/strapi-hml/assets/Regulamento_Elo_Atualizado_V_Atual_e_V_Bacen_44cd9db34f.pdf';
test('CB-TXT-04: Elo cita a versão 13.0 do Regulamento no app e no blog, com o PDF do site da Elo', () => {
  for (const m of MATRIZ.filter((x) => x.bandeira === 'Elo')) assert.ok(m.observacao.includes('versão 13.0, de 11/05/2026, Cap. VII, Seção II, Subseção IV, art. 94, parágrafo único'), m.id);
  const t = texto(blog);
  assert.equal((t.match(/Regulamento Elo \(versão 13\.0, de 11 de maio de 2026\)/g) || []).length, 2);
  assert.equal(blog.split(`href="${ELO_PDF}"`).length - 1, 2);
  for (const h of [app, blog]) assert.ok(!/versão 11\.0|art\. 97|termos-e-regulamentos\.elo\.com\.br/.test(h));
});
test('CB-TXT-04: Mastercard com a mesma versão e data de conferência no app e no blog, sem jargão interno', () => {
  for (const m of MATRIZ.filter((x) => x.bandeira === 'Mastercard')) assert.ok(m.rodape_linha.includes('versão de 13 May 2025, conferido em 15/10/2026'), m.id);
  const t = texto(blog);
  assert.equal((t.match(/Merchant Edition \(versão de 13 de maio de 2025, conferida em 15\/10\/2026\)/g) || []).length, 2);
  assert.ok(!/matriz S-01/.test(t));
});

// CB-TXT-05: termos com lei citada, conferidos na Câmara (norma atualizada) em 31/10/2026.
// CDC art. 49: 7 dias "a contar de sua assinatura ou do ato de recebimento do produto ou serviço";
// parágrafo único: valores devolvidos "de imediato, monetariamente atualizados". O T-7 só aparece
// com cobrança (COBRANCA = false nesta fase), mas fica pronto e correto.
test('CB-TXT-05: T-7 segue o CDC art. 49 (início do prazo e atualização monetária)', () => {
  const t7 = TEXTOS['T-7'];
  assert.ok(t7.includes('em até 7 dias, contados da contratação ou do recebimento do serviço'));
  assert.ok(t7.includes('monetariamente atualizados (CDC, art. 49)'));
  assert.ok(!/integral/.test(t7));
  assert.equal(ctx.__t.COBRANCA, false, 'T-7 só deve aparecer quando houver cobrança (CP-06)');
});
// LGPD (Lei 13.709/2018): arts. 42 a 45 = Seção III, Da Responsabilidade e do Ressarcimento de Danos;
// art. 5º, VI: controlador. CDC art. 51, I: nulidade de cláusula que atenue a responsabilidade.
test('CB-TXT-05: T-4 e T-5 citam os artigos conferidos', () => {
  assert.ok(TEXTOS['T-4'].includes('arts. 42 a 45 da Lei nº 13.709/2018'));
  assert.ok(TEXTOS['T-4'].includes('(art. 51, I)'));
  assert.ok(TEXTOS['T-5'].includes('O usuário é controlador dos dados do comprador'));
});

// CB-TXT-06: exemplo do blog recalculado a partir das próprias premissas do texto. Se alguém mudar
// um número sem refazer a conta, o teste falha. Formato pt-BR: R$ 30.000,00.
const brl = (v) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
test('CB-TXT-06: exemplo "quanto custa um chargeback" confere com a conta', () => {
  const t = texto(blog);
  const preco = 300, custo = 150, vendasMes = 200, perdidas = 4;
  assert.ok(t.includes(`vendendo um produto de ${brl(preco)} com custo de mercadoria e frete de ${brl(custo)}`));
  const lucro = preco - custo, perdido = -custo, diferenca = lucro - perdido;
  assert.ok(t.includes(`+ ${brl(lucro)}`) && t.includes(`− ${brl(custo)}`));
  assert.ok(t.includes(`A diferença entre os dois cenários é de ${brl(diferenca)} por chargeback perdido`));
  assert.ok(t.includes(`lucro bruto de ${diferenca / lucro} vendas`));
  const antes = vendasMes * lucro, depois = (vendasMes - perdidas) * lucro - perdidas * custo;
  assert.equal(antes - depois, perdidas * diferenca);
  assert.ok(t.includes(`cai de ${brl(antes)} (${vendasMes} × ${brl(lucro)}) para ${brl(depois)} (${vendasMes - perdidas} × ${brl(lucro)} − ${perdidas} × ${brl(custo)})`));
});
// Cada coluna da tabela fecha: o primeiro valor de cada parcela, somado, dá o resultado da coluna.
test('CB-TXT-06: tabela do exemplo fecha em cada coluna', () => {
  const tab = blog.match(/aria-label="Tabela: custo de um chargeback">([\s\S]*?)<\/table>/)[1];
  const lin = [...tab.matchAll(/<tr><td>([^<]+)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/g)].map((m) => [m[1], m[2], m[3]]);
  const val = (c) => { const m = c.replace(/<[^>]+>/g, '').match(/^([+−]) ?R\$ ([\d.]+,\d{2})|^R\$ ([\d.]+,\d{2})/); if (!m) return null;
    const n = Number((m[2] || m[3]).replace(/\./g, '').replace(',', '.')); return m[1] === '−' ? -n : n; };
  const parcelas = lin.filter(([n]) => n === 'Receita da venda' || n.startsWith('Mercadoria e frete'));
  const resultado = lin.find(([n]) => n === 'Resultado da venda');
  assert.equal(parcelas.length, 2);
  for (const col of [1, 2]) {
    const soma = parcelas.reduce((a, l) => a + val(l[col]), 0);
    assert.equal(soma, val(resultado[col]), `coluna ${col}`);
  }
  assert.equal(val(resultado[1]), 150);
  assert.equal(val(resultado[2]), -150);
});
// Regulamento do Pix: anexo à Resolução BCB nº 1/2020 (em vigor, conferida na API de normativos do
// BCB em 31/10/2026); o Mecanismo Especial de Devolução está no Capítulo XI, Seção II.
test('CB-TXT-06: FAQ do Pix cita o regulamento em vigor e o MED', () => {
  const t = texto(blog);
  assert.ok(t.includes('Mecanismo Especial de Devolução, definidas no Regulamento do Pix, anexo à Resolução BCB nº 1/2020'));
});

// CB-TXT-07: a tabela "Os motivos mais comuns" do blog só usa códigos que existem na matriz do app
// (a matriz é a constante; o blog não pode citar código que o app não tem).
test('CB-TXT-07: códigos da tabela de motivos do blog existem na matriz do app', () => {
  const tabela = blog.match(/<thead><tr><th>Motivo<\/th><th>Visa<\/th><th>Mastercard<\/th><th>Elo<\/th>[\s\S]*?<\/table>/)[0];
  const linhas = [...tabela.matchAll(/<tr><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td>/g)];
  assert.equal(linhas.length, 6);
  const tem = (b, c) => MATRIZ.some((m) => m.bandeira === b && (m.codigo === c || m.codigo.startsWith(`${c} (`)));
  for (const [, nome, v, mc, elo] of linhas) {
    assert.ok(tem('Visa', v), `${nome}: Visa ${v}`);
    assert.ok(tem('Mastercard', mc), `${nome}: Mastercard ${mc}`);
    assert.ok(tem('Elo', elo), `${nome}: Elo ${elo}`);
  }
});
