#!/usr/bin/env bash
set -uo pipefail

# Monta uma sugestão de mensagem de commit a partir dos arquivos staged,
# categorizando em Adiciona / Atualiza / Remove / Renomeia.
build_commit_suggestion() {
    local added=() modified=() deleted=() renamed=()
    local status rest newpath

    while IFS=$'\t' read -r status rest; do
        [ -z "$status" ] && continue
        case "$status" in
            A) added+=("$rest") ;;
            M) modified+=("$rest") ;;
            D) deleted+=("$rest") ;;
            R*|C*)
                newpath="${rest##*$'\t'}"
                renamed+=("$newpath")
                ;;
            *) modified+=("$rest") ;;
        esac
    done < <(git diff --cached --name-status)

    local parts=()
    describe() {
        local label="$1"; shift
        local arr=("$@")
        local n=${#arr[@]}
        [ "$n" -eq 0 ] && return
        if [ "$n" -le 3 ]; then
            local joined
            joined=$(printf '%s, ' "${arr[@]}")
            joined="${joined%, }"
            parts+=("$label $joined")
        else
            parts+=("$label $n arquivo(s)")
        fi
    }

    describe "Adiciona" "${added[@]}"
    describe "Atualiza" "${modified[@]}"
    describe "Remove" "${deleted[@]}"
    describe "Renomeia" "${renamed[@]}"

    local joined_parts
    printf -v joined_parts '%s; ' "${parts[@]}"
    echo "${joined_parts%; }"
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
        SUGGESTED_MSG=$(build_commit_suggestion)
        echo ""
        if [ -n "$SUGGESTED_MSG" ]; then
            echo ">> Sugestão de mensagem de commit:"
            echo "   \"$SUGGESTED_MSG\""
            echo ""
            read -rp ">> Pressione Enter para usar a sugestão, ou digite sua própria mensagem: " COMMIT_MSG
            if [ -z "${COMMIT_MSG// }" ]; then
                COMMIT_MSG="$SUGGESTED_MSG"
            fi
        else
            read -rp ">> Digite a mensagem do commit: " COMMIT_MSG
        fi
        if [ -z "${COMMIT_MSG// }" ]; then
            echo ">> Mensagem vazia. Commit cancelado. Abortando sincronização."
            exit 1
        fi
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
