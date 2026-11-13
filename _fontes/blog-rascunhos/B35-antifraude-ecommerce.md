---
id: B35
slug: antifraude-ecommerce
titulo: Antifraude para e-commerce: como escolher e configurar
h1: Antifraude para e-commerce: como escolher, configurar e medir
descricao: Como escolher um antifraude para a loja virtual: tipos de análise, 3-D Secure, garantia de chargeback, métricas que importam e regras para começar.
og_titulo: Antifraude para e-commerce
og_sub: Como escolher, configurar e medir
og_rodape: Regras, análise manual e 3-D Secure
palavra_chave: antifraude para e-commerce
secundarias: sistema antifraude loja virtual ;; como escolher antifraude ;; taxa de aprovação antifraude ;; 3-d secure e-commerce
situacao: rascunho
conferir: Texto genérico, sem fornecedores nem números de mercado.
---
**Resumo:** um antifraude analisa cada pedido antes da aprovação e decide se aprova, recusa ou manda para análise manual. O bom antifraude não é o que recusa mais, e sim o que recusa a fraude sem recusar o cliente bom. Para escolher, compare três números no seu segmento: taxa de aprovação, taxa de chargeback por fraude e custo por pedido. Para configurar, comece com poucas regras, use 3-D Secure nas vendas de risco e revise os resultados todo mês.

## Tipos de análise

| Tipo | Como funciona | Quando ajuda |
|---|---|---|
| Regras | A loja define critérios: valor alto, endereço de entrega diferente, muitas tentativas | Lojas pequenas e casos óbvios |
| Modelos automáticos | O sistema pontua o risco com dados de muitas lojas | Volume médio e alto |
| Análise manual | Uma pessoa revisa os pedidos duvidosos | Pedidos de valor alto |
| 3-D Secure | O banco emissor autentica o comprador | Vendas de risco; nas compras autenticadas, as regras das bandeiras transferem ao emissor, em regra, a responsabilidade por contestações de fraude |

Na prática, as lojas combinam os quatro.

## As métricas que importam

- **Taxa de aprovação**: pedidos aprovados sobre pedidos analisados. Recusar demais custa vendas.
- **Taxa de chargeback por fraude**: contestações de fraude sobre vendas aprovadas. Adquirentes e bandeiras acompanham o índice de disputas.
- **Falsos positivos**: pedidos bons recusados. Difícil de medir, mas aparece nas reclamações de clientes.
- **Custo total**: mensalidade, custo por pedido, custo da análise manual e perdas que sobram.

## Como escolher

1. **Peça números do seu segmento**, não médias gerais.
2. **Pergunte o que acontece com o pedido recusado**: dá para mandar para análise manual ou para autenticação?
3. **Veja se há garantia de chargeback** e o que ela cobre. Em geral, só fraude.
4. **Confira a integração** com a sua plataforma e o seu gateway.
5. **Teste por um período** e compare com o antes.

## Regras para começar

- Pedido acima de um valor de referência, com endereço de entrega diferente do de cobrança: análise manual ou 3-D Secure.
- Muitas tentativas de pagamento com cartões diferentes no mesmo pedido: recusa ou análise.
- Primeira compra de valor alto com entrega expressa: análise manual.
- Cliente recorrente, mesmo dispositivo, mesmo endereço: aprovação mais rápida.

Ajuste os valores ao seu ticket médio e revise todo mês.

## O antifraude também gera provas

Os dados que o antifraude registra (IP, dispositivo, histórico do cliente, resultado da autenticação) são as provas que pesam numa contestação por fraude. Veja o que guardar em [o que é chargeback](/blog/o-que-e-chargeback/) e outras medidas em [como evitar chargeback](/blog/como-evitar-chargeback/).

## Perguntas frequentes

### Toda loja virtual precisa de antifraude?

Toda loja que vende com cartão on-line precisa de alguma análise de risco. Pode ser a do gateway, um serviço dedicado ou regras próprias com análise manual.

### Antifraude acaba com o chargeback?

Não. Ele reduz a fraude, mas não evita as contestações por desacordo comercial, como produto não recebido ou diferente do anunciado.

### Vale usar 3-D Secure em todas as vendas?

Depende. A autenticação protege contra contestações de fraude, mas pode reduzir a conversão. Muitas lojas usam nas vendas de maior risco.

## Fontes oficiais

- [Visa, Dispute Management Guidelines for Visa Merchants](https://usa.visa.com/dam/VCOM/global/support-legal/documents/merchants-dispute-management-guidelines.pdf) (versão de junho de 2024; pode haver regra mais recente).
- [Mercado Pago, contestações: motivos mais comuns e como prevenir](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/chargebacks/introduction).
