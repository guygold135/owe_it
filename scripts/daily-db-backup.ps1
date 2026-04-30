$ErrorActionPreference = "Stop"

# Required: set once in user environment (do NOT commit secrets).
# Example:
# setx SUPABASE_DB_URL "postgresql://postgres:<PASSWORD>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
$databaseUrl = $env:SUPABASE_DB_URL
if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
  throw "SUPABASE_DB_URL is not set. Set it once with: setx SUPABASE_DB_URL <connection-string>"
}

$localBackupDir = "C:\db-backups"
$ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

New-Item -ItemType Directory -Path $localBackupDir -Force | Out-Null

# Create data + schema backups
pg_dump --format=custom --no-owner --no-privileges --file="$localBackupDir\oweit_$ts.dump" "$databaseUrl"
pg_dump --schema-only --no-owner --no-privileges --file="$localBackupDir\oweit_schema_$ts.sql" "$databaseUrl"

# Retention: keep last 30 days locally
Get-ChildItem $localBackupDir -File | Where-Object {
  $_.LastWriteTime -lt (Get-Date).AddDays(-30)
} | Remove-Item -Force

# Google Drive sync targets (Google Drive for Desktop variants)
$gdriveCandidates = @(
  "G:\My Drive\oweit-db-backups",
  "$env:USERPROFILE\My Drive\oweit-db-backups",
  "$env:USERPROFILE\Google Drive\oweit-db-backups",
  "$env:USERPROFILE\GoogleDrive\oweit-db-backups"
)

$gdriveTarget = $gdriveCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $gdriveTarget) {
  Write-Output "Google Drive folder not found. Kept local backup only at $localBackupDir"
  exit 0
}

# Mirror local backups to Google Drive target
robocopy "$localBackupDir" "$gdriveTarget" /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
Write-Output "Backup completed and synced to: $gdriveTarget"
