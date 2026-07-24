$base = "C:\Users\shriy\.kiro\sessions\bca08b6168d680f2"
Get-ChildItem -Path $base -Recurse -Filter "*.js" |
  Where-Object { $_.FullName -notlike "*node_modules*" } |
  Select-Object FullName, LastWriteTime |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 40 |
  Format-List
