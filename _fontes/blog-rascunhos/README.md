# Blog: rascunhos de 13/11/2026 (17 itens do mapa de artigos)

Rascunhos no formato de `_fontes/blog/` (o mesmo do `build-blog.py`), guardados fora da pasta que o build lê. Nada aqui é publicado: o build só lê `_fontes/blog/*.md`, e o GitHub Pages não publica pastas que começam com "_".

| ID | Situação | URL | Title | Palavra-chave |
|---|---|---|---|---|
| B4 | rascunho | `/blog/chargeback-mercado-pago/` | Chargeback no Mercado Pago: como responder a uma contestação | chargeback mercado pago |
| B5 | rascunho | `/blog/chargeback-cielo/` | Chargeback na Cielo: onde ver, prazo e como responder | chargeback cielo |
| B6 | rascunho | `/blog/chargeback-por-adquirente/` | Chargeback na Stone, no PagBank e no Pagar.me: o que fazer | chargeback stone |
| B7 | rascunho | `/blog/codigos-chargeback-visa/` | Códigos de chargeback Visa: 10.4, 13.1, 13.2 e 13.3 | chargeback visa |
| B8 | rascunho | `/blog/codigos-chargeback-mastercard/` | Códigos de chargeback Mastercard: 4837, 4853 e 4834 | chargeback mastercard |
| B9 | rascunho | `/blog/chargeback-desacordo-comercial/` | Chargeback por desacordo comercial: não recebido ou defeito | chargeback desacordo comercial |
| B10 | rascunho | `/blog/fraude-amigavel/` | Fraude amigável: como identificar e se defender | fraude de chargeback |
| B11 | rascunho | `/blog/garantia-de-chargeback/` | Garantia de chargeback: o que é e quando vale a pena | garantia de chargeback |
| B12 | rascunho | `/blog/estorno-x-chargeback/` | Estorno x chargeback: diferença, prazos e compra parcelada | estorno cartão de crédito |
| B13 | rascunho | `/blog/chargeback-infoproduto/` | Chargeback em infoproduto: o que o produtor pode fazer | chargeback hotmart |
| B15 | rascunho | `/blog/estorno-o-que-e/` | Estorno ou extorno? O que é estorno e como funciona | estorno ou extorno |
| B23 | rascunho | `/blog/med-pix/` | MED do Pix: como funciona e como o lojista se defende | med do pix |
| B29 | rascunho | `/blog/chargeback-marketplace/` | Chargeback em marketplace: quem assume a contestação | chargeback mercado livre |
| B32 | rascunho | `/blog/chargeback-turismo/` | Chargeback em viagens e hotelaria: no-show e cancelamento | chargeback turismo |
| B33 | rascunho | `/blog/prazos-do-chargeback/` | Prazos do chargeback: quanto tempo o cliente e o lojista têm | prazo chargeback |
| B35 | rascunho | `/blog/antifraude-ecommerce/` | Antifraude para e-commerce: como escolher e configurar | antifraude para e-commerce |
| B39 | atualização | `/blog/como-contestar-chargeback/` | (seção nova no post publicado) | provas para contestar chargeback |
## Campos de controle

Além dos campos do build (`slug`, `titulo`, `h1`, `descricao`, `og_titulo`, `og_sub`, `og_rodape`), cada arquivo tem `id`, `palavra_chave`, `secundarias`, `situacao` e `conferir`. O build ignora esses campos.

## Conferência feita

Numa cópia do repositório, com os 16 rascunhos copiados para `_fontes/blog/`, o `build-blog.py` gerou as 16 páginas sem erro, com 3 a 4 perguntas no FAQPage de cada uma, a imagem og.png e títulos de até 60 caracteres e descrições de até 158. Os links internos apontam só para os 4 posts publicados, o índice do blog e o formulário do piloto.

## Para publicar

1. Resolver o campo `conferir` e ler as fontes de cada adquirente ou plataforma citada.
2. Mover o arquivo para `_fontes/blog/` (com prefixo numérico, como os demais) e rodar `python3 _fontes/build-blog.py AAAA-MM-DD`.
3. Acrescentar a URL ao `sitemap.xml` e ao `llms.txt` e o card ao `blog/index.html`, como no PR #14.
4. Se o post novo deve aparecer no "Leia também", ampliar a lista `nomes` do build.

## Observações

- B6 (Stone, PagBank, Pagar.me) não cita caminho de menu nem prazo em dias: nenhuma fonte oficial foi lida. É o rascunho mais dependente de conferência.
- B32 (turismo) tem menos de 10 buscas por mês: publicar por último ou fundir no B9.
- B39 é atualização do post publicado como-contestar-chargeback (checklist por motivo).
- B12 e B15 respondem buscas de consumidor ("estorno cartão de crédito", "estorno ou extorno"), que têm o maior volume do lote.
