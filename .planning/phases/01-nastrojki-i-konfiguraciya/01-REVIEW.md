---
phase: 01-nastrojki-i-konfiguraciya
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - app/create_test.ps1
findings:
  critical: 5
  warning: 6
  info: 3
  total: 14
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-05-09
**Depth:** standard
**Files Reviewed:** 1 (`app/create_test.ps1`)
**Status:** issues_found

## Summary

Файл реализует WinForms-интерфейс панели управления цифровым заводом: метрики, карточки стадий пайплайна, слайдовая панель настроек. Код работоспособен в happy-path, однако содержит системные утечки GDI-ресурсов в обработчиках Paint (критично для приложения, работающего непрерывно на заводском ПК), потенциальное повреждение данных при сохранении настроек, небезопасное открытие файловых потоков и ряд логических ошибок.

---

## Critical Issues

### CR-01: Утечка файлового потока при исключении в `Get-LogoImage`

**File:** `app/create_test.ps1:29-34`

**Issue:** Если `[System.Drawing.Image]::FromStream($stream)` выбрасывает исключение, выполнение переходит в `catch { }`, а `$stream.Close()` (строка 32) никогда не вызывается. Файл логотипа остаётся заблокированным до завершения процесса. Дополнительно: даже в случае успеха `$stream` закрывается немедленно после `FromStream`, тогда как часть реализаций GDI+ (.NET Framework) требует, чтобы поток оставался открытым на всё время жизни `Image` — закрытие может привести к `ExternalException` при отрисовке.

**Fix:**
```powershell
function Get-LogoImage($logoFile, $fallbackGlyph, $bgColor, $fgColor) {
    $path = Join-Path $logoDir $logoFile
    if (Test-Path $path) {
        $stream = $null
        try {
            $stream = [System.IO.File]::OpenRead($path)
            # Скопировать в MemoryStream, чтобы можно было закрыть файл
            $ms = New-Object System.IO.MemoryStream
            $stream.CopyTo($ms)
            $ms.Position = 0
            $img = [System.Drawing.Image]::FromStream($ms)
            # $ms НЕ закрываем — GDI+ держит ссылку на него
            return $img
        } catch {
            # fall through to glyph fallback
        } finally {
            if ($stream) { $stream.Close() }
        }
    }
    # ... glyph fallback
}
```

---

### CR-02: Утечка GDI-объектов в обработчиках Paint (систематическая)

**File:** `app/create_test.ps1:149-154, 162-172, 198-206, 217-227, 425-435, 547-552`

**Issue:** В каждом обработчике `Add_Paint` создаются неуправляемые GDI+ объекты (`Pen`, `SolidBrush`, `Font`, `StringFormat`), которые **никогда не вызывают `.Dispose()`**. Paint срабатывает при каждой перерисовке — при анимации (12 мс, до 83 раз/сек) это сотни утечек в минуту. На заводском ПК без перезагрузок накопление GDI-хендлов приводит к деградации отрисовки и возможному краш-у ("Generic error in GDI+").

Затронутые места:
- `$card.Add_Paint` — `$pen` (строка 152)
- `$headerIcon.Add_Paint` — `$f`, `$brush`, `$sf` (строки 166-170)
- `$statusPanel.Add_Paint` — `$brush`, `$f`, `$tBrush` (строки 201-205)
- `$gearBtn.Add_Paint` — `$f`, `$brush`, `$sf` (строки 221-226)
- `$stageCard.Add_Paint` — `$pen` (строка 433)
- `$settingsPanel.Add_Paint` — `$pen` (строка 550)

**Fix:** Оборачивать GDI-объекты в `try/finally` с `.Dispose()`:
```powershell
$card.Add_Paint({
    $g = $_.Graphics
    $g.SmoothingMode = "AntiAlias"
    $pen = New-Object System.Drawing.Pen $colBorder, 1
    try {
        $g.DrawRectangle($pen, 0, 0, $card.Width - 1, $card.Height - 1)
    } finally {
        $pen.Dispose()
    }
})
```
Аналогично для всех остальных обработчиков Paint.

---

### CR-03: Утечка GDI-объектов в `Get-LogoImage` (fallback-ветка)

**File:** `app/create_test.ps1:36-49`

**Issue:** В fallback-ветке создаются `$brush` (строка 40), `$f` (строка 42), `$tBrush` (строка 43), `$sf` (строка 44). Из них вызывается только `$g.Dispose()` (строка 48). Три объекта SolidBrush, Font и StringFormat утекают. Функция вызывается 5 раз при старте (по одному разу на каждую стадию без логотипа).

**Fix:**
```powershell
$bmp = New-Object System.Drawing.Bitmap 64, 64
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$brush  = New-Object System.Drawing.SolidBrush $bgColor
$f      = New-Object System.Drawing.Font("Segoe UI", 26, [System.Drawing.FontStyle]::Bold)
$tBrush = New-Object System.Drawing.SolidBrush $fgColor
$sf     = New-Object System.Drawing.StringFormat
try {
    $g.SmoothingMode      = "AntiAlias"
    $g.TextRenderingHint  = "AntiAlias"
    $sf.Alignment         = "Center"
    $sf.LineAlignment     = "Center"
    $g.FillRectangle($brush, 0, 0, 64, 64)
    $g.DrawString([string]$fallbackGlyph, $f, $tBrush,
        (New-Object System.Drawing.RectangleF 0, 0, 64, 64), $sf)
} finally {
    $g.Dispose(); $brush.Dispose(); $f.Dispose(); $tBrush.Dispose(); $sf.Dispose()
}
return $bmp
```

---

### CR-04: Повреждение `settings.json` при неполной записи

**File:** `app/create_test.ps1:647`

**Issue:** `$cfg | ConvertTo-Json | Out-File -FilePath $settingsPath -Encoding UTF8` перезаписывает файл без атомарности. При ошибке записи (нет места на диске, прерывание питания) файл оказывается частично записан. При следующем запуске `ConvertFrom-Json` выбрасывает исключение, которое поглощается в `catch { }` (строка 690) — приложение молча стартует с пустыми настройками, и пользователь теряет конфигурацию без каких-либо уведомлений.

**Fix:** Писать во временный файл, затем атомарно переименовывать:
```powershell
$settingsPath = Join-Path $scriptDir "settings.json"
$tmpPath      = $settingsPath + ".tmp"
try {
    $cfg | ConvertTo-Json | Out-File -FilePath $tmpPath -Encoding UTF8
    Move-Item -Path $tmpPath -Destination $settingsPath -Force
} catch {
    [System.Windows.Forms.MessageBox]::Show("Ошибка сохранения настроек: $_")
}
```

---

### CR-05: Двойное использование `Tag` у `$stageCard` — конфликт данных

**File:** `app/create_test.ps1:348, 431, 472`

**Issue:** Свойство `Tag` у `$stageCard` используется одновременно для двух несовместимых целей:
1. Хранит имя файла (`$s.File`) для обработчика кликов (строка 473: `$ctrl.Tag`).
2. Используется в обработчике Paint для определения цвета рамки (строка 431: `$sender.Tag -eq "test_plantsim.txt"`).

`Tag` — публичное свойство `Control`, изменяемое из любого места. Любая будущая модификация `Tag` для одной цели немедленно сломает другую. Кроме того, логика Paint жёстко сравнивает значение `Tag` с магической строкой `"test_plantsim.txt"` — при переименовании файла в `$stages` Paint не обновится.

**Fix:** Хранить имя файла отдельно (через `Add-Member`), а признак "активной" стадии — в отдельном свойстве:
```powershell
$stageCard | Add-Member -NotePropertyName StageFile -NotePropertyValue $s.File -Force
$stageCard | Add-Member -NotePropertyName IsActive  -NotePropertyValue $s.Active -Force
# В Paint handler:
$col = if ($sender.IsActive) { $colBorderInfo } else { $colBorder }
# В click handler:
$target = Join-Path $scriptDir $ctrl.StageFile
```

---

## Warnings

### WR-01: `$isActive` объявляется, но нигде не используется

**File:** `app/create_test.ps1:424`

**Issue:** `$isActive = $s.Active` объявляется перед обработчиком Paint, но в самом обработчике (строка 431) признак активности определяется через `$sender.Tag -eq "test_plantsim.txt"`, а не через `$isActive`. Мёртвая переменная создаёт иллюзию, что логика корректна, и маскирует дефект CR-05.

**Fix:** Удалить строку 424 или использовать `$isActive` в обработчике Paint (после исправления CR-05).

---

### WR-02: Переменная `$card` в замыканиях `$hoverEnter`/`$hoverLeave` перекрывает скрипт-скоупную переменную

**File:** `app/create_test.ps1:398-419`

**Issue:** В `$hoverEnter` и `$hoverLeave` локальная переменная `$card` (строки 400, 410) используется для обхода дерева контролов. Она перекрывает переменную `$card` уровня скрипта (строка 145 — `$card` основная панель). Если будущий код в этих замыканиях попытается обратиться к внешней `$card`, он получит внутреннюю.

**Fix:** Переименовать локальную переменную, например:
```powershell
$hoverEnter = {
    param($sender, $e)
    $targetCard = $sender
    while ($targetCard -and -not ($targetCard.PSObject.Properties.Name -contains 'AnimTimer')) {
        $targetCard = $targetCard.Parent
    }
    if ($targetCard) {
        $targetCard.Hovering = $true
        $targetCard.BringToFront()
        $targetCard.AnimTimer.Start()
    }
}
```

---

### WR-03: Магические числа `1160` и `350` дублируются в анимации настроек

**File:** `app/create_test.ps1:664, 673, 655`

**Issue:** Ширина карточки `1160` (строка 147) дублируется в строках 664 и 673 как `1160 - $newW`. Целевая ширина панели `350` задана в `$settingsPanelTargetW` (строка 655), но размер `$settingsDivider` и `$settingsFootDivider` жёстко закодированы как `350` (строки 568, 574) без ссылки на `$settingsPanelTargetW`. При изменении ширины придётся менять в трёх местах.

**Fix:** Определить константы в начале:
```powershell
$CARD_W              = 1160
$SETTINGS_PANEL_W    = 350
# Затем использовать везде: $CARD_W - $newW, New-Object System.Drawing.Size($SETTINGS_PANEL_W, 1)
```

---

### WR-04: `FolderBrowserDialog` не освобождается после использования

**File:** `app/create_test.ps1:120-127`

**Issue:** `$dlg = New-Object System.Windows.Forms.FolderBrowserDialog` и `OpenFileDialog` (строка 109) создаются без последующего вызова `.Dispose()`. Оба диалога реализуют `IDisposable` и удерживают COM-объекты до финализации GC.

**Fix:**
```powershell
$browseBtn.Add_Click({
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = "Выберите папку"
    try {
        if ($dlg.ShowDialog() -eq "OK") {
            $tb.Text = $dlg.SelectedPath
            $tb.BackColor = $colBgPage
            $errLbl.Visible = $false
        }
    } finally {
        $dlg.Dispose()
    }
}.GetNewClosure())
```

---

### WR-05: Таймеры `$cardTimer` не останавливаются при закрытии формы

**File:** `app/create_test.ps1:359-395`

**Issue:** Для каждой из 5 стадий создаётся `$cardTimer` с интервалом 12 мс. При закрытии формы через `$form.ShowDialog()` таймеры не останавливаются явно. Если форма закрыта, но объект PowerShell-сессии ещё жив (например, форма пересоздаётся), таймеры продолжат тикать и пытаться изменять свойства уже уничтоженных контролов.

**Fix:** Добавить обработчик `$form.Add_FormClosed`:
```powershell
$form.Add_FormClosed({
    $metricsTimer.Stop(); $metricsTimer.Dispose()
    $settingsTimer.Stop(); $settingsTimer.Dispose()
    # Остановить все cardTimer
    foreach ($ctrl in $card.Controls) {
        if ($ctrl.PSObject.Properties.Name -contains 'AnimTimer') {
            $ctrl.AnimTimer.Stop()
            $ctrl.AnimTimer.Dispose()
        }
    }
})
```

---

### WR-06: `$metricsTimer` и `$settingsTimer` не освобождаются

**File:** `app/create_test.ps1:294, 658`

**Issue:** Оба таймера создаются, запускаются, но `.Dispose()` не вызывается при завершении. `System.Windows.Forms.Timer` реализует `IDisposable`. В контексте одноразового скрипта это некритично, но при встраивании в более крупную систему может привести к утечке.

**Fix:** Освободить в `FormClosed` (см. WR-05).

---

## Info

### IN-01: Hardcoded текст "All services online" — статус не отражает реальное состояние

**File:** `app/create_test.ps1:205`

**Issue:** Индикатор статуса всегда рисует "All services online" с зелёным кружком, независимо от реального состояния систем. Это прототипная заглушка. Пользователь может доверять ложному статусу.

**Fix:** Связать статус с реальными проверками или добавить явный комментарий `# TODO: подключить к реальным проверкам` чтобы задача не была потеряна.

---

### IN-02: Footerlabel содержит hardcoded время "today, 14:32"

**File:** `app/create_test.ps1:508`

**Issue:** `"Last full pipeline run  -  today, 14:32"` — захардкоженная строка. Не обновляется при реальных запусках пайплайна.

**Fix:** Хранить время последнего запуска в переменной и обновлять `$footLbl.Text` после каждого успешного запуска.

---

### IN-03: `Add-SettingsField` создаёт `Font` без последующего Dispose

**File:** `app/create_test.ps1:68, 81, 89, 102`

**Issue:** Четыре объекта `Font` создаются при каждом вызове `Add-SettingsField` (функция вызывается 3 раза = 12 объектов Font) и не освобождаются. При WinForms контролы могут управлять временем жизни шрифтов через `Dispose()`, но явная передача без установки `Control.Font` с `IsFontOwned` — надёжнее освобождать вручную.

**Fix:** По завершении работы формы (в `FormClosed`) освободить кастомные шрифты, либо использовать `using` pattern через `[System.Drawing.Font]::new(...)` если переходите на PowerShell 7+.

---

_Reviewed: 2026-05-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
