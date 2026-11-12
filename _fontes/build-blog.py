#!/usr/bin/env python3
"""Gera posts do blog a partir de _fontes/blog/*.md (pasta com '_': o GitHub Pages não publica).
Uso, da raiz: python3 _fontes/build-blog.py AAAA-MM-DD
Template: blog/o-que-e-chargeback/index.html (cabeçalho, CSS, navegação e rodapé). Escreve blog/<slug>/index.html e
blog/<slug>/og.png (1200x630). Formato do .md: cabeçalho entre '---' (slug, titulo, h1, descricao, og_titulo, og_sub,
og_rodape), resumo, seções '## ', '## Perguntas frequentes' (perguntas em '### ') e '## Fontes oficiais' por último."""
import sys, re, json, os, glob, html, unicodedata
import markdown
from PIL import Image, ImageDraw, ImageFont, ImageFilter
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SITE = 'https://chargeback.contacertabr.com.br'
DATA = sys.argv[1]
y, m, d = DATA.split('-'); DBR = f'{d}/{m}/{y}'
tpl = open(f'{R}/blog/o-que-e-chargeback/index.html', encoding='utf-8').read()
topo = tpl[:tpl.index('<title>')]
css = re.search(r'<style>.*?</style>', tpl, re.S).group(0)
nav = re.search(r'<nav class="topo">.*?</nav>', tpl, re.S).group(0)
rodape = re.search(r'<footer>.*?</footer>', tpl, re.S).group(0)
texto = lambda h: html.unescape(re.sub(r'<[^>]+>', '', h)).strip()
slugify = lambda t: re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()).strip('-')
esc = lambda s: html.escape(s, quote=True)
ld = lambda o: '<script type="application/ld+json">' + json.dumps(o, ensure_ascii=False, separators=(',', ':')) + '</script>'
FONTE = '/usr/share/fonts/truetype/inter/Inter-{}.ttf'

def fonte(peso, tam):
    for p in [FONTE.format(peso), f'/usr/share/fonts/opentype/inter/Inter-{peso}.otf']:
        if os.path.exists(p): return ImageFont.truetype(p, tam)
    import subprocess
    caminho = subprocess.run(['fc-match', '-f', '%{file}', f'Inter:style={peso}'], capture_output=True, text=True).stdout
    return ImageFont.truetype(caminho, tam)

def quebrar(draw, txt, f, largura):
    linhas, atual = [], ''
    for p in txt.split():
        t = (atual + ' ' + p).strip()
        if draw.textlength(t, font=f) <= largura: atual = t
        else: linhas.append(atual); atual = p
    return linhas + [atual]

def og(P, destino):
    W, H = 1200, 630
    img = Image.new('RGB', (W, H), '#0b2a20')
    # fundo com brilho suave à direita
    glow = Image.new('L', (W, H), 0); ImageDraw.Draw(glow).ellipse((620, -120, 1320, 640), fill=110)
    img.paste(Image.new('RGB', (W, H), '#14523b'), (0, 0), glow.filter(ImageFilter.GaussianBlur(160)))
    dr = ImageDraw.Draw(img)
    # marca
    dr.rounded_rectangle((80, 64, 132, 116), 12, fill='#1f7a4f')
    dr.rounded_rectangle((91, 80, 115, 86), 3, fill='#ffffff'); dr.rounded_rectangle((91, 94, 107, 100), 3, fill='#ffffff')
    dr.line((109, 99, 114, 104, 123, 92), fill='#c6f35f', width=5, joint='curve')
    fm = fonte('Bold', 27); dr.text((148, 76), 'Conta', font=fm, fill='#ffffff')
    dr.text((148 + dr.textlength('Conta ', font=fm), 76), 'Certa', font=fm, fill='#c6f35f')
    # cartão inclinado
    card = Image.new('RGBA', (380, 240), (0, 0, 0, 0)); dc = ImageDraw.Draw(card)
    dc.rounded_rectangle((0, 0, 379, 239), 26, fill='#0f6b48'); dc.rounded_rectangle((34, 70, 94, 112), 9, fill='#c6f35f')
    fn = fonte('SemiBold', 24); dc.text((40, 160), '•••• ••••  4821', font=fn, fill='#e8f5ee')
    card = card.rotate(8, expand=True, resample=Image.BICUBIC)
    sombra = Image.new('RGBA', card.size, (0, 0, 0, 0)); sombra.paste((0, 0, 0, 90), (0, 0), card.split()[3])
    img.paste(sombra.filter(ImageFilter.GaussianBlur(18)), (778, 168), sombra.filter(ImageFilter.GaussianBlur(18)))
    img.paste(card, (765, 140), card)
    dr = ImageDraw.Draw(img)
    dr.arc((860, 330, 1040, 510), 0, 120, fill='#c6f35f', width=9)
    dr.line((870, 470, 900, 500), fill='#c6f35f', width=9); dr.line((870, 470, 912, 458), fill='#c6f35f', width=9)
    # textos
    fk = fonte('Bold', 21); x = 80
    for ch in 'GUIA PARA LOJISTAS':
        dr.text((x, 186), ch, font=fk, fill='#c6f35f'); x += dr.textlength(ch, font=fk) + 3
    ft = fonte('ExtraBold', 68); yy = 226
    for linha in quebrar(dr, P['og_titulo'], ft, 640):
        dr.text((78, yy), linha, font=ft, fill='#ffffff'); yy += 78
    fs = fonte('Medium', 31); yy += 22
    for linha in quebrar(dr, P['og_sub'], fs, 600):
        dr.text((80, yy), linha, font=fs, fill='#d7e8de'); yy += 42
    dr.text((80, 548), P['og_rodape'], font=fonte('Medium', 21), fill='#9fb9ab')
    img.save(destino, optimize=True)

POSTS = []
for arq in sorted(glob.glob(f'{R}/_fontes/blog/*.md')):
    cab, corpo_md = re.match(r'^---\n(.*?)\n---\n(.*)$', open(arq, encoding='utf-8').read(), re.S).groups()
    P = dict(re.findall(r'^(\w+):\s*(.*)$', cab, re.M))
    for k in ('slug', 'titulo', 'h1', 'descricao', 'og_titulo', 'og_sub', 'og_rodape'):
        if not P.get(k): sys.exit(f'ABORTA {arq}: falta {k}')
    if len(P['descricao']) > 160: sys.exit(f'ABORTA {arq}: descrição com {len(P["descricao"])} caracteres')
    S = P['slug']; URL = f'{SITE}/blog/{S}/'; IMG = URL + 'og.png'
    corpo = markdown.markdown(corpo_md, extensions=['tables', 'sane_lists'], output_format='html')
    usados = {slugify(P['h1'])}
    def hid(mo):
        n, t = mo.group(1), mo.group(2); i = slugify(texto(t))[:70].strip('-'); b, k = i, 2
        while i in usados: i = f'{b}-{k}'; k += 1
        usados.add(i); return f'<h{n} id="{i}">{t}</h{n}>'
    corpo = re.sub(r'<h([23])>(.*?)</h\1>', hid, corpo)
    partes, secao = [], ''
    for bloco in re.split(r'(<h2 id="[^"]+">.*?</h2>|<table>.*?</table>)', corpo, flags=re.S):
        if bloco.startswith('<h2'): secao = texto(bloco)
        elif bloco.startswith('<table>'):
            bloco = f'<div class="tabela" role="region" tabindex="0" aria-label="Tabela: {esc(secao.lower() if secao else P["h1"])}">' + re.sub(r'>\s+<', '><', bloco) + '</div>'
        partes.append(bloco)
    corpo = ''.join(partes)
    corpo = re.sub(r'<a href="(https?://[^"]+)">', r'<a href="\1" rel="noopener noreferrer nofollow">', corpo)
    faq_html = corpo.split('id="perguntas-frequentes">Perguntas frequentes</h2>', 1)[1].split('<h2', 1)[0]
    faqs = re.findall(r'<h3 id="[^"]+">(.*?)</h3>\s*<p>(.*?)</p>', faq_html, re.S)
    if not 3 <= len(faqs) <= 6: sys.exit(f'ABORTA {S}: {len(faqs)} perguntas')
    outros = [p for p in ('o-que-e-chargeback', 'como-contestar-chargeback', 'como-evitar-chargeback', 'quem-paga-chargeback') if p != S]
    nomes = {'o-que-e-chargeback': 'O que é chargeback: como funciona, motivos e como contestar',
             'como-contestar-chargeback': 'Como contestar um chargeback: passo a passo com modelo de carta',
             'como-evitar-chargeback': 'Como evitar chargeback: 12 medidas para loja online',
             'quem-paga-chargeback': 'Quem paga uma compra contestada no cartão: lojista, adquirente ou banco?'}
    leia = ('<aside class="leia"><p><strong>Leia também</strong></p><ul>'
            + ''.join(f'<li><a href="/blog/{p}/">{esc(nomes[p])}</a></li>' for p in outros)
            + '<li><a href="/#form">Monte o seu dossiê no formulário do piloto</a></li><li><a href="/blog/">Todos os artigos do blog</a></li></ul></aside>')
    notas = ('<p>Visa, Mastercard e Elo são marcas de seus titulares, citadas apenas para identificar regras públicas de disputa. '
             'A LCM não tem vínculo com elas nem com as adquirentes citadas.</p>\n'
             f'<p><em>Conteúdo informativo, revisado em {DBR}. Não é orientação jurídica individual. Regras e prazos mudam; '
             'confira sempre o painel e o contrato da sua adquirente.</em></p>')
    artigo = (f'<article>\n<p class="autoria">Por Equipe Chargeback. Revisado em {DBR}.</p>\n'
              f'<h1 id="{slugify(P["h1"])}">{esc(P["h1"])}</h1>\n{corpo}\n{notas}\n{leia}\n</article>')
    palavras = len(texto(artigo).split())
    head = (topo + f'<title>{esc(P["titulo"])}</title>\n<meta name="description" content="{esc(P["descricao"])}">\n'
            f'<link rel="canonical" href="{URL}">\n<meta property="og:type" content="article">\n'
            f'<meta property="og:title" content="{esc(P["titulo"])}">\n<meta property="og:description" content="{esc(P["descricao"])}">\n'
            f'<meta property="og:url" content="{URL}">\n<meta property="og:locale" content="pt_BR">\n<meta property="og:site_name" content="Piloto Chargeback">\n'
            f'<meta name="theme-color" content="#F4F2FB">\n<meta property="og:image" content="{IMG}">\n<meta property="og:image:alt" content="{esc(P["titulo"])}">\n'
            f'<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="{IMG}">\n'
            '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
            + ld({'@context': 'https://schema.org', '@type': 'Article', 'headline': P['h1'], 'description': P['descricao'],
                  'author': {'@type': 'Organization', 'name': 'Equipe Chargeback'},
                  'publisher': {'@type': 'Organization', 'name': 'LCM GLOBAL SERVICES', 'url': f'{SITE}/'},
                  'image': [IMG], 'dateModified': DATA, 'datePublished': DATA, 'inLanguage': 'pt-BR', 'mainEntityOfPage': URL, 'wordCount': palavras}) + '\n'
            + ld({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
                {'@type': 'Question', 'name': texto(q), 'acceptedAnswer': {'@type': 'Answer', 'text': texto(a)}} for q, a in faqs]}) + '\n'
            + ld({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Piloto Chargeback', 'item': f'{SITE}/'},
                {'@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': f'{SITE}/blog/'},
                {'@type': 'ListItem', 'position': 3, 'name': P['h1'], 'item': URL}]}) + '\n' + css + '\n</head>\n')
    pagina = head + f'<body>\n{nav}\n<main>\n{artigo}\n</main>\n{rodape}\n</body>\n</html>\n'
    os.makedirs(f'{R}/blog/{S}', exist_ok=True)
    open(f'{R}/blog/{S}/index.html', 'w', encoding='utf-8').write(pagina)
    og(P, f'{R}/blog/{S}/og.png')
    POSTS.append({'slug': S, 'h1': P['h1'], 'titulo': P['titulo'], 'descricao': P['descricao'], 'url': URL, 'img': IMG})
    print(f'{S}: {palavras} palavras, {len(faqs)} perguntas, título {len(P["titulo"])}, descrição {len(P["descricao"])}')
json.dump(POSTS, open(f'{R}/_fontes/blog/manifesto.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
