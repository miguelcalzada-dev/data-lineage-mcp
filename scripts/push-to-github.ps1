#Requires -Version 7.0
<#
.SYNOPSIS
  Push the local Data Lineage & Impact Analyzer monorepo to GitHub.

.DESCRIPTION
  This script reads the GitHub Personal Access Token from the environment
  variable $env:GITHUB_TOKEN. The token is used only for the push and is
  removed from the git remote immediately afterwards.

.USAGE
  1. Create an empty repository on GitHub (no README, no .gitignore).
  2. In PowerShell, set the token for the current session only:
       $env:GITHUB_TOKEN = "github_pat_..."
  3. Run this script:
       .\scripts\push-to-github.ps1 -Repo "TU_USUARIO/NOMBRE_REPO"
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$Repo
)

$ErrorActionPreference = "Stop"

if (-not $env:GITHUB_TOKEN) {
  Write-Error "GITHUB_TOKEN environment variable is not set. Set it for this session with:`n  `$env:GITHUB_TOKEN = 'github_pat_...'"
  exit 1
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -Path $projectRoot

Write-Host "Working directory: $projectRoot" -ForegroundColor Cyan

# Initialize git if needed
if (-not (Test-Path -Path ".git" -PathType Container)) {
  Write-Host "Initializing git repository..." -ForegroundColor Cyan
  git init
}

# Configure remote with token for this push only
$remoteUrl = "https://$($env:GITHUB_TOKEN)@github.com/$Repo.git"

$existingRemote = git remote get-url origin 2>$null
if ($existingRemote) {
  Write-Host "Updating existing origin remote..." -ForegroundColor Cyan
  git remote set-url origin $remoteUrl
} else {
  Write-Host "Adding origin remote..." -ForegroundColor Cyan
  git remote add origin $remoteUrl
}

# Stage, commit and push
Write-Host "Staging files..." -ForegroundColor Cyan
git add .

$hasChanges = git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creating initial commit..." -ForegroundColor Cyan
  git commit -m "feat: initial data lineage & impact analyzer with MCP"
} else {
  Write-Host "No changes to commit." -ForegroundColor Yellow
}

Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git branch -M main
git push -u origin main

# Remove token from remote to avoid leaking it in .git/config
Write-Host "Cleaning token from git remote..." -ForegroundColor Cyan
git remote set-url origin "https://github.com/$Repo.git"

Write-Host "Done. Repository pushed to https://github.com/$Repo" -ForegroundColor Green
Write-Host "You can now delete the GITHUB_TOKEN environment variable with:`n  Remove-Item Env:\GITHUB_TOKEN" -ForegroundColor Green
