param([string]$NodePath = 'node')
$ErrorActionPreference = 'Stop'
$fixture = @{ pages = @(); payloads = @{} }
foreach ($sourceUrl in @('https://www.douyu.com/91124', 'https://www.douyu.com/1369397')) {
    $html = (Invoke-WebRequest -Uri $sourceUrl -TimeoutSec 20).Content
    $decodedParts = @()
    foreach ($match in [regex]::Matches($html, 'self\.__next_f\.push\((\[.*?\])\)</script>')) {
        try { $part = $match.Groups[1].Value | ConvertFrom-Json; $decodedParts += [string]$part[1] } catch {}
    }
    $decoded = $decodedParts -join "`n"
    $configUrl = [regex]::Match($decoded, '(?:https?:)?//butterfly\.douyucdn\.cn/api/page/loadPage\?[^\s"''<>\\]+').Value
    $topic = [regex]::Match($decoded, 'window\.zhtName\s*=\s*[''"]([\w-]+)[''"]').Groups[1].Value
    if (!$configUrl -or !$topic) { throw "活动页面结构变化：$sourceUrl" }
    if ($configUrl.StartsWith('//')) { $configUrl = 'https:' + $configUrl }
    $pageId = [regex]::Match($configUrl, '[?&]pageId=(\d+)').Groups[1].Value
    $ver = [regex]::Match($configUrl, '[?&]ver=([^&]+)').Groups[1].Value
    $configUrl += '&view=0&topicName=' + $topic + '&viewport=3'
    $config = (Invoke-WebRequest -Uri $configUrl -TimeoutSec 20).Content
    $fixture.pages += @{ url = $sourceUrl; html = $html; config = $config; topic = $topic; pageId = $pageId; ver = $ver }
}
foreach ($url in @('https://www.douyu.com/betard/9999', 'https://www.huya.com/660000', 'https://api.live.bilibili.com/room/v1/Room/get_info?room_id=6', 'https://api.live.bilibili.com/live_user/v1/UserInfo/get_anchor_in_room?roomid=6')) {
    $fixture.payloads[$url] = (Invoke-WebRequest -Uri $url -TimeoutSec 20).Content
}
$fixture | ConvertTo-Json -Depth 8 -Compress | & $NodePath (Join-Path $PSScriptRoot 'temporary-live-check.cjs')
if ($LASTEXITCODE -ne 0) { throw '实际页面快照回归检查未通过。' }
