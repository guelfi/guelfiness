#!/usr/bin/env bash
set -uo pipefail

# Pede ao Kimi K2 uma sugestão de mensagem de commit com base no diff staged.
# Ecoa a sugestão (sem aspas/markdown extra) ou nada, se o kimi não estiver
# disponível ou não retornar resposta.
kimi_commit_suggestion() {
    local kimi_bin=""
    if command -v kimi >/dev/null 2>&1; then
        kimi_bin="kimi"
    elif [ -x "$HOME/.kimi-code/bin/kimi" ]; then
        # Fallback: o PATH do kimi normalmente só é exportado pelo ~/.bashrc,
        # que nem toda forma de executar este script carrega.
        kimi_bin="$HOME/.kimi-code/bin/kimi"
    else
        echo ">> Comando 'kimi' não encontrado (nem no PATH, nem em ~/.kimi-code/bin). Você poderá digitar a mensagem manualmente." >&2
        return 0
    fi

    echo ">> Consultando o Kimi K2 ($kimi_bin) para sugerir a mensagem de commit..." >&2

    local kimi_prompt
    kimi_prompt="Você é um assistente que escreve mensagens de commit git em português, curtas, objetivas e no imperativo (ex: 'Adiciona', 'Corrige', 'Atualiza'). Baseado no diff abaixo, responda APENAS com a mensagem de commit sugerida, em uma única linha de texto puro, sem aspas, sem explicações, sem markdown e sem marcadores/bullets.

Arquivos alterados:
$(git diff --cached --name-status)

Diff completo:
$(git diff --cached)"

    local kimi_err_file kimi_output kimi_status
    kimi_err_file=$(mktemp)
    # Nota: -p já roda em modo não-interativo; --yolo não pode ser combinado
    # com --prompt (o kimi rejeita com "Cannot combine --prompt with --yolo").
    if command -v timeout >/dev/null 2>&1; then
        kimi_output=$(timeout 90 "$kimi_bin" -p "$kimi_prompt" 2>"$kimi_err_file")
    else
        kimi_output=$("$kimi_bin" -p "$kimi_prompt" 2>"$kimi_err_file")
    fi
    kimi_status=$?

    local suggestion
    suggestion=$(printf '%s\n' "$kimi_output" \
        | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
        | grep -v '^$' \
        | head -n1 \
        | sed -e 's/^[•*-][[:space:]]*//')

    if [ -z "$suggestion" ]; then
        echo ">> O Kimi não retornou uma sugestão utilizável (código de saída: $kimi_status)." >&2
        if [ -s "$kimi_err_file" ]; then
            echo ">> Saída de erro do kimi:" >&2
            sed 's/^/     /' "$kimi_err_file" >&2
        fi
        echo ">> Você poderá digitar a mensagem manualmente." >&2
    fi
    rm -f "$kimi_err_file"

    echo "$suggestion"
}

# --- 0. Autenticação e identidade ---
gh auth switch --user guelfi

# Garante a identidade da conta pessoal neste repositório (evita o aviso de auto-configuração do Git)
git config user.name "Marco Guelfi"
git config user.email "guelfi@msn.com"

# --- 1. Garante que estamos numa branch local (não em detached HEAD) ---
BRANCH=$(git branch --show-current)
if [ -z "$BRANCH" ]; then
    echo ">> Você não está em nenhuma branch local (HEAD destacado). Faça 'git checkout <branch>' antes de sincronizar."
    exit 1
fi
echo ">> Branch atual: $BRANCH"

git remote -v

# --- 2. Busca o estado do remoto ---
echo ">> Buscando atualizações do remoto (fetch)..."
git fetch origin

if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    REMOTE_EXISTS=1
else
    echo ">> A branch '$BRANCH' ainda não existe em origin. Ela será criada no push."
    REMOTE_EXISTS=0
fi

# --- 3. Verifica e commita alterações locais pendentes ---
if [ -n "$(git status --porcelain)" ]; then
    echo ">> Alterações locais detectadas:"
    git status --short

    echo ">> Adicionando alterações!!!..."
    git add -A

    if git diff --cached --quiet; then
        echo ">> Nada ficou de fato staged. Nada a commitar."
    else
        FILE_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
        if [ "$FILE_COUNT" -gt 15 ]; then
            echo ">> Mais de 15 arquivos alterados ($FILE_COUNT). Abortando sincronização — revise e faça commits menores antes de rodar o script novamente."
            exit 1
        fi

        SUGGESTED_MSG=$(kimi_commit_suggestion)

        COMMIT_MSG=""
        while [ -z "$COMMIT_MSG" ]; do
            echo ""
            if [ -n "$SUGGESTED_MSG" ]; then
                echo ">> Sugestão de mensagem de commit (Kimi K2):"
                echo "   \"$SUGGESTED_MSG\""
            fi
            echo ">> Escolha uma opção:"
            [ -n "$SUGGESTED_MSG" ] && echo "   [A] Aceitar a sugestão"
            echo "   [E] Escrever minha própria mensagem"
            echo "   [C] Cancelar o commit"
            read -rp ">> Opção: " OPTION
            case "$OPTION" in
                [Aa]*)
                    if [ -n "$SUGGESTED_MSG" ]; then
                        COMMIT_MSG="$SUGGESTED_MSG"
                    else
                        echo ">> Não há sugestão disponível para aceitar."
                    fi
                    ;;
                [Ee]*)
                    read -rp ">> Digite a mensagem do commit: " COMMIT_MSG
                    if [ -z "${COMMIT_MSG// }" ]; then
                        echo ">> Mensagem vazia. Tente novamente."
                        COMMIT_MSG=""
                    fi
                    ;;
                [Cc]*)
                    echo ">> Commit cancelado pelo usuário. Abortando sincronização."
                    exit 1
                    ;;
                *)
                    echo ">> Opção inválida."
                    ;;
            esac
        done

        git commit -m "$COMMIT_MSG"
    fi
else
    echo ">> Nenhuma alteração local pendente."
fi

# --- 4. Compara local x remoto e decide pull / rebase ---
if [ "$REMOTE_EXISTS" -eq 1 ]; then
    BEHIND=$(git rev-list HEAD..origin/"$BRANCH" --count)
    AHEAD=$(git rev-list origin/"$BRANCH"..HEAD --count)
else
    BEHIND=0
    AHEAD=$(git rev-list HEAD --count)
fi

echo ">> Local está $AHEAD commit(s) à frente e $BEHIND commit(s) atrás de origin/$BRANCH."

if [ "$REMOTE_EXISTS" -eq 1 ] && [ "$BEHIND" -gt 0 ] && [ "$AHEAD" -gt 0 ]; then
    echo ">> Históricos divergiram. Executando rebase (pull --rebase)..."
    if ! git pull --rebase origin "$BRANCH"; then
        echo ">> Conflito durante o rebase. Resolva manualmente (git status), depois rode:"
        echo "     git rebase --continue"
        echo "   e execute este script novamente."
        exit 1
    fi
elif [ "$REMOTE_EXISTS" -eq 1 ] && [ "$BEHIND" -gt 0 ]; then
    echo ">> Repositório local está atrás. Executando git pull..."
    git pull origin "$BRANCH"
fi

# --- 5. Envia (push) o que ainda estiver à frente do remoto ---
if [ "$REMOTE_EXISTS" -eq 1 ]; then
    AHEAD=$(git rev-list origin/"$BRANCH"..HEAD --count)
else
    AHEAD=$(git rev-list HEAD --count)
fi

if [ "$AHEAD" -gt 0 ]; then
    echo ">> Enviando alterações (push) para origin/$BRANCH..."
    if ! git push -u origin "$BRANCH"; then
        echo ">> Push rejeitado. Sincronizando novamente com o remoto (pull --rebase) e tentando de novo..."
        if ! git pull --rebase origin "$BRANCH"; then
            echo ">> Conflito durante o rebase. Resolva manualmente e rode o script novamente."
            exit 1
        fi
        git push -u origin "$BRANCH"
    fi
else
    echo ">> Nada para enviar ao remoto."
fi

echo ">> Concluído. Repositório local e remoto sincronizados (branch: $BRANCH)."
