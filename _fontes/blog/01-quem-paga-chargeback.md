---
slug: quem-paga-chargeback
titulo: Quem paga uma compra contestada? Lojista, adquirente ou banco
h1: Quem paga uma compra contestada no cartão: lojista, adquirente ou banco?
descricao: Em regra, quem paga o chargeback é o lojista: a adquirente debita o valor da venda. Veja quando o banco emissor fica com a perda e como recuperar o dinheiro.
og_titulo: Quem paga o chargeback
og_sub: Lojista, adquirente ou banco: o caminho do dinheiro
og_rodape: Débito, defesa com provas e 3-D Secure
---
**Resumo:** na maioria dos casos, quem paga a compra contestada é o **lojista**. Quando o titular contesta a compra no banco emissor, a disputa passa pela bandeira e chega à adquirente ou ao gateway, que, pelo contrato, retém ou debita o valor da venda do lojista. O lojista só recupera o dinheiro se responder com provas dentro do prazo e o emissor aceitar a resposta. O **banco emissor** fica com a perda quando a resposta do lojista é aceita e, nas contestações por fraude em compras autenticadas com 3-D Secure, pela regra de transferência de responsabilidade das bandeiras.

## O caminho do dinheiro numa contestação

| Etapa | O que acontece | Quem fica sem o dinheiro |
|---|---|---|
| 1. Contestação | O titular contesta a compra no banco que emitiu o cartão | Ainda ninguém |
| 2. Disputa na bandeira | O emissor abre a disputa com um código de motivo e cobra a adquirente | A adquirente, por um momento |
| 3. Débito do lojista | A adquirente ou o gateway avisa o lojista e retém ou debita o valor | O lojista |
| 4. Resposta | O lojista envia as provas pelo painel da adquirente, dentro do prazo dela | O lojista, enquanto aguarda |
| 5. Decisão | O emissor aceita ou recusa a resposta; pode haver novas etapas conforme a bandeira | O lojista, se perder; o emissor, se o lojista ganhar |

A adquirente fica no meio: ela repassa a cobrança ao lojista porque o contrato de credenciamento prevê isso. Por isso também pode reter valores da agenda de recebíveis quando o risco de disputas aumenta.

## Quando o lojista fica com a perda

- A contestação não é respondida ou a resposta sai fora do prazo da adquirente.
- As provas não atendem o que a bandeira pede para aquele código de motivo.
- O cliente tem razão: produto não entregue, cobrança em dobro ou cancelamento não atendido.

Além do valor da venda, o lojista perde a mercadoria e o frete, quando já enviou o produto, e pode pagar tarifa por disputa, se o contrato da adquirente ou do gateway prever. O exemplo em números está em [o que é chargeback](/blog/o-que-e-chargeback/).

## Quando o banco emissor fica com a perda

- **A resposta do lojista é aceita:** o valor volta ao lojista, e o emissor resolve a questão com o titular.
- **Fraude em compra autenticada:** nas compras on-line autenticadas com 3-D Secure (Visa Secure, Mastercard Identity Check), as regras das bandeiras transferem ao emissor, em regra, a responsabilidade pelas contestações por fraude. Há exceções nas regras de cada bandeira, e a autenticação precisa ter sido registrada na transação.

Por isso a autenticação é uma das medidas que mais reduzem perdas com fraude. Veja outras em [como evitar chargeback](/blog/como-evitar-chargeback/).

## E o cliente?

Se a resposta do lojista for aceita, a cobrança se mantém e o cliente paga a compra normalmente, na fatura do cartão. Quando o próprio titular contesta uma compra que fez e recebeu, alegando que não a reconhece, o caso é chamado de autofraude. Nessas situações, histórico de compras, dados do dispositivo e comprovante de entrega são as provas que mais pesam.

## Como reduzir a conta

1. Responda toda contestação que tiver provas, dentro do prazo da adquirente.
2. Separe as provas pelo código de motivo; o modelo de resposta está em [como contestar um chargeback](/blog/como-contestar-chargeback/).
3. Use autenticação 3-D Secure nas vendas on-line de maior risco.
4. Quando o cliente tiver razão, devolva o dinheiro antes que ele abra a disputa.

Para organizar as provas de uma disputa, [monte o dossiê no formulário do piloto](/#form).

## Perguntas frequentes

### O lojista sempre paga o chargeback?

Não. O lojista paga quando não responde, quando responde fora do prazo ou quando as provas não são aceitas. Se a resposta for aceita, o valor volta para ele.

### A adquirente pode reter o meu dinheiro?

O contrato de credenciamento costuma permitir que a adquirente retenha ou debite valores para cobrir contestações e, em alguns casos, mantenha uma reserva quando o risco aumenta. Confira as regras no contrato e no painel.

### Compra autenticada com 3-D Secure ainda pode virar chargeback?

Pode, mas por outros motivos, como produto não recebido ou diferente do anunciado. A transferência de responsabilidade das bandeiras vale, em regra, para contestações por fraude.

### Pix tem chargeback?

Não no sentido de cartão. O Pix tem regras próprias de devolução definidas pelo Banco Central, como o Mecanismo Especial de Devolução. Este artigo trata só de cartões.

## Fontes oficiais

- [Visa, Dispute Management Guidelines for Visa Merchants](https://usa.visa.com/dam/VCOM/global/support-legal/documents/merchants-dispute-management-guidelines.pdf) (versão de junho de 2024; pode haver regra mais recente).
- [Lei nº 12.865/2013 (arranjos de pagamento)](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12865.htm).
- [Banco Central, Regulamento do Pix (Resolução BCB nº 1/2020)](https://www.bcb.gov.br/estabilidadefinanceira/pixregulamentacao).
- Termos de uso: [Mercado Pago](https://www.mercadopago.com.br/ajuda/299), [PagBank](https://pagbank.com.br/sobre/regras-de-uso), [Stripe](https://stripe.com/br/legal/ssa).
