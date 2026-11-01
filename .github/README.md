# Piloto Chargeback

App (`index.html`) e blog (`blog/`) publicados pelo GitHub Pages em https://chargeback.contacertabr.com.br. Este README fica em `.github/` porque o Jekyll do Pages publicaria um `README.md` na raiz como arquivo do site; pastas e arquivos com ponto não são publicados.

## Fonte

O HTML do repositório é a fonte oficial: edite-o direto. O `index.html` já foi saída de um build, e o script dele ainda traz comentários desse tempo:

- `PILOTO`, "Gerado/alterado pelo build" (`node build.mjs --piloto`);
- `TEXTOS`, "Não editar à mão" (textos da seção 6 do escopo v5);
- matriz S01 e quadro C3, "GERADO por gerar-matriz.mjs. Não editar", com a fonte em `fontes/*.json` e `fontes/*.md` e o sha256 dela no próprio comentário.

`build.mjs`, `gerar-matriz.mjs` e `fontes/` não estão no repositório nem no histórico. Esses trechos agora se editam à mão no HTML; o sha256 dos comentários é o da fonte antiga. As constantes que o build deixava sem uso (`S01_SHA256`, `C3_SHA256`, `S01_RODAPE_MATRIZ`, `S01_RODAPE_R2`, `digitosAscii`) saíram em 01/11 (CB-14), e o `pagina.test.mjs` recusa símbolo de nível de topo do script que nem o script nem os testes usam. Depois de editar o script, rode o `--corrigir` abaixo.

## CSP do app

A CSP do `index.html` libera os dois `<script>` inline pelo hash (`script-src 'sha256-...'`): o teste de suporte (ES5, logo depois do `</main>`) e o script principal. O `<main>` e o `<footer>` só aparecem quando o script principal roda; sem JavaScript, o `<noscript>` avisa, e no navegador que não aceita lookbehind e `\p{}` em regex (Safari antes do 16.4, que recusa o script principal inteiro) o teste de suporte mostra só o título e o `#sem-suporte`. Se um script mudar e o hash não, o navegador bloqueia o script e a página fica em branco. A CSP também exige Trusted Types (`require-trusted-types-for 'script'; trusted-types 'none'`): o navegador recusa HTML ou script em texto em destinos como `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` e `eval`. Use `textContent`, `createElement` e `setAttribute`, como o script já faz. Depois de editar um script, rode:

```
node .github/scripts/conferir-csp.mjs --corrigir
```

Ele reescreve só os hashes do `script-src` do `index.html` e confere todas as páginas. Sem `--corrigir`, só confere. Vale o repositório inteiro, de qualquer pasta em que se rode.

## Testes do app (`.github/testes/`)

- `mascara.test.mjs`: máscara de cartão (matrizes dos laudos em `*.json`).
- `dossie.test.mjs`: funções puras do dossiê (motivo, CNPJ, limpeza de texto, datas, nome do arquivo, `dadosDoFormulario`).
- `pagina.test.mjs`: o HTML das páginas, sem navegador: o `<noscript>`, o `#sem-suporte` e o teste de suporte (rodado no DOM mínimo com um `RegExp` sem lookbehind e com o normal); as diretivas da CSP do app; e os símbolos de nível de topo do script principal sem uso.

Os testes que rodam o script principal o tiram do HTML pelo começo (`<script>"use strict";`), porque o primeiro `<script>` da página é o teste de suporte.
- `fluxo.test.mjs`: roda o script da página sobre a árvore do próprio `index.html` num DOM mínimo (`dom-minimo.mjs`, que cobre só o que o script usa) e dispara os eventos como o navegador. Confere que qualquer alteração descarta o dossiê, que a D-1 vale para uma geração e que o arquivo baixado é a prévia da tela; que cada recusa fica junto do campo (`<p id="<campo>-erro">`, `aria-invalid`, `aria-describedby`, foco); que a nota da saída do campo (A-3) não muda a página entre o mousedown e o click do botão (o `timersNaFila` troca o `setTimeout` síncrono por uma fila); e, com `vedadosNaPagina`, que nenhum texto da página fora dos literais aprovados tem termo vedado. Se o script passar a usar outra API do DOM, estenda o `dom-minimo.mjs`.
- `fluxo-navegador.mjs` (fora do `*.test.mjs`, porque pede Chrome e rede): o mesmo fluxo no Chrome de verdade, com o formulário visível, em 390 e 1280 px. Controla o Chrome por CDP com o WebSocket nativo do Node 22, sem dependências; confere que a mensagem de erro fica dentro da tela, que o clique de mouse e o toque (390 px) chegam ao botão quando a saída do campo mostra uma nota (fato, pedido e CNPJ com número de cartão), fonte >= 16 px e alvos >= 44 px, e roda o axe-core 4.14.0 (baixado por `npm pack` e conferido pelo sha512) em cada etapa, exigindo 0 violação. Abre também a página sem JavaScript (aviso do `<noscript>`) e com um `RegExp` que recusa lookbehind antes dos scripts da página (o script principal para e aparecem só o título e o `#sem-suporte`, sem violação no axe-core), e confere que o Chrome aplica os Trusted Types da CSP (`innerHTML` com texto é recusado). Para subir o axe-core, troque a versão e o sha512 (o `integrity` do `npm view axe-core@<versão> dist.integrity`) no topo do script.

Os testes de tempo da máscara (A-03, limite de 100 ms) ficam perto do limite em máquina carregada. Por isso o CI roda os arquivos de teste um de cada vez (`--test-concurrency=1`): em paralelo, o fluxo disputava CPU com eles. Se um deles falhar sozinho, rode de novo só ele (`node --test --test-name-pattern='A-03' .github/testes/mascara.test.mjs`).

## CI (`.github/workflows/ci.yml`)

- `check`: html-validate 9.7.1 (regras em `.htmlvalidate.json`) em todo `.html`, os testes do app (`node --test --test-concurrency=1 .github/testes/*.test.mjs`: máscara de cartão, funções do dossiê, HTML das páginas e fluxo da página num DOM mínimo, sem dependências), o fluxo no Chrome do runner com axe-core (`fluxo-navegador.mjs`), o `conferir-csp.mjs` e o zizmor 1.30.1 (modo offline) nos workflows e no `dependabot.yml`, que falha o job em qualquer achado, como action sem SHA ou credencial persistida no checkout. Local, da raiz:

  ```
  find . -name '*.html' -not -path './.git/*' -print0 | xargs -0 npx --yes html-validate@9.7.1 --max-warnings 0 -c .htmlvalidate.json
  node --test --test-concurrency=1 .github/testes/*.test.mjs
  node .github/testes/fluxo-navegador.mjs
  node .github/scripts/conferir-csp.mjs
  uvx zizmor@1.30.1 --offline .github
  ```

- `lighthouse`: Lighthouse 13.5.0 com o site servido localmente. Blog: SEO >= 0,90, acessibilidade >= 0,95, CLS < 0,1, robots.txt e llms.txt lidos e válidos. App: acessibilidade e CLS (é noindex de propósito). Local, da raiz: `node .github/scripts/lighthouse.mjs` (Node >= 22.19, rede para o `npx` e Chrome instalado ou em `CHROME_PATH`; as outras opções estão no cabeçalho do script).

## Dependabot (`.github/dependabot.yml`)

Só os SHAs das actions do `ci.yml`, todas num PR agrupado, com versões publicadas há pelo menos 14 dias. O html-validate, o Lighthouse, o zizmor e o axe-core, fixados no próprio comando ou script, ficam de fora.

A primeira verificação roda quando este arquivo chega à `main`, sem esperar o dia 1; depois, dia 1 de cada mês às 06:00 de Brasília. O grupo inclui majors, e o checkout e o setup-node já têm v7 publicada há mais de 14 dias: o primeiro PR deve trazer a v7 das duas. Leia as notas de versão e só faça o merge, manual, com o CI verde.

Alertas e atualizações de segurança (Settings > Advanced Security) não cobrem nada aqui: o GitHub só gera alerta de action referenciada por versão, não por SHA, e os pacotes do `npx` e do `pip` não entram no grafo de dependências. A defesa é o PR mensal com cooldown e o merge manual com o CI verde.
