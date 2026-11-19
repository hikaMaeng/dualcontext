# UI responsiveness probe: sends WM_NULL to the top-level windows of running apps (SendMessageTimeout) once per second and records
# how long each window's message pump takes to answer. A window that answers slowly (or not within the timeout) is what a user feels as "that app is lagging".
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File ui-probe.ps1 -OutFile <path.json> [-Seconds 40] [-TimeoutMs 2000]
param([Parameter(Mandatory = $true)][string]$OutFile, [int]$Seconds = 40, [int]$TimeoutMs = 2000)
Add-Type @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class UiProbe {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  public class Sample { public uint Pid; public IntPtr Hwnd; public double Ms; public bool TimedOut; }
  public static List<Sample> Run(uint timeoutMs, int maxWindows) {
    var hwnds = new List<IntPtr>();
    EnumWindows((h, l) => { if (IsWindowVisible(h) && GetWindowTextLength(h) > 0) hwnds.Add(h); return true; }, IntPtr.Zero);
    var seen = new HashSet<uint>(); var result = new List<Sample>();
    foreach (var h in hwnds) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (!seen.Add(pid) || result.Count >= maxWindows) continue;
      var sw = Stopwatch.StartNew(); IntPtr r;
      IntPtr ok = SendMessageTimeout(h, 0, IntPtr.Zero, IntPtr.Zero, 0x0002 /*SMTO_ABORTIFHUNG*/ | 0x0008 /*SMTO_ERRORONEXIT*/, timeoutMs, out r);
      sw.Stop();
      result.Add(new Sample { Pid = pid, Hwnd = h, Ms = sw.Elapsed.TotalMilliseconds, TimedOut = (ok == IntPtr.Zero) });
    }
    return result;
  }
}
"@
$names = @{}; foreach ($p in Get-Process) { $names[[uint32]$p.Id] = $p.ProcessName }
$perApp = @{}; $timeline = New-Object System.Collections.Generic.List[object]
$end = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $end) {
  $t0 = Get-Date
  $samples = [UiProbe]::Run([uint32]$TimeoutMs, 25)
  $worst = 0.0; $worstApp = ""; $timeouts = 0
  foreach ($s in $samples) {
    $n = $names[[uint32]$s.Pid]; if (-not $n) { $n = "pid$($s.Pid)" }
    if (-not $perApp.ContainsKey($n)) { $perApp[$n] = New-Object System.Collections.Generic.List[double] }
    $perApp[$n].Add($s.Ms)
    if ($s.TimedOut) { $timeouts++ }
    if ($s.Ms -gt $worst) { $worst = $s.Ms; $worstApp = $n }
  }
  $timeline.Add([ordered]@{ at = $t0.ToString("HH:mm:ss"); windows = $samples.Count; worstMs = [math]::Round($worst, 1); worstApp = $worstApp; timeouts = $timeouts })
  $wait = 1000 - ((Get-Date) - $t0).TotalMilliseconds; if ($wait -gt 0) { Start-Sleep -Milliseconds ([int]$wait) }
}
$apps = foreach ($k in $perApp.Keys) { $v = @($perApp[$k] | Sort-Object); [ordered]@{ app = $k; n = $v.Count; p50 = [math]::Round($v[[int]($v.Count * 0.5)], 1); p99 = [math]::Round($v[[math]::Min($v.Count - 1, [int]($v.Count * 0.99))], 1); max = [math]::Round($v[$v.Count - 1], 1) } }
$summary = [ordered]@{ at = (Get-Date).ToString("o"); seconds = $Seconds; timeoutMs = $TimeoutMs; apps = @($apps | Sort-Object { $_.max } -Descending); worstTimeline = @($timeline | Sort-Object { $_.worstMs } -Descending | Select-Object -First 12) }
[IO.File]::WriteAllText($OutFile, ($summary | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
