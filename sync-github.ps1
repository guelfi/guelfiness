# Pede ao Claude uma sugestão de mensagem de commit com base no diff staged.
# Retorna a sugestão (sem aspas/markdown extra) ou string vazia, se o claude
# não estiver disponível ou não retornar resposta.
function Get-ClaudeCommitSuggestion {
    $claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
    if (-not $claudeCmd) {
        Write-Host ">> Comando 'claude' não encontrado. Você poderá digitar a mensagem manualmente."
        return ""
    }

    Write-Host ">> Consultando o Claude para sugerir a mensagem de commit..."

    $nameStatus = (git diff --cached --name-status | Out-String).Trim()
    $fullDiff   = (git diff --cached | Out-String).Trim()

    $claudePrompt = @"
Você é um assistente que escreve mensagens de commit git em português, curtas, objetivas e no imperativo (ex: 'Adiciona', 'Corrige', 'Atualiza'). Baseado no diff abaixo, responda APENAS com a mensagem de commit sugerida, em uma única linha de texto puro, sem aspas, sem explicações, sem markdown e sem marcadores/bullets.

Arquivos alterados:
$nameStatus

Diff completo:
$fullDiff
"@

    # O prompt vai por stdin (não como argumento): diffs grandes (muitos arquivos/
    # exclusões) podem passar do limite de tamanho de argumentos do SO.
    # --allowedTools "": não é preciso nenhuma ferramenta, o diff já vai no prompt.
    $errFile = [System.IO.Path]::GetTempFileName()
    $rawOutput = ($claudePrompt | claude -p --allowedTools "" 2>$errFile | Out-String)
    $claudeStatus = $LASTEXITCODE

    $firstLine = ($rawOutput -split "`r?`n" | Where-Object { $_.Trim() -ne "" } | Select-Object -First 1)
    $suggestion = ""
    if ($firstLine) {
        $suggestion = $firstLine.Trim() -replace '^[•*-]\s*', ''
    }

    if ([string]::IsNullOrWhiteSpace($suggestion)) {
        Write-Host ">> O Claude não retornou uma sugestão utilizável (código de saída: $claudeStatus)."
        if ((Get-Item $errFile).Length -gt 0) {
            Write-Host ">> Saída de erro do claude:"
            Get-Content $errFile | ForEach-Object { Write-Host "     $_" }
        }
        Write-Host ">> Você poderá digitar a mensagem manualmente."
        Remove-Item $errFile -ErrorAction SilentlyContinue
        return ""
    }

    Remove-Item $errFile -ErrorAction SilentlyContinue
    return $suggestion
}

# --- 0. Autenticação e identidade ---
gh auth switch --user guelfi

# Garante a identidade da conta pessoal neste repositório (evita o aviso de auto-configuração do Git)
git config user.name "Marco Guelfi"
git config user.email "guelfi@msn.com"

# --- 1. Garante que estamos numa branch local (não em detached HEAD) ---
$BRANCH = git branch --show-current
if ([string]::IsNullOrWhiteSpace($BRANCH)) {
    Write-Host ">> Você não está em nenhuma branch local (HEAD destacado). Faça 'git checkout <branch>' antes de sincronizar."
    exit 1
}
Write-Host ">> Branch atual: $BRANCH"

git remote -v

# --- 2. Busca o estado do remoto ---
Write-Host ">> Buscando atualizações do remoto (fetch)..."
git fetch origin

git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"
if ($LASTEXITCODE -eq 0) {
    $REMOTE_EXISTS = $true
} else {
    Write-Host ">> A branch '$BRANCH' ainda não existe em origin. Ela será criada no push."
    $REMOTE_EXISTS = $false
}

# --- 3. Verifica e commita alterações locais pendentes ---
$statusPorcelain = git status --porcelain
if ($statusPorcelain) {
    Write-Host ">> Alterações locais detectadas:"
    git status --short

    Write-Host ">> Adicionando alterações!!!..."
    git add -A

    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host ">> Nada ficou de fato staged. Nada a commitar."
    } else {
        $fileCount = (git diff --cached --name-only | Measure-Object -Line).Lines
        if ($fileCount -gt 50) {
            Write-Host ">> Mais de 50 arquivos alterados ($fileCount). Abortando sincronização — revise e faça commits menores antes de rodar o script novamente."
            exit 1
        }

        $SUGGESTED_MSG = Get-ClaudeCommitSuggestion

        $COMMIT_MSG = ""
        while ([string]::IsNullOrWhiteSpace($COMMIT_MSG)) {
            Write-Host ""
            if ($SUGGESTED_MSG) {
                Write-Host ">> Sugestão de mensagem de commit (Claude):"
                Write-Host "   `"$SUGGESTED_MSG`""
            }
            Write-Host ">> Escolha uma opção:"
            if ($SUGGESTED_MSG) { Write-Host "   [A] Aceitar a sugestão" }
            Write-Host "   [E] Escrever minha própria mensagem"
            Write-Host "   [C] Cancelar o commit"
            $OPTION = Read-Host ">> Opção"
            switch -regex ($OPTION) {
                '^[Aa]' {
                    if ($SUGGESTED_MSG) {
                        $COMMIT_MSG = $SUGGESTED_MSG
                    } else {
                        Write-Host ">> Não há sugestão disponível para aceitar."
                    }
                    break
                }
                '^[Ee]' {
                    $COMMIT_MSG = Read-Host ">> Digite a mensagem do commit"
                    if ([string]::IsNullOrWhiteSpace($COMMIT_MSG)) {
                        Write-Host ">> Mensagem vazia. Tente novamente."
                        $COMMIT_MSG = ""
                    }
                    break
                }
                '^[Cc]' {
                    Write-Host ">> Commit cancelado pelo usuário. Abortando sincronização."
                    exit 1
                }
                default {
                    Write-Host ">> Opção inválida."
                }
            }
        }

        git commit -m "$COMMIT_MSG"
    }
} else {
    Write-Host ">> Nenhuma alteração local pendente."
}

# --- 4. Compara local x remoto e decide pull / rebase ---
if ($REMOTE_EXISTS) {
    $BEHIND = [int](git rev-list HEAD..origin/$BRANCH --count)
    $AHEAD  = [int](git rev-list origin/$BRANCH..HEAD --count)
} else {
    $BEHIND = 0
    $AHEAD  = [int](git rev-list HEAD --count)
}

Write-Host ">> Local está $AHEAD commit(s) à frente e $BEHIND commit(s) atrás de origin/$BRANCH."

if ($REMOTE_EXISTS -and $BEHIND -gt 0 -and $AHEAD -gt 0) {
    Write-Host ">> Históricos divergiram. Executando rebase (pull --rebase)..."
    git pull --rebase origin $BRANCH
    if ($LASTEXITCODE -ne 0) {
        Write-Host ">> Conflito durante o rebase. Resolva manualmente (git status), depois rode:"
        Write-Host "     git rebase --continue"
        Write-Host "   e execute este script novamente."
        exit 1
    }
} elseif ($REMOTE_EXISTS -and $BEHIND -gt 0) {
    Write-Host ">> Repositório local está atrás. Executando git pull..."
    git pull origin $BRANCH
}

# --- 5. Envia (push) o que ainda estiver à frente do remoto ---
if ($REMOTE_EXISTS) {
    $AHEAD = [int](git rev-list origin/$BRANCH..HEAD --count)
} else {
    $AHEAD = [int](git rev-list HEAD --count)
}

if ($AHEAD -gt 0) {
    Write-Host ">> Enviando alterações (push) para origin/$BRANCH..."
    git push -u origin $BRANCH
    if ($LASTEXITCODE -ne 0) {
        Write-Host ">> Push rejeitado. Sincronizando novamente com o remoto (pull --rebase) e tentando de novo..."
        git pull --rebase origin $BRANCH
        if ($LASTEXITCODE -ne 0) {
            Write-Host ">> Conflito durante o rebase. Resolva manualmente e rode o script novamente."
            exit 1
        }
        git push -u origin $BRANCH
    }
} else {
    Write-Host ">> Nada para enviar ao remoto."
}

Write-Host ">> Concluído. Repositório local e remoto sincronizados (branch: $BRANCH)."
