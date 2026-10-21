const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../static/temporary-list.js'), 'utf8')
function harness(options = {}) {
  const data = structuredClone(options.data || { favorite_streamers: ['dy_9999'], yubo_last_rooms: [{ id: 'dy_9999' }] })
  const writes = [], calls = []
  const fetcher = async (url, init) => {
    calls.push({ url, init })
    const body = await options.respond?.(new URL(url), init)
    if (body instanceof Error) throw body
    if (body === undefined) throw new Error('Unexpected URL: ' + url)
    return { ok: true, status: 200, url, text: async () => typeof body === 'string' ? body : JSON.stringify(body) }
  }
  const context = vm.createContext({ URL, AbortSignal, fetch: fetcher, crypto, chrome: { runtime: {} } })
  vm.runInContext(source, context)
  const module = context.YuboTemporary
  const area = {
    get: (key, callback) => queueMicrotask(() => callback({ [key]: structuredClone(data[key]) })),
    set: (values, callback) => { writes.push(structuredClone(values)); Object.assign(data, structuredClone(values)); queueMicrotask(callback) }
  }
  return { module, area, controller: module.createController(area, { fetch: fetcher }), data, writes, calls, context }
}
const roomPayload = (id, live = 1) => ({ room: { room_id: Number(id), nickname: '主播 '+id, show_status: live, videoLoop: 0, avatar: { big: 'https://example.com/avatar.png' }, room_name: '活动直播', second_lvl_name: '户外' } })
const loader = (topic = 'STLD', id = '59047') => `window.zhtName = '${topic}'; var webm_page_config = location.protocol + '//butterfly.douyucdn.cn/api/page/loadPage?name=pageData2&pageId=${id}&ver=abc';`

test('room URLs are canonical, deduplicated and restricted to supported room paths', () => {
  const { module } = harness()
  assert.equal(module.roomLink('http://www.douyu.com/9999?dyshid=tracking').url, 'https://www.douyu.com/9999')
  assert.equal(module.roomLink('https://live.bilibili.com/blanc/6').roomKey, '6')
  assert.equal(module.roomLink('https://www.huya.com/lpl').platform, 'huya')
  for (const url of ['https://www.douyu.com/search', 'https://www.douyu.com.evil.com/1', 'javascript:alert(1)', 'https://user:password@www.huya.com/1', 'https://127.0.0.1/1', 'https://www.huya.com:444/1', 'https://www.bilibili.com/video/6']) assert.equal(module.roomLink(url), null)
  assert.equal(module.directRooms('https://www.douyu.com/9999?a=1\nhttps://www.douyu.com/9999?a=2').length, 1)
})

test('Next.js-encoded activity loaders are decoded without trailing escaped quotes in the config URL', () => {
  const { module } = harness()
  const html = `<script>self.__next_f.push(${JSON.stringify([1, loader('ljqxt','59041')])})</script>`
  const url = new URL(module.activityRequest(html, 'https://www.douyu.com/1369397'))
  assert.equal(url.searchParams.get('topicName'), 'ljqxt')
  assert.equal(url.searchParams.get('pageId'), '59041')
  assert.equal(url.searchParams.get('ver'), 'abc')
  assert.equal(url.searchParams.get('viewport'), '3')
})

test('official activity config wins over navigation and unrelated recommendation links', async () => {
  const { controller, calls, writes } = harness({ respond: (url) => url.hostname === 'butterfly.douyucdn.cn'
    ? { code: 0, data: { roomIds: ['182102','3903192','182102'] } }
    : `<a href="https://www.douyu.com/9999">不相关推荐</a><script>${loader()}</script>` })
  const preview = await controller.preview('https://www.douyu.com/91124?dyshid=tracking', 'activity')
  assert.deepEqual(Array.from(preview.rooms, (r) => r.roomKey), ['182102','3903192'])
  assert.equal(writes.length, 0)
  assert.equal(calls.length, 2)
  assert.ok(calls.every((call) => call.init.credentials === 'omit' && call.init.signal))
})

test('generic activity pages explicitly warn about incomplete dynamic content', async () => {
  const { controller } = harness({ respond: () => '<a href="/660000"><strong>赛事直播</strong></a><a href="/search">搜索</a><script>globalThis.executed = true</script>' })
  const result = await controller.preview('https://www.huya.com/activity/example', 'activity')
  assert.equal(result.rooms.length, 1)
  assert.equal(result.rooms[0].name, '赛事直播')
  assert.match(result.warnings[0], /动态脚本或 iframe/)
})

test('empty, unsupported, blocked or malformed previews never write over the existing list', async () => {
  const { controller, writes, calls } = harness({ respond: () => '<html>请完成验证</html>' })
  await assert.rejects(controller.preview('https://localhost/secret', 'activity'))
  assert.equal(calls.length, 0)
  await assert.rejects(controller.preview('https://www.douyu.com/topic/test', 'activity'), /未提取/)
  await assert.rejects(controller.preview('', 'rooms'))
  assert.equal(writes.length, 0)
})

test('JSON/HTML pasted room links are accepted, capped, and never execute embedded code', async () => {
  const { controller, module, context } = harness()
  const result = await controller.preview('<script>globalThis.executed=true</script>["https:\\/\\/www.douyu.com\\/9999", "https://www.huya.com/lpl"]', 'rooms')
  assert.equal(result.rooms.length, 2)
  assert.equal(context.executed, undefined)
  assert.throws(() => module.directRooms(Array.from({ length: 301 }, (_, i) => 'https://www.douyu.com/'+(i+1)).join('\n')), /300/)
})

test('public Douyu status includes replay exclusion and does not use online popularity as live status', async () => {
  const options = { respond: () => ({ room: { ...roomPayload(9999).room, videoLoop: 1, online: 999999 } }) }
  const { module } = harness(options)
  const room = module.roomLink('https://www.douyu.com/9999')
  assert.equal((await module.roomInfo(room)).live, false)
  options.respond = () => roomPayload(9999, 2)
  assert.equal((await module.roomInfo(room)).live, false)
})

test('Huya assigned objects are parsed as JSON, including quoted braces, without eval', async () => {
  const { module, context } = harness({ respond: () => 'var TT_ROOM_DATA = {"state":"ON","profileRoom":660000,"introduction":"标题 } 与 \\\" 引号","isReplay":false};var TT_PROFILE_INFO = {"nick":"虎牙主播","avatar":"https://example.com/avatar"};globalThis.executed=true;' })
  const result = await module.roomInfo(module.roomLink('https://www.huya.com/lpl'))
  assert.equal(result.name, '虎牙主播')
  assert.equal(result.live, true)
  assert.equal(context.executed, undefined)
})

test('Bilibili replay is not live and missing avatar/profile does not hide a valid room status', async () => {
  const { module } = harness({ respond: (url) => url.pathname.includes('get_info') ? { code: 0, data: { room_id: 123, live_status: 2, title: '轮播' } } : new Error('profile unavailable') })
  const result = await module.roomInfo(module.roomLink('https://live.bilibili.com/6'))
  assert.equal(result.live, false)
  assert.equal(result.canonicalRoomId, '123')
})

test('a null live status is unknown, never silently coerced to offline', async () => {
  const { module } = harness({ respond: () => ({ code: 0, data: { room_id: 6, live_status: null } }) })
  await assert.rejects(module.roomInfo(module.roomLink('https://live.bilibili.com/6')), /状态不可读取/)
})

const create = async (h, name, ids) => {
  const candidate = await h.controller.preview(ids.map((id) => 'https://www.douyu.com/'+id).join('\n'), 'rooms')
  return (await h.controller.save({ name, candidate })).activities.at(-1)
}

test('multiple activities, rename and roster updates remain isolated from each other and official lists', async () => {
  const h = harness({ respond: (url) => roomPayload(url.pathname.split('/').at(-1)) })
  const a = await create(h, '活动 A', [1,2]), b = await create(h, '活动 B', [3])
  await h.controller.refresh(a.id, true)
  await h.controller.rename(a.id, '改名活动')
  const candidate = await h.controller.preview('https://www.douyu.com/2\nhttps://www.douyu.com/4', 'rooms')
  const value = await h.controller.save({ id: a.id, expectedRevision: a.revision, name: '改名活动', candidate })
  assert.deepEqual(Array.from(value.activities[0].rooms, (room) => room.roomKey), ['2','4'])
  assert.equal(value.activities[0].rooms[0].name, '主播 2')
  assert.equal(value.activities[0].name, '改名活动')
  assert.equal(value.activities[1].id, b.id)
  assert.equal(value.activities[1].rooms[0].roomKey, '3')
  await assert.rejects(h.controller.save({ id:a.id, expectedRevision:a.revision, name:'旧预览', candidate }), /重新预览/)
  await h.controller.remove(a.id)
  assert.equal((await h.controller.read()).activities[0].id, b.id)
  assert.deepEqual(h.data.favorite_streamers, ['dy_9999'])
  assert.deepEqual(h.data.yubo_last_rooms, [{ id:'dy_9999' }])
  assert.ok(h.writes.every((value) => Object.keys(value).length === 1 && h.module.KEY in value))
})

test('legacy single-list data migrates once with room metadata and source preserved; deletion never resurrects it', async () => {
  const h = harness()
  const room = { ...h.module.roomLink('https://www.douyu.com/1'), name:'原主播', statusKnown:true, live:true }
  const legacy = { revision:'legacy', rooms:[room], sources:['https://www.douyu.com/91124'], importedAt:123, updatedAt:456 }
  h.data[h.module.LEGACY_KEY] = structuredClone(legacy)
  const [first, second] = await Promise.all([h.controller.read(), h.controller.read()])
  assert.equal(first.activities.length, 1)
  assert.equal(first.activities[0].id, second.activities[0].id)
  assert.equal(first.activities[0].rooms[0].name, '原主播')
  assert.equal(first.activities[0].input, legacy.sources[0])
  assert.equal(h.writes.length, 1)
  assert.deepEqual(h.data[h.module.LEGACY_KEY], legacy)
  await h.controller.remove(first.activities[0].id)
  assert.equal((await h.controller.read()).activities.length, 0)
})

test('invalid activity mutations do not change saved data', async () => {
  const h = harness()
  const a = await create(h, '有效活动', [1])
  const before = JSON.stringify(h.data)
  await assert.rejects(h.controller.rename(a.id, '   '), /名称/)
  await assert.rejects(h.controller.save({ name:'错误', candidate:{ rooms:[{url:'https://evil.com/1'}] } }), /无效/)
  await assert.rejects(h.controller.remove('not-found'), /删除/)
  assert.equal(JSON.stringify(h.data), before)
})

test('failed room status is unknown rather than offline and does not discard other participants', async () => {
  const h = harness({ respond: (url) => url.pathname.endsWith('/1') ? roomPayload(1) : new Error('failed') })
  const a = await create(h, '测试', [1,2])
  const value = (await h.controller.refresh(a.id, true)).activities[0]
  assert.equal(value.rooms[0].statusKnown, true)
  assert.equal(value.rooms[1].statusKnown, false)
  assert.equal(value.rooms[1].stale, true)
  assert.match(value.rooms[1].error, /不能据此判断未开播/)
})

test('deleting an activity during refresh cannot resurrect it or affect another activity', async () => {
  let release
  const pending = new Promise((resolve) => { release = resolve })
  const h = harness({ respond: async () => { await pending; return roomPayload(1) } })
  const a = await create(h, '删除', [1]), b = await create(h, '保留', [2])
  const refresh = h.controller.refresh(a.id, true)
  await new Promise(setImmediate)
  await h.controller.remove(a.id)
  release(); await refresh
  const value = await h.controller.read()
  assert.equal(value.activities.length, 1)
  assert.equal(value.activities[0].id, b.id)
})

test('updating the roster while old status is in flight cannot restore removed participants', async () => {
  let release
  const pending = new Promise((resolve) => { release = resolve })
  const h = harness({ respond: async (url) => { if(url.pathname.endsWith('/1')) await pending; return roomPayload(url.pathname.split('/').at(-1)) } })
  const a = await create(h, '活动', [1])
  const older = h.controller.refresh(a.id, true)
  await new Promise(setImmediate)
  const candidate = await h.controller.preview('https://www.douyu.com/2','rooms')
  await h.controller.save({ id:a.id, name:a.name, expectedRevision:a.revision, candidate })
  await h.controller.refresh(a.id, true)
  release(); await older
  assert.equal((await h.controller.read()).activities[0].rooms[0].name, '主播 2')
})

test('rename during refresh and updates to other activities survive status commits', async () => {
  let release
  const pending = new Promise((resolve) => { release = resolve })
  const h = harness({ respond: async () => { await pending; return roomPayload(1) } })
  const a = await create(h, '旧名称', [1])
  const refresh = h.controller.refresh(a.id, true)
  await new Promise(setImmediate)
  await h.controller.rename(a.id, '新名称')
  const b = await create(h, '新活动', [2])
  release(); await refresh
  const value = await h.controller.read()
  assert.equal(value.activities[0].name, '新名称')
  assert.equal(value.activities[0].rooms[0].statusKnown, true)
  assert.equal(value.activities[1].id, b.id)
})

test('concurrent refresh requests deduplicate per activity, cache statuses, and refreshAll includes every activity', async () => {
  const h = harness({ respond: (url) => roomPayload(url.pathname.split('/').at(-1)) })
  const a = await create(h, '活动 A', [1])
  await Promise.all([h.controller.refresh(a.id,true),h.controller.refresh(a.id,true)])
  await h.controller.refresh(a.id)
  assert.equal(h.calls.length, 1)
  await create(h,'活动 B',[2])
  await h.controller.refreshAll()
  assert.equal(h.calls.length, 2)
  assert.ok((await h.controller.read()).activities.every((activity) => activity.updatedAt))
})

test('real worker routes activity-specific messages without touching official following or notifications', async () => {
  const { context, area, data, calls, module } = harness({ respond: () => roomPayload(1) })
  let listener, notificationCount = 0
  const event = () => ({ addListener() {} }), chrome = context.chrome
  chrome.runtime = { id:'test-extension',onMessage:{addListener(fn){listener=fn}},onInstalled:event(),onStartup:event(),getURL:(p)=>p }
  chrome.storage = { local:area,sync:{get:(key,callback)=>callback({[key]:key==='enabled_platforms'?[]:undefined}),remove(){}},onChanged:event() }
  chrome.alarms = { get:async()=>({name:'yubo-check-live-status'}),clear:async()=>{},create(){},onAlarm:event() }
  chrome.notifications = { onClicked:event(),create:async()=>{notificationCount++} }
  chrome.tabs = { create(){throw new Error('No tabs should open')} }
  context.importScripts = () => {}; context.console = console
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/room-data.js'),'utf8'),context)
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/background/yubo-worker.js'),'utf8'),context)
  await new Promise(setImmediate)
  assert.equal(calls.length,0)
  const send = (action, details={}) => new Promise((resolve)=>listener({type:'yubo-temporary-action',action,...details},{id:'test-extension'},resolve))
  const parsed = await send('preview',{input:'https://www.douyu.com/1',mode:'rooms'})
  assert.equal(parsed.ok,true)
  assert.equal(listener({type:'yubo-temporary-action',action:'remove'},{id:'another-extension'},()=>{}),false)
  const saved = await send('save',{name:'活动',candidate:parsed.value})
  assert.equal(saved.ok,true)
  const id = saved.value.activities[0].id
  await new Promise(setImmediate)
  assert.equal(data[module.KEY].activities[0].rooms[0].statusKnown,true)
  assert.equal((await send('rename',{id,name:'新名称'})).value.activities[0].name,'新名称')
  assert.equal((await send('read')).value.activities.length,1)
  assert.equal((await send('remove',{id})).value.activities.length,0)
  assert.equal(notificationCount,0)
  assert.deepEqual(data.favorite_streamers,['dy_9999'])
  assert.deepEqual(data.yubo_last_rooms,[{id:'dy_9999'}])
})
