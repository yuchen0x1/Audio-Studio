param(
    [Parameter(Mandatory)][string]$Installer,
    [Parameter(Mandatory)][string]$Version
)

$ErrorActionPreference = 'Stop'
$installPath = Join-Path $env:RUNNER_TEMP ('AudioStudio-' + [guid]::NewGuid().ToString('N'))
$uninstaller = Join-Path $installPath 'uninstall.exe'
$app = $null
try {
    # NSIS requires /D to be the last argument, without quotes.
    $install = Start-Process -FilePath $Installer -ArgumentList "/S /D=$installPath" -WindowStyle Hidden -Wait -PassThru
    if ($install.ExitCode -ne 0) { throw "NSIS installation failed with exit code $($install.ExitCode)" }
    $exe = Get-ChildItem -LiteralPath $installPath -Filter '*.exe' -File |
        Where-Object Name -ne 'uninstall.exe' | Select-Object -First 1
    if (!$exe -or $exe.VersionInfo.ProductVersion -ne $Version) {
        throw "Expected an installed Audio Studio executable with version $Version"
    }
    $app = Start-Process -FilePath $exe.FullName -WindowStyle Hidden -PassThru
    if ($app.WaitForExit(8000)) { throw "Installed app exited with code $($app.ExitCode)" }
    Write-Output "Installed $Version and launched the application."
} finally {
    if ($app -and !$app.HasExited) { Stop-Process -Id $app.Id }
    if (Test-Path -LiteralPath $uninstaller) {
        $uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
        if ($uninstall.ExitCode -ne 0 -or ($exe -and (Test-Path -LiteralPath $exe.FullName))) {
            throw "NSIS uninstall failed with exit code $($uninstall.ExitCode)"
        }
        Write-Output 'Uninstall removed the application executable.'
    }
}
