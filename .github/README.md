# Piloto Chargeback

App (`index.html`) e blog (`blog/`) publicados pelo GitHub Pages em https://chargeback.contacertabr.com.br. Este README fica em `.github/` porque o Jekyll do Pages publicaria um `README.md` na raiz como arquivo do site; pastas e arquivos com ponto não são publicados.

## Fonte

O HTML do repositório é a fonte oficial: edite-o direto. O `index.html` já foi saída de um build, e o script dele ainda traz comentários desse tempo:

- `PILOTO`, "Gerado/alterado pelo build" (`node build.mjs --piloto`);
- `TEXTOS`, "Não editar à mão" (textos da seção 6 do escopo v5);
- matriz S01 e quadro C3, "GERADO por gerar-matriz.mjs. Não editar", com a fonte em `fontes/*.json` e `fontes/*.md` e o hash dela em `S01_SHA256` e `C3_SHA256`.

`build.mjs`, `gerar-matriz.mjs` e `fontes/` não estão no repositório nem no histórico. Esses trechos agora se editam à mão no HTML; os `*_SHA256` são o hash da fonte antiga, e o código não os usa. Depois de editar o script, rode o `--corrigir` abaixo.

## CSP do app

A CSP do `index.html` libera o único `<script>` inline pelo hash (`script-src 'sha256-...'`), e o `<main>` e o `<footer>` só aparecem quando o script roda. Se o script mudar e o hash não, o navegador bloqueia o script e a página fica em branco. Depois de editar o script, rode:

```
node .github/scripts/conferir-csp.mjs --corrigir
```

Ele reescreve só os hashes do `script-src` do `index.html` e confere todas as páginas. Sem `--corrigir`, só confere. Vale o repositório inteiro, de qualquer pasta em que se rode.

## CI (`.github/workflows/ci.yml`)

- `check`: html-validate 9.7.1 (regras em `.htmlvalidate.json`) em todo `.html`, o `conferir-csp.mjs` e o zizmor 1.30.1 (modo offline) nos workflows e no `dependabot.yml`, que falha o job em qualquer achado, como action sem SHA ou credencial persistida no checkout. Local, da raiz:

  ```
  find . -name '*.html' -not -path './.git/*' -print0 | xargs -0 npx --yes html-validate@9.7.1 --max-warnings 0 -c .htmlvalidate.json
  node .github/scripts/conferir-csp.mjs
  uvx zizmor@1.30.1 --offline .github
  ```

- `lighthouse`: Lighthouse 13.5.0 com o site servido localmente. Blog: SEO >= 0,90, acessibilidade >= 0,95, CLS < 0,1, robots.txt e llms.txt lidos e válidos. App: acessibilidade e CLS (é noindex de propósito). Local, da raiz: `node .github/scripts/lighthouse.mjs` (Node >= 22.19, rede para o `npx` e Chrome instalado ou em `CHROME_PATH`; as outras opções estão no cabeçalho do script).

## Dependabot (`.github/dependabot.yml`)

Só os SHAs das actions do `ci.yml`, todas num PR agrupado, com versões publicadas há pelo menos 14 dias. O html-validate, o Lighthouse e o zizmor, fixados no próprio comando, ficam de fora.

A primeira verificação roda quando este arquivo chega à `main`, sem esperar o dia 1; depois, dia 1 de cada mês às 06:00 de Brasília. O grupo inclui majors, e o checkout e o setup-node já têm v7 publicada há mais de 14 dias: o primeiro PR deve trazer a v7 das duas. Leia as notas de versão e só faça o merge, manual, com o CI verde.

Alertas e atualizações de segurança (Settings > Advanced Security) não cobrem nada aqui: o GitHub só gera alerta de action referenciada por versão, não por SHA, e os pacotes do `npx` e do `pip` não entram no grafo de dependências. A defesa é o PR mensal com cooldown e o merge manual com o CI verde.
