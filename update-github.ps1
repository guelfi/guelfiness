gh auth switch --user guelfi

# Garante a identidade da conta pessoal neste repositório (evita o aviso de auto-configuração do Git)
git config user.name "Marco Guelfi"
git config user.email "guelfi@msn.com"

Write-Host ">> Adicionando alterações!!!..."
git add -A

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host ">> Nenhuma alteração para commitar. Nada a fazer."
    exit 0
}

git status --short

Write-Host ""
$COMMIT_MSG = Read-Host ">> Digite a mensagem do commit"

if ([string]::IsNullOrWhiteSpace($COMMIT_MSG)) {
    Write-Host ">> Mensagem vazia. Commit cancelado."
    exit 1
}

git commit -m "$COMMIT_MSG"

$BRANCH = git branch --show-current

Write-Host ">> Enviando alterações (push) para origin/$BRANCH..."
git push origin "$BRANCH"
if ($LASTEXITCODE -ne 0) {
    Write-Host ">> Push rejeitado. Sincronizando com o remoto (pull --rebase) e tentando novamente..."
    git pull --rebase origin "$BRANCH"
    git push origin "$BRANCH"
}

Write-Host ">> Atualizando repositório local (pull)..."
git pull origin "$BRANCH"

Write-Host ">> Concluído. Repositório local e remoto sincronizados."
