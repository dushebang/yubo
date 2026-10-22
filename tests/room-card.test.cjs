const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const root=path.resolve(__dirname,'..'),now=Date.parse('2026-10-21T08:00:00Z')
function modules(){
  const context=vm.createContext({URL,console})
  for(const file of ['room-data.js','room-card.js'])vm.runInContext(fs.readFileSync(path.join(root,'static',file),'utf8'),context)
  return {data:context.YuboRoomData,card:context.YuboRoomCard}
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const base=(platform='douyu')=>({id:'room-1',platform,name:'主播',title:'直播标题',url:'https://www.douyu.com/1',live:true,statusKnown:true,liveStartedAt:now-3600000,cover:'https://image.test/asrpic/1.jpg',coverKind:'snapshot'})
test('all tabs use the identical card model and renderer in both modes; activity only removes favorite controls',()=>{
  const {data,card}=modules()
  const render=card.create({escape,icons:{douyu:'DY',huya:'HY',bilibili:'BL'},heading:room=>'<strong>'+escape(room.name)+'</strong><i>'+escape(room.title)+'</i>',duration:room=>'<time>'+data.durationText(room.liveStartedAt,now)+'</time>',image:room=>'<img data-cover src="'+escape(room.cover)+'">'})
  for(const platform of ['douyu','huya','bilibili'])for(const coverMode of [false,true]){
    const room=base(platform)
    const official=data.selectCardRooms([room],{now,coverMode,defaultAvatar:'fallback.png'})[0]
    const temporary=data.selectCardRooms([room],{temporary:true,now,coverMode,defaultAvatar:'fallback.png',favorites:[room.id]})[0]
    assert.equal(official.live,temporary.live);assert.equal(official.liveStartedAt,temporary.liveStartedAt)
    assert.equal(temporary.canFavorite,false);assert.equal(temporary.favorite,false)
    const standard=render(official,{coverMode}),activity=render(temporary,{coverMode})
    assert.equal(standard.replace(/<button class="star [\s\S]*?<\/button>/,''),activity.replace('has-room-order ','').replace(/<span class="room-order-controls"[\s\S]*?<\/span>/,''))
    for(const html of [standard,activity]){assert.match(html,/<time>1h0m<\/time>/);assert.match(html,/data-cover/);assert.match(html,/直播标题/)}
    assert.doesNotMatch(activity,/data-star/)
  }
})
test('one selector applies live/platform/group/search filters and time ordering consistently to all tab types',()=>{
  const {data}=modules(),rooms=[base(),{...base(),id:'room-2',liveStartedAt:now-1800000},{...base(),id:'off',live:false},{...base(),id:'unknown',statusKnown:false}]
  const ids=(options)=>Array.from(data.selectCardRooms(rooms,{now,...options}),r=>r.id)
  assert.deepEqual(ids({filter:'live',mode:'newest'}),['room-2','room-1'])
  assert.deepEqual(ids({coverMode:true,mode:'newest'}),['room-2','room-1'])
  assert.deepEqual(ids({temporary:true,coverMode:true,mode:'newest'}),['room-1','room-2'])
  assert.deepEqual(ids({filter:'favorites',favorites:['room-1','off'],mode:'newest'}),['room-1','off'])
  assert.deepEqual(ids({group:'G',groups:{'room-1':'G'},mode:'oldest'}),['room-1'])
  assert.deepEqual(ids({platform:'huya'}),[])
  assert.deepEqual(ids({matches:room=>room.id==='room-2'}),['room-2'])
  assert.equal(data.cardRooms([rooms[3]],{temporary:true})[0].stale,true)
  assert.equal(rooms[3].live,true,'normalization must not mutate storage records')
})
test('page and worker follow adapters share title, screenshot and time mappings with activity metadata',()=>{
  const {data}=modules()
  const fixtures={douyu:{room_id:1,nickname:'斗鱼',url:'/1',show_status:1,videoLoop:0,show_time:(now-3600000)/1000,room_name:'标题',room_pic:'https://rpic.douyucdn.cn/asrpic/1.jpg'},huya:{uid:2,profileRoom:2,nick:'虎牙',isLive:true,startTime:(now-3600000)/1000,intro:'标题',screenshot:'https://image.test/2.jpg'},bilibili:{roomid:3,uname:'B站',live_status:1,live_time:(now-3600000)/1000,title:'标题',keyframe:'https://image.test/3.jpg'}}
  for(const [platform,item] of Object.entries(fixtures)){
    const official=data.followRoom(platform,item,now),activity=data.metadataFor(platform,item,now)
    for(const key of ['title','cover','coverKind','liveStartedAt'])assert.equal(official[key],activity[key])
    assert.equal(official.live,true);assert.equal(official.coverKind,'snapshot');assert.equal(official.liveStartedAt,now-3600000)
  }
})
test('shared card escapes titles, aliases and attributes without parsing platform HTML',()=>{
  const {data,card}=modules(),room=data.cardRooms([{...base(),name:'<img onerror=x>',id:'" autofocus="x'}],{aliases:()=>['<script>bad</script>']})[0]
  const html=card.create({escape,icons:{douyu:'DY'},heading:r=>escape(r.name),duration:()=>'',image:r=>escape(r.cover)})(room)
  assert.doesNotMatch(html,/<script>|<img onerror/)
  assert.match(html,/&lt;script&gt;/);assert.match(html,/data-star="&quot; autofocus=&quot;x"/)
})
test('card labels keep vanity numbers while links use the canonical room address',()=>{
  const {data,card}=modules(),room=data.cardRooms([data.followRoom('douyu',{room_id:12157371,url:'/88891',show_status:1,videoLoop:0},now)])[0]
  const html=card.create({escape,icons:{douyu:'DY'},heading:()=>'',duration:()=>'',image:()=>''})(room)
  assert.match(html,/href="https:\/\/www.douyu.com\/12157371"/)
  assert.match(html,/<span class="room">88891<\/span>/)
})
