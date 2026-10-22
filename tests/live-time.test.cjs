const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const source=fs.readFileSync(path.join(__dirname,'../static/room-data.js'),'utf8')
const now=Date.parse('2026-10-21T08:18:00Z'),start=now-8280000
function moduleOnly(){const context=vm.createContext({URL,AbortSignal,setTimeout,console});vm.runInContext(source,context);return {module:context.YuboRoomData,context}}
const room=(id,extra={})=>({id,name:id,platform:'douyu',url:'https://www.douyu.com/'+id,live:true,liveStartedAt:start,...extra})
test('activities keep source order regardless of main sort, live status or names; manual order overrides it',()=>{
  const {module:m}=moduleOnly(),rooms=[room('3',{name:'Z',statusKnown:true,live:false}),room('1',{name:'A',statusKnown:true}),room('2',{name:'B',statusKnown:true,liveStartedAt:now-1000})]
  for(const mode of ['default','newest','oldest']){
    assert.deepEqual(Array.from(m.sortRooms(rooms,{temporary:true,mode,now}),r=>r.id),['3','1','2'])
    assert.deepEqual(Array.from(m.selectCardRooms(rooms,{temporary:true,coverMode:true,mode,now}),r=>r.id),['1','2'])
    assert.deepEqual(Array.from(m.sortRooms(rooms,{temporary:true,roomOrder:['2'],mode,now}),r=>r.id),['2','3','1'])
  }
})
test('activity manual order outranks live state and both time modes without changing official priority',()=>{
  const {module:m}=moduleOnly(),rooms=[room('live',{statusKnown:true}),room('off',{live:false,statusKnown:true})]
  for(const mode of ['default','newest','oldest']){
    assert.deepEqual(Array.from(m.sortRooms(rooms,{temporary:true,roomOrder:['off','live'],mode,now}),r=>r.id),['off','live'])
    assert.deepEqual(Array.from(m.sortRooms(rooms,{roomOrder:['off','live'],mode,now}),r=>r.id),['live','off'])
  }
})
test('Douyu vanity number is display-only: detail requests and persistent caches use the real room ID',async()=>{
  const h=readerHarness(async url=>{assert.equal(url,'https://www.douyu.com/betard/12157371');return {ok:true,json:async()=>({room:{show_status:1,show_time:start/1000,room_pic:'https://rpic.douyucdn.cn/asrpic/real.jpg'}})}})
  const fresh=h.m.followRoom('douyu',{room_id:12157371,url:'/88891',show_status:1,videoLoop:0,room_src:'https://rpic.douyucdn.cn/live-cover/poster.jpg'},now)
  assert.equal(fresh.url,'https://www.douyu.com/12157371');assert.equal(fresh.canonicalRoomId,'12157371');assert.equal(fresh.displayRoomId,'88891')
  const legacy=room('dy_12157371',{url:'https://www.douyu.com/88891',coverKind:'cover'})
  h.saved[h.m.TIME_CACHE_KEY]={'https://www.douyu.com/betard/88891':{checkedAt:now,coverProtocol:1,start:0}}
  const result=await h.read([legacy,fresh])
  assert.equal(h.calls.length,1);assert.ok(result.every(room=>room.coverKind==='snapshot'))
  assert.ok(h.saved[h.m.TIME_CACHE_KEY]['https://www.douyu.com/betard/12157371'])
  await h.another()([fresh]);assert.equal(h.calls.length,1,'reuse real-room cache across vanity and numeric URLs')
})
test('activity screenshots match legacy vanity URLs by canonical identity and never match a different real room',()=>{
  const {module:m}=moduleOnly(),snapshot='https://rpic.douyucdn.cn/asrpic/activity.jpg'
  const collection={activities:[{rooms:[room('temp_douyu_12157371',{statusKnown:true,canonicalRoomId:'12157371',url:'https://www.douyu.com/12157371',cover:snapshot,coverKind:'snapshot',checkedAt:now})]}]}
  const input=[room('dy_12157371',{url:'https://www.douyu.com/88891',coverKind:'cover'})]
  assert.equal(m.mergeActivitySnapshots(input,collection,now)[0].cover,snapshot)
  const wrong=[room('dy_88891',{url:'https://www.douyu.com/88891',coverKind:'cover'})]
  assert.equal(m.mergeActivitySnapshots(wrong,collection,now),wrong,'a vanity number must not alias an unrelated real room')
  assert.equal(m.roomIdentity(room('huya_7017534',{platform:'huya',url:'https://www.huya.com/678555'})).requestRoomId,'678555','Huya user ID is not a room ID')
  const old={...input[0],title:'上次标题'},fresh={...input[0],url:'https://www.douyu.com/12157371',canonicalRoomId:'12157371',title:''}
  assert.equal(m.mergeTitles([fresh],[old])[0].title,'上次标题','canonical URL migration must not erase same-room titles')
})
test('fresh activity snapshots are reused by room identity, not activity-specific ID, without fetching',async()=>{
  const h=readerHarness(async()=>{throw new Error('must reuse activity image')})
  const snapshot='https://rpic.douyucdn.cn/asrpic/activity.jpg',poster='https://rpic.douyucdn.cn/live-cover/poster.jpg'
  const activityRoom=room('temp_douyu_12157371',{url:'https://www.douyu.com/12157371',cover:snapshot,coverKind:'snapshot',checkedAt:now,statusKnown:true})
  const collection={activities:[{rooms:[activityRoom]}]}
  h.saved.yubo_temporary_activities=collection
  const input=[room('official-12157371',{url:activityRoom.url,cover:poster,coverKind:'cover'})]
  const result=await h.read(input)
  assert.equal(result[0].cover,snapshot);assert.equal(result[0].coverFallback,poster);assert.equal(h.calls.length,0)
  assert.equal(input[0].cover,poster,'do not mutate follow-list records')
  for(const extra of [{stale:true},{live:false},{statusKnown:false},{checkedAt:now-300001},{checkedAt:now+1},{platform:'huya'},{url:'https://user:secret@www.douyu.com/12157371'}]){
    assert.equal(h.m.mergeActivitySnapshots(input,{activities:[{rooms:[{...activityRoom,...extra}]}]},now),input)
  }
})
function readerHarness(respond){
  const {module:m,context}=moduleOnly(),saved={},calls=[],waits=[]
  let clock=now,active=0,maxActive=0
  const area={get(key,callback){queueMicrotask(()=>callback({[key]:structuredClone(saved[key])}))},set(values,callback){Object.assign(saved,structuredClone(values));queueMicrotask(callback)}}
  const fetcher=async(url,init)=>{calls.push({url,init,at:clock});active++;maxActive=Math.max(maxActive,active);try{return await respond(url,init,clock)}finally{active--}}
  const options={fetch:fetcher,now:()=>clock,pause:async(ms)=>{waits.push(ms);clock+=ms}}
  return {m,context,saved,calls,waits,read:m.createTimeReader(area,options),another:()=>m.createTimeReader(area,options),advance:(ms)=>{clock+=ms},get maxActive(){return maxActive}}
}
test('official time normalization accepts seconds/ms and Bilibili CST without depending on local timezone',()=>{
  const {module:m}=moduleOnly()
  assert.equal(m.timestamp(start/1000,now),start)
  assert.equal(m.timestamp(String(start),now),start)
  assert.equal(m.timestamp('2026-10-21 14:00:00',now),start)
  for(const value of [null,undefined,false,true,{},[],0,-1,'bad','2026-02-30 14:00:00','0000-00-00 00:00:00',now+1,now-32*86400000,Infinity,NaN])assert.equal(m.timestamp(value,now),0,String(value))
  assert.equal(m.startFor('douyu',{show_time:start/1000},now),start)
  assert.equal(m.startFor('huya',{startTime:start/1000},now),start)
  assert.equal(m.startFor('bilibili',{live_time:'2026-10-21 14:00:00'},now),start)
  for(const payload of [{videoLoop:1},{isReplay:'1'},{live_status:2},{state:'REPLAY'}])assert.equal(m.startFor('douyu',{show_time:start/1000,...payload},now),0)
  for(const extra of [{live:false},{stale:true},{statusKnown:false},{replay:true}])assert.equal(m.liveStart(room('1',extra),now),0)
  assert.equal(m.durationText(start,now),'2h18m')
  assert.equal(m.durationText(now-120000,now),'2m')
  assert.equal(m.durationText(now-13680000,now),'3h48m')
  assert.equal(m.durationText(now-3600000,now),'1h0m')
  assert.equal(m.durationText(now,now),'0m')
  assert.equal(m.durationText(0,now),'')
})
test('favorites and live status always beat both time modes; manual order is retained and never mutated',()=>{
  const {module:m}=moduleOnly(),rooms=[room('a',{liveStartedAt:now-100000}),room('b',{liveStartedAt:now-200000}),room('c',{live:false}),room('d'),room('e',{live:false}),room('f',{live:false})]
  const options={favorites:['a','b','c'],favoriteOrder:['b','a','c'],streamerOrder:['f','e','d'],now}
  const original=JSON.stringify({rooms,options})
  const ids=(mode)=>Array.from(m.sortRooms(rooms,{...options,mode}),r=>r.id)
  assert.deepEqual(ids('default'),['b','a','c','d','f','e'])
  assert.deepEqual(ids('newest'),['a','b','c','d','f','e'])
  assert.deepEqual(ids('oldest'),['b','a','c','d','f','e'])
  assert.equal(JSON.stringify({rooms,options}),original)
  assert.deepEqual(ids('bad'),ids('default'))
})
test('missing, stale, future and replay times sort after known times only within their live/favorite layer',()=>{
  const {module:m}=moduleOnly(),rooms=[room('missing',{liveStartedAt:0}),room('known'),room('stale',{stale:true}),room('future',{liveStartedAt:now+1}),room('replay',{replay:true}),room('offline',{live:false})]
  for(const mode of ['newest','oldest']){
    const sorted=Array.from(m.sortRooms(rooms,{mode,now,streamerOrder:['missing','stale','future','replay','offline']}),r=>r.id)
    assert.deepEqual(sorted,['known','missing','stale','future','replay','offline'])
  }
  const temporary=Array.from(m.sortRooms([room('unknown',{statusKnown:false}),room('live',{statusKnown:true}),room('off',{statusKnown:true,live:false})],{temporary:true,favorites:['unknown'],mode:'newest',now}),r=>r.id)
  assert.deepEqual(temporary,['unknown','live','off'])
})
test('official detail reader caps each refresh at six requests, spaces them, deduplicates and shares persistent cache',async()=>{
  const h=readerHarness(async(url)=>({ok:true,json:async()=>({room:{room_id:Number(url.split('/').at(-1)),show_status:1,videoLoop:0,show_time:start/1000}})}))
  const rooms=Array.from({length:8},(_,i)=>room(String(i+1),{liveStartedAt:0}))
  const first=await h.read([...rooms,room('copy',{url:rooms[0].url,liveStartedAt:0})])
  assert.equal(h.calls.length,6);assert.equal(first[0].liveStartedAt,start);assert.equal(first.at(-1).liveStartedAt,start)
  assert.equal(first[6].liveStartedAt,0)
  assert.ok(h.calls.slice(1).every((call,i)=>call.at-h.calls[i].at>=400))
  const [second]=await Promise.all([h.another()(rooms),h.read(rooms)])
  assert.equal(h.calls.length,8);assert.equal(h.maxActive,1)
  assert.ok(second.every(r=>r.liveStartedAt===start))
  assert.ok(h.calls.every(c=>c.init.credentials==='omit'&&new URL(c.url).hostname==='www.douyu.com'))
  assert.ok(h.calls[6].at-h.calls[5].at>=400)
})
test('failed/blocked detail lookup retains live status but no fabricated time, backs off, and recovers after TTL',async()=>{
  let fail=true
  const h=readerHarness(async()=>{if(fail)throw new Error('blocked');return {ok:true,json:async()=>({room:{show_status:1,videoLoop:0,show_time:start/1000}})}})
  const input=[room('1',{liveStartedAt:0,title:'标题'})]
  const first=await h.read(input)
  assert.equal(first[0].live,true);assert.equal(first[0].title,'标题');assert.equal(first[0].liveStartedAt,0)
  await h.another()(input);assert.equal(h.calls.length,1)
  h.advance(300001);fail=false
  assert.equal((await h.read(input))[0].liveStartedAt,start)
  assert.equal(h.calls.length,2)
  await h.read([room('1',{live:false})])
  assert.equal((await h.read(input))[0].liveStartedAt,start)
  assert.equal(h.calls.length,3,'offline transition invalidates previous-session cache')
})
test('reader uses only allowlisted platform endpoints and never fetches offline, replay, stale or unknown-status rooms',async()=>{
  const h=readerHarness(async()=>{throw new Error('must not request')})
  const rooms=[room('1',{live:false}),room('2',{replay:true}),room('3',{stale:true}),room('4',{statusKnown:false}),room('5',{url:'https://www.douyu.com.evil.test/5'}),room('6',{url:'https://user:secret@www.douyu.com/6'}),room('7',{url:'https://www.douyu.com/7/extra'}),room('8',{url:'https://127.0.0.1/8'})]
  await h.read(rooms)
  assert.equal(h.calls.length,0)
})
test('Bilibili and Huya official details verify live state and extract actual start fields',async()=>{
  const h=readerHarness(async(url)=>new URL(url).hostname==='api.live.bilibili.com'?{ok:true,json:async()=>({code:0,data:{room_id:8016907,live_status:1,live_time:'2026-10-21 14:00:00'}})}:{ok:true,text:async()=>`var TT_ROOM_DATA={"state":"ON","isReplay":false,"startTime":${start/1000}};`})
  h.context.YuboTemporary={assignedObject:(text)=>JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1))}
  const result=await h.read([room('b',{platform:'bilibili',url:'https://live.bilibili.com/616',liveStartedAt:0}),room('h',{platform:'huya',url:'https://www.huya.com/660000',liveStartedAt:0})])
  assert.ok(result.every(r=>r.liveStartedAt===start));assert.equal(h.calls.length,2)
})
test('multiple pages share a twelve-per-minute budget; rate limits stop other requests to that platform',async()=>{
  const h=readerHarness(async()=>({ok:true,json:async()=>({room:{show_status:1,show_time:start/1000}})}))
  const rooms=Array.from({length:20},(_,i)=>room(String(i+1),{liveStartedAt:0}))
  await h.read(rooms);await h.another()(rooms);await h.read(rooms)
  assert.equal(h.calls.length,12)
  h.advance(60001);await h.read(rooms)
  assert.equal(h.calls.length,18)
  const limited=readerHarness(async()=>({ok:false,status:429,headers:{get:()=> '600'}}))
  await limited.read(rooms);assert.equal(limited.calls.length,1)
  limited.advance(300001);await limited.another()(rooms);assert.equal(limited.calls.length,1)
  limited.advance(300001);await limited.read(rooms);assert.equal(limited.calls.length,2)
})
test('poster-only list records get screenshot enrichment even with a valid start; cache survives later poster responses',async()=>{
  const poster='https://rpic.douyucdn.cn/live-cover/poster.jpg'
  let suffix='first'
  const h=readerHarness(async()=>({ok:true,json:async()=>({room:{show_status:1,videoLoop:0,room_pic:'https://rpic.douyucdn.cn/asrpic/'+suffix+'.jpg',coverSrc:poster}})}))
  const input=[room('1',{cover:poster,coverKind:'cover'})]
  h.saved[h.m.TIME_CACHE_KEY]={'https://www.douyu.com/betard/1':{start,checkedAt:now}}
  const first=await h.read(input)
  assert.equal(h.calls.length,1,'old time-only cache must not suppress screenshot retrieval')
  assert.equal(first[0].liveStartedAt,start,'missing detail timestamp must not erase valid list time')
  assert.equal(first[0].cover,'https://rpic.douyucdn.cn/asrpic/first.jpg')
  assert.equal(first[0].coverFallback,poster)
  const cached=await h.another()(input)
  assert.equal(h.calls.length,1);assert.equal(cached[0].coverKind,'snapshot')
  h.advance(300001);suffix='second'
  assert.equal((await h.read(input))[0].cover,'https://rpic.douyucdn.cn/asrpic/second.jpg')
  assert.equal(h.calls.length,2)
})
