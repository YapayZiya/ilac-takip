<#
.SYNOPSIS
README.md, AGENTS.md ve PROGRESS.md dosyalarini GitHub'a push eder.
#>

param(
    [string]$RepoDir = ".",
    [string]$Branch = "main",
    [string]$CommitMessage = "docs: add README, AGENTS, PROGRESS"
)

Set-Location -LiteralPath $RepoDir

$files = @("README.md", "AGENTS.md", "PROGRESS.md")
foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) {
        Write-Error "$f bulunamadi."
        exit 1
    }
}

git add -- $files
git status
git commit -m $CommitMessage
git push origin $Branch

Write-Host "Push tamamlandi."
