param(
    [string[]]$Scenes = @('backprop','neuron','attention','descent','xor','rope','heads','generation')
)
$ErrorActionPreference = 'Stop'
$repository = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$outputRoot = Join-Path $repository 'work/backprop-pilot/narration'
$voice = New-Object -ComObject SAPI.SpVoice
$russian = @($voice.GetVoices() | Where-Object { $_.GetDescription() -eq 'Microsoft Irina Desktop - Russian' })
if ($russian.Count -ne 1) { throw 'Install Microsoft Irina Desktop Russian before generating narration.' }
$voice.Voice = $russian[0]
$voice.Volume = 90
$voice.AllowAudioOutputFormatChangesOnNextSet = $false
$failures = @()
foreach ($sceneName in $Scenes) {
    if ($sceneName -notmatch '^[a-z]+$') { throw 'Invalid scene name' }
    $manifestPath = Join-Path $PSScriptRoot "$sceneName/narration.ru.json"
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
    $destination = Join-Path $outputRoot $sceneName
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    $measurements = @()
    for ($index = 0; $index -lt $manifest.segments.Count; $index++) {
        $segment = $manifest.segments[$index]
        $file = Join-Path $destination ('{0:D2}.wav' -f $index)
        $available = [double]$segment.end - [double]$segment.start - 0.08
        $fit = $false
        foreach ($rate in 0..5) {
            $stream = New-Object -ComObject SAPI.SpFileStream
            $stream.Format.Type = 22 # 22.05 kHz, 16 bit, mono
            $stream.Open($file, 3, $false)
            $voice.AudioOutputStream = $stream
            $voice.Rate = $rate
            [void]$voice.Speak([string]$segment.text, 0)
            $stream.Close()
            # SAPI writes RIFF PCM; its data length is measured by the assembly script.
            $raw = [System.IO.File]::ReadAllBytes($file)
            $position = 12
            $sampleBytes = 0
            while ($position + 8 -le $raw.Length) {
                $chunk = [System.Text.Encoding]::ASCII.GetString($raw, $position, 4)
                $size = [BitConverter]::ToUInt32($raw, $position + 4)
                if ($chunk -eq 'data') { $sampleBytes = $size; break }
                $position += 8 + $size + ($size % 2)
            }
            $seconds = $sampleBytes / (22050.0 * 2)
            if ($seconds -gt 0 -and $seconds -le $available) { $fit = $true; break }
        }
        if (-not $fit) { $failures += "$sceneName segment $index needs shorter narration ($seconds seconds, available $available)." }
        $measurements += [pscustomobject]@{index=$index;start=$segment.start;end=$segment.end;duration=$seconds;rate=$rate;text=$segment.text}
    }
    $measurements | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $destination 'segments.json') -Encoding utf8
    Write-Output "$sceneName`: synthesized $($measurements.Count) timed segments"
}
if ($failures.Count) { throw ($failures -join "`n") }
