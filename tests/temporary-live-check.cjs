// Reads public HTTP snapshots from the PowerShell companion script; no credentials.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict')
const path = require('node:path')
const fixture = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
const calls = []
async function fetcher(address) {
  calls.push(address)
  const url = new URL(address)
  let body = fixture.payloads[address]
  if (url.hostname === 'butterfly.douyucdn.cn') {
    const activity = fixture.pages.find((page) => page.pageId === url.searchParams.get('pageId'))
    assert.ok(activity, 'Unexpected activity pageId')
    assert.equal(url.searchParams.get('topicName'), activity.topic)
    assert.equal(url.searchParams.get('ver'), activity.ver)
    body = activity.config
  }
  if (body === undefined) body = fixture.pages.find((page) => page.url === address)?.html
  assert.notEqual(body, undefined, 'Unexpected request: ' + address)
  return { ok: true, status: 200, url: address, text: async () => body }
}
const context = vm.createContext({ URL, AbortSignal, fetch: fetcher })
vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/room-data.js'),'utf8'), context)
vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/temporary-list.js'),'utf8'), context)
;(async () => {
  const results = []
  for (const page of fixture.pages) {
    const parsed = await context.YuboTemporary.preview(page.url, 'activity')
    const expected = [...new Set(JSON.parse(page.config).data.roomIds.map(String))]
    assert.deepEqual(Array.from(parsed.rooms, (room) => room.roomKey), expected)
    assert.equal(parsed.methods[0].method, 'activity-config')
    results.push({ activity: page.url, roomCount: parsed.rooms.length, exactConfigMatch: true })
  }
  for (const url of ['https://www.douyu.com/9999','https://www.huya.com/660000','https://live.bilibili.com/6']) {
    const result = await context.YuboTemporary.roomInfo(context.YuboTemporary.roomLink(url))
    assert.ok(result.name)
    assert.equal(typeof result.live, 'boolean')
    results.push({ room: url, name: result.name, live: result.live })
  }
  console.log(JSON.stringify({ verifiedAt: new Date().toISOString(), results, requests: calls.length }, null, 2))
})().catch((error) => { console.error(error); process.exitCode = 1 })
