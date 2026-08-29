#!/usr/bin/env bash

gh auth switch --user guelfi

# Garante a identidade da conta pessoal neste repositório (evita o aviso de auto-configuração do Git)
git config user.name "Marco Guelfi"
git config user.email "guelfi@msn.com"

echo ">> Adicionando alterações!!!..."
git add -A

if git diff --cached --quiet; then
    echo ">> Nenhuma alteração para commitar. Nada a fazer."
    exit 0
fi

git status --short

echo ""
read -rp ">> Digite a mensagem do commit: " COMMIT_MSG

if [ -z "${COMMIT_MSG// }" ]; then
    echo ">> Mensagem vazia. Commit cancelado."
    exit 1
fi

git commit -m "$COMMIT_MSG"

BRANCH=$(git branch --show-current)

echo ">> Enviando alterações (push) para origin/$BRANCH..."
if ! git push origin "$BRANCH"; then
    echo ">> Push rejeitado. Sincronizando com o remoto (pull --rebase) e tentando novamente..."
    git pull --rebase origin "$BRANCH"
    git push origin "$BRANCH"
fi

echo ">> Atualizando repositório local (pull)..."
git pull origin "$BRANCH"

echo ">> Concluído. Repositório local e remoto sincronizados."
