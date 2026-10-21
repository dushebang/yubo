/* Temporary event subscriptions: public, read-only room requests; local storage only. */
(() => {
  const KEY = 'yubo_temporary_activities', LEGACY_KEY = 'yubo_temporary_list', MAX_ROOMS = 300, MAX_ACTIVITIES = 20
  const names = { douyu: '斗鱼', huya: '虎牙', bilibili: '哔哩哔哩' }
  const empty = () => ({ version: 2, activities: [] })
  const supportedPage = (url) => {
    try {
      const u = new URL(url)
      return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
        ['douyu.com','huya.com','bilibili.com'].some((host) => u.hostname === host || u.hostname.endsWith('.' + host))
    } catch { return false }
  }
  function roomLink(value, base) {
    try {
      const u = new URL(value, base)
      if (!['https:','http:'].includes(u.protocol) || u.username || u.password || u.port) return null
      let platform, key
      if (['douyu.com','www.douyu.com','m.douyu.com'].includes(u.hostname)) {
        platform = 'douyu'; key = u.pathname.match(/^\/(?:room\/)?([a-zA-Z0-9_]{1,64})\/?$/)?.[1]
      } else if (['huya.com','www.huya.com','m.huya.com'].includes(u.hostname)) {
        platform = 'huya'; key = u.pathname.match(/^\/([a-zA-Z0-9_]{1,64})\/?$/)?.[1]
      } else if (u.hostname === 'live.bilibili.com') {
        platform = 'bilibili'; key = u.pathname.match(/^\/(?:blanc\/)?([1-9]\d{0,15})\/?$/)?.[1]
      }
      if (!platform || !key || /^(?:0|index|home|room|topic|activity|event|events|search|directory|download|member|user|login|video|g|l|s|my|category|app|about|tv|index_html)$/i.test(key)) return null
      key = key.toLowerCase()
      const url = platform === 'bilibili' ? `https://live.bilibili.com/${key}` : `https://www.${platform}.com/${key}`
      return { id: `temp_${platform}_${key}`, platform, roomKey: key, url, name: `${names[platform]} ${key}`, live: false, statusKnown: false }
    } catch { return null }
  }
  function dedupe(rooms) {
    const result = [...new Map(rooms.filter(Boolean).map((room) => [room.id, room])).values()]
    if (result.length > MAX_ROOMS) throw new Error(`一次最多导入 ${MAX_ROOMS} 个直播间，请缩小活动范围；未替换原列表。`)
    return result
  }
  function decodeText(text) {
    return String(text).replace(/&amp;|&#0*38;|&#x0*26;/gi,'&').replace(/&quot;|&#0*34;/gi,'"')
      .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, decimal) => {
        const n = parseInt(hex || decimal, hex ? 16 : 10)
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
      }).replace(/\\u002[fF]/g,'/').replace(/\\u0026/g,'&').replace(/\\\//g,'/')
  }
  function pageText(html) {
    let text = String(html)
    // Next.js flight chunks contain the actual activity loader as encoded JSON strings.
    for (const match of text.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/gs)) {
      try { const part = JSON.parse(match[1]); if (typeof part[1] === 'string') text += '\n' + part[1] } catch {}
    }
    return decodeText(text)
  }
  function directRooms(text, base) {
    const decoded = decodeText(text), rooms = []
    for (const match of decoded.matchAll(/(?:https?:)?\/\/(?:[\w-]+\.)*(?:douyu\.com|huya\.com|bilibili\.com)\/[^\s<>"'`\\，。；）)\]}]+/gi)) rooms.push(roomLink(match[0], base || 'https://www.douyu.com/'))
    return dedupe(rooms)
  }
  function pageRooms(html, base) {
    const text = pageText(html), rooms = []
    // Only explicit links, not arbitrary numeric fields/recommendation identifiers.
    for (const match of text.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const room = roomLink(match[1], base)
      if (room) {
        const label = decodeText(match[2].replace(/<[^>]*>/g,'')).trim()
        if (label) room.name = label.slice(0,80)
        rooms.push(room)
      }
    }
    // Structured JSON lists used by event pages, without executing embedded scripts.
    for (const match of text.matchAll(/"(?:roomIds|roomids|room_ids)"\s*:\s*(\[[\d\s,"']*\]|"[\d,\s]+")/g)) {
      for (const id of match[1].match(/\d+/g) || []) rooms.push(roomLink('/'+id, base))
    }
    return dedupe(rooms)
  }
  function activityRequest(html, source) {
    const host = new URL(source).hostname
    if (host !== 'douyu.com' && !host.endsWith('.douyu.com')) return null
    const text = pageText(html)
    const match = text.match(/(?:https?:)?\/\/butterfly\.douyucdn\.cn\/api\/page\/loadPage\?[^\s"'<>\\]+/)
    if (!match) return null
    const url = new URL(match[0], source)
    const topic = text.match(/window\.zhtName\s*=\s*['"]([\w-]+)['"]/)?.[1]
    if (!url.searchParams.get('pageId') || !topic) throw new Error('已发现斗鱼活动配置，但缺少活动标识；请改用直播间链接列表。')
    url.searchParams.set('view','0'); url.searchParams.set('topicName',topic); url.searchParams.set('viewport','3')
    return url.href
  }
  async function requestText(url, fetcher = globalThis.fetch) {
    const allowed = (value) => {
      try { const u = new URL(value); return supportedPage(value) || (u.protocol === 'https:' && u.hostname === 'butterfly.douyucdn.cn' && u.pathname === '/api/page/loadPage' && !u.username && !u.password && !u.port) } catch { return false }
    }
    if (!allowed(url)) throw new Error('仅支持斗鱼、虎牙、B站的活动页或直播间链接。')
    const response = await fetcher(url, { credentials: 'omit', signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`读取页面失败（HTTP ${response.status}），原列表未被替换。`)
    if (response.url && !allowed(response.url)) throw new Error('页面跳转到不支持的站点，已停止导入。')
    const text = await response.text()
    if (text.length > 5000000) throw new Error('页面内容过大，请改用直播间链接列表。')
    return text
  }
  async function preview(input, mode = 'activity', fetcher = globalThis.fetch) {
    if (typeof input !== 'string' || input.length > 1000000 || !input.trim()) throw new Error('请粘贴活动页链接或直播间链接列表（最多 1 MB）。')
    if (!['activity','rooms'].includes(mode)) throw new Error('不支持的导入方式。')
    if (mode === 'rooms') {
      const rooms = directRooms(input)
      if (!rooms.length) throw new Error('未识别到直播间链接；请使用斗鱼、虎牙或 live.bilibili.com 的直播间完整地址。')
      return { rooms, sources: [], mode }
    }
    const urls = [...new Set(input.match(/https?:\/\/[^\s<>"'`，。；）)\]}]+/g) || [])]
    if (!urls.length || urls.some((url) => !supportedPage(url))) throw new Error('请提供斗鱼、虎牙或B站的完整 HTTPS 活动页链接。')
    if (urls.length > 5) throw new Error('一次最多解析 5 个活动页面。')
    let rooms = []
    const warnings = [], methods = []
    for (const url of urls) {
      const html = await requestText(url, fetcher)
      const config = activityRequest(html, url)
      let found
      if (config) {
        const payload = JSON.parse(await requestText(config, fetcher))
        if (Number(payload.code) !== 0 || !Array.isArray(payload.data?.roomIds)) throw new Error('斗鱼活动配置没有返回有效的主播列表；原列表未被替换。')
        found = dedupe(payload.data.roomIds.map((id) => /^\d+$/.test(String(id)) ? roomLink('https://www.douyu.com/'+id) : null))
      } else {
        found = pageRooms(html, url)
        warnings.push('此页面按可读取的直播间链接提取，请核对预览；动态脚本或 iframe 内的主播可能无法完整提取。')
      }
      if (!found.length) throw new Error('活动页未提取到主播链接。请复制活动里的直播间链接，使用“直播间链接列表”导入；原列表未被替换。')
      methods.push({ source: url, method: config ? 'activity-config' : 'page-links', count: found.length })
      rooms = dedupe(rooms.concat(found))
    }
    return { rooms, sources: urls, warnings: [...new Set(warnings)], methods, mode }
  }

  // Read a JSON object assigned to a named variable; never eval platform HTML/JS.
  function assignedObject(html, variable) {
    const match = new RegExp('\\b' + variable + '\\s*=\\s*').exec(html)
    if (!match) throw new Error('房间信息字段暂不可读取。')
    const start = match.index + match[0].length
    if (html[start] !== '{') throw new Error('房间信息格式已变化。')
    let depth = 0, quoted = false, escaped = false
    for (let i = start; i < html.length; i++) {
      const char = html[i]
      if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false }
      else if (char === '"') quoted = true
      else if (char === '{') depth++
      else if (char === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1))
    }
    throw new Error('房间信息不完整。')
  }
  const imageUrl = (url) => { try { const u = new URL(url); return ['https:','http:'].includes(u.protocol) ? u.href : '' } catch { return '' } }
  async function roomInfo(room, fetcher = globalThis.fetch) {
    const valid = roomLink(room.url)
    if (!valid || valid.id !== room.id) throw new Error('直播间地址无效。')
    if (room.platform === 'douyu') {
      const json = JSON.parse(await requestText('https://www.douyu.com/betard/'+encodeURIComponent(room.roomKey), fetcher))
      const data = json.room
      if (!data?.room_id || ![1,2].includes(Number(data.show_status))) throw new Error('房间不存在或直播状态不可读取。')
      return { name: data.nickname || room.name, avatar: imageUrl(data.avatar?.big || data.avatar?.middle || data.avatar), cover: imageUrl(data.room_pic),
        title: data.room_name || '', category: data.second_lvl_name || '直播', live: Number(data.show_status) === 1 && Number(data.videoLoop || 0) === 0,
        canonicalRoomId: String(data.room_id) }
    }
    if (room.platform === 'huya') {
      const html = await requestText(room.url, fetcher), data = assignedObject(html, 'TT_ROOM_DATA'), profile = assignedObject(html, 'TT_PROFILE_INFO')
      if (!data.profileRoom || !['ON','OFF','REPLAY'].includes(data.state)) throw new Error('虎牙房间状态不可读取。')
      return { name: profile.nick || room.name, avatar: imageUrl(profile.avatar), cover: imageUrl(data.screenshot || data.cover), title: data.introduction || '', category: '直播',
        live: data.state === 'ON' && !data.isReplay, canonicalRoomId: String(data.profileRoom) }
    }
    const data = JSON.parse(await requestText('https://api.live.bilibili.com/room/v1/Room/get_info?room_id='+encodeURIComponent(room.roomKey), fetcher))
    if (Number(data.code) !== 0 || !data.data?.room_id || data.data.live_status == null || ![0,1,2].includes(Number(data.data.live_status))) throw new Error('B站房间不存在或状态不可读取。')
    let profile = {}
    try { profile = JSON.parse(await requestText('https://api.live.bilibili.com/live_user/v1/UserInfo/get_anchor_in_room?roomid='+encodeURIComponent(room.roomKey), fetcher)).data?.info || {} } catch {}
    const info = data.data
    return { name: profile.uname || room.name, avatar: imageUrl(profile.face), cover: imageUrl(info.user_cover || info.keyframe), title: info.title || '', category: info.area_name || '直播',
      live: Number(info.live_status) === 1, canonicalRoomId: String(info.room_id) }
  }

  // Portable backup: only activity definitions and room links/names, never live
  // state, cache revisions, arbitrary storage fields or credentials.
  function normalizeBackup(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.activities)) throw new Error('临时活动备份格式不正确，未导入。')
    if (value.activities.length > MAX_ACTIVITIES) throw new Error('临时活动备份超过 20 个活动，未导入。')
    return { version: 1, activities: value.activities.map((activity) => {
      if (!activity || typeof activity.name !== 'string' || !activity.name.trim() || activity.name.trim().length > 24) throw new Error('临时活动名称无效，未导入。')
      if (!['activity','rooms'].includes(activity.mode) || !Array.isArray(activity.sources) || activity.sources.length > 5 || activity.sources.some((source) => typeof source !== 'string' || !supportedPage(source))) throw new Error('临时活动来源无效，未导入。')
      if (activity.mode === 'activity' && !activity.sources.length) throw new Error('临时活动缺少活动页来源，未导入。')
      if (activity.mode === 'rooms' && activity.sources.length) throw new Error('直播间列表的来源格式无效，未导入。')
      if (!Array.isArray(activity.rooms) || activity.rooms.length > MAX_ROOMS) throw new Error('临时活动主播名单无效或超过 300 位，未导入。')
      const ids = new Set()
      const rooms = activity.rooms.map((room) => {
        const canonical = roomLink(room?.url)
        if (!canonical || ids.has(canonical.id)) throw new Error('临时活动包含无效或重复的直播间，未导入。')
        ids.add(canonical.id)
        return { url: canonical.url, name: typeof room.name === 'string' && room.name.trim() ? room.name.trim().slice(0,200) : canonical.name }
      })
      return { name: activity.name.trim(), mode: activity.mode, sources: [...new Set(activity.sources)], rooms }
    }) }
  }

  function backupFromCollection(collection) {
    if (!collection || collection.version !== 2 || !Array.isArray(collection.activities)) throw new Error('活动数据格式异常，未导出备份。')
    return normalizeBackup({ version: 1, activities: collection.activities.map((activity) => ({
      name: activity.name, mode: activity.mode, sources: activity.sources, rooms: activity.rooms
    })) })
  }
  async function readBackup(area) {
    const get = (key) => new Promise((resolve,reject) => area.get(key,(data) => {
      const error=globalThis.chrome?.runtime?.lastError
      error?reject(new Error(error.message)):resolve(data?.[key])
    }))
    const saved=await get(KEY)
    if(saved!==undefined)return backupFromCollection(saved)
    const legacy=await get(LEGACY_KEY)
    if(!legacy || !Array.isArray(legacy.rooms) || !legacy.rooms.length)return {version:1,activities:[]}
    const sources=Array.isArray(legacy.sources)?legacy.sources.filter(supportedPage):[]
    return backupFromCollection({version:2,activities:[{name:'临时活动',mode:sources.length?'activity':'rooms',sources,rooms:legacy.rooms}]})
  }

  function createController(area, options = {}) {
    const fetcher = options.fetch || globalThis.fetch
    let queue = Promise.resolve(), sequence = 0
    const inFlight = new Map()
    const readKey = (key) => new Promise((resolve, reject) => area.get(key, (data) => {
      const error = globalThis.chrome?.runtime?.lastError
      if (error) reject(new Error(error.message))
      else resolve(data?.[key])
    }))
    const write = (value) => new Promise((resolve, reject) => area.set({ [KEY]: value }, () => {
      const error = globalThis.chrome?.runtime?.lastError
      error ? reject(new Error(error.message)) : resolve(value)
    }))
    const serial = (fn) => { const result = queue.then(fn); queue = result.catch(() => {}); return result }
    const revision = () => `${Date.now()}-${++sequence}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`
    // The worker is the sole writer. Keep the legacy key as a migration backup;
    // an existing v2 collection (even empty) always wins, so deleted data stays deleted.
    async function load() {
      const saved = await readKey(KEY)
      if (saved !== undefined) {
        if (saved?.version !== 2 || !Array.isArray(saved.activities)) throw new Error('活动数据格式异常，未覆盖原数据。')
        return saved
      }
      const legacy = await readKey(LEGACY_KEY)
      if (!Array.isArray(legacy?.rooms) || !legacy.rooms.length) return empty()
      const sources = Array.isArray(legacy.sources) ? legacy.sources.filter(supportedPage) : []
      return write({ version: 2, activities: [{ ...legacy, id: 'legacy-temporary', name: '临时活动', revision: legacy.revision || revision(), sources,
        mode: sources.length ? 'activity' : 'rooms', input: (sources.length ? sources : legacy.rooms.map((room) => room.url)).join('\n') }] })
    }
    const read = () => serial(load)
    const requireActivity = (collection, id, expectedRevision) => {
      const activity = collection.activities.find((item) => item.id === id)
      if (!activity) throw new Error('活动已删除，请重新选择。')
      if (expectedRevision && activity.revision !== expectedRevision) throw new Error('此活动名单已更新，请重新预览后再保存。')
      return activity
    }
    const validName = (name) => {
      const value = String(name || '').trim()
      if (!value || value.length > 24) throw new Error('活动名称请填写 1–24 个字。')
      return value
    }
    async function save({ id, name, candidate, expectedRevision } = {}) {
      name = validName(name)
      if (!candidate || !Array.isArray(candidate.rooms) || !candidate.rooms.length) throw new Error('请先解析并预览主播列表。')
      const rooms = dedupe(candidate.rooms.map((room) => roomLink(room?.url)))
      if (!rooms.length || rooms.length !== candidate.rooms.length) throw new Error('列表包含无效或重复的直播间，请重新解析。')
      return serial(async () => {
        const collection = await load(), previous = id ? requireActivity(collection, id, expectedRevision) : null
        if (!previous && collection.activities.length >= MAX_ACTIVITIES) throw new Error('最多保存 20 个活动，请先删除不再需要的活动。')
        const sources = (Array.isArray(candidate.sources) ? candidate.sources : []).filter(supportedPage).slice(0,5)
        const mode = sources.length ? 'activity' : 'rooms', oldRooms = new Map((previous?.rooms || []).map((room) => [room.id, room]))
        const activity = { id: previous?.id || 'activity-'+revision(), name, revision: revision(), mode, sources,
          input: (sources.length ? sources : rooms.map((room) => room.url)).join('\n'),
          rooms: rooms.map((room) => oldRooms.get(room.id) || room), importedAt: Date.now(), updatedAt: 0 }
        return write({ ...collection, activities: previous ? collection.activities.map((item) => item.id === id ? activity : item) : [...collection.activities, activity] })
      })
    }
    async function rename(id, name) {
      name = validName(name)
      return serial(async () => {
        const collection = await load(); requireActivity(collection, id)
        return write({ ...collection, activities: collection.activities.map((item) => item.id === id ? { ...item, name } : item) })
      })
    }
    async function remove(id) {
      return serial(async () => {
        const collection = await load(); requireActivity(collection, id)
        return write({ ...collection, activities: collection.activities.filter((item) => item.id !== id) })
      })
    }
    async function exportBackup() {
      return serial(async () => backupFromCollection(await load()))
    }
    async function restoreBackup(value) {
      const portable = normalizeBackup(value)
      return serial(() => write({ version: 2, activities: portable.activities.map((activity) => ({
        ...activity, id: 'activity-'+revision(), revision: revision(), importedAt: Date.now(), updatedAt: 0,
        input: (activity.mode === 'activity' ? activity.sources : activity.rooms.map((room) => room.url)).join('\n'),
        rooms: activity.rooms.map((room) => ({ ...roomLink(room.url), name: room.name }))
      })) }))
    }
    async function refresh(id, force = false) {
      const collection = await read(), snapshot = requireActivity(collection, id)
      if (!snapshot.rooms.length || (!force && snapshot.updatedAt && Date.now() - snapshot.updatedAt < 30000)) return collection
      const flightKey = id + ':' + snapshot.revision
      if (inFlight.has(flightKey)) return inFlight.get(flightKey)
      const promise = (async () => {
        let index = 0
        const deadline = Date.now() + 120000
        const rooms = new Array(snapshot.rooms.length)
        await Promise.all(Array.from({ length: Math.min(4, snapshot.rooms.length) }, async () => {
          while (index < snapshot.rooms.length) {
            const i = index++, room = snapshot.rooms[i]
            try {
              if (Date.now() > deadline) throw new Error('本轮检测超时')
              rooms[i] = { ...room, ...await roomInfo(room, fetcher), statusKnown: true, stale: false, error: '', checkedAt: Date.now() }
            }
            catch { rooms[i] = { ...room, statusKnown: false, stale: true, error: '状态读取失败，不能据此判断未开播', checkedAt: Date.now() } }
          }
        }))
        return serial(async () => {
          const current = await load(), activity = current.activities.find((item) => item.id === id)
          if (!activity || activity.revision !== snapshot.revision) return current
          return write({ ...current, activities: current.activities.map((item) => item.id === id ? { ...item, rooms, updatedAt: Date.now() } : item) })
        })
      })()
      inFlight.set(flightKey, promise)
      try { return await promise } finally { if (inFlight.get(flightKey) === promise) inFlight.delete(flightKey) }
    }
    async function refreshAll() {
      const collection = await read()
      for (const activity of collection.activities) {
        try { await refresh(activity.id) } catch (error) {
          // Deletion during a poll is expected; storage/network errors still surface.
          if ((await read()).activities.some((item) => item.id === activity.id)) throw error
        }
      }
      return read()
    }
    return { read, save, rename, remove, exportBackup, restoreBackup, refresh, refreshAll, preview: (input, mode) => preview(input, mode, fetcher) }
  }
  globalThis.YuboTemporary = { KEY, LEGACY_KEY, MAX_ROOMS, MAX_ACTIVITIES, empty, roomLink, directRooms, pageRooms, activityRequest, preview, assignedObject, roomInfo, normalizeBackup, readBackup, createController }
})()
