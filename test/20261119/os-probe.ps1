# OS-wide latency probe. Measures what a user feels as "everything is slow": scheduler wake-up lag, process creation,
# small file write/read/delete on C: and F:, and a loopback TCP connect. Light load (about 5 probes per second).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File os-probe.ps1 -OutFile <path.json> [-Seconds 45]
param([Parameter(Mandatory = $true)][string]$OutFile, [int]$Seconds = 45, [string]$ProbeDir = "F:\dev\dualcontext")
$ErrorActionPreference = "SilentlyContinue"
function Pct($a, $p) { $s = @($a | Sort-Object); if ($s.Count -eq 0) { return $null }; [math]::Round($s[[math]::Min($s.Count - 1, [int]($s.Count * $p))], 1) }
$series = @{ sleepLag = @(); spawn = @(); fileC = @(); fileF = @(); tcp = @() }
$stamps = @()
$exe = Join-Path $env:SystemRoot "System32\whoami.exe"
$end = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $end) {
  $t = [Diagnostics.Stopwatch]::StartNew(); Start-Sleep -Milliseconds 10; $series.sleepLag += ($t.Elapsed.TotalMilliseconds - 10)
  $t = [Diagnostics.Stopwatch]::StartNew()
  $info = New-Object Diagnostics.ProcessStartInfo $exe; $info.CreateNoWindow = $true; $info.UseShellExecute = $false; $info.RedirectStandardOutput = $true
  $p = [Diagnostics.Process]::Start($info); $null = $p.StandardOutput.ReadToEnd(); $p.WaitForExit(); $series.spawn += $t.Elapsed.TotalMilliseconds
  $t = [Diagnostics.Stopwatch]::StartNew(); $f = Join-Path $env:TEMP "probe_$PID.tmp"; [IO.File]::WriteAllText($f, "x"); $null = [IO.File]::ReadAllText($f); Remove-Item $f -Force; $series.fileC += $t.Elapsed.TotalMilliseconds
  $t = [Diagnostics.Stopwatch]::StartNew(); $f = Join-Path $ProbeDir ".probe_$PID.tmp"; [IO.File]::WriteAllText($f, "x"); $null = [IO.File]::ReadAllText($f); Remove-Item $f -Force; $series.fileF += $t.Elapsed.TotalMilliseconds
  $t = [Diagnostics.Stopwatch]::StartNew(); $c = New-Object Net.Sockets.TcpClient; $c.Connect("127.0.0.1", 18081); $c.Close(); $series.tcp += $t.Elapsed.TotalMilliseconds
  Start-Sleep -Milliseconds 200
}
$summary = [ordered]@{ at = (Get-Date).ToString("o"); seconds = $Seconds }
foreach ($k in $series.Keys) { $v = $series[$k]; $summary[$k] = [ordered]@{ n = $v.Count; p50 = (Pct $v 0.5); p99 = (Pct $v 0.99); max = [math]::Round(($v | Measure-Object -Maximum).Maximum, 1) } }
[IO.File]::WriteAllText($OutFile, ($summary | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding($false)))
