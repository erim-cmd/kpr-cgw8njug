param([int]$Port = 8080, [string]$Root = $PSScriptRoot, [switch]$Strict)
# Netlify'ı taklit eden basit yerel sunucu: klasör index'i, /gizlilik yönlendirmesi, doğru MIME türleri.
# -Strict: GitHub Pages gibi davranır (/gizlilik yönlendirmesi yok) — önizleme paketini test etmek için.
$Root = (Resolve-Path $Root).Path
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8'; '.json'='application/json'; '.webmanifest'='application/manifest+json'; '.png'='image/png'; '.svg'='image/svg+xml'; '.ico'='image/x-icon' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Serving $Root on http://localhost:$Port"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
  if (-not $Strict -and $path -eq '/gizlilik') { $path = '/gizlilik.html' }
  $file = Join-Path $Root $path.TrimStart('/')
  if ((Test-Path $file -PathType Container) -and -not $path.EndsWith('/')) {
    $ctx.Response.StatusCode = 301; $ctx.Response.RedirectLocation = "$path/"
  } else {
    if ($path.EndsWith('/')) { $file = Join-Path $file 'index.html' }
    if (Test-Path $file -PathType Leaf) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file)
      $ctx.Response.ContentType = $(if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' })
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
  }
  Write-Host "$($ctx.Response.StatusCode) $($ctx.Request.HttpMethod) $path"
  $ctx.Response.Close()
}
