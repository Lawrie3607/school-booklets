Write-Output '--- TCP listener check for port 3002'
Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,State,OwningProcess | Format-List
Write-Output '--- HTTP GET to proxy'
try {
  $r = Invoke-WebRequest -Uri 'http://localhost:3002/rest/v1/users?select=id' -Method GET -UseBasicParsing -ErrorAction Stop
  Write-Output 'Status:'
  $r.StatusCode
} catch {
  Write-Output 'Request error:'
  Write-Output $_.Exception.Message
}
