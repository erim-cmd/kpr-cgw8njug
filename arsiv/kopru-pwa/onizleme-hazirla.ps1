# KPR — Önizleme paketi hazırlayıcı
# Projeyi, klasörsüz (tüm dosyalar tek düzeyde) bir önizleme sürümüne çevirir.
# Neden: GitHub'ın tarayıcıdan yükleme ekranı klasör yapısını korumuyor; düz yapı hiçbir yükleme yönteminde bozulmaz.
# Kullanım: powershell -ExecutionPolicy Bypass -File onizleme-hazirla.ps1
param(
  [string]$Src = $PSScriptRoot,
  [string]$Dst = (Join-Path (Split-Path $PSScriptRoot -Parent) "kpr-onizleme")
)
$ErrorActionPreference = "Stop"
$utf8 = New-Object Text.UTF8Encoding $false

if (Test-Path $Dst) { Remove-Item -Recurse -Force $Dst }
New-Item -ItemType Directory $Dst | Out-Null

# 1) Dosyaları düz olarak kopyala (app/index.html -> app.html)
$map = [ordered]@{ "app\index.html" = "app.html" }
foreach ($f in "index.html", "gizlilik.html", "manifest.webmanifest", "sw.js", "robots.txt") { $map[$f] = $f }
foreach ($dir in "css", "js", "js\views", "icons") {
  Get-ChildItem (Join-Path $Src $dir) -File | ForEach-Object { $map["$dir\$($_.Name)"] = $_.Name }
}
$seen = @{}
foreach ($k in $map.Keys) {
  $name = $map[$k]
  if ($seen.ContainsKey($name)) { throw "Ad çakışması: $name ($k ve $($seen[$name]))" }
  $seen[$name] = $k
  Copy-Item (Join-Path $Src $k) (Join-Path $Dst $name)
}

# 2) Yolları düz yapıya göre yeniden yaz
Get-ChildItem $Dst -File | Where-Object { $_.Extension -in ".html", ".js", ".css", ".webmanifest" } | ForEach-Object {
  $c = [IO.File]::ReadAllText($_.FullName)
  $c = $c.Replace("/js/views/", "/").Replace("/css/", "/").Replace("/js/", "/").Replace("/icons/", "/")
  $c = $c.Replace('"/app/', '"/app.html').Replace("'/app/", "'/app.html")
  $c = $c.Replace('"/gizlilik"', '"/gizlilik.html"')  # GitHub Pages'te yönlendirme kuralı yok
  $c = $c.Replace('from "./views/', 'from "./').Replace('from "../', 'from "./')

  # 3) Tüm yolları göreli yap: paket sitenin kökünde de, bir alt klasörde de (ör. /kpr-onizleme/) çalışsın
  $file = $_  # switch içinde $_ uzantıyı gösterir, dosyayı değil
  switch ($file.Extension) {
    ".webmanifest" { $c = $c -replace '": "/', '": "./' }
    ".js" {
      if ($file.Name -eq "sw.js") {
        $c = $c -replace '(?m)^(\s+)"/', '$1"./'
        $c = $c.Replace('url.pathname.startsWith("/app") ? "/app.html" : "/"', 'url.pathname.endsWith("/app.html") ? "./app.html" : "./"')
      } else {
        $c = $c.Replace('register("/sw.js", { scope: "/" })', 'register("sw.js", { scope: "./" })')
      }
    }
  }
  $c = $c.Replace('href="/"', 'href="./"').Replace('href="/', 'href="').Replace('src="/', 'src="').Replace('content="/', 'content="')
  [IO.File]::WriteAllText($_.FullName, $c, $utf8)
}

# 4) Kontrol: klasör yolu ya da köke bağlı (/ ile başlayan) yerel yol kalmamalı
$bad = Select-String -Path (Join-Path $Dst "*") -Pattern '"/(css|js|icons|app)/', "'/(css|js|icons|app)/", 'from "\.\./', 'from "\./views/', '"/gizlilik"', '(href|src|content)="/[^/]', 'register\("/', '": "/[^/]' -SimpleMatch:$false
if ($bad) { $bad | ForEach-Object { Write-Host "KALAN YOL: $($_.Filename):$($_.LineNumber) $($_.Line.Trim())" }; throw "Önizleme paketinde düzeltilmemiş yol var." }
$swLeft = Select-String -Path (Join-Path $Dst "sw.js") -Pattern 'startsWith\("/app"\)|^\s+"/[a-z]'
if ($swLeft) { throw "sw.js göreli yapılamadı: $($swLeft.Line)" }

$n = (Get-ChildItem $Dst -File).Count
Write-Host "Hazır: $Dst ($n dosya, klasör yok)"
