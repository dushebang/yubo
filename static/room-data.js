/* Shared platform metadata, screenshot selection, timing and sorting for page/worker. */
(() => {
  const firstText = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim() || ''
  function titleFor(platform, item = {}) {
    if (platform === 'huya') return firstText(item.intro, item.introduction, item.sLiveDesc, item.roomName, item.room_name, item.title, item.liveTitle)
    if (platform === 'douyu') return firstText(item.room_name, item.title)
    if (platform === 'bilibili') return firstText(item.title)
    return ''
  }
  function imageUrl(value, platform) {
    if (typeof value !== 'string' || !value.trim()) return ''
    let text=value.trim()
    if(text.startsWith('//'))text='https:'+text
    if(platform==='douyu'&&/^\/?(?:asrpic|live-cover)\//.test(text))text='https://rpic.douyucdn.cn/'+text.replace(/^\//,'')
    try{const url=new URL(text);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:''}catch{return ''}
  }
  function coversFor(platform, item = {}) {
    const first=(values)=>values.map(value=>imageUrl(value,platform)).find(Boolean)||''
    let snapshot='',fallback=''
    if(platform==='douyu'){
      snapshot=first([item.room_pic,item.room_src].filter(value=>typeof value==='string'&&/(?:^|\/)asrpic\//.test(value)))
      fallback=first([item.coverSrc,item.room_src,item.room_pic])
    }else if(platform==='bilibili'){
      snapshot=first([item.keyframe]);fallback=first([item.user_cover,item.room_cover,item.cover])
    }else if(platform==='huya'){
      snapshot=first([item.screenshot]);fallback=first([item.cover])
    }
    return {cover:snapshot||fallback,coverFallback:snapshot&&fallback!==snapshot?fallback:'',coverKind:snapshot?'snapshot':fallback?'cover':''}
  }
  function roomIdentity(room) {
    try {
      const url=new URL(room.url),hosts={douyu:'www.douyu.com',bilibili:'live.bilibili.com',huya:'www.huya.com'}
      const path=url.pathname.replace(/^\/|\/$/g,'')
      if(url.hostname!==hosts[room.platform]||!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port||!/^\w+$/.test(path))return null
      // Old official caches already contain the real Douyu room ID in dy_<id>.
      // Huya's huya_<id> is a USER ID and must never be used as a room ID.
      const legacy=room.platform==='douyu'?String(room.id||'').match(/^dy_(\d+)$/)?.[1]:''
      const canonical=[room.canonicalRoomId,legacy].map(value=>String(value||'')).find(value=>/^\d+$/.test(value))||''
      const requestRoomId=canonical||path
      return {canonicalRoomId:canonical,requestRoomId,displayRoomId:String(room.displayRoomId||room.roomKey||path),key:room.platform+':'+requestRoomId}
    }catch{return null}
  }
  function mergeActivitySnapshots(rooms, collection, now=Date.now()) {
    const keys=room=>{const identity=roomIdentity(room);return identity?[identity.key]:[]}
    const snapshots=new Map()
    for(const activity of collection?.activities||[])for(const room of activity.rooms||[]){
      const checkedAt=Number(room.checkedAt||activity.updatedAt)
      if(!room.live||!room.statusKnown||room.stale||room.coverKind!=='snapshot'||!imageUrl(room.cover,room.platform)||!Number.isFinite(checkedAt)||checkedAt>now||now-checkedAt>TIME_TTL)continue
      for(const key of keys(room))if(!snapshots.has(key)||snapshots.get(key).checkedAt<checkedAt)snapshots.set(key,{...room,checkedAt})
    }
    let changed=false
    const result=rooms.map(room=>{
      if(!room.live||room.stale||room.coverKind==='snapshot')return room
      const source=keys(room).map(key=>snapshots.get(key)).filter(Boolean).sort((a,b)=>b.checkedAt-a.checkedAt)[0]
      if(!source)return room
      changed=true
      return {...room,cover:source.cover,coverFallback:room.cover||source.coverFallback||'',coverKind:'snapshot',coverCheckedAt:source.checkedAt,coverRetryAt:0}
    })
    return changed?result:rooms
  }
  function mergeTitles(rooms, cached = []) {
    const previous = new Map(cached.map((room) => [room.id, room]))
    return rooms.map((room) => {
      if (room.stale) return room
      if (firstText(room.title)) return { ...room, title: room.title.trim(), titleStale: false }
      const old = previous.get(room.id)
      const oldKey=old&&roomIdentity(old)?.key,newKey=roomIdentity(room)?.key
      if (old?.platform === room.platform && (old.url === room.url || oldKey && oldKey===newKey) && firstText(old.title)) return { ...room, title: old.title, titleStale: true }
      return { ...room, title: '', titleStale: false }
    })
  }
  const TIME_CACHE_KEY = 'yubo_official_live_times', TIME_TTL = 5 * 60000
  function timestamp(value, now = Date.now()) {
    let result = 0
    if (typeof value === 'number' || typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) {
      const number = Number(value)
      result = number < 1e12 ? number * 1000 : number
    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
      // Bilibili's unzoned room date is China Standard Time, not the OS timezone.
      result = Date.parse(value.replace(' ', 'T') + '+08:00')
      if (Number.isFinite(result) && new Date(result + 8 * 3600000).toISOString().slice(0,19).replace('T',' ') !== value) return 0
    }
    // Reject zero, future, malformed and implausibly old session timestamps.
    return Number.isFinite(result) && result > 0 && result <= now && now - result <= 31 * 86400000 ? result : 0
  }
  const replay = (value) => value === true || Number(value) > 0
  function startFor(platform, item = {}, now = Date.now()) {
    if (replay(item.videoLoop) || replay(item.isReplay) || Number(item.live_status) === 2 || item.state === 'REPLAY') return 0
    return timestamp(platform === 'douyu' ? item.show_time : platform === 'huya' ? item.startTime : platform === 'bilibili' ? item.live_time : null, now)
  }
  function liveStart(room, now = Date.now()) {
    return room.live && !room.stale && room.statusKnown !== false && !room.replay ? timestamp(room.liveStartedAt, now) : 0
  }
  // Every source enters the same card model. Source policy is data, not a second template.
  function cardRooms(rooms, options={}) {
    const temporary=!!options.temporary, favorites=new Set(temporary?[]:options.favorites||[])
    return rooms.map(room=>{
      const unknown=room.statusKnown===false||(temporary&&!room.statusKnown)
      return {...room,live:!!room.live&&!unknown&&!room.replay&&(!temporary||!room.stale),stale:!!room.stale||unknown,
        avatar:room.avatar||options.defaultAvatar||'',displayRoomId:roomIdentity(room)?.displayRoomId||room.displayRoomId||'',canFavorite:!temporary,favorite:favorites.has(room.id),
        canReorder:temporary,aliases:temporary?[]:options.aliases?.(room)||[],statusLabel:temporary?'状态未知':'暂用缓存'}
    })
  }
  function selectCardRooms(rooms, options={}) {
    const sorted=sortRooms(cardRooms(rooms,options),options)
    return sorted.filter(room=>{
      if((options.coverMode||options.onlyLive||options.filter==='live')&&(!room.live||(options.coverMode&&room.stale)))return false
      if(options.filter==='favorites'&&!room.favorite)return false
      if(options.platform&&options.platform!=='all'&&options.platform!==room.platform)return false
      if(options.group&&options.group!=='all'&&options.groups?.[room.id]!==options.group)return false
      return !options.matches||options.matches(room)
    }).map((room,index,visible)=>({...room,canMoveUp:index>0,canMoveDown:index<visible.length-1}))
  }
  function metadataFor(platform,item,now=Date.now()) {
    return {...coversFor(platform,item),title:titleFor(platform,item),liveStartedAt:startFor(platform,item,now)}
  }
  function followRoom(platform,item,now=Date.now()) {
    const common={platform,...metadataFor(platform,item,now)}
    if(platform==='douyu')return {...common,id:'dy_'+item.room_id,canonicalRoomId:String(item.room_id),displayRoomId:String(item.url||'').match(/^\/(\w+)\/?(?:[?#].*)?$/)?.[1]||String(item.room_id),name:item.nickname,avatar:item.avatar_small,category:item.game_name||'直播',live:item.show_status==1&&item.videoLoop==0,replay:replay(item.videoLoop),url:'https://www.douyu.com/'+item.room_id}
    if(platform==='huya')return {...common,id:'huya_'+item.uid,canonicalRoomId:String(item.profileRoom),name:item.nick,avatar:item.avatar180,category:item.gameName||'直播',live:!!item.isLive&&!replay(item.isReplay),replay:replay(item.isReplay),url:'https://www.huya.com/'+item.profileRoom}
    if(platform==='bilibili')return {...common,id:'bili_'+item.roomid,canonicalRoomId:String(item.roomid),name:item.uname,avatar:item.face,category:item.area_name_v2||'直播',live:item.live_status===1,url:'https://live.bilibili.com/'+item.roomid}
    throw new Error('Unsupported platform')
  }
  function durationText(start, now = Date.now()) {
    const valid = timestamp(start, now)
    if (!valid) return ''
    const minutes = Math.floor((now - valid) / 60000)
    return minutes < 60 ? minutes + 'm' : Math.floor(minutes / 60) + 'h' + (minutes % 60) + 'm'
  }
  const sortMode = (value) => ['newest','oldest'].includes(value) ? value : 'default'
  function sortRooms(rooms, options = {}) {
    const favorites = options.temporary ? [] : options.favorites || [], fav = new Set(favorites)
    const favoriteOrder = new Map((options.favoriteOrder || []).map((id,i) => [id,i]))
    const manualOrder = new Map((options.streamerOrder || []).map((id,i) => [id,i]))
    const now = options.now ?? Date.now(), mode = sortMode(options.mode)
    const activityIds=options.temporary?[...new Set([...(options.roomOrder||[]),...rooms.map(room=>room.id)])]:[]
    const activityOrder=new Map(activityIds.map((id,index)=>[id,index]))
    const isLive = (room) => !!room.live && (!options.temporary || room.statusKnown && !room.stale)
    return [...rooms].sort((a,b) => {
      if(activityOrder.size){const diff=(activityOrder.get(a.id)??Number.MAX_SAFE_INTEGER)-(activityOrder.get(b.id)??Number.MAX_SAFE_INTEGER);if(diff)return diff}
      const favoriteDiff = Number(fav.has(b.id)) - Number(fav.has(a.id))
      if (favoriteDiff) return favoriteDiff
      const liveDiff = Number(isLive(b)) - Number(isLive(a))
      if (liveDiff) return liveDiff
      if (mode !== 'default' && isLive(a)) {
        const startA = liveStart(a,now), startB = liveStart(b,now)
        if (!!startA !== !!startB) return Number(!!startB) - Number(!!startA)
        if (startA && startB && startA !== startB) return mode === 'newest' ? startB - startA : startA - startB
      }
      const positions = fav.has(a.id) ? favoriteOrder : manualOrder
      const fallback = (id) => fav.has(id) && favorites.includes(id) ? favorites.indexOf(id) : Number.MAX_SAFE_INTEGER
      const diff = (positions.get(a.id) ?? fallback(a.id)) - (positions.get(b.id) ?? fallback(b.id))
      return diff || String(a.name).localeCompare(String(b.name),'zh-CN') || String(a.id).localeCompare(String(b.id))
    })
  }
  let timeQueue = Promise.resolve()
  function createTimeReader(area, options = {}) {
    const fetcher = options.fetch || globalThis.fetch, now = options.now || Date.now
    const pause = options.pause || ((ms) => new Promise((resolve) => setTimeout(resolve,ms)))
    const storageGet = (key=TIME_CACHE_KEY) => new Promise((resolve) => area.get(key,(data) => resolve(data?.[key] || {})))
    const storageSet = (value) => new Promise((resolve) => area.set({[TIME_CACHE_KEY]:value},resolve))
    function target(room) {
      try {
        const url = new URL(room.url), identity=roomIdentity(room),key=identity?.requestRoomId
        if (url.protocol !== 'https:' || !identity) return null
        if (room.platform === 'douyu' && url.hostname === 'www.douyu.com' && /^\d+$/.test(key)) return 'https://www.douyu.com/betard/' + key
        if (room.platform === 'bilibili' && url.hostname === 'live.bilibili.com' && /^\d+$/.test(key)) return 'https://api.live.bilibili.com/room/v1/Room/get_info?room_id=' + key
        if (room.platform === 'huya' && url.hostname === 'www.huya.com') return 'https://www.huya.com/'+key
      } catch {}
      return null
    }
    async function run(input) {
      const [saved,activities]=await Promise.all([storageGet(),storageGet('yubo_temporary_activities')])
      const rooms = mergeActivitySnapshots(input,activities,now()).map((room) => ({...room,liveStartedAt:liveStart(room,now()),coverRetryAt:0})), cache = {}
      for (const [key,value] of Object.entries(saved)) if (value && Number.isFinite(value.checkedAt) && value.checkedAt <= now() && now() - value.checkedAt < 86400000) cache[key] = value
      const pending = new Map()
      const savedBudget=cache['@request-budget']
      const budget=savedBudget && Number.isFinite(savedBudget.windowStartedAt) && now()-savedBudget.windowStartedAt<60000 ? savedBudget : {windowStartedAt:now(),requests:0,checkedAt:now()}
      for (const room of rooms) {
        const address = target(room)
        if (!address) continue
        if (!room.live || room.replay || room.statusKnown === false) { delete cache[address]; continue }
        if (room.stale) continue
        if (room.liveStartedAt && room.coverKind==='snapshot') { cache[address] = {...cache[address],checkedAt:now(),start:room.liveStartedAt,...{cover:room.cover,coverFallback:room.coverFallback||'',coverKind:'snapshot',coverProtocol:1}}; continue }
        const entry = cache[address]
        if (entry && entry.coverProtocol===1 && now() - entry.checkedAt < TIME_TTL) {
          if(!room.liveStartedAt)room.liveStartedAt=timestamp(entry.start,now())
          if(room.coverKind!=='snapshot'&&entry.coverKind==='snapshot'&&imageUrl(entry.cover,room.platform))Object.assign(room,{cover:entry.cover,coverFallback:room.cover||entry.coverFallback||'',coverKind:'snapshot'})
          if(room.coverKind!=='snapshot')room.coverRetryAt=entry.checkedAt+TIME_TTL
        }
        else if (!pending.has(address)) pending.set(address,{room,address,checkedAt:entry?.checkedAt || 0})
      }
      // One origin-wide queue, at most six missing rooms per refresh, no unbounded fan-out.
      const started = now()
      let lastRequestAt = Math.max(0,...Object.values(cache).map((value) => Number(value.requestedAt) || 0))
      for (const {room,address} of [...pending.values()].sort((a,b) => a.checkedAt-b.checkedAt).slice(0,6)) {
        if (now() - started >= 6000 || budget.requests >= 12) break
        if (cache['@cooldown-'+room.platform]?.until > now()) continue
        if (lastRequestAt) await pause(Math.max(0,400-(now()-lastRequestAt)))
        const requestedAt = now()
        budget.requests++;budget.checkedAt=requestedAt;budget.requestedAt=requestedAt
        cache['@request-budget']=budget
        let start = 0
        try {
          const response = await fetcher(address,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(2500)})
          if ([403,412,429].includes(response.status)) {
            const retry=response.headers?.get('Retry-After'),seconds=Number(retry)
            const delay=retry && Number.isFinite(seconds)?seconds*1000:retry?Date.parse(retry)-now():0
            cache['@cooldown-'+room.platform]={checkedAt:now(),until:now()+Math.min(86400000,Math.max(300000,Number.isFinite(delay)?delay:0))}
          }
          if (!response.ok) throw new Error('HTTP '+response.status)
          let data
          if (room.platform === 'huya') data = globalThis.YuboTemporary.assignedObject(await response.text(),'TT_ROOM_DATA')
          else { const json = await response.json(); data = room.platform === 'douyu' ? json.room : Number(json.code) === 0 ? json.data : null }
          const live = data && (room.platform === 'huya' ? data.state === 'ON' && !replay(data.isReplay) : room.platform === 'douyu' ? Number(data.show_status) === 1 && !replay(data.videoLoop) : Number(data.live_status) === 1)
          if (live) start = startFor(room.platform,data,now())
          cache[address] = {start,checkedAt:now(),requestedAt,coverProtocol:1,...(live?coversFor(room.platform,data):{})}
        } catch { cache[address] = {start:0,checkedAt:now(),requestedAt,coverProtocol:1} }
        lastRequestAt = requestedAt
        for (const item of rooms) if (target(item) === address && item.live && !item.stale && item.statusKnown !== false) {
          if(!item.liveStartedAt)item.liveStartedAt=start
          const entry=cache[address]
          if(entry.coverKind==='snapshot')Object.assign(item,{cover:entry.cover,coverFallback:entry.coverFallback||item.cover||'',coverKind:'snapshot'})
          else item.coverRetryAt=Math.max(entry.checkedAt+TIME_TTL,cache['@cooldown-'+item.platform]?.until||0)
        }
      }
      for(const room of rooms)if(room.coverKind!=='snapshot'&&!room.coverRetryAt)room.coverRetryAt=Math.max(now()+1000,budget.requests>=12?budget.windowStartedAt+60000:0,cache['@cooldown-'+room.platform]?.until||0)
      await storageSet(Object.fromEntries(Object.entries(cache).sort((a,b) => b[1].checkedAt-a[1].checkedAt).slice(0,2000)))
      return rooms
    }
    return (rooms) => {
      const task = () => globalThis.navigator?.locks ? navigator.locks.request('yubo-official-live-times',() => run(rooms)) : run(rooms)
      const result = timeQueue.catch(() => {}).then(task)
      timeQueue = result.catch(() => {})
      return result
    }
  }
  globalThis.YuboRoomData = { titleFor, coversFor, metadataFor, followRoom, roomIdentity, cardRooms, selectCardRooms, imageUrl, mergeActivitySnapshots, mergeTitles, timestamp, startFor, liveStart, durationText, sortMode, sortRooms, createTimeReader, isReplay:replay, TIME_CACHE_KEY }
})()
