---
id: B4
slug: chargeback-mercado-pago
titulo: Chargeback no Mercado Pago: como responder a uma contestação
h1: Chargeback no Mercado Pago: como responder a uma contestação e enviar a defesa
descricao: Como funciona a contestação de pagamento no Mercado Pago: o aviso, o prazo do caso, os arquivos aceitos, o Programa de Proteção ao Vendedor e a decisão.
og_titulo: Chargeback no Mercado Pago
og_sub: Aviso, prazo, documentos e decisão
og_rodape: Contestação de pagamento com cartão
palavra_chave: chargeback mercado pago
secundarias: contestação mercado pago ;; programa de proteção ao vendedor mercado pago ;; como contestar chargeback mercado pago
situacao: rascunho
conferir: Caminho de menus do painel não descrito (muda com frequência). Prazo de cada caso vem no próprio caso (campo de prazo na API); confirmar na Central de Ajuda se há prazo padrão em dias antes de citar número.
---
**Resumo:** no Mercado Pago, a contestação (chargeback) começa quando o comprador pede ao banco a devolução de um pagamento com cartão. O Mercado Pago avisa o vendedor, retém o valor em disputa e pede documentos que provem a venda. A documentação é analisada pela equipe do Mercado Pago, que media a disputa com a bandeira e o banco emissor. Se a venda estiver coberta pelo Programa de Proteção ao Vendedor, o valor pode ser devolvido sem desconto. O prazo para enviar os documentos é o informado em cada caso.

## Como a contestação chega ao vendedor

1. **Aviso**: o Mercado Pago notifica o vendedor (pelo painel, por e-mail e, para quem integra pela API, por notificação do tópico de contestações).
2. **Retenção**: durante a análise, o valor em disputa fica retido na conta do vendedor.
3. **Documentos**: o vendedor envia as provas da venda dentro do prazo do caso.
4. **Análise e mediação**: o Mercado Pago revisa os documentos e media a resolução com a bandeira e o banco emissor.
5. **Decisão**: se a decisão for favorável, o valor volta ao vendedor; se for contrária, é descontado.

## O que enviar na defesa

A documentação do Mercado Pago para integradores pede arquivos de evidência como notas fiscais, comprovantes de envio e capturas de tela, em JPEG, PNG ou PDF, com até 10 arquivos e 10 MB no total por envio. Pela API, depois do envio, o caso passa ao status de documentação em revisão.

Escolha as provas pelo motivo da contestação:

| Motivo alegado | Provas que mais ajudam |
|---|---|
| Compra não reconhecida (fraude) | Dados do comprador, histórico de compras, autenticação quando houver, comprovante de entrega no endereço cadastrado |
| Produto não recebido | Rastreio com entrega e, se houver, assinatura ou foto da entrega |
| Produto diferente ou com defeito | Anúncio, fotos, nota fiscal, conversas e política de troca |
| Cobrança duplicada | Comprovantes que mostram compras diferentes ou uma única cobrança |

A lista completa por bandeira está em [o que é chargeback](/blog/o-que-e-chargeback/), e o modelo de carta em [como contestar um chargeback](/blog/como-contestar-chargeback/).

## Programa de Proteção ao Vendedor

O Mercado Pago informa que, se a venda atender aos requisitos do Programa de Proteção ao Vendedor, ele faz o estorno ao comprador sem descontar o dinheiro da venda. Na API, um campo indica se o caso é elegível à cobertura. Os requisitos estão na página do programa e mudam com o tempo: leia antes de contar com a cobertura.

## Como reduzir as contestações no Mercado Pago

- Configure o nome que aparece na fatura do cartão, para o cliente reconhecer a compra.
- Envie e-mail de confirmação com os dados do pedido.
- Informe rastreio e prazos de entrega.
- Atenda pedidos de cancelamento antes que virem contestação.

Mais medidas em [como evitar chargeback](/blog/como-evitar-chargeback/).

## Perguntas frequentes

### Qual é o prazo para responder a uma contestação no Mercado Pago?

O prazo vem informado em cada caso de contestação, no aviso e no painel. Envie os documentos o quanto antes; depois do prazo, o caso segue sem a sua defesa.

### O dinheiro fica bloqueado durante a contestação?

Sim. Durante a análise, o valor em disputa fica retido na conta do vendedor até a conclusão do processo.

### Quem decide a contestação?

O banco emissor e a bandeira, com a mediação do Mercado Pago, que analisa os documentos enviados pelo vendedor.

### Se eu tiver Proteção ao Vendedor, preciso enviar documentos?

A documentação do Mercado Pago orienta enviar sempre documentos que sustentem a venda. A cobertura depende dos requisitos do programa.

## Fontes oficiais

- [Mercado Pago, Gerenciar contestações (documentação para desenvolvedores)](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/chargebacks/management).
- [Mercado Pago, Contestações: introdução e motivos mais comuns](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/chargebacks/introduction).
- [Mercado Pago, termos de uso](https://www.mercadopago.com.br/ajuda/299).
