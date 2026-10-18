# Piloto Chargeback

App (`index.html`) e blog (`blog/`) publicados pelo GitHub Pages em https://chargeback.contacertabr.com.br. Este README fica em `.github/` porque o Jekyll do Pages publicaria um `README.md` na raiz como arquivo do site; pastas e arquivos com ponto não são publicados.

## Fonte

O HTML do repositório é a fonte oficial. O `index.html` já foi saída de um build cuja fonte não existe mais (o comentário sobre `build.mjs` no script é resto dele): edite o HTML direto.

## CSP do app

A CSP do `index.html` libera o único `<script>` inline pelo hash (`script-src 'sha256-...'`), e o `<main>` e o `<footer>` só aparecem quando o script roda. Se o script mudar e o hash não, o navegador bloqueia o script e a página fica em branco. Depois de editar o script, rode:

```
node .github/scripts/conferir-csp.mjs --corrigir
```

Ele reescreve só os hashes do `script-src` do `index.html` e confere todas as páginas. Sem `--corrigir`, só confere.

## CI (`.github/workflows/ci.yml`)

- `check`: html-validate 9.7.1 (regras em `.htmlvalidate.json`) em todo `.html`, e o `conferir-csp.mjs`.
- `lighthouse`: Lighthouse 13.5.0 com o site servido localmente (`.github/scripts/lighthouse.mjs`). Blog: SEO >= 0,90, acessibilidade >= 0,95 e CLS < 0,1. App: acessibilidade e CLS (é noindex de propósito).
