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

- `check`: html-validate 9.7.1 (regras em `.htmlvalidate.json`) em todo `.html`, e o `conferir-csp.mjs`. Local, da raiz:

  ```
  find . -name '*.html' -not -path './.git/*' -print0 | xargs -0 npx --yes html-validate@9.7.1 --max-warnings 0 -c .htmlvalidate.json
  node .github/scripts/conferir-csp.mjs
  ```

- `lighthouse`: Lighthouse 13.5.0 com o site servido localmente. Blog: SEO >= 0,90, acessibilidade >= 0,95, CLS < 0,1, robots.txt e llms.txt lidos e válidos. App: acessibilidade e CLS (é noindex de propósito). Local, da raiz: `node .github/scripts/lighthouse.mjs` (Node >= 22.19, rede para o `npx` e Chrome instalado ou em `CHROME_PATH`; as outras opções estão no cabeçalho do script).
