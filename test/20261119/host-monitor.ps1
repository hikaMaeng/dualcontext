# Host observation logger + watchdog for the dualcontext decompose run.
# Appends one JSON line per sample (flushed immediately, so the file survives a host freeze).
# Watchdog: on sustained CPU / memory / disk pressure or a long loop stall, cancels running runs via the admin API,
# and if pressure persists, stops the dualcontext and crawler containers (once).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File host-monitor.ps1 -OutFile <path.jsonl> [-IntervalSec 2] [-MaxMinutes 90]
# Stop early by creating <OutFile>.stop
param(
  [Parameter(Mandatory = $true)][string]$OutFile,
  [int]$IntervalSec = 2,
  [int]$MaxMinutes = 90,
  [string]$Base = "http://127.0.0.1:18081",
  [int]$CpuLimit = 85,
  [int]$MemFreeLimitMB = 25000,
  [int]$DiskQueueLimit = 10,
  [int]$StallLimitSec = 12,
  [switch]$NoWatchdog
)
$ErrorActionPreference = "SilentlyContinue"
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Write-Line([string]$text) { [IO.File]::AppendAllText($OutFile, $text + "`n", $utf8) }
function Get-Api([string]$path) { try { Invoke-RestMethod -Uri ($Base + "/api/admin" + $path) -TimeoutSec 3 } catch { $null } }

$cpuCount = [Environment]::ProcessorCount
$stopFile = $OutFile + ".stop"
$deadline = (Get-Date).AddMinutes($MaxMinutes)
$prev = @{}
foreach ($p in Get-Process) { $prev[$p.Id] = $p.CPU }
$prevTime = Get-Date
$tick = 0
$bad = 0
$cancelled = $false
$cancelAt = $null
$stopped = $false
$dockerText = $null
$gpuText = $null
Write-Line (@{ kind = "start"; at = (Get-Date).ToString("o"); intervalSec = $IntervalSec; cpuCount = $cpuCount; watchdog = (-not $NoWatchdog); cpuLimit = $CpuLimit; memFreeLimitMB = $MemFreeLimitMB; diskQueueLimit = $DiskQueueLimit; stallLimitSec = $StallLimitSec } | ConvertTo-Json -Compress)

while ((Get-Date) -lt $deadline -and -not (Test-Path $stopFile)) {
  $loopStart = Get-Date
  $c = Get-Counter -Counter @('\Processor(_Total)\% Processor Time', '\PhysicalDisk(_Total)\Avg. Disk Queue Length', '\PhysicalDisk(_Total)\% Disk Time', '\Memory\Available MBytes', '\Memory\Pages/sec', '\System\Processor Queue Length', '\Memory\% Committed Bytes In Use') -SampleInterval 1 -MaxSamples 1
  $v = @{}
  foreach ($s in $c.CounterSamples) { $v[($s.Path -replace '^\\\\[^\\]+\\', '')] = [math]::Round($s.CookedValue, 1) }
  $now = Get-Date
  $dt = ($now - $prevTime).TotalSeconds
  $procs = foreach ($p in Get-Process) {
    $old = $prev[$p.Id]
    if ($null -ne $old -and $null -ne $p.CPU -and $dt -gt 0) {
      [pscustomobject]@{ n = $p.ProcessName; id = $p.Id; cpu = [math]::Round(($p.CPU - $old) / $dt * 100, 0); th = $p.Threads.Count; h = $p.HandleCount; ws = [int]($p.WorkingSet64 / 1MB) }
    }
  }
  $prev = @{}
  foreach ($p in Get-Process) { $prev[$p.Id] = $p.CPU }
  $prevTime = $now
  $top = $procs | Sort-Object cpu -Descending | Select-Object -First 7

  if ($tick % 3 -eq 0) {
    $dockerText = (docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.PIDs}}" dualcontext crawler 2>$null) -join ";"
  }
  if ($tick % 2 -eq 0) {
    $gpuText = (nvidia-smi --query-gpu=index,utilization.gpu,memory.used --format=csv,noheader,nounits 2>$null) -join ";"
  }
  $status = Get-Api "/status"
  $app = $null
  if ($status) {
    $app = @{ activeRuns = $status.activeRuns; chatIn = $status.queues.chat.inFlight; chatQ = $status.queues.chat.queued; chatDelayed = $status.queues.chat.delayed; chatRetried = $status.queues.chat.retried; embedIn = $status.queues.embed.inFlight; embedQ = $status.queues.embed.queued; elP99 = $status.eventLoop.p99; elMax = $status.eventLoop.max }
  }
  $cpu = $v["processor(_total)\% processor time"]
  $mem = $v["memory\available mbytes"]
  $dq = $v["physicaldisk(_total)\avg. disk queue length"]
  $row = @{ kind = "s"; at = $now.ToString("o"); dt = [math]::Round($dt, 1); cpu = $cpu; memFreeMB = $mem; commit = $v["memory\% committed bytes in use"]; pages = $v["memory\pages/sec"]; runq = $v["system\processor queue length"]; diskQ = $dq; diskPct = $v["physicaldisk(_total)\% disk time"]; top = $top; docker = $dockerText; gpu = $gpuText; app = $app }
  Write-Line ($row | ConvertTo-Json -Compress -Depth 5)
  $tick++

  if (-not $NoWatchdog) {
    $pressure = ($cpu -ge $CpuLimit) -or ($mem -lt $MemFreeLimitMB -and $mem -gt 0) -or ($dq -ge $DiskQueueLimit)
    if ($pressure) { $bad++ } else { $bad = 0 }
    $stall = ($dt -gt $StallLimitSec)
    if (($bad -ge 3 -or $stall) -and -not $cancelled) {
      $cancelled = $true
      $cancelAt = Get-Date
      $ids = @()
      $runs = Get-Api "/runs?pageSize=10"
      if ($runs) { foreach ($r in $runs.items) { if ($r.status -eq "running") { $ids += $r.id } } }
      foreach ($id in $ids) { try { Invoke-RestMethod -Method Post -Uri ($Base + "/api/admin/runs/$id/cancel") -TimeoutSec 5 | Out-Null } catch { } }
      Write-Line (@{ kind = "WATCHDOG"; action = "cancel"; at = (Get-Date).ToString("o"); why = @{ cpu = $cpu; memFreeMB = $mem; diskQ = $dq; dt = $dt; badSamples = $bad }; cancelled = $ids } | ConvertTo-Json -Compress -Depth 4)
    }
    elseif ($cancelled -and -not $stopped -and ((Get-Date) - $cancelAt).TotalSeconds -gt 30 -and $pressure) {
      $stopped = $true
      docker stop dualcontext crawler 2>$null | Out-Null
      Write-Line (@{ kind = "WATCHDOG"; action = "docker-stop"; at = (Get-Date).ToString("o"); why = @{ cpu = $cpu; memFreeMB = $mem; diskQ = $dq } } | ConvertTo-Json -Compress -Depth 4)
    }
  }
  $elapsed = ((Get-Date) - $loopStart).TotalSeconds
  if ($elapsed -lt $IntervalSec) { Start-Sleep -Milliseconds ([int](($IntervalSec - $elapsed) * 1000)) }
}
Write-Line (@{ kind = "end"; at = (Get-Date).ToString("o"); samples = $tick } | ConvertTo-Json -Compress)
