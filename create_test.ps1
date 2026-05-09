Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$scriptDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($scriptDir)) { $scriptDir = (Get-Location).Path }
$logoDir = Join-Path $scriptDir "logos"

# ===== Color palette =====
$colBgPage       = [System.Drawing.Color]::FromArgb(245, 244, 240)
$colBgCard       = [System.Drawing.Color]::White
$colBorder       = [System.Drawing.Color]::FromArgb(220, 218, 210)
$colBorderInfo   = [System.Drawing.Color]::FromArgb(23, 95, 165)
$colTextPrimary  = [System.Drawing.Color]::FromArgb(40, 40, 38)
$colTextSec      = [System.Drawing.Color]::FromArgb(120, 119, 112)
$colTextTert     = [System.Drawing.Color]::FromArgb(160, 158, 150)
$colSuccessBg    = [System.Drawing.Color]::FromArgb(225, 245, 238)
$colSuccessText  = [System.Drawing.Color]::FromArgb(15, 110, 86)
$colInfoBg       = [System.Drawing.Color]::FromArgb(230, 241, 251)
$colInfoText     = [System.Drawing.Color]::FromArgb(12, 68, 124)
$colMutedBg      = [System.Drawing.Color]::FromArgb(241, 239, 232)
$colMutedText    = [System.Drawing.Color]::FromArgb(95, 94, 90)

# ===== Logo loader with fallback =====
function Get-LogoImage($logoFile, $fallbackGlyph, $bgColor, $fgColor) {
    $path = Join-Path $logoDir $logoFile
    if (Test-Path $path) {
        try {
            $stream = [System.IO.File]::OpenRead($path)
            $img = [System.Drawing.Image]::FromStream($stream)
            $stream.Close()
            return $img
        } catch { }
    }
    $bmp = New-Object System.Drawing.Bitmap 64, 64
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"
    $g.TextRenderingHint = "AntiAlias"
    $brush = New-Object System.Drawing.SolidBrush $bgColor
    $g.FillRectangle($brush, 0, 0, 64, 64)
    $f = New-Object System.Drawing.Font("Segoe UI", 26, [System.Drawing.FontStyle]::Bold)
    $tBrush = New-Object System.Drawing.SolidBrush $fgColor
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = "Center"
    $sf.LineAlignment = "Center"
    $g.DrawString([string]$fallbackGlyph, $f, $tBrush, (New-Object System.Drawing.RectangleF 0, 0, 64, 64), $sf)
    $g.Dispose()
    return $bmp
}

# ===== Form =====
$form = New-Object System.Windows.Forms.Form
$form.Text = "Digital factory control panel"
$form.Size = New-Object System.Drawing.Size(1200, 620)
$form.StartPosition = "CenterScreen"
$form.BackColor = $colBgPage
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

# ===== Outer card =====
$card = New-Object System.Windows.Forms.Panel
$card.Location = New-Object System.Drawing.Point(20, 20)
$card.Size = New-Object System.Drawing.Size(1160, 560)
$card.BackColor = $colBgCard
$card.Add_Paint({
    $g = $_.Graphics
    $g.SmoothingMode = "AntiAlias"
    $pen = New-Object System.Drawing.Pen $colBorder, 1
    $g.DrawRectangle($pen, 0, 0, $card.Width - 1, $card.Height - 1)
})
$form.Controls.Add($card)

# ===== Header =====
$headerIcon = New-Object System.Windows.Forms.Panel
$headerIcon.Location = New-Object System.Drawing.Point(24, 22)
$headerIcon.Size = New-Object System.Drawing.Size(40, 40)
$headerIcon.BackColor = $colInfoBg
$headerIcon.Add_Paint({
    $g = $_.Graphics
    $g.SmoothingMode = "AntiAlias"
    $g.TextRenderingHint = "AntiAlias"
    $f = New-Object System.Drawing.Font("Segoe UI", 18, [System.Drawing.FontStyle]::Bold)
    $brush = New-Object System.Drawing.SolidBrush $colInfoText
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = "Center"
    $sf.LineAlignment = "Center"
    $g.DrawString([char]0x2302, $f, $brush, (New-Object System.Drawing.RectangleF 0, 0, 40, 40), $sf)
})
$card.Controls.Add($headerIcon)

$titleLbl = New-Object System.Windows.Forms.Label
$titleLbl.Text = "Digital factory control panel"
$titleLbl.Location = New-Object System.Drawing.Point(76, 22)
$titleLbl.Size = New-Object System.Drawing.Size(600, 22)
$titleLbl.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 12)
$titleLbl.ForeColor = $colTextPrimary
$titleLbl.BackColor = $colBgCard
$card.Controls.Add($titleLbl)

$subLbl = New-Object System.Windows.Forms.Label
$subLbl.Text = "Pipeline orchestration  -  portal crane line"
$subLbl.Location = New-Object System.Drawing.Point(76, 44)
$subLbl.Size = New-Object System.Drawing.Size(600, 18)
$subLbl.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$subLbl.ForeColor = $colTextSec
$subLbl.BackColor = $colBgCard
$card.Controls.Add($subLbl)

# Status indicator
$statusPanel = New-Object System.Windows.Forms.Panel
$statusPanel.Location = New-Object System.Drawing.Point(960, 28)
$statusPanel.Size = New-Object System.Drawing.Size(180, 22)
$statusPanel.BackColor = $colBgCard
$statusPanel.Add_Paint({
    $g = $_.Graphics
    $g.SmoothingMode = "AntiAlias"
    $brush = New-Object System.Drawing.SolidBrush $colSuccessText
    $g.FillEllipse($brush, 0, 7, 8, 8)
    $f = New-Object System.Drawing.Font("Segoe UI", 9)
    $tBrush = New-Object System.Drawing.SolidBrush $colSuccessText
    $g.DrawString("All services online", $f, $tBrush, 14, 3)
})
$card.Controls.Add($statusPanel)

# Header divider
$divider1 = New-Object System.Windows.Forms.Panel
$divider1.Location = New-Object System.Drawing.Point(24, 78)
$divider1.Size = New-Object System.Drawing.Size(1112, 1)
$divider1.BackColor = $colBorder
$card.Controls.Add($divider1)

# ===== Metric cards =====
function Add-MetricCard($parent, $x, $y, $w, $label, $value) {
    $p = New-Object System.Windows.Forms.Panel
    $p.Location = New-Object System.Drawing.Point($x, $y)
    $p.Size = New-Object System.Drawing.Size($w, 60)
    $p.BackColor = $colBgPage

    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = $label
    $lbl.Location = New-Object System.Drawing.Point(14, 8)
    $lbl.Size = New-Object System.Drawing.Size(($w - 20), 16)
    $lbl.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
    $lbl.ForeColor = $colTextSec
    $lbl.BackColor = $colBgPage
    $p.Controls.Add($lbl)

    $val = New-Object System.Windows.Forms.Label
    $val.Text = $value
    $val.Location = New-Object System.Drawing.Point(14, 26)
    $val.Size = New-Object System.Drawing.Size(($w - 20), 26)
    $val.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 13)
    $val.ForeColor = $colTextPrimary
    $val.BackColor = $colBgPage
    $p.Controls.Add($val)

    $parent.Controls.Add($p)
    return $val
}

$metricsY = 96
$metricW = 210
$metricGap = 16
$script:lastSyncTime = Get-Date
$script:appStartTime = Get-Date
$script:totalAttempts = 0
$script:failedAttempts = 0

$syncLbl       = Add-MetricCard $card 24                                      $metricsY $metricW "Last sync"          "just now"
$drawingsLbl   = Add-MetricCard $card (24 + 1*($metricW + $metricGap))        $metricsY $metricW "Drawings processed" "1,284"
$throughputLbl = Add-MetricCard $card (24 + 2*($metricW + $metricGap))        $metricsY $metricW "Throughput"         "94.2%"
$errorLbl      = Add-MetricCard $card (24 + 3*($metricW + $metricGap))        $metricsY $metricW "Error rate"         "0.0%"
$uptimeLbl     = Add-MetricCard $card (24 + 4*($metricW + $metricGap))        $metricsY $metricW "Uptime"             "00:00:00"

$metricsTimer = New-Object System.Windows.Forms.Timer
$metricsTimer.Interval = 1000
$metricsTimer.Add_Tick({
    $elapsed = (Get-Date) - $script:lastSyncTime
    if ($elapsed.TotalSeconds -lt 60) {
        $syncLbl.Text = "$([int]$elapsed.TotalSeconds) sec ago"
    } elseif ($elapsed.TotalHours -lt 1) {
        $syncLbl.Text = "$([int]$elapsed.TotalMinutes) min ago"
    } else {
        $syncLbl.Text = "$([math]::Round($elapsed.TotalHours, 1)) h ago"
    }
    $up = (Get-Date) - $script:appStartTime
    $uptimeLbl.Text = "{0:D2}:{1:D2}:{2:D2}" -f [int]$up.TotalHours, $up.Minutes, $up.Seconds
    if ($script:totalAttempts -gt 0) {
        $errPct = [math]::Round(($script:failedAttempts / $script:totalAttempts) * 100, 1)
        $errorLbl.Text = "$errPct%"
    }
}.GetNewClosure())
$metricsTimer.Start()

# Section label
$sectionLbl = New-Object System.Windows.Forms.Label
$sectionLbl.Text = "PIPELINE STAGES"
$sectionLbl.Location = New-Object System.Drawing.Point(24, 178)
$sectionLbl.Size = New-Object System.Drawing.Size(400, 18)
$sectionLbl.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$sectionLbl.ForeColor = $colTextSec
$sectionLbl.BackColor = $colBgCard
$card.Controls.Add($sectionLbl)

# ===== Stage cards =====
$stages = @(
    @{ Title="AutoCAD";    Title2="processing"; File="test_autocad.txt";  Logo="autocad.png";  Glyph=[char]0x25B2; Status="Ready";  StatusBg=$colSuccessBg; StatusText=$colSuccessText; IconBg=[System.Drawing.Color]::FromArgb(252,235,235); IconColor=[System.Drawing.Color]::FromArgb(163,45,45);  Active=$false },
    @{ Title="Vault PDM";  Title2="sync";       File="test_pdm.txt";      Logo="vault.png";    Glyph=[char]0x25C9; Status="Ready";  StatusBg=$colSuccessBg; StatusText=$colSuccessText; IconBg=[System.Drawing.Color]::FromArgb(230,241,251); IconColor=[System.Drawing.Color]::FromArgb(12,68,124);  Active=$false },
    @{ Title="Excel data"; Title2="processing"; File="test_excel.txt";    Logo="excel.png";    Glyph=[char]0x25A6; Status="Ready";  StatusBg=$colSuccessBg; StatusText=$colSuccessText; IconBg=[System.Drawing.Color]::FromArgb(234,243,222); IconColor=[System.Drawing.Color]::FromArgb(39,80,10);   Active=$false },
    @{ Title="Plant";      Title2="Simulation"; File="test_plantsim.txt"; Logo="plantsim.png"; Glyph=[char]0x25C8; Status="Active"; StatusBg=$colInfoBg;    StatusText=$colInfoText;    IconBg=[System.Drawing.Color]::FromArgb(225,245,238); IconColor=[System.Drawing.Color]::FromArgb(8,80,65);    Active=$true  },
    @{ Title="Report";     Title2="generation"; File="test_report.txt";   Logo="report.png";   Glyph=[char]0x25A4; Status="Idle";   StatusBg=$colMutedBg;   StatusText=$colMutedText;   IconBg=[System.Drawing.Color]::FromArgb(241,239,232); IconColor=[System.Drawing.Color]::FromArgb(44,44,42);   Active=$false }
)

$stageY = 208
$stageW = 210
$stageH = 220
$stageGap = 18
$stageStartX = 24

for ($i = 0; $i -lt $stages.Count; $i++) {
    $s = $stages[$i]
    $x = $stageStartX + $i * ($stageW + $stageGap)

    $stageCard = New-Object System.Windows.Forms.Panel
    $stageCard.Location = New-Object System.Drawing.Point($x, $stageY)
    $stageCard.Size = New-Object System.Drawing.Size($stageW, $stageH)
    $stageCard.BackColor = $colBgCard
    $stageCard.Cursor = [System.Windows.Forms.Cursors]::Hand
    $stageCard.Tag = $s.File

    # Smooth hover scale animation for the whole card
    $cardBaseX = $x
    $cardBaseY = $stageY
    $cardBaseW = $stageW
    $cardBaseH = $stageH
    $cardMaxW = $stageW + 16
    $cardMaxH = $stageH + 16
    $cardStep = 2

    $cardTimer = New-Object System.Windows.Forms.Timer
    $cardTimer.Interval = 12

    $stageCard | Add-Member -NotePropertyName Hovering -NotePropertyValue $false -Force
    $stageCard | Add-Member -NotePropertyName CurW -NotePropertyValue $cardBaseW -Force
    $stageCard | Add-Member -NotePropertyName CurH -NotePropertyValue $cardBaseH -Force
    $stageCard | Add-Member -NotePropertyName BaseX -NotePropertyValue $cardBaseX -Force
    $stageCard | Add-Member -NotePropertyName BaseY -NotePropertyValue $cardBaseY -Force
    $stageCard | Add-Member -NotePropertyName MinW -NotePropertyValue $cardBaseW -Force
    $stageCard | Add-Member -NotePropertyName MinH -NotePropertyValue $cardBaseH -Force
    $stageCard | Add-Member -NotePropertyName MaxW -NotePropertyValue $cardMaxW -Force
    $stageCard | Add-Member -NotePropertyName MaxH -NotePropertyValue $cardMaxH -Force
    $stageCard | Add-Member -NotePropertyName Step -NotePropertyValue $cardStep -Force
    $stageCard | Add-Member -NotePropertyName AnimTimer -NotePropertyValue $cardTimer -Force

    $cardTimer.Add_Tick({
        param($sender, $e)
        $c = $sender.Tag
        $targetW = if ($c.Hovering) { $c.MaxW } else { $c.MinW }
        $targetH = if ($c.Hovering) { $c.MaxH } else { $c.MinH }
        $curW = $c.CurW
        $curH = $c.CurH
        if ($curW -eq $targetW -and $curH -eq $targetH) {
            $sender.Stop()
            return
        }
        if ($curW -lt $targetW) { $curW = [Math]::Min($targetW, $curW + $c.Step) }
        elseif ($curW -gt $targetW) { $curW = [Math]::Max($targetW, $curW - $c.Step) }
        if ($curH -lt $targetH) { $curH = [Math]::Min($targetH, $curH + $c.Step) }
        elseif ($curH -gt $targetH) { $curH = [Math]::Max($targetH, $curH - $c.Step) }
        $c.CurW = $curW
        $c.CurH = $curH
        $offX = [int](($curW - $c.MinW) / 2)
        $offY = [int](($curH - $c.MinH) / 2)
        $c.Size = New-Object System.Drawing.Size($curW, $curH)
        $c.Location = New-Object System.Drawing.Point(($c.BaseX - $offX), ($c.BaseY - $offY))
    })
    $cardTimer.Tag = $stageCard

    $hoverEnter = {
        param($sender, $e)
        $card = $sender
        while ($card -and -not ($card.PSObject.Properties.Name -contains 'AnimTimer')) { $card = $card.Parent }
        if ($card) {
            $card.Hovering = $true
            $card.BringToFront()
            $card.AnimTimer.Start()
        }
    }
    $hoverLeave = {
        param($sender, $e)
        $card = $sender
        while ($card -and -not ($card.PSObject.Properties.Name -contains 'AnimTimer')) { $card = $card.Parent }
        if ($card) {
            # Check if mouse is still inside the card bounds
            $pt = $card.PointToClient([System.Windows.Forms.Cursor]::Position)
            if ($pt.X -lt 0 -or $pt.Y -lt 0 -or $pt.X -ge $card.Width -or $pt.Y -ge $card.Height) {
                $card.Hovering = $false
                $card.AnimTimer.Start()
            }
        }
    }
    $stageCard.Add_MouseEnter($hoverEnter)
    $stageCard.Add_MouseLeave($hoverLeave)

    $isActive = $s.Active
    $stageCard.Add_Paint({
        param($sender, $e)
        $g = $e.Graphics
        $g.SmoothingMode = "AntiAlias"
        $w = $sender.Width - 1
        $h = $sender.Height - 1
        $col = if ($sender.Tag -eq "test_plantsim.txt") { $colBorderInfo } else { $colBorder }
        $bw = if ($sender.Tag -eq "test_plantsim.txt") { 2 } else { 1 }
        $pen = New-Object System.Drawing.Pen $col, $bw
        $g.DrawRectangle($pen, 0, 0, $w, $h)
    }.GetNewClosure())

    # Logo as PictureBox (loads file from logos/ or falls back to colored glyph)
    $pic = New-Object System.Windows.Forms.PictureBox
    $pic.Size = New-Object System.Drawing.Size(64, 64)
    $pic.Location = New-Object System.Drawing.Point((($stageW - 64) / 2), 22)
    $pic.SizeMode = "Zoom"
    $pic.BackColor = $s.IconBg
    $pic.Image = Get-LogoImage $s.Logo $s.Glyph $s.IconBg $s.IconColor
    $pic.Cursor = [System.Windows.Forms.Cursors]::Hand
    $stageCard.Controls.Add($pic)

    $title = New-Object System.Windows.Forms.Label
    $title.Text = "$($s.Title)`n$($s.Title2)"
    $title.Location = New-Object System.Drawing.Point(0, 100)
    $title.Size = New-Object System.Drawing.Size($stageW, 40)
    $title.TextAlign = "MiddleCenter"
    $title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
    $title.ForeColor = $colTextPrimary
    $title.BackColor = $colBgCard
    $stageCard.Controls.Add($title)

    $pill = New-Object System.Windows.Forms.Label
    $pill.Text = "  $($s.Status)  "
    $pill.AutoSize = $true
    $pill.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
    $pill.ForeColor = $s.StatusText
    $pill.BackColor = $s.StatusBg
    $pill.TextAlign = "MiddleCenter"
    $pill.Padding = New-Object System.Windows.Forms.Padding(2, 3, 2, 3)
    $stageCard.Controls.Add($pill)
    $pill.Location = New-Object System.Drawing.Point((($stageW - $pill.PreferredWidth) / 2), 158)

    $clickHandler = {
        param($sender, $e)
        $ctrl = $sender
        while ($ctrl -and -not $ctrl.Tag) { $ctrl = $ctrl.Parent }
        if ($ctrl -and $ctrl.Tag) {
            $target = Join-Path $scriptDir $ctrl.Tag
            $script:totalAttempts++
            try {
                "test" | Out-File -FilePath $target -Encoding UTF8
                $script:lastSyncTime = Get-Date
                [System.Windows.Forms.MessageBox]::Show("Created: $target")
            } catch {
                $script:failedAttempts++
                [System.Windows.Forms.MessageBox]::Show("Error: $_")
            }
        }
    }
    $stageCard.Add_Click($clickHandler)
    $pic.Add_Click($clickHandler)
    $title.Add_Click($clickHandler)
    $pill.Add_Click($clickHandler)

    $pic.Add_MouseEnter($hoverEnter)
    $title.Add_MouseEnter($hoverEnter)
    $pill.Add_MouseEnter($hoverEnter)
    $pic.Add_MouseLeave($hoverLeave)
    $title.Add_MouseLeave($hoverLeave)
    $pill.Add_MouseLeave($hoverLeave)

    $card.Controls.Add($stageCard)
}

# ===== Footer =====
$divider2 = New-Object System.Windows.Forms.Panel
$divider2.Location = New-Object System.Drawing.Point(24, 458)
$divider2.Size = New-Object System.Drawing.Size(1112, 1)
$divider2.BackColor = $colBorder
$card.Controls.Add($divider2)

$footLbl = New-Object System.Windows.Forms.Label
$footLbl.Text = "Last full pipeline run  -  today, 14:32"
$footLbl.Location = New-Object System.Drawing.Point(24, 478)
$footLbl.Size = New-Object System.Drawing.Size(600, 22)
$footLbl.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$footLbl.ForeColor = $colTextTert
$footLbl.BackColor = $colBgCard
$card.Controls.Add($footLbl)

$runBtn = New-Object System.Windows.Forms.Button
$runBtn.Text = "Run full pipeline"
$runBtn.Location = New-Object System.Drawing.Point(980, 472)
$runBtn.Size = New-Object System.Drawing.Size(156, 34)
$runBtn.BackColor = $colBgCard
$runBtn.ForeColor = $colTextPrimary
$runBtn.FlatStyle = "Flat"
$runBtn.FlatAppearance.BorderColor = $colBorder
$runBtn.FlatAppearance.BorderSize = 1
$runBtn.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$runBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$runBtn.Add_Click({
    $target = Join-Path $scriptDir "test_full_pipeline.txt"
    $script:totalAttempts++
    try {
        "test" | Out-File -FilePath $target -Encoding UTF8
        $script:lastSyncTime = Get-Date
        [System.Windows.Forms.MessageBox]::Show("Created: $target")
    } catch {
        $script:failedAttempts++
        [System.Windows.Forms.MessageBox]::Show("Error: $_")
    }
})
$card.Controls.Add($runBtn)

[void]$form.ShowDialog()
