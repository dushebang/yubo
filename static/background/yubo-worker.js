importScripts('../room-data.js', '../temporary-list.js')
const temporaryList = YuboTemporary.createController(chrome.storage.local)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'yubo-temporary-action') return false
  if (sender.id !== chrome.runtime.id) return false
  ;(async () => {
    let value
    if (message.action === 'preview') value = await temporaryList.preview(message.input, message.mode)
    else if (message.action === 'read') value = await temporaryList.read()
    else if (message.action === 'save') {
      value = await temporaryList.save(message)
      const id = message.id || value.activities.at(-1).id
      void temporaryList.refresh(id, true).catch((error) => console.warn('[鱼播] 临时活动刷新失败', error))
    } else if (message.action === 'rename') value = await temporaryList.rename(message.id, message.name)
    else if (message.action === 'remove') value = await temporaryList.remove(message.id)
    else if (message.action === 'refresh') value = await temporaryList.refresh(message.id, message.force === true)
    else throw new Error('不支持的临时列表操作')
    sendResponse({ ok: true, value })
  })().catch((error) => sendResponse({ ok: false, error: error.message || '临时列表操作失败，原列表未变更。' }))
  return true
})

const ALARM_NAME = 'yubo-check-live-status'
const PLATFORM_PREFIX = { bilibili: 'bili_', douyu: 'dy_', huya: 'huya_' }
const PLATFORM_NAMES = { bilibili: '哔哩哔哩', douyu: '斗鱼', huya: '虎牙' }
let checkInProgress = false

// Remove the obsolete platform credential left by older extension versions.
chrome.storage.sync.get('twitch_config', (items) => {
  if (items.twitch_config !== undefined) chrome.storage.sync.remove('twitch_config')
})

function read(area, key) {
  return new Promise((resolve) => area.get(key, (items) => resolve(items[key])))
}

function write(area, values) {
  return new Promise((resolve) => area.set(values, resolve))
}

function decode(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

async function syncValue(key) {
  return decode(await read(chrome.storage.sync, key))
}

class PlatformError extends Error {
  constructor(platform, message, authRequired = false) {
    super(message)
    this.platform = platform
    this.authRequired = authRequired
  }
}

async function fetchBilibili() {
  const response = await fetch('https://api.live.bilibili.com/xlive/web-ucenter/user/following?page=1&page_size=50&ignoreRecord=0&hit_ab=true', { credentials: 'include' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const json = await response.json()
  if (Number(json.code) === -101 || /账号未登录|未登录|登录失效/.test(`${json.message || ''} ${json.msg || ''}`)) throw new PlatformError('bilibili', '登录已失效', true)
  return (json.data?.list || []).map((item) => ({
    id: `bili_${item.roomid}`, platform: 'bilibili', name: item.uname, avatar: item.face,
    cover: item.room_cover, title: YuboRoomData.titleFor('bilibili', item), category: item.area_name_v2 || '直播', live: item.live_status === 1,
    url: `https://live.bilibili.com/${item.roomid}`
  }))
}

async function fetchDouyu() {
  const response = await fetch('https://www.douyu.com/wgapi/livenc/liveweb/follow/list', { credentials: 'include' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const json = await response.json()
  const authCode = [json.code, json.error, json.errno].some((value) => [-1, 401, 403].includes(Number(value)))
  const message = [json.msg, json.message, json.errorMsg, json.error_msg].filter(Boolean).join(' ')
  if (authCode || /未登录|请登录|登录失效|未授权|unauthori[sz]ed|login required/i.test(message)) throw new PlatformError('douyu', '登录已失效', true)
  return (json.data?.list || []).map((item) => ({
    id: `dy_${item.room_id}`, platform: 'douyu', name: item.nickname, avatar: item.avatar_small,
    cover: item.room_src, title: YuboRoomData.titleFor('douyu', item), category: item.game_name || '直播',
    live: item.show_status == 1 && item.videoLoop == 0, url: `https://www.douyu.com${item.url}`
  }))
}

async function fetchHuya() {
  const login = await fetch('https://www.huya.com/udb_web/checkLogin.php', { credentials: 'include' }).then((response) => response.json())
  if (![true, 1, '1', 'true'].includes(login.isLogined)) throw new PlatformError('huya', '登录已失效', true)
  const json = await fetch(`https://fw.huya.com/dispatch?do=subscribeList&uid=${encodeURIComponent(login.uid)}`, { credentials: 'include' }).then((response) => response.json())
  if (Number(json.status) === 1401 || /未登录|请登录|登录失效/.test(String(json.message || json.msg || ''))) throw new PlatformError('huya', '登录已失效', true)
  if (!Array.isArray(json.result?.list)) throw new Error('虎牙关注列表返回格式异常')
  return (json.result?.list || []).map((item) => ({
    id: `huya_${item.uid}`, platform: 'huya', name: item.nick, avatar: item.avatar180,
    cover: item.screenshot, title: YuboRoomData.titleFor('huya', item), category: item.gameName || '直播', live: !!item.isLive,
    url: `https://www.huya.com/${item.profileRoom}`
  }))
}

const FETCHERS = { bilibili: fetchBilibili, douyu: fetchDouyu, huya: fetchHuya }

async function getEnabledPlatforms() {
  const value = decode(await read(chrome.storage.sync, 'enabled_platforms'))
  return Array.isArray(value) ? [...new Set(value.filter((platform) => FETCHERS[platform]))] : Object.keys(FETCHERS)
}

async function fetchAllPlatforms() {
  const platforms = await getEnabledPlatforms()
  const cachedRooms = await read(chrome.storage.local, 'yubo_last_rooms')
  const oldRooms = Array.isArray(cachedRooms) ? cachedRooms : []
  const oldByPlatform = new Map(Object.keys(PLATFORM_PREFIX).map((platform) => [platform, oldRooms.filter((room) => room.platform === platform)]))
  const results = await Promise.allSettled(platforms.map((platform) => FETCHERS[platform]()))
  const rooms = []
  const diagnostics = {}
  const successful = new Set()
  results.forEach((result, index) => {
    const platform = platforms[index]
    if (result.status === 'fulfilled') {
      successful.add(platform)
      rooms.push(...result.value)
      diagnostics[platform] = { ok: true, authRequired: false, count: result.value.length, checkedAt: Date.now() }
    } else {
      const error = result.reason
      diagnostics[platform] = {
        ok: false,
        authRequired: !!error.authRequired,
        error: error.authRequired ? '登录已失效' : String(error.message || '读取失败'),
        count: oldByPlatform.get(platform)?.length || 0,
        checkedAt: Date.now()
      }
      rooms.push(...(oldByPlatform.get(platform) || []).map((room) => ({ ...room, stale: true })))
    }
  })
  const mergedRooms = YuboRoomData.mergeTitles(rooms, oldRooms)
  await write(chrome.storage.local, {
    yubo_last_rooms: mergedRooms,
    yubo_platform_diagnostics: diagnostics,
    yubo_last_refresh_at: Date.now()
  })
  return { rooms: mergedRooms, diagnostics, successful }
}

function isQuietNow(settings, now = new Date()) {
  if (!settings.quietEnabled) return false
  const toMinutes = (value) => {
    const [hour, minute] = String(value || '00:00').split(':').map(Number)
    return (hour || 0) * 60 + (minute || 0)
  }
  const current = now.getHours() * 60 + now.getMinutes()
  const start = toMinutes(settings.quietStart)
  const end = toMinutes(settings.quietEnd)
  return start === end || (start < end ? current >= start && current < end : current >= start || current < end)
}

async function recordTransitions(rooms, successful) {
  const [previous, initialized, history, active] = await Promise.all([
    read(chrome.storage.local, 'yubo_last_status'),
    read(chrome.storage.local, 'yubo_initialized'),
    read(chrome.storage.local, 'yubo_recent_live_history'),
    read(chrome.storage.local, 'yubo_active_live')
  ])
  const prior = previous || {}
  const next = { ...prior }
  const activeLive = { ...(active || {}) }
  const recent = Array.isArray(history) ? [...history] : []
  const currentById = new Map(rooms.map((room) => [room.id, room]))
  const started = []
  const ended = []

  for (const platform of successful) {
    const prefix = PLATFORM_PREFIX[platform]
    for (const id of Object.keys(prior)) {
      if (id.startsWith(prefix) && !currentById.has(id)) {
        if (prior[id]) ended.push(id)
        next[id] = false
      }
    }
  }

  for (const room of rooms) {
    if (room.stale) continue
    const wasLive = !!prior[room.id]
    next[room.id] = !!room.live
    if (room.live && !wasLive && initialized) {
      started.push(room)
      const entry = { id: room.id, name: room.name, platform: room.platform, category: room.category, avatar: room.avatar, url: room.url, startedAt: Date.now(), endedAt: null }
      recent.unshift(entry)
      activeLive[room.id] = entry.startedAt
    }
    if (!room.live && wasLive) ended.push(room.id)
  }

  for (const id of ended) {
    const entry = recent.find((item) => item.id === id && !item.endedAt)
    if (entry) entry.endedAt = Date.now()
    delete activeLive[id]
  }

  await write(chrome.storage.local, {
    yubo_last_status: next,
    yubo_initialized: true,
    yubo_recent_live_history: recent.slice(0, 100),
    yubo_active_live: activeLive
  })
  return started
}

async function notifyStarted(rooms) {
  if (!rooms.length) return
  const [muted, favoritesValue, hiddenValue, settingsValue, groupsValue, groupRulesValue, overridesValue] = await Promise.all([
    syncValue('mute_notification'), syncValue('favorite_streamers'), syncValue('hidden_rooms'),
    read(chrome.storage.local, 'yubo_settings'), read(chrome.storage.local, 'yubo_favorite_groups'),
    read(chrome.storage.local, 'yubo_group_notification_rules'), read(chrome.storage.local, 'yubo_streamer_notification_overrides')
  ])
  const settings = settingsValue || {}, mode = settings.notifyMode || 'all'
  const favorites = Array.isArray(favoritesValue) ? favoritesValue : []
  const hidden = Array.isArray(hiddenValue) ? hiddenValue : []
  const groups = groupsValue || {}
  const groupRules = groupRulesValue || {}
  const overrides = overridesValue || {}
  if (muted || isQuietNow(settings)) return

  const eligible = rooms.filter((room) => {
    if (hidden.includes(room.id)) return false
    if (typeof overrides[room.id] === 'boolean') return overrides[room.id]
    if (mode === 'none') return false
    if (mode === 'favorites' && !favorites.includes(room.id)) return false
    const group = groups[room.id]
    if (group && groupRules[group] === false) return false
    return true
  })
  if (!eligible.length) return

  const targets = await read(chrome.storage.local, 'yubo_notification_targets') || {}
  const notifications = settings.groupNotifications === false ? eligible.map((room) => [room]) : [eligible]
  const ids = []
  for (const batch of notifications) {
    const id = `yubo-live-${Date.now()}-${ids.length}`
    const names = batch.slice(0, 5).map((room) => room.name).join('、')
    const suffix = batch.length > 5 ? ` 等 ${batch.length} 位主播` : ''
    const title = batch.length === 1 ? `${batch[0].name} 正在直播` : `${batch.length} 位主播正在直播`
    targets[id] = batch[0].url
    ids.push(id)
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon-fish-128.png'),
      title,
      message: `${names}${suffix}`,
      priority: 2
    })
  }
  await write(chrome.storage.local, { yubo_notification_targets: targets })
}

async function checkLiveStatus() {
  if (checkInProgress) return
  checkInProgress = true
  try {
    const { rooms, successful } = await fetchAllPlatforms()
    const started = await recordTransitions(rooms, successful)
    await notifyStarted(started)
  } catch (error) {
    console.error('[鱼播] 开播检查失败', error)
  } finally {
    try { await temporaryList.refreshAll() } catch (error) { console.warn('[鱼播] 临时活动刷新失败', error) }
    checkInProgress = false
  }
}

async function scheduleCheck(runNow = false) {
  const raw = await syncValue('check_interval')
  const minutes = Math.min(60, Math.max(1, Number(raw) || 3))
  await chrome.alarms.clear(ALARM_NAME)
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: minutes })
  if (runNow) void checkLiveStatus()
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void checkLiveStatus()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled_platforms) void scheduleCheck(true)
  else if (area === 'sync' && (changes.check_interval || changes.mute_notification)) void scheduleCheck()
})

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const targets = await read(chrome.storage.local, 'yubo_notification_targets') || {}
  const url = targets[notificationId]
  if (url) {
    await chrome.tabs.create({ url })
    delete targets[notificationId]
    await write(chrome.storage.local, { yubo_notification_targets: targets })
  } else {
    await chrome.tabs.create({ url: chrome.runtime.getURL('tabs/index.html') })
  }
})

chrome.runtime.onInstalled.addListener(() => void scheduleCheck(true))
chrome.runtime.onStartup.addListener(() => void scheduleCheck(true))
// Import/preview messages may wake the worker. Do not start an unrelated full
// following/notification check on every such wakeup; startup/install still run it.
void chrome.alarms.get(ALARM_NAME).then((alarm) => { if (!alarm) void scheduleCheck() })
