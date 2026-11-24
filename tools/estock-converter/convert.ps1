param(
    [string]$BakPath = '',
    [string]$OutDir  = '',
    [string]$Server  = '.\SQLEXPRESS',
    [string]$SqlUser = '',
    [string]$SqlPass = '',
    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'PharmacyPOS - eStock Converter'

$script:LogFile = $null
function Add-Log($m) {
    if ($script:LogFile) {
        try { Add-Content -LiteralPath $script:LogFile -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) -Encoding UTF8 } catch {}
    }
}
function Write-Step($m) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $m" -ForegroundColor Cyan; Add-Log $m }
function Write-Ok($m)   { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $m" -ForegroundColor Green; Add-Log "OK: $m" }
function Write-Err($m)  { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $m" -ForegroundColor Red; Add-Log "ERROR: $m" }

function Pause-Exit($code = 1) {
    if (-not $NoPause) {
        Write-Host ""
        Read-Host "اضغط Enter للإغلاق"
    }
    exit $code
}

function JStr([string]$s) {
    if ($null -eq $s) { return '""' }
    $s = $s.Replace('\', '\\').Replace('"', '\"')
    $s = $s -replace "[\r\n\t]", ' '
    return '"' + $s + '"'
}
function JNum($v) {
    if ($null -eq $v -or $v -eq '') { return '0' }
    $d = [double]$v
    if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) { return '0' }
    return ([math]::Round($d, 4)).ToString([System.Globalization.CultureInfo]::InvariantCulture)
}
function N($v, $d) { if ($null -eq $v -or $v -eq '') { return $d } return $v }
function S($v, $d) { if ($null -eq $v -or ([string]$v).Trim() -eq '') { return $d } return [string]$v }

function UnitType($pdAr, $pdEn, $nameAr, $nameEn) {
    $s = ("$pdAr $pdEn $nameAr $nameEn").ToLower()
    if ($s -match 'قطر|drop') { return 'droppers' }
    if ($s -match 'بخاخ|spray|inhal') { return 'sprays' }
    if ($s -match 'امبول|أمبول|ampoul|ampol|inject') { return 'ampoules' }
    if ($s -match 'فيال|vial') { return 'vials' }
    if ($s -match 'لبوس|اقماع|أقماع|suppos') { return 'suppositories' }
    if ($s -match 'مرهم|كريم|جل|cream|ointment|gel|lotion|فازلين') { return 'tubes' }
    if ($s -match 'شراب|معلق|سيرب|syrup|susp|solution|محلول|غسول|شامبو|sachet|اكياس|أكياس|كيس|فوار|effer') { return 'sachets' }
    if ($s -match 'كبسول|caps') { return 'capsules' }
    if ($s -match 'اقراص|أقراص|tab|قرص') { return 'tablets' }
    return 'units'
}

Write-Host "==============================================================" -ForegroundColor DarkCyan
Write-Host "   PharmacyPOS - محوّل نسخ eStock الاحتياطية (SQL Server)" -ForegroundColor White
Write-Host "==============================================================" -ForegroundColor DarkCyan

# ---------------------------------------------------------------- 1. Choose backup file
if (-not $BakPath) {
    Add-Type -AssemblyName System.Windows.Forms
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Title = 'اختر ملف النسخة الاحتياطية لبرنامج eStock'
    $dlg.Filter = 'eStock Backup (*.bak)|*.bak|All files (*.*)|*.*'
    if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { Write-Err 'لم يتم اختيار ملف.'; Pause-Exit 1 }
    $BakPath = $dlg.FileName
}
if (-not (Test-Path -LiteralPath $BakPath)) { Write-Err "الملف غير موجود: $BakPath"; Pause-Exit 1 }
$BakPath = (Resolve-Path -LiteralPath $BakPath).Path
Write-Step "ملف النسخة: $BakPath"

$bakSizeMb = [math]::Round((Get-Item -LiteralPath $BakPath).Length / 1MB, 1)
Write-Step "الحجم: $bakSizeMb MB"

# ---------------------------------------------------------------- 2. Output folder
if (-not $OutDir) {
    $stamp = Get-Date -Format 'yyyy-MM-dd'
    $OutDir = Join-Path (Split-Path -Parent $BakPath) "eStock-Export-$stamp"
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$OutFile = Join-Path $OutDir 'eStock-Import.json'
$script:LogFile = Join-Path $OutDir 'convert-log.txt'
Write-Step "مجلد الإخراج: $OutDir"

# ---------------------------------------------------------------- 3. Find SQL Server
$svc = Get-Service -Name 'MSSQL$SQLEXPRESS' -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Err 'لم يتم العثور على SQL Server Express (المثيل SQLEXPRESS) على هذا الجهاز.'
    Write-Host 'ثبّت SQL Server 2022 Express ثم شغّل الأداة مرة أخرى.' -ForegroundColor Yellow
    Pause-Exit 3
}
if ($svc.Status -ne 'Running') {
    Write-Step 'تشغيل خدمة SQL Server Express...'
    Start-Service -Name 'MSSQL$SQLEXPRESS'
    Start-Sleep -Seconds 3
}

# ---------------------------------------------------------------- 4. Working dir + restore
$workDir = Join-Path $env:ProgramData 'eStockConverter'
New-Item -ItemType Directory -Path $workDir -Force | Out-Null
$workBak = Join-Path $workDir 'source.bak'
Write-Step 'نسخ ملف النسخة إلى مجلد العمل...'
Copy-Item -LiteralPath $BakPath -Destination $workBak -Force
try { icacls $workBak /grant '"NT AUTHORITY\NETWORK SERVICE":(R)' | Out-Null } catch {}
try { icacls $workDir /grant '"NT AUTHORITY\NETWORK SERVICE":(OI)(CI)M' | Out-Null } catch {}

Add-Type -AssemblyName System.Data
$dbName = 'estock_convert_' + (Get-Random -Minimum 10000 -Maximum 99999)

if ($SqlUser) {
    $masterCs = "Server=$Server;Database=master;User Id=$SqlUser;Password=$SqlPass;TrustServerCertificate=True;Connect Timeout=60;"
} else {
    $masterCs = "Server=$Server;Database=master;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=60;"
}

function New-Conn($cs) {
    $c = New-Object System.Data.SqlClient.SqlConnection $cs
    $c.Open()
    return $c
}

function Exec($conn, $sql) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $sql
    $cmd.CommandTimeout = 3600
    [void]$cmd.ExecuteNonQuery()
}

try {
    $conn = New-Conn $masterCs
} catch {
    Write-Err "تعذّر الاتصال بـ SQL Server: $($_.Exception.Message)"
    Write-Host 'شغّل الأداة كمسؤول (Run as administrator).' -ForegroundColor Yellow
    Pause-Exit 4
}

try {
    Write-Step 'قراءة بيانات ملف النسخة (Logical file names)...'
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "RESTORE FILELISTONLY FROM DISK = N'$workBak'"
    $cmd.CommandTimeout = 1800
    $r = $cmd.ExecuteReader()
    $logical = @()
    while ($r.Read()) { $logical += [string]$r['LogicalName'] }
    $r.Close()
    if ($logical.Count -eq 0) { throw 'ملف النسخة لا يحتوي على قاعدة بيانات صالحة.' }
    Write-Step ("الملفات المنطقية: " + ($logical -join ', '))

    $moves = @()
    $i = 0
    foreach ($lg in $logical) {
        $isLog = $i -gt 0
        $ext = if ($isLog) { '.ldf' } else { '.mdf' }
        $dest = Join-Path $workDir ("{0}_{1}{2}" -f $dbName, $i, $ext)
        $moves += "MOVE N'$lg' TO N'$dest'"
        $i++
    }

    Write-Step "استعادة قاعدة البيانات (قد تأخذ دقيقة أو أكثر)..."
    Exec $conn ("IF DB_ID('$dbName') IS NOT NULL BEGIN ALTER DATABASE [$dbName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$dbName]; END")
    Exec $conn ("RESTORE DATABASE [$dbName] FROM DISK = N'$workBak' WITH " + ($moves -join ', ') + ", REPLACE, RECOVERY")
    Write-Ok 'تمت الاستعادة.'

    $conn.Close()
    if ($SqlUser) {
        $dbCs = "Server=$Server;Database=$dbName;User Id=$SqlUser;Password=$SqlPass;TrustServerCertificate=True;Connect Timeout=60;"
    } else {
        $dbCs = "Server=$Server;Database=$dbName;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=60;"
    }
    $db = New-Conn $dbCs

    function Read-All($sql) {
        $cmd = $db.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 3600
        $r = $cmd.ExecuteReader()
        $list = New-Object System.Collections.ArrayList
        $names = @(); for ($k=0; $k -lt $r.FieldCount; $k++) { $names += $r.GetName($k) }
        while ($r.Read()) {
            $o = @{}
            for ($k=0; $k -lt $r.FieldCount; $k++) {
                $o[$names[$k]] = if ($r.IsDBNull($k)) { $null } else { $r.GetValue($k) }
            }
            [void]$list.Add($o)
        }
        $r.Close()
        return ,$list
    }

    function Has-Table($name) {
        $res = Read-All "SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '$name'"
        return ([int]$res[0]['c'] -gt 0)
    }

    if (-not (Has-Table 'Products')) {
        throw 'هذا الملف لا يبدو نسخة eStock (جدول Products غير موجود).'
    }

    Write-Step 'قراءة الأصناف...'
    $products = Read-All @"
SELECT p.product_id, p.product_name_ar, p.product_name_en, p.product_scientific_name,
       p.product_int_code, p.product_unit1_2, p.product_unit1_3,
       p.sell_price, p.unit2_sell_price, p.unit3_sell_price,
       g.group_name_ar, g.group_name_en, d.pd_name_ar, d.pd_name_en
FROM dbo.Products p
LEFT JOIN dbo.Product_groups g ON g.group_id = p.group_id
LEFT JOIN dbo.Product_description d ON d.pd_id = p.pd_id
WHERE p.deleted <> 'Y'
ORDER BY p.product_id
"@

    Write-Step 'قراءة الأرصدة والدفعات...'
    $stock = @{}
    foreach ($row in (Read-All "SELECT product_id, SUM(amount) AS total FROM dbo.Product_Amount GROUP BY product_id HAVING SUM(amount) > 0")) {
        $stock[[int]$row['product_id']] = [double]$row['total']
    }
    $expiry = @{}
    foreach ($row in (Read-All "SELECT product_id, MIN(exp_date) AS m FROM dbo.Product_Amount WHERE amount > 0 AND exp_date IS NOT NULL GROUP BY product_id")) {
        $expiry[[int]$row['product_id']] = $row['m']
    }
    $vendorOf = @{}
    foreach ($row in (Read-All "SELECT product_id, vendor_id FROM dbo.Product_Amount WHERE amount > 0 ORDER BY product_id, Product_update_date DESC")) {
        $it = [int]$row['product_id']
        if (-not $vendorOf.ContainsKey($it)) { $vendorOf[$it] = [int]$row['vendor_id'] }
    }

    Write-Step 'قراءة الموردين والعملاء...'
    $vendors = Read-All "SELECT vendor_id, vendor_name_ar, vendor_name_en, tel, mobile, address, vendor_current_money FROM dbo.Vendor WHERE deleted <> 'Y' ORDER BY vendor_id"
    $customers = Read-All "SELECT customer_id, customer_name_ar, customer_name_en, mobile, tel, address, customer_current_money, customer_max_money FROM dbo.Customer WHERE deleted <> 'Y' ORDER BY customer_id"

    $vendorName = @{}
    foreach ($v in $vendors) { $vendorName[[int]$v['vendor_id']] = (S $v['vendor_name_ar'] (S $v['vendor_name_en'] '')) }

    Write-Step 'بناء ملف الأصناف...'
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('[')
    $count = 0
    foreach ($p in $products) {
        $prodId = [int]$p['product_id']
        $spbD = [math]::Max(1.0, [math]::Round([double](N $p['product_unit1_2'] 1)))
        $conv13 = [double](N $p['product_unit1_3'] 1)
        if ($spbD -gt 1000) { $spbD = 1 }
        if ($conv13 -gt 1000) { $conv13 = 1 }
        $spb = [int]$spbD
        if ($spb -le 1 -and $conv13 -le 1) { $ups = 1 }
        else { $ups = [int][math]::Max(1.0, [math]::Round($conv13 / [math]::Max(1.0, $spb))) }
        $pb = [double](N $p['sell_price'] 0)
        $ps = [double](N $p['unit2_sell_price'] 0)
        $pu = [double](N $p['unit3_sell_price'] 0)
        if ($ps -le 0 -and $spb -gt 1 -and $pb -gt 0) { $ps = $pb / $spb }
        if ($pu -le 0 -and $ps -gt 0) { $pu = $ps / [math]::Max(1.0, $ups) }
        if ($spb -eq 1 -and $ups -eq 1) { $ps = $pb; $pu = 0 }
        if ($ups -le 1) { $pu = 0 }

        $totalBoxes = if ($stock.ContainsKey($prodId)) { $stock[$prodId] } else { 0 }
        $bx = [int][math]::Floor($totalBoxes + 1e-9)
        $restUnits = [int][math]::Round((($totalBoxes - $bx) * $spb * $ups) + 1e-9)
        if ($restUnits -lt 0) { $restUnits = 0 }
        $st = [int][math]::Floor($restUnits / [math]::Max(1.0, $ups))
        $un = $restUnits - ($st * [math]::Max(1.0, $ups))
        if ($un -lt 0) { $un = 0 }

        $expStr = ''
        if ($expiry.ContainsKey($prodId) -and $expiry[$prodId]) {
            $expStr = ([datetime]$expiry[$prodId]).ToString('MM/yyyy', [System.Globalization.CultureInfo]::InvariantCulture)
        }
        $bc = ([string](S $p['product_int_code'] '')).Trim()
        $sup = ''
        if ($vendorOf.ContainsKey($prodId) -and $vendorName.ContainsKey($vendorOf[$prodId])) { $sup = [string]$vendorName[$vendorOf[$prodId]] }
        $ut = UnitType $p['pd_name_ar'] $p['pd_name_en'] $p['product_name_ar'] $p['product_name_en']

        if ($count -gt 0) { [void]$sb.Append(',') }
        [void]$sb.Append('{')
        [void]$sb.Append('"id":' + $prodId)
        [void]$sb.Append(',"ar":' + (JStr ([string]$p['product_name_ar'])))
        [void]$sb.Append(',"en":' + (JStr ([string]$p['product_name_en'])))
        [void]$sb.Append(',"sci":' + (JStr ([string]$p['product_scientific_name'])))
        [void]$sb.Append(',"bc":' + (JStr $bc))
        [void]$sb.Append(',"cat":' + (JStr ((S $p['group_name_ar'] (S $p['group_name_en'] '')))))
        [void]$sb.Append(',"spb":' + $spb)
        [void]$sb.Append(',"ups":' + $ups)
        [void]$sb.Append(',"pb":' + (JNum $pb))
        [void]$sb.Append(',"ps":' + (JNum $ps))
        [void]$sb.Append(',"pu":' + (JNum $pu))
        [void]$sb.Append(',"bx":' + $bx)
        [void]$sb.Append(',"st":' + $st)
        [void]$sb.Append(',"un":' + $un)
        [void]$sb.Append(',"exp":' + (JStr $expStr))
        [void]$sb.Append(',"sup":' + (JStr $sup))
        [void]$sb.Append(',"ut":' + (JStr $ut))
        [void]$sb.Append('}')
        $count++
    }
    [void]$sb.Append(']')
    $productsJson = $sb.ToString()

    Write-Step 'بناء ملف الدفعات...'
    $batches = Read-All "SELECT pa_id, product_id, amount, buy_price, exp_date FROM dbo.Product_Amount WHERE amount > 0 ORDER BY product_id, exp_date"
    $sb2 = New-Object System.Text.StringBuilder
    [void]$sb2.Append('[')
    $bi = 0
    foreach ($b in $batches) {
        if ($bi -gt 0) { [void]$sb2.Append(',') }
        $e = ''
        if ($b['exp_date']) { $e = ([datetime]$b['exp_date']).ToString('MM/yyyy', [System.Globalization.CultureInfo]::InvariantCulture) }
        [void]$sb2.Append('{')
        [void]$sb2.Append('"mid":' + [int]$b['product_id'])
        [void]$sb2.Append(',"qty":' + (JNum $b['amount']))
        [void]$sb2.Append(',"cost":' + (JNum $b['buy_price']))
        [void]$sb2.Append(',"exp":' + (JStr $e))
        [void]$sb2.Append(',"bn":' + (JStr ("ESTOCK-" + [int]$b['pa_id'])))
        [void]$sb2.Append('}')
        $bi++
    }
    [void]$sb2.Append(']')
    $batchesJson = $sb2.ToString()

    Write-Step 'بناء ملف الموردين...'
    $sb3 = New-Object System.Text.StringBuilder
    [void]$sb3.Append('[')
    $vi = 0
    foreach ($v in $vendors) {
        if ($vi -gt 0) { [void]$sb3.Append(',') }
        [void]$sb3.Append('{')
        [void]$sb3.Append('"id":' + [int]$v['vendor_id'])
        [void]$sb3.Append(',"name":' + (JStr ((S $v['vendor_name_ar'] (S $v['vendor_name_en'] '')))))
        [void]$sb3.Append(',"phone":' + (JStr ((S $v['mobile'] (S $v['tel'] '')))))
        [void]$sb3.Append(',"addr":' + (JStr ([string]$v['address'])))
        [void]$sb3.Append(',"bal":' + (JNum (N $v['vendor_current_money'] 0)))
        [void]$sb3.Append('}')
        $vi++
    }
    [void]$sb3.Append(']')
    $vendorsJson = $sb3.ToString()

    Write-Step 'بناء ملف العملاء...'
    $sb4 = New-Object System.Text.StringBuilder
    [void]$sb4.Append('[')
    $ci = 0
    foreach ($c in $customers) {
        if ($ci -gt 0) { [void]$sb4.Append(',') }
        [void]$sb4.Append('{')
        [void]$sb4.Append('"id":' + [int]$c['customer_id'])
        [void]$sb4.Append(',"name":' + (JStr ((S $c['customer_name_ar'] (S $c['customer_name_en'] '')))))
        [void]$sb4.Append(',"phone":' + (JStr ((S $c['mobile'] (S $c['tel'] '')))))
        [void]$sb4.Append(',"addr":' + (JStr ([string]$c['address'])))
        [void]$sb4.Append(',"limit":' + (JNum (N $c['customer_max_money'] 0)))
        [void]$sb4.Append(',"bal":' + (JNum (N $c['customer_current_money'] 0)))
        [void]$sb4.Append('}')
        $ci++
    }
    [void]$sb4.Append(']')
    $customersJson = $sb4.ToString()

    $db.Close()

    # ------------------------------------------------------------ write output
    Write-Step 'كتابة ملف الاستيراد...'
    $out = New-Object System.Text.StringBuilder
    [void]$out.Append('{')
    [void]$out.Append('"generator":"PharmacyPOS eStock Converter",')
    [void]$out.Append('"version":"1.0",')
    [void]$out.Append('"generatedAt":' + (JStr (Get-Date -Format 'o')) + ',')
    [void]$out.Append('"sourceDatabase":' + (JStr (Split-Path -Leaf $BakPath)) + ',')
    [void]$out.Append('"counts":{')
    [void]$out.Append('"products":' + $count + ',')
    [void]$out.Append('"batches":' + $bi + ',')
    [void]$out.Append('"vendors":' + $vi + ',')
    [void]$out.Append('"customers":' + $ci + '},')
    [void]$out.Append('"catalog":{')
    [void]$out.Append('"source":"eStock",')
    [void]$out.Append('"products":' + $productsJson + ',')
    [void]$out.Append('"batches":' + $batchesJson + ',')
    [void]$out.Append('"vendors":' + $vendorsJson + ',')
    [void]$out.Append('"customers":' + $customersJson)
    [void]$out.Append('}}')

    [System.IO.File]::WriteAllText($OutFile, $out.ToString(), (New-Object System.Text.UTF8Encoding($false)))
    $sizeMb = [math]::Round((Get-Item -LiteralPath $OutFile).Length / 1MB, 2)

    Write-Host ''
    Write-Ok '================ تم التحويل بنجاح ================'
    Write-Host ("  الأصناف     : {0}" -f $count) -ForegroundColor White
    Write-Host ("  الدفعات     : {0}" -f $bi) -ForegroundColor White
    Write-Host ("  الموردون    : {0}" -f $vi) -ForegroundColor White
    Write-Host ("  العملاء     : {0}" -f $ci) -ForegroundColor White
    Write-Host ("  الملف       : {0}" -f $OutFile) -ForegroundColor Yellow
    Write-Host ("  الحجم       : {0} MB" -f $sizeMb) -ForegroundColor White
    Write-Host '=================================================' -ForegroundColor DarkCyan
    Write-Host 'افتح PharmacyPOS > الإعدادات > النسخ الاحتياطي > استيراد كتالوج من برنامج آخر' -ForegroundColor Gray
    $exitCode = 0
} catch {
    Write-Err "فشل التحويل: $($_.Exception.Message)"
    $exitCode = 5
} finally {
    # ------------------------------------------------------------ cleanup
    try {
        if ($conn -and $conn.State -eq 'Open') { $conn.Close() }
        $c2 = New-Conn $masterCs
        Exec $c2 "IF DB_ID('$dbName') IS NOT NULL BEGIN ALTER DATABASE [$dbName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$dbName]; END"
        $c2.Close()
    } catch {}
    try { Remove-Item -LiteralPath $workBak -Force -ErrorAction SilentlyContinue } catch {}
    try {
        Get-ChildItem -Path $workDir -Filter "$dbName*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    } catch {}
}

Pause-Exit $exitCode
