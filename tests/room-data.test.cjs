const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const root = path.resolve(__dirname,'..')
const roomDataSource = fs.readFileSync(path.join(root,'static/room-data.js'),'utf8')
// intro/title verified from the user's subscribeList screenshot; identities anonymized.
const huyaRecord = require('./fixtures/huya-subscribe-record.json')
function workerHarness() {
  const data = { local:{},sync:{enabled_platforms:['bilibili','douyu','huya']} }, calls=[]
  const state = { huya:{status:200,result:{list:[structuredClone(huyaRecord)]}},
    douyu:{data:{list:[{room_id:9999,nickname:'斗鱼测试',show_status:1,videoLoop:0,url:'/9999',room_name:'斗鱼标题'}]}},
    bilibili:{code:0,data:{list:[{roomid:6,uname:'B站测试',live_status:1,title:'B站标题'}]}} }
  const start=Math.floor(Date.now()/1000)-3600
  state.huya.result.list[0].startTime=start
  state.douyu.data.list[0].show_time=start
  state.bilibili.data.list[0].live_time=start
  state.bilibili.data.list[0].keyframe='https://i0.hdslb.com/fixture.jpg'
  state.douyu.data.list[0].room_src='https://rpic.douyucdn.cn/asrpic/fixture.jpg'
  state.huya.result.list[0].screenshot='https://huyaimg.msstatic.com/fixture.jpg'
  const event=()=>({addListener(){}})
  const area=(name)=>({get(key,callback){queueMicrotask(()=>callback({[key]:structuredClone(data[name][key])}))},set(values,callback){Object.assign(data[name],structuredClone(values));queueMicrotask(()=>callback?.())},remove(){}})
  const context=vm.createContext({URL,AbortSignal,crypto,console,fetch:async(address,init)=>{
    calls.push({address,init}); const url=new URL(address)
    let payload
    if(url.pathname.includes('checkLogin'))payload={isLogined:true,uid:'test-user'}
    else if(url.hostname==='fw.huya.com')payload=state.huya
    else if(url.hostname==='api.live.bilibili.com')payload=state.bilibili
    else if(url.hostname==='www.douyu.com')payload=state.douyu
    else throw new Error('Unexpected URL '+address)
    if(payload instanceof Error)throw payload
    return {ok:true,json:async()=>structuredClone(payload)}
  },chrome:{storage:{local:area('local'),sync:area('sync'),onChanged:event()},runtime:{id:'test-extension',onMessage:event(),onInstalled:event(),onStartup:event()},
    alarms:{get:async()=>({name:'yubo-check-live-status'}),onAlarm:event()},notifications:{onClicked:event()},tabs:{create(){throw new Error('No tabs should open')}}}})
  context.importScripts=(...files)=>files.forEach((file)=>vm.runInContext(fs.readFileSync(path.resolve(root,'static/background',file),'utf8'),context))
  vm.runInContext(fs.readFileSync(path.join(root,'static/background/yubo-worker.js'),'utf8'),context)
  return {context,data,state,calls}
}
function moduleOnly(){const context=vm.createContext({URL});vm.runInContext(roomDataSource,context);return context.YuboRoomData}
test('platform cover selection prefers real screenshot fields and retains a distinct poster fallback',()=>{
  const m=moduleOnly(),poster='https://rpic.douyucdn.cn/live-cover/poster.png',shot='https://rpic.douyucdn.cn/asrpic/261021/12157371_src_1732.avif/dy4'
  const douyu=m.coversFor('douyu',{room_pic:shot,room_src:'asrpic/261021/12157371_src_1732.avif/dy4',coverSrc:poster})
  assert.equal(douyu.cover,shot);assert.equal(douyu.coverFallback,poster);assert.equal(douyu.coverKind,'snapshot')
  assert.equal(m.coversFor('douyu',{room_src:'asrpic/fixture.jpg'}).cover,'https://rpic.douyucdn.cn/asrpic/fixture.jpg')
  assert.equal(m.coversFor('douyu',{room_src:poster}).coverKind,'cover')
  assert.equal(m.coversFor('bilibili',{keyframe:'//i0.hdslb.com/shot.jpg',user_cover:'https://i0.hdslb.com/poster.jpg'}).cover,'https://i0.hdslb.com/shot.jpg')
  assert.equal(m.coversFor('bilibili',{keyframe:'//i0.hdslb.com/shot.jpg',user_cover:'https://i0.hdslb.com/poster.jpg'}).coverFallback,'https://i0.hdslb.com/poster.jpg')
  assert.equal(m.coversFor('huya',{screenshot:'https://huyaimg.msstatic.com/shot.jpg',cover:'https://huyaimg.msstatic.com/poster.jpg'}).coverKind,'snapshot')
  assert.equal(m.coversFor('huya',{screenshot:'javascript:alert(1)',cover:'https://huyaimg.msstatic.com/poster.jpg'}).coverKind,'cover')
  assert.equal(m.coversFor('douyu',{}).cover,'')
})
test('Huya title mapping prioritizes actual subscribeList intro and retains alternate schema compatibility',()=>{
  const m=moduleOnly()
  assert.equal(m.titleFor('huya',huyaRecord),'回来开工')
  assert.equal(m.titleFor('huya',{intro:' 实际接口标题 ',introduction:'其他接口旧标题'}),'实际接口标题')
  assert.equal(m.titleFor('huya',{introduction:' 当前直播标题 ',roomName:'旧字段'}),'当前直播标题')
  assert.equal(m.titleFor('huya',{introduction:'  ',sLiveDesc:'官方关注标题'}),'官方关注标题')
  assert.equal(m.titleFor('huya',{introduction:{},roomName:'兼容标题'}),'兼容标题')
  assert.equal(m.titleFor('huya',{introduction:123,title:false}), '')
})
test('missing title retains same-room cache with a stale marker, but never reuses another room or mutates inputs',()=>{
  const m=moduleOnly(),old={id:'huya_1',platform:'huya',url:'https://www.huya.com/1',title:'旧标题'}
  const next={...old,title:''},merged=m.mergeTitles([next],[old])[0]
  assert.equal(merged.title,'旧标题');assert.equal(merged.titleStale,true);assert.equal(next.title,'')
  assert.equal(m.mergeTitles([{...next,url:'https://www.huya.com/2'}],[old])[0].title,'')
  assert.equal(m.mergeTitles([{...next,title:'新标题'}],[old])[0].titleStale,false)
})
test('real background polling stores fresh titles from all three platforms and preserves them on later missing fields',async()=>{
  const h=workerHarness()
  const first=await h.context.fetchAllPlatforms()
  assert.deepEqual(Array.from(first.rooms,r=>r.title),['B站标题','斗鱼标题','回来开工'])
  assert.deepEqual(h.data.local.yubo_last_rooms.map(r=>r.title),['B站标题','斗鱼标题','回来开工'])
  assert.ok(first.rooms.every(r=>Number.isFinite(r.liveStartedAt)&&r.liveStartedAt>0),'all three list mappers retain official start times')
  assert.equal(h.calls.length,4,'list timestamps require no per-room requests')
  delete h.state.huya.result.list[0].intro
  delete h.state.douyu.data.list[0].room_name
  delete h.state.bilibili.data.list[0].title
  await h.context.fetchAllPlatforms()
  assert.deepEqual(h.data.local.yubo_last_rooms.map(r=>r.title),['B站标题','斗鱼标题','回来开工'])
  assert.ok(h.data.local.yubo_last_rooms.every(r=>r.titleStale))
  h.state.huya.result.list[0].intro='虎牙更新标题'
  await h.context.fetchAllPlatforms()
  const huya=h.data.local.yubo_last_rooms.find(r=>r.platform==='huya')
  assert.equal(huya.title,'虎牙更新标题');assert.equal(huya.titleStale,false)
  assert.ok(h.calls.every(c=>c.init.credentials==='include'))
})
test('actual unauthenticated Huya status 1401 is an auth error, never an empty successful list that erases cached titles',async()=>{
  const h=workerHarness();await h.context.fetchAllPlatforms()
  h.state.huya={status:1401,message:'未登录！'}
  const result=await h.context.fetchAllPlatforms(),room=result.rooms.find(r=>r.platform==='huya')
  assert.equal(result.diagnostics.huya.authRequired,true)
  assert.equal(room.title,'回来开工');assert.equal(room.stale,true)
})
test('malformed Huya lists retain cache instead of succeeding with no rooms',async()=>{
  const h=workerHarness();await h.context.fetchAllPlatforms()
  h.state.huya={status:200,result:{unexpected:[]}}
  const result=await h.context.fetchAllPlatforms()
  assert.equal(result.diagnostics.huya.ok,false)
  assert.equal(result.rooms.find(r=>r.platform==='huya').title,'回来开工')
})
