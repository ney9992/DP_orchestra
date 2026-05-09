# mock-plantsim.ps1
# Заглушка PlantSimulation.exe для разработки без реального ПО.
# Принимает те же аргументы что PlantSim.exe (D-01):
#   powershell -File mock-plantsim.ps1 /S "macro.spm" "file.spp"
# Контракт results.txt соответствует D-07 из CONTEXT.md.

param(
    [string]$S = "",        # путь к .spm макросу (передаётся как /S следующим аргументом)
    [string]$SppPath = ""   # путь к .spp файлу (позиционный, 3-й аргумент)
)

Write-Output "[mock-plantsim] Запуск симуляции..."
Write-Output "[mock-plantsim] Макрос: $S"
Write-Output "[mock-plantsim] Модель: $SppPath"
Write-Output "[mock-plantsim] Шаг 1/3: инициализация..."

Start-Sleep -Seconds 1

Write-Output "[mock-plantsim] Шаг 2/3: симуляция (2000 шагов)..."

Start-Sleep -Seconds 1

Write-Output "[mock-plantsim] Шаг 3/3: запись результатов..."

# Определить work_dir — директория .spp файла или текущая директория
$workDir = if ($SppPath -and (Test-Path $SppPath)) {
    Split-Path $SppPath -Parent
} else {
    (Get-Location).Path
}

# Записать results.txt по контракту D-07 (key=value, UTF-8 без BOM)
$resultsPath = Join-Path $workDir "results.txt"
$content = "load=87.3`nthroughput=42`ncycle_time=18.5"
[System.IO.File]::WriteAllText($resultsPath, $content, [System.Text.Encoding]::UTF8)

Write-Output "[mock-plantsim] Результаты записаны: $resultsPath"
Write-Output "[mock-plantsim] Завершено. Коэффициент загрузки: 87.3%, пропускная способность: 42 ед./ч, время цикла: 18.5 сек."

exit 0
