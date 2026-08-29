#!/usr/bin/env bash
set -uo pipefail

# Pede ao Claude uma sugestão de mensagem de commit com base no diff staged.
# Ecoa a sugestão (sem aspas/markdown extra) ou nada, se o claude não estiver
# disponível ou não retornar resposta.
claude_commit_suggestion() {
    local claude_bin=""
    if command -v claude >/dev/null 2>&1; then
        claude_bin="claude"
    elif [ -x "$HOME/.local/bin/claude" ]; then
        # Fallback: caso o PATH do claude não esteja disponível neste shell.
        claude_bin="$HOME/.local/bin/claude"
    else
        echo ">> Comando 'claude' não encontrado (nem no PATH, nem em ~/.local/bin). Você poderá digitar a mensagem manualmente." >&2
        return 0
    fi

    echo ">> Consultando o Claude ($claude_bin) para sugerir a mensagem de commit..." >&2

    local claude_prompt
    claude_prompt="Você é um assistente que escreve mensagens de commit git em português, curtas, objetivas e no imperativo (ex: 'Adiciona', 'Corrige', 'Atualiza'). Baseado no diff abaixo, responda APENAS com a mensagem de commit sugerida, em uma única linha de texto puro, sem aspas, sem explicações, sem markdown e sem marcadores/bullets.

Arquivos alterados:
$(git diff --cached --name-status)

Diff completo:
$(git diff --cached)"

    local claude_err_file claude_output claude_status
    claude_err_file=$(mktemp)

    # O prompt vai por stdin (não como argumento): diffs grandes (muitos arquivos/
    # exclusões) podem passar do limite de tamanho de argumentos do SO (E2BIG).
    # --allowedTools "": não é preciso nenhuma ferramenta, o diff já vai no prompt.
    if command -v timeout >/dev/null 2>&1; then
        claude_output=$(printf '%s' "$claude_prompt" | timeout 90 "$claude_bin" -p --allowedTools "" 2>"$claude_err_file")
    else
        claude_output=$(printf '%s' "$claude_prompt" | "$claude_bin" -p --allowedTools "" 2>"$claude_err_file")
    fi
    claude_status=$?

    local suggestion
    suggestion=$(printf '%s\n' "$claude_output" \
        | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
        | grep -v '^$' \
        | head -n1 \
        | sed -e 's/^[•*-][[:space:]]*//')

    if [ -z "$suggestion" ]; then
        echo ">> O Claude não retornou uma sugestão utilizável (código de saída: $claude_status)." >&2
        if [ -s "$claude_err_file" ]; then
            echo ">> Saída de erro do claude:" >&2
            sed 's/^/     /' "$claude_err_file" >&2
        fi
        echo ">> Você poderá digitar a mensagem manualmente." >&2
    fi
    rm -f "$claude_err_file"

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
        if [ "$FILE_COUNT" -gt 50 ]; then
            echo ">> Mais de 50 arquivos alterados ($FILE_COUNT). Abortando sincronização — revise e faça commits menores antes de rodar o script novamente."
            exit 1
        fi

        SUGGESTED_MSG=$(claude_commit_suggestion)

        COMMIT_MSG=""
        while [ -z "$COMMIT_MSG" ]; do
            echo ""
            if [ -n "$SUGGESTED_MSG" ]; then
                echo ">> Sugestão de mensagem de commit (Claude):"
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
