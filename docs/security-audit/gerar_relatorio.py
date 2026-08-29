# -*- coding: utf-8 -*-
"""
Gera o Relatório de Auditoria de Segurança do projeto Guelfiness em PDF.

Uso (a partir da raiz do repo):
    docs/security-audit/.venv/Scripts/python.exe docs/security-audit/gerar_relatorio.py

Saída:
    docs/security-audit/relatorio-auditoria-seguranca.pdf
"""
import os
import textwrap
from datetime import date

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Image,
    Table, TableStyle, PageBreak, KeepTogether, XPreformatted,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_PATH = os.path.join(BASE_DIR, "relatorio-auditoria-seguranca.pdf")
CHART_DONUT = os.path.join(BASE_DIR, "_chart_severidade.png")
CHART_BARRAS = os.path.join(BASE_DIR, "_chart_categorias.png")

PROJECT_NAME = "Guelfiness"
REPORT_TITLE = f"Relatório de Auditoria de Segurança — {PROJECT_NAME}"
AUDIT_DATE = "28/08/2026"

# Paleta exigida
SEV_COLORS = {
    "Crítica": "#B91C1C",
    "Alta": "#EA580C",
    "Média": "#D97706",
    "Baixa": "#2563EB",
    "Informativa": "#6B7280",
    "Ponto forte": "#059669",
}

# ----------------------------------------------------------------------------
# DADOS DA AUDITORIA (verificados no código)
# ----------------------------------------------------------------------------
SEVERITY_COUNTS = {"Crítica": 0, "Alta": 0, "Média": 0, "Baixa": 2, "Informativa": 2}

CATEGORIES = [
    ("1. Banco sem tranca\n(isolamento de tenant)", 0, True),
    ("2. Permissão definida\nno navegador", 0, True),
    ("3. IDOR", 0, True),
    ("4. Chaves expostas\n(hardcode)", 3, False),
    ("5. Inputs sem\ntratamento (XSS)", 1, False),
]

FINDINGS = [
    {
        "id": "F1",
        "sev": "Baixa",
        "cat": "4. Chaves expostas",
        "where": ".github/workflows/oci-deploy.yml:21 e :39",
        "title": "Fallback para Actions Variables permite chave privada SSH fora de Secrets",
        "desc": (
            "O workflow aceita SSH_PRIVATE_KEY (e SSH_HOST/SSH_USER) vindos de variáveis de "
            "repositório (vars) como fallback de secrets: ${{ secrets.SSH_PRIVATE_KEY || "
            "vars.SSH_PRIVATE_KEY }}. Variables do GitHub Actions não são mascaradas nos logs e "
            "ficam visíveis em texto claro para todo colaborador com acesso de leitura ao "
            "repositório. O fallback incentiva cadastrar a chave privada — que dá acesso de "
            "deploy ao servidor de produção (OCI) — no mecanismo errado."
        ),
        "exploit": (
            "Condicional: só é explorável se o operador cadastrar a chave como variable. Nesse "
            "cenário, qualquer colaborador com read no repo lê a chave privada e pode acessar o "
            "servidor de produção via SSH."
        ),
    },
    {
        "id": "F2",
        "sev": "Informativa",
        "cat": "4. Chaves expostas",
        "where": "Dockerfile:1",
        "title": "Imagem base nginx:alpine sem pin de versão ou digest",
        "desc": (
            "FROM nginx:alpine usa tag móvel: cada build pode baixar uma imagem diferente, sem "
            "revisão. Builds não são reproduzíveis e, num cenário de supply chain (tag "
            "republi­cada com conteúdo malicioso), não há digest para detectar a mudança."
        ),
        "exploit": (
            "Condicional: requer comprometimento upstream da imagem ou erro de atualização. "
            "Sem exploração direta a partir do código do projeto."
        ),
    },
    {
        "id": "F3",
        "sev": "Informativa",
        "cat": "4. Chaves expostas",
        "where": "Dockerfile:3 (com .dockerignore:1-9)",
        "title": "COPY . joga o repositório inteiro no docroot público do nginx",
        "desc": (
            "COPY . /usr/share/nginx/html copia todo o contexto de build para o diretório "
            "servido publicamente. A única barreira contra vazamento é o .dockerignore — hoje "
            "correto (exclui .git, .github, Dockerfile, composes). Qualquer arquivo sensível "
            "adicionado no futuro (.env, backup, anotação com credencial) sem atualizar o "
            ".dockerignore vira conteúdo público, servido pelo nginx, sem nenhum erro de build."
        ),
        "exploit": (
            "Condicional: depende de erro futuro de processo. Hoje o .dockerignore cobre os "
            "arquivos sensíveis existentes."
        ),
    },
    {
        "id": "F4",
        "sev": "Baixa",
        "cat": "5. Inputs sem tratamento (XSS)",
        "where": "Dockerfile:1-7 / index.html:1-19 (ausência de configuração)",
        "title": "Ausência de security headers HTTP (CSP, X-Frame-Options e correlatos)",
        "desc": (
            "O projeto não tem nginx.conf customizado: o container usa a configuração default "
            "da imagem nginx:alpine, que não envia Content-Security-Policy, X-Frame-Options, "
            "X-Content-Type-Options, Referrer-Policy nem Permissions-Policy. O index.html "
            "também não define meta CSP. Não há defesa em profundidade contra XSS (caso algum "
            "dia o site passe a processar entrada de usuário) nem contra clickjacking."
        ),
        "exploit": (
            "Risco prático baixo hoje: o site é 100% estático e não processa entrada de "
            "usuário. O achado é de defesa em profundidade."
        ),
    },
]

STRENGTHS = [
    ("Categorias 1, 2 e 3 não aplicáveis — verificado",
     "O repositório contém apenas 9 arquivos versionados (site estático + infra). Não há "
     "backend, banco de dados, ORM, autenticação, papéis ou handlers de rota: isolamento de "
     "tenant, verificação de privilégio no servidor e IDOR não têm superfície neste projeto. "
     "Verificado por inspeção completa da árvore e do histórico git."),
    ("Segredos somente via GitHub Secrets, com validação de startup",
     ".github/workflows/oci-deploy.yml:16-35 valida a presença de SSH_HOST, SSH_USER e "
     "SSH_PRIVATE_KEY no início do job e aborta com ::error:: explícito se algum faltar. "
     "Nenhum valor de segredo aparece no código — apenas referências ${{ secrets.* }}."),
    ("Histórico git limpo de segredos",
     "Busca por padrões de segredo (api_key, secret, password, token, BEGIN PRIVATE KEY, "
     "AKIA, ghp_, sk-, xox*, bearer) em TODOS os commits retornou apenas as referências "
     "${{ secrets.* }} do workflow e a palavra 'JWT' em texto descritivo do portfólio. "
     "Nenhum segredo foi commitado em nenhuma revisão."),
    ("Imagem Docker não vaza metadados do repositório",
     ".dockerignore:1-9 exclui .git, .github, Dockerfile, docker-compose*.yml e o próprio "
     ".dockerignore do contexto copiado para a imagem."),
    ("JS sem sumidouros de XSS; texto dinâmico sempre via textContent",
     "assets/js/main.js não usa eval, new Function nem document.write. Todo texto dinâmico "
     "é atribuído via textContent (linhas 259, 313, 335, 353, 367). O único uso de HTML "
     "bruto — insertAdjacentHTML em main.js:53 — consome projectTrack.innerHTML, markup "
     "estático da própria página (auto-clonagem do carrossel), sem entrada de usuário."),
    ("Script inline de tema não executa dado do localStorage",
     "index.html:12-18 lê guelfiness-theme do localStorage e aplica via setAttribute "
     "('data-theme', ...): contexto de atributo, sem execução de código. Não explorável."),
    ("Links externos protegidos contra tabnabbing",
     "Todos os ~20 links com target=\"_blank\" do index.html carregam rel=\"noopener\"."),
    ("Higiene de SSH no pipeline de deploy",
     "A chave privada é gravada com chmod 600 (oci-deploy.yml:42-43), o host é registrado "
     "via ssh-keyscan -H em known_hosts (:46-51) e o rsync exclui .git e .github do upload "
     "(:61-64)."),
    ("Superfície de rede mínima nos containers",
     "docker-compose.yml (produção) não publica portas — o container só é alcançável pela "
     "rede do reverse proxy. docker-compose.local.yml monta os arquivos como read-only "
     "(:ro) e define healthcheck."),
    ("Sem dependências de runtime de terceiros no frontend",
     "O site é HTML/CSS/JS puro, sem node_modules nem CDNs de JavaScript — a única origem "
     "externa é Google Fonts. Supply chain de JS praticamente inexistente."),
]

RECOMMENDATIONS = [
    ("P1", "Remover o fallback para vars no workflow de deploy (F1)",
     "Trocar ${{ secrets.X || vars.X }} por ${{ secrets.X }} para SSH_HOST, SSH_USER e "
     "SSH_PRIVATE_KEY em .github/workflows/oci-deploy.yml, e documentar no README que a "
     "chave privada nunca deve ser cadastrada como variable."),
    ("P2", "Adicionar nginx.conf com security headers e pinar a imagem base (F4, F2)",
     "Criar um nginx.conf próprio enviando Content-Security-Policy, X-Frame-Options (ou "
     "frame-ancestors), X-Content-Type-Options: nosniff, Referrer-Policy e "
     "Permissions-Policy; no Dockerfile, pinar a imagem por digest (nginx:alpine@sha256:...)."),
    ("P3", "Estreitar o COPY do Dockerfile (F3)",
     "Substituir COPY . por cópias explícitas de index.html e assets/ — assim nenhum "
     "arquivo futuro do repositório entra na imagem por acidente, independente do "
     ".dockerignore."),
    ("P4", "Pinar actions por SHA e avaliar HSTS no reverse proxy",
     "Usar actions/checkout@&lt;sha-do-commit&gt; no workflow (supply chain do CI) e, no Nginx central da "
     "OCI, habilitar Strict-Transport-Security para guelfi.com.br."),
]

ISSUES = [
    {
        "n": 1,
        "title": "[Segurança] Fallback para vars permite chave privada SSH fora de Secrets no deploy",
        "labels": "security, severidade-baixa",
        "body": """\
## Problema

O workflow de deploy aceita as credenciais SSH tanto de **secrets** quanto de
**variables** do repositório, com `secrets` como primeira opção e `vars` como
fallback:

```yaml
SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY || vars.SSH_PRIVATE_KEY }}
```

Variables do GitHub Actions **não são mascaradas nos logs** e ficam visíveis em
texto claro para qualquer colaborador com acesso de leitura ao repositório. O
fallback incentiva cadastrar a chave privada SSH — que dá acesso de deploy ao
servidor de produção (OCI) — no mecanismo errado.

## Por que é explorável

Se a chave for cadastrada como variable (o fallback sugere que isso é válido),
qualquer pessoa com read no repo lê a chave privada e pode abrir sessão SSH no
servidor de produção. Condição: o operador precisa usar o fallback — hoje os
valores aparentemente estão em secrets, mas nada impede o uso inseguro.

## Evidência

`.github/workflows/oci-deploy.yml:19-21` e `:38-39`:

```yaml
SSH_HOST: ${{ secrets.SSH_HOST || vars.SSH_HOST }}
SSH_USER: ${{ secrets.SSH_USER || vars.SSH_USER }}
SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY || vars.SSH_PRIVATE_KEY }}
```

## Impacto

Comprometimento da chave privada de deploy → acesso SSH ao servidor OCI que
hospeda todos os produtos (o mesmo host serve vários SaaS, conforme a seção
Infraestrutura do próprio site).

## Sugestão de correção

Remover o `|| vars.*` de todas as credenciais sensíveis, mantendo apenas
`${{ secrets.* }}`, e documentar no README que `SSH_PRIVATE_KEY` jamais deve ser
cadastrada como variable.

## Critérios de aceite

- [ ] Nenhuma ocorrência de `vars.SSH_PRIVATE_KEY`, `vars.SSH_USER` ou
      `vars.SSH_HOST` no workflow
- [ ] Deploy continua funcionando com os valores em secrets
- [ ] README (ou comentário no workflow) registra a política: credenciais
      somente em Secrets""",
    },
    {
        "n": 2,
        "title": "[Segurança] Dockerfile: imagem nginx sem pin e COPY . amplo dependente de .dockerignore",
        "labels": "security, severidade-informativa",
        "body": """\
## Problema

Dois pontos de endurecimento no Dockerfile (agrupados por serem do mesmo tema —
cadeia de build):

1. `FROM nginx:alpine` usa tag móvel, sem pin de versão ou digest. Builds não
   são reproduzíveis e não há como detectar uma imagem base alterada upstream.
2. `COPY . /usr/share/nginx/html` copia o repositório inteiro para o docroot
   público do nginx. A única proteção contra vazar arquivos sensíveis é o
   `.dockerignore` — hoje correto, mas qualquer arquivo sensível futuro (`.env`,
   backup, anotação) adicionado sem atualizar o `.dockerignore` será servido
   publicamente, sem erro de build.

## Por que é explorável

Não há exploração direta hoje. O risco é de processo: (1) um rebuild silencioso
pode puxar uma imagem base diferente/comprometida; (2) um único arquivo
sensível commitado no futuro vaza publicamente pela porta 80 do container.

## Evidência

`Dockerfile:1-3`:

```dockerfile
FROM nginx:alpine

COPY . /usr/share/nginx/html
```

`.dockerignore:1-9` (proteção atual, baseada em lista de exclusão):

```
.git
.github
docker-compose.yml
docker-compose.local.yml
Dockerfile
.dockerignore
README.md
...
```

## Impacto

Vazamento futuro de arquivos sensíveis do repositório via HTTP; ingestão não
revisada de imagem base em cenário de supply chain.

## Sugestão de correção

- Pinar a imagem base por digest: `FROM nginx:alpine@sha256:<digest>`
- Substituir `COPY .` por cópias explícitas:

```dockerfile
COPY index.html /usr/share/nginx/html/index.html
COPY assets/ /usr/share/nginx/html/assets/
```

## Critérios de aceite

- [ ] Imagem base pinada por digest no Dockerfile
- [ ] Imagem final contém apenas `index.html` e `assets/` no docroot
      (verificar com `docker run --rm <img> ls -R /usr/share/nginx/html`)
- [ ] Site continua servindo corretamente após o rebuild""",
    },
    {
        "n": 3,
        "title": "[Segurança] Ausência de security headers HTTP (CSP, X-Frame-Options e correlatos)",
        "labels": "security, severidade-baixa",
        "body": """\
## Problema

O projeto não possui `nginx.conf` customizado: o container usa a configuração
default da imagem `nginx:alpine`, que não envia nenhum security header. O
`index.html` também não define `<meta>` de CSP. Headers ausentes:

- `Content-Security-Policy`
- `X-Frame-Options` (ou `frame-ancestors` na CSP)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`

## Por que é explorável

O risco prático é baixo hoje — o site é 100% estático e não processa entrada de
usuário. O achado é de **defesa em profundidade**: sem CSP, qualquer futura
funcionalidade que injete conteúdo (ou um endpoint de terceiro comprometido)
executa scripts sem restrição; sem X-Frame-Options, a página pode ser emoldurada
para clickjacking.

## Evidência

`Dockerfile:1-7` — não copia nenhum `nginx.conf`; a imagem default não envia os
headers. `index.html:1-19` — `<head>` sem meta CSP.

Verificável em produção com:

```bash
curl -sI https://www.guelfi.com.br/ | grep -iE 'content-security|x-frame|x-content|referrer-policy'
```

(sem resultados hoje)

## Impacto

Ausência de mitigação em camadas contra XSS e clickjacking; penalização em
scanners de segurança (securityheaders.com, observatory).

## Sugestão de correção

Adicionar um `nginx.conf` ao repositório e copiá-lo no Dockerfile:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    add_header Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self' 'unsafe-inline'" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
}
```

(`'unsafe-inline'` é necessário para o script de tema e estilos inline
existentes; pode ser eliminado depois movendo-os para arquivos.)

## Critérios de aceite

- [ ] `curl -sI` no site em produção mostra os 5 headers
- [ ] Site renderiza sem erros de CSP no console do navegador
- [ ] Nota A ou superior em securityheaders.com""",
    },
]

# ----------------------------------------------------------------------------
# GRÁFICOS
# ----------------------------------------------------------------------------
def gerar_graficos():
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10})

    # Rosca por severidade
    sev = {k: v for k, v in SEVERITY_COUNTS.items() if v > 0}
    fig, ax = plt.subplots(figsize=(4.2, 3.2))
    vals = list(sev.values())
    labs = list(sev.keys())
    cols = [SEV_COLORS[k] for k in labs]
    wedges, _ = ax.pie(
        vals, colors=cols, startangle=90,
        wedgeprops=dict(width=0.42, edgecolor="white"),
    )
    total = sum(vals)
    ax.text(0, 0.08, str(total), ha="center", va="center", fontsize=26, fontweight="bold", color="#111827")
    ax.text(0, -0.22, "achados", ha="center", va="center", fontsize=11, color="#6B7280")
    ax.legend(
        wedges, [f"{l} ({v})" for l, v in zip(labs, vals)],
        loc="center left", bbox_to_anchor=(1.0, 0.5), frameon=False,
    )
    ax.set_aspect("equal")
    fig.tight_layout()
    fig.savefig(CHART_DONUT, dpi=200, bbox_inches="tight", transparent=False, facecolor="white")
    plt.close(fig)

    # Barras por categoria
    fig, ax = plt.subplots(figsize=(7.2, 3.0))
    nomes = [c[0] for c in CATEGORIES]
    qtds = [c[1] for c in CATEGORIES]
    nas = [c[2] for c in CATEGORIES]
    bar_colors = ["#D1D5DB" if na else "#B91C1C" for na in nas]
    bars = ax.barh(range(len(nomes)), qtds, color=bar_colors, height=0.55)
    ax.set_yticks(range(len(nomes)))
    ax.set_yticklabels(nomes, fontsize=9)
    ax.invert_yaxis()
    ax.set_xlim(0, max(qtds) + 1)
    ax.set_xlabel("Nº de achados", fontsize=9)
    ax.spines[["top", "right"]].set_visible(False)
    for i, (b, q, na) in enumerate(zip(bars, qtds, nas)):
        if na:
            ax.text(0.08, i, "N/A — sem backend/auth", va="center", fontsize=8.5,
                    color="#6B7280", style="italic")
        else:
            ax.text(b.get_width() + 0.08, i, str(q), va="center", fontsize=10,
                    fontweight="bold", color="#111827")
    fig.tight_layout()
    fig.savefig(CHART_BARRAS, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)

# ----------------------------------------------------------------------------
# ESTILOS
# ----------------------------------------------------------------------------
styles = {
    "cover_title": ParagraphStyle("cover_title", fontName="Helvetica-Bold", fontSize=24,
                                  leading=30, textColor=colors.HexColor("#111827"),
                                  alignment=TA_CENTER),
    "cover_sub": ParagraphStyle("cover_sub", fontName="Helvetica", fontSize=13, leading=18,
                                textColor=colors.HexColor("#4B5563"), alignment=TA_CENTER),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=16, leading=20,
                         textColor=colors.HexColor("#111827"), spaceBefore=14, spaceAfter=8),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16,
                         textColor=colors.HexColor("#1F2937"), spaceBefore=10, spaceAfter=4),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=10, leading=14.5,
                           textColor=colors.HexColor("#1F2937"), spaceAfter=6),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8.5, leading=11.5,
                            textColor=colors.HexColor("#4B5563")),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.8, leading=12,
                           textColor=colors.HexColor("#1F2937")),
    "cell_bold": ParagraphStyle("cell_bold", fontName="Helvetica-Bold", fontSize=8.8,
                                leading=12, textColor=colors.HexColor("#111827")),
    "chip": ParagraphStyle("chip", fontName="Helvetica-Bold", fontSize=8.5, leading=11,
                           textColor=colors.white, alignment=TA_CENTER),
    "code": ParagraphStyle("code", fontName="Courier", fontSize=7.6, leading=9.6,
                           textColor=colors.HexColor("#111827")),
    "issue": ParagraphStyle("issue", fontName="Courier", fontSize=7.4, leading=9.4,
                            textColor=colors.HexColor("#1F2937")),
}

def chip(sev):
    t = Table([[Paragraph(sev.upper(), styles["chip"])]], colWidths=[2.6 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(SEV_COLORS[sev])),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(SEV_COLORS[sev])),
    ]))
    return t

def wrap_code(text, width=104):
    out = []
    for line in text.split("\n"):
        if len(line) <= width:
            out.append(line)
        else:
            out.extend(textwrap.wrap(line, width=width,
                                     subsequent_indent="    ",
                                     break_long_words=False,
                                     break_on_hyphens=False) or [""])
    return "\n".join(out)

# ----------------------------------------------------------------------------
# HEADER / FOOTER
# ----------------------------------------------------------------------------
def on_page(canvas, doc):
    canvas.saveState()
    w, h = A4
    if doc.page > 1:
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#6B7280"))
        canvas.drawString(2 * cm, h - 1.2 * cm, REPORT_TITLE)
        canvas.setStrokeColor(colors.HexColor("#D1D5DB"))
        canvas.setLineWidth(0.5)
        canvas.line(2 * cm, h - 1.4 * cm, w - 2 * cm, h - 1.4 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.drawString(2 * cm, 1.1 * cm, f"{PROJECT_NAME} — auditoria de segurança — {AUDIT_DATE}")
    canvas.drawRightString(w - 2 * cm, 1.1 * cm, f"Página {doc.page}")
    canvas.restoreState()

# ----------------------------------------------------------------------------
# CONSTRUÇÃO DO DOCUMENTO
# ----------------------------------------------------------------------------
def build():
    gerar_graficos()
    doc = BaseDocTemplate(
        PDF_PATH, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title=REPORT_TITLE, author="Auditoria automatizada — Kimi Code CLI",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=on_page)])

    story = []
    P = lambda txt, st="body": Paragraph(txt, styles[st])

    # ---------------- CAPA ----------------
    story.append(Spacer(1, 3.2 * cm))
    story.append(P("Relatório de Auditoria de Segurança", "cover_title"))
    story.append(Spacer(1, 0.3 * cm))
    story.append(P(f"— {PROJECT_NAME} —", "cover_title"))
    story.append(Spacer(1, 1.0 * cm))
    story.append(P(f"Data: {AUDIT_DATE}", "cover_sub"))
    story.append(Spacer(1, 0.8 * cm))

    escopo = (
        "<b>Escopo auditado:</b> repositório completo (9 arquivos versionados + histórico git): "
        "<font face='Courier'>index.html</font>, <font face='Courier'>assets/js/main.js</font>, "
        "<font face='Courier'>assets/css/style.css</font>, <font face='Courier'>Dockerfile</font>, "
        "<font face='Courier'>docker-compose.yml</font>, <font face='Courier'>docker-compose.local.yml</font>, "
        "<font face='Courier'>.github/workflows/oci-deploy.yml</font>, "
        "<font face='Courier'>.gitignore</font>, <font face='Courier'>.dockerignore</font> "
        "e todos os commits do histórico."
    )
    metodo = (
        "<b>Nota metodológica:</b> a stack detectada é <b>site estático (HTML/CSS/JS vanilla) "
        "servido por nginx:alpine em Docker, com deploy via GitHub Actions → SSH/rsync → VM OCI</b>. "
        "Não há backend, banco de dados, ORM, autenticação nem multi-tenancy. As cinco categorias "
        "foram mapeadas para essa stack: (1) isolamento de tenant, (2) autorização no servidor e "
        "(3) IDOR foram verificadas como <b>não aplicáveis</b> — não existe superfície de "
        "servidor no projeto; (4) chaves expostas foi aplicada a código, configs, Docker, CI e "
        "histórico git; (5) inputs/XSS foi aplicada ao JavaScript do frontend, ao HTML estático e "
        "às defesas da camada de entrega (headers HTTP)."
    )
    for txt in (escopo, metodo):
        t = Table([[P(txt)]], colWidths=[doc.width])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F3F4F6")),
            ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#D1D5DB")),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]))
        story.append(t)
        story.append(Spacer(1, 0.5 * cm))
    story.append(PageBreak())

    # ---------------- RESUMO EXECUTIVO ----------------
    story.append(P("1. Resumo executivo", "h1"))
    total = sum(SEVERITY_COUNTS.values())
    story.append(P(
        f"A auditoria cobriu 100% do código-fonte e do histórico git do projeto. Foram "
        f"registrados <b>{total} achados</b>: <b>0 críticos</b>, <b>0 altos</b>, <b>0 médios</b>, "
        f"<b>{SEVERITY_COUNTS['Baixa']} baixos</b> e <b>{SEVERITY_COUNTS['Informativa']} informativos</b>, "
        f"além de <b>{len(STRENGTHS)} pontos fortes</b> verificados. Nenhum dos achados é "
        f"explorável diretamente hoje: três dependem de condições futuras de processo e um é de "
        f"defesa em profundidade. A postura geral de segurança do projeto é <b>boa</b>, coerente "
        f"com um site estático sem superfície de servidor."
    ))
    chips_row = []
    for sev in ("Crítica", "Alta", "Média", "Baixa", "Informativa"):
        c = Table(
            [[Paragraph(f"{SEVERITY_COUNTS[sev]}", ParagraphStyle(
                "n", fontName="Helvetica-Bold", fontSize=15, textColor=colors.white,
                alignment=TA_CENTER))],
             [Paragraph(sev.upper(), ParagraphStyle(
                 "l", fontName="Helvetica-Bold", fontSize=7.5, textColor=colors.white,
                 alignment=TA_CENTER))]],
            colWidths=[doc.width / 5 - 6])
        c.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(SEV_COLORS[sev])),
            ("TOPPADDING", (0, 0), (-1, 0), 8), ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        chips_row.append(c)
    row = Table([chips_row], colWidths=[doc.width / 5] * 5)
    row.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3)]))
    story.append(row)
    story.append(Spacer(1, 0.4 * cm))

    graf = Table(
        [[Image(CHART_DONUT, width=8.2 * cm, height=6.3 * cm),
          Image(CHART_BARRAS, width=8.4 * cm, height=3.5 * cm)]],
        colWidths=[doc.width / 2, doc.width / 2])
    graf.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                              ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    story.append(P("Achados por severidade e por categoria", "h2"))
    story.append(graf)
    story.append(P(
        "Categorias 1–3 constam como <i>N/A</i>: sem backend, autenticação ou banco de dados, "
        "não há queries, rotas privilegiadas ou handlers por ID para auditar — verificado por "
        "inspeção completa da árvore e do histórico.", "small"))
    story.append(PageBreak())

    # ---------------- PONTOS FORTES E FRACOS ----------------
    story.append(P("2. Pontos fortes e pontos fracos", "h1"))
    story.append(P("2.1 Pontos fortes (verificados, com evidência)", "h2"))
    for title, ev in STRENGTHS:
        head = Table([[Paragraph("✔", ParagraphStyle(
            "ok", fontName="Helvetica-Bold", fontSize=10, textColor=colors.white,
            alignment=TA_CENTER)),
            Paragraph(f"<b>{title}</b>", styles["cell"])]],
            colWidths=[0.7 * cm, doc.width - 0.7 * cm])
        head.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), colors.HexColor(SEV_COLORS["Ponto forte"])),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (1, 0), (1, 0), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(KeepTogether([head, P(ev, "small"), Spacer(1, 0.15 * cm)]))

    story.append(P("2.2 Pontos fracos (riscos centrais)", "h2"))
    story.append(P(
        "Nenhum risco crítico ou alto foi identificado. Os riscos centrais concentram-se na "
        "<b>cadeia de build e deploy</b>: (a) o workflow tolera credenciais SSH em variables "
        "(F1); (b) o Dockerfile confia cegamente no .dockerignore para não vazar arquivos do "
        "repositório (F3) e não pinha a imagem base (F2); (c) a camada de entrega não envia "
        "security headers (F4). São riscos de processo e de defesa em profundidade — todos com "
        "correção simples, detalhada na seção 4."))
    story.append(PageBreak())

    # ---------------- TABELA DE ACHADOS ----------------
    story.append(P("3. Achados detalhados", "h1"))
    for f in FINDINGS:
        story.append(P(f"{f['id']} — {f['title']}", "h2"))
        tbl = Table([
            [chip(f["sev"]),
             Paragraph(f"<b>{f['cat']}</b>", styles["cell"]),
             Paragraph(f"<font face='Courier'>{f['where']}</font>", styles["cell"])],
        ], colWidths=[3.0 * cm, 5.2 * cm, doc.width - 8.2 * cm])
        tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(tbl)
        story.append(P(f"<b>Descrição:</b> {f['desc']}"))
        story.append(P(f"<b>Explorabilidade:</b> {f['exploit']}"))
        story.append(Spacer(1, 0.25 * cm))

    story.append(P("3.1 Tabela consolidada", "h2"))
    header = [Paragraph("Sev.", styles["cell_bold"]),
              Paragraph("Arquivo:linha", styles["cell_bold"]),
              Paragraph("Descrição", styles["cell_bold"])]
    data = [header]
    for f in FINDINGS:
        data.append([
            chip(f["sev"]),
            Paragraph(f"<font face='Courier' size=7.6>{f['where']}</font>", styles["cell"]),
            Paragraph(f"<b>{f['id']}</b> — {f['title']}", styles["cell"]),
        ])
    tbl = Table(data, colWidths=[3.0 * cm, 5.6 * cm, doc.width - 8.6 * cm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(tbl)
    story.append(PageBreak())

    # ---------------- RECOMENDAÇÕES ----------------
    story.append(P("4. Recomendações priorizadas", "h1"))
    for prio, title, body in RECOMMENDATIONS:
        head = Table([[Paragraph(prio, ParagraphStyle(
            "prio", fontName="Helvetica-Bold", fontSize=10, textColor=colors.white,
            alignment=TA_CENTER)),
            Paragraph(f"<b>{title}</b>", styles["cell"])]],
            colWidths=[1.1 * cm, doc.width - 1.1 * cm])
        head.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#111827")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (1, 0), (1, 0), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(KeepTogether([head, P(body), Spacer(1, 0.18 * cm)]))
    story.append(PageBreak())

    # ---------------- ISSUES PARA O GITHUB ----------------
    story.append(P("5. Issues para o GitHub", "h1"))
    story.append(P(
        "Cada bloco abaixo contém o texto completo de uma issue em Markdown, pronto para copiar "
        "e colar. Achados triviais relacionados foram agrupados em issue única (F2+F3 → Issue 2) "
        "para evitar spam."))
    for it in ISSUES:
        n = it["n"]
        full = f"--- ISSUE {n} ---\n**Título:** {it['title']}\n**Labels:** {it['labels']}\n\n{it['body']}\n--- FIM ISSUE {n} ---"
        wrapped = wrap_code(full, width=100)
        # XPreformatted interpreta markup XML — escapar & < > do texto puro
        wrapped = wrapped.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        block = XPreformatted(wrapped, styles["issue"])
        box = Table([[block]], colWidths=[doc.width])
        box.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
            ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#94A3B8")),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(P(f"Issue {n}: {it['title']}", "h2"))
        story.append(box)
        story.append(Spacer(1, 0.4 * cm))

    doc.build(story)
    print(f"PDF gerado em: {PDF_PATH}")

if __name__ == "__main__":
    build()
