---
id: B39
tipo: atualizacao
post: como-contestar-chargeback
palavra_chave: provas para contestar chargeback
situacao: rascunho
---
# B39: atualização do post publicado /blog/como-contestar-chargeback/

## Por que é atualização

O mapa previa "Provas para contestar chargeback: checklist por motivo", sem demanda medida no Semrush e com a nota "fundir em guia maior ou cortar". O post publicado já tem a tabela "Que provas usar em cada motivo". A atualização transforma a tabela num checklist mais completo, sem criar página nova.

## Texto proposto: seção nova, depois de "Que provas usar em cada motivo"

> ## Checklist de provas por motivo
>
> **Fraude em compra on-line (Visa 10.4, Mastercard 4837, Elo 83)**
> - [ ] Resultado da autenticação 3-D Secure, se houve
> - [ ] Compras anteriores do mesmo cliente, sem contestação, com dispositivo ou IP iguais
> - [ ] IP, ID do dispositivo, e-mail e conta usados na compra
> - [ ] Comprovante de entrega no endereço do pedido
>
> **Produto não recebido (Visa 13.1, Mastercard 4853, Elo 30)**
> - [ ] Rastreio com a entrega no endereço do pedido
> - [ ] Assinatura ou foto da entrega
> - [ ] Data de entrega prometida, se ainda não venceu
>
> **Diferente do anunciado ou com defeito (Visa 13.3, Mastercard 4853, Elo 53)**
> - [ ] Anúncio e fotos na data da venda
> - [ ] Nota fiscal com a descrição
> - [ ] Mensagens com o cliente e oferta de troca ou conserto
>
> **Assinatura cancelada (Visa 13.2, Mastercard 4853, Elo 41)**
> - [ ] Termos da recorrência aceitos
> - [ ] Aviso de renovação enviado
> - [ ] Registro de uso depois da data alegada de cancelamento
>
> **Cobrança duplicada (Visa 12.6.1, Mastercard 4834, Elo 82)**
> - [ ] Dois pedidos e duas notas, ou prova de uma só cobrança
>
> **Reembolso não processado (Visa 13.6, Mastercard 4853, Elo 85)**
> - [ ] Comprovante do reembolso já feito, ou política aceita que não o previa

## Observações

- Os códigos são os da tabela publicada em o-que-e-chargeback (manuais da Visa e da Mastercard e lista da Adyen para a Elo).
- O markdown do build não gera caixas de seleção; os "[ ]" podem virar lista simples ou exigir ajuste no build.
- Rodar `python3 _fontes/build-blog.py AAAA-MM-DD` depois de editar o .md de _fontes/blog/.
