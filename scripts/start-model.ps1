param([string]$ModelPath = '', [int]$Threads = 6, [int]$Port = 8080, [switch]$Small, [switch]$Bonsai, [switch]$Horizon)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$customModel = [bool]$ModelPath
$file = if ($ModelPath) { Split-Path -Leaf $ModelPath } else { '' }
if (([int]$Small.IsPresent + [int]$Bonsai.IsPresent + [int]$Horizon.IsPresent) -gt 1) { throw 'Choose only one model switch.' }
$horizon = $Horizon -or ((-not $Small) -and (-not $Bonsai) -and $customModel -and ($file -like 'K2-Horizon*'))
if ($horizon) {
  $serverPath = Join-Path $projectRoot '.tools\llama-k2\llama-server.exe'
  if (-not $ModelPath) { $ModelPath = Join-Path $projectRoot '.tools\models\K2-Horizon-4B-Q4_K_M.gguf' }
  if ((Test-Path -LiteralPath $serverPath) -and (Test-Path -LiteralPath $ModelPath)) {
    & $serverPath -m $ModelPath --host 127.0.0.1 --port $Port --ctx-size 8192 --parallel 1 --alias signal-91 --reasoning off --no-webui --offline --threads $Threads --jinja
    if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq -1073741510 -or $customModel) { exit $LASTEXITCODE }
    Write-Output 'Horizon could not run. Starting the small CPU model.'
  } elseif ($customModel) { throw 'The requested Horizon model or IFM runtime is missing.' }
  $ModelPath = ''
}
$bonsai = $Bonsai -or ((-not $Small) -and $customModel -and ($file -like 'Ternary-Bonsai*'))
if ($bonsai) {
  $serverPath = Join-Path $projectRoot '.tools\llama-prism\llama-server.exe'
  if (-not $ModelPath) { $ModelPath = Join-Path $projectRoot '.tools\models\Ternary-Bonsai-2-27B-Abliterated-PTQ1_0.gguf' }
  if ((Test-Path -LiteralPath $serverPath) -and (Test-Path -LiteralPath $ModelPath)) {
    & $serverPath -m $ModelPath --host 127.0.0.1 --port $Port --ctx-size 8192 --parallel 1 --alias signal-91 --reasoning off --no-webui --offline --threads $Threads --device CUDA0 --fit on --fit-target 768 --batch-size 256 --ubatch-size 128 --jinja
    if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq -1073741510 -or $customModel) { exit $LASTEXITCODE }
    Write-Output 'Bonsai could not run. Starting the small CPU model.'
  } elseif ($customModel) { throw 'The requested Bonsai model or Prism CUDA runtime is missing.' }
  $ModelPath = ''
}
$miniCpm2 = (-not $Small) -and (-not $Bonsai) -and (-not $Horizon) -and ((-not $customModel) -or ($file -like 'MiniCPM5-2B*'))
if ($miniCpm2) {
  $serverPath = Join-Path $projectRoot '.tools\llama\llama-server.exe'
  if (-not $ModelPath) { $ModelPath = Join-Path $projectRoot '.tools\models\MiniCPM5-2B-Q4_K_M.gguf' }
  if ((Test-Path -LiteralPath $serverPath) -and (Test-Path -LiteralPath $ModelPath)) {
    & $serverPath -m $ModelPath --host 127.0.0.1 --port $Port --ctx-size 8192 --parallel 1 --alias signal-91 --reasoning off --no-webui --offline --threads $Threads --jinja
    if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq -1073741510 -or $customModel) { exit $LASTEXITCODE }
    Write-Output 'MiniCPM5-2B could not run. Starting the small CPU model.'
  } elseif ($customModel) { throw 'The requested MiniCPM5-2B model or standard llama.cpp runtime is missing.' }
  $ModelPath = ''
}
$serverPath = Join-Path $projectRoot '.tools\llama\llama-server.exe'
if (-not $ModelPath) { $ModelPath = Join-Path $projectRoot '.tools\models\Huihui-MiniCPM5-1B-abliterated.Q4_K_M.gguf' }
if (-not (Test-Path -LiteralPath $serverPath)) { throw 'Small model runtime missing: .tools/llama/llama-server.exe' }
if (-not (Test-Path -LiteralPath $ModelPath)) { throw 'GGUF model missing. Follow the setup in README.md.' }
& $serverPath -m $ModelPath --host 127.0.0.1 --port $Port --ctx-size 8192 --parallel 1 --alias signal-91 --reasoning off --no-webui --offline --threads $Threads
