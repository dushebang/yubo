param([string]$NodePath = 'node')
$ErrorActionPreference = 'Stop'
$taskRoomHtml = (Invoke-WebRequest -Uri 'https://www.huya.com/660000' -TimeoutSec 20).Content
$taskFollowHtml = (Invoke-WebRequest -Uri 'https://www.huya.com/myfollow' -TimeoutSec 20).Content
$taskScriptMatch = [regex]::Match($taskFollowHtml, 'https://a\.msstatic\.com/huya/main3/app/subscribe-list_[a-zA-Z0-9]+\.js')
if (!$taskScriptMatch.Success) { throw '虎牙官网关注脚本地址变化，请重新检查。' }
$taskFollowScript = (Invoke-WebRequest -Uri $taskScriptMatch.Value -TimeoutSec 20).Content
$taskGuestResponse = (Invoke-WebRequest -Uri 'https://fw.huya.com/dispatch?do=subscribeList&uid=0' -TimeoutSec 20).Content
@{roomHtml=$taskRoomHtml;followScript=$taskFollowScript;scriptUrl=$taskScriptMatch.Value;guestResponse=$taskGuestResponse} | ConvertTo-Json -Compress | & $NodePath (Join-Path $PSScriptRoot 'huya-live-check.cjs')
if ($LASTEXITCODE -ne 0) { throw '虎牙公开数据核对失败。' }
