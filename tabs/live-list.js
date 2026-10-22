(async()=>{
  const app=document.querySelector('#app'),sync=chrome.storage.sync,local=chrome.storage.local
  const tvIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="16" height="13" rx="3"/><path d="M8 3l4 3 4-3"/><path d="M9 12h.01M15 12h.01M9 16h6"/></svg>'
  const names={bilibili:'哔哩哔哩',douyu:'斗鱼',huya:'虎牙'}
  const platformIcons={
    bilibili:tvIcon,
    douyu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.1 9.1 2.7 6.5l.6 5.3-.6 5.4 2.8-2.4c2.2 2.1 5.2 3.2 8.7 3l2.7 2.1.4-3.1c2.2-.9 3.8-2.5 4.7-4.8-.9-2.3-2.5-3.9-4.7-4.8l-.4-3.1-2.7 2.1c-3.5-.2-6.5.9-8.7 3z"/><circle cx="16.8" cy="11.2" r=".65" fill="currentColor" stroke="none"/><path d="M14.2 13.2c-.5.9-1.2 1.6-2.1 2"/></svg>',
    huya:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8.1 4.5 4.2l4.8 1.7a9.4 9.4 0 0 1 5.4 0l4.8-1.7L18 8.1c1.5 1.5 2.2 3.4 2.2 5.6 0 4.1-3.4 6.5-8.2 6.5s-8.2-2.4-8.2-6.5c0-2.2.7-4.1 2.2-5.6z"/><path d="M9 11.8c.8-.7 1.7-.7 2.5 0M13.5 11.8c.8-.7 1.7-.7 2.5 0M10.7 14.4l1.3.8 1.3-.8M12 15.2v1.3M8.4 8.2l1.1 1.1M15.6 8.2l-1.1 1.1M5.8 13.3l2 .6M18.2 13.3l-2 .6"/></svg>'
  }
  // Offline Hanyu Pinyin index for common characters; direct Hanzi matching still works for every character.
  const pinyinIndex=new Map()
  for(const line of `
a 啊阿
ai 哀矮挨爱艾碍
an 安俺岸按案暗
ang 昂
ao 奥熬傲澳凹
ba 吧八巴把爸
bai 白百摆败柏
ban 班半办板版伴搬扮
bang 帮棒榜邦绑
bao 包宝保抱报爆暴
bei 被北备背倍杯贝悲
ben 本笨奔
beng 崩蹦
bi 比笔必逼毕壁避币彼鼻碧闭哔
bian 边编变便遍辩扁
biao 表标飙
bie 别憋
bin 宾彬
bing 冰兵病并饼
bo 波博播薄伯
bu 不部步布补
ca 擦
cai 才菜采财彩猜
can 参残餐
cang 藏仓苍
cao 操草曹
ce 测策
ceng 曾层
cha 查茶差察叉插
chai 柴拆
chan 产缠颤
chang 长常唱场厂昌畅
chao 超朝潮炒
che 车彻撤
chen 陈晨沉尘称
cheng 成城程乘诚
chi 吃持迟池赤尺
chong 冲重宠虫
chou 丑抽愁仇
chu 出初处除楚
chuan 川传穿船
chuang 创窗床
chui 吹
chun 春纯唇
chuo 戳
ci 次此词刺
cong 从聪
cou 凑
cu 粗促
cuan 窜
cui 催脆翠
cun 村存
cuo 错
da 大打达答
dai 带代待袋呆
dan 单但胆蛋淡弹
dang 当党档荡
dao 到道倒导岛刀
de 的得德
deng 等灯登
di 地第低敌滴帝弟递
dian 点电店典
diao 掉调雕吊
die 跌叠
ding 定顶丁订
dong 东动懂冬洞
dou 斗都豆抖
du 都读度独毒堵赌
duan 断短段
dui 对队堆
dun 吨顿盾蹲
duo 多夺朵
e 额恶饿
en 恩
er 二而耳儿
fa 发法罚
fan 反范饭翻烦凡
fang 方放防房访
fei 非飞费废肥
fen 分份粉奋
feng 风封峰疯
fo 佛
fou 否
fu 服福付复夫父副
gai 改该盖概
gan 干感敢甘
gang 刚钢港
gao 高搞告稿
ge 个各歌哥格隔
gei 给
gen 跟根
geng 更耿
gong 工公功宫共攻
gou 狗够购沟
gu 古故顾鼓谷股
gua 挂瓜
guai 怪乖
guan 关观管官馆惯
guang 光广逛
gui 鬼贵归规
gun 滚棍
guo 国过果锅郭
ha 哈
hai 还海害嗨
han 汉韩寒含喊
hang 行航杭
hao 好号浩豪
he 和合喝何河贺
hei 黑
hen 很狠
heng 横恒
hong 红宏轰
hou 后候厚猴
hu 湖虎互护呼户
hua 花华画话化
huai 怀坏
huan 欢环换还
huang 黄皇煌荒
hui 会回辉灰惠
hun 混魂
huo 活火或获
ji 机几级集记极及季基计急鸡吉技己寄激际
jia 家加假价甲架佳
jian 间见建剑简件坚减尖健
jiang 将江奖讲降
jiao 叫教交脚角焦
jie 接结节姐解界
jin 进今金近紧尽
jing 京精经静景竟境镜
jiong 窘炯
jiu 九就旧酒久究
ju 句局举巨具居剧拒
juan 卷捐
jue 觉决绝
jun 军君均俊
ka 卡咖
kai 开凯慨
kan 看刊砍
kang 康抗
kao 考靠烤
ke 可科客课刻克
ken 肯恳
keng 坑
kong 空控孔恐
kou 口扣
ku 苦哭库酷
kua 跨夸
kuai 快块
kuan 款宽
kuang 狂矿框
kui 亏愧
kun 困昆
kuo 括扩
la 拉啦辣
lai 来赖
lan 蓝兰懒览
lang 浪狼郎
lao 老劳牢
le 了乐勒
lei 类累雷泪
leng 冷
 lian 连联练脸恋炼
li 里力理李立利离礼丽历厉黎璃例哩
liao 聊料疗
lie 列烈猎
lin 林临邻
ling 令灵领零铃
liu 六流留刘
long 龙隆笼
lou 楼漏
lu 路鲁陆录露
lv 绿率旅吕
luan 乱
lue 略
lun 论轮
luo 罗落洛逻
ma 吗马妈麻骂码
mai 买卖麦
man 满慢漫曼
mang 忙芒
mao 毛猫冒帽茂
me 么
mei 美没每妹梅
men 门们
meng 梦蒙盟猛孟
mi 米迷密秘蜜
mian 面棉免
miao 秒妙描
mie 灭
min 民敏
ming 名明鸣命
mo 莫魔摸模末默墨
mou 某谋
mu 木目母幕
na 那拿哪纳
nai 奶耐乃
nan 南男难
nao 闹脑恼
ne 呢
nei 内
nen 嫩
neng 能
ni 你拟尼逆泥
nian 年念
niang 娘
niao 鸟尿
nie 聂
nin 您
ning 宁凝
niu 牛
nong 农浓
nu 怒努
nv 女
nuan 暖
nue 虐
nuo 诺
o 哦
ou 欧偶
pa 怕爬帕
pai 排拍派牌
pan 盘判盼
pang 胖旁
pao 跑炮抛
pei 配陪培
pen 喷
peng 朋碰棚
pi 批皮屁匹
pian 片篇骗
piao 漂票
pie 撇
pin 品拼
ping 平评屏
po 破迫坡
pu 普谱扑
qi 七起其气期奇器骑棋齐启企弃
qia 恰
qian 前钱千签浅
qiang 强枪墙抢
qiao 桥巧敲乔
qie 切且窃
qin 亲琴秦勤
qing 情请清青轻庆
qiong 穷
qiu 求球秋
qu 去取区曲趋
quan 全权圈泉
que 却缺确
qun 群
ran 然染
rang 让
rao 绕扰
re 热
ren 人认任忍仁
reng 仍
ri 日
rong 容荣融
rou 肉柔
ru 如入辱
ruan 软
rui 瑞
run 润
ruo 若弱
sa 撒萨
sai 塞赛
san 三散
sang 丧
sao 扫骚
se 色
sen 森
seng 僧
sha 杀沙傻
shai 晒
shan 山闪善删
shang 上商伤赏
shao 少烧稍
she 社设蛇
shen 神身深什沈
sheng 生声胜省圣
shi 是时事十世使市师实式石视识食始史诗
shou 手收受首守瘦
shu 书数树输属熟术鼠
shua 刷
shuai 帅摔
shuan 栓
shuang 双爽
shui 水睡
shun 顺瞬
shuo 说硕
si 四思死斯私丝似
song 送宋松
sou 搜
su 苏速诉
suan 算酸
sui 随岁虽碎
sun 孙损
suo 所索锁
ta 他她它塔踏
tai 太台抬态泰
tan 谈探弹坦
tang 唐堂糖躺
tao 套逃涛桃
te 特
teng 腾
ti 题体提替踢
tian 天田填甜
tiao 条跳调
tie 铁贴
ting 听停挺厅
tong 同通痛统童
tou 头投透
tu 图土突徒
tuan 团
tui 推退腿
tun 吞
tuo 脱托拖
wa 挖瓦娃
wai 外歪
wan 玩完晚万
wang 王网忘望往
wei 为位微未围威卫伟维
wen 文问闻温
weng 翁
wo 我握窝
wu 无五武物务舞乌屋
xi 西系喜戏习细洗希
xia 下夏峡
xian 先线现闲显鲜县贤仙
xiang 想相向像乡香项箱
xiao 小笑校消晓
xie 些谢写鞋协邪
xin 心新信欣辛
xing 行星性姓兴型
xiong 雄熊
xiu 修休秀
xu 许需续徐序
xuan 选宣悬
xue 学雪血
xun 寻讯训迅
ya 呀亚压牙
yan 眼言演烟严盐延炎
yang 阳杨样养洋
yao 要药摇耀
ye 也夜业叶野
yi 一以已意义衣艺易亿伊益依移忆异
yin 音因引银阴印
ying 英影应赢营硬
yo 哟
yong 用永勇拥
you 有又由优游友油
yu 鱼与于语雨余玉育域宇遇欲
yuan 元原员圆源远愿院
yue 月越约乐
yun 云运
za 杂砸
zai 在再载
zan 咱赞
zao 早造遭
ze 则责
zei 贼
zen 怎
zeng 增曾
zha 扎炸眨
zhai 摘宅
zhan 战站展占
zhang 张长章涨掌
zhao 找照招赵着
zhe 这者着折哲
zhen 真镇阵针震
zheng 正争证整政
zhi 之只知直值指制至治职纸质志
zhong 中种重众钟终
zhou 周州洲昼
zhu 主住注朱祝助猪竹
zhua 抓
zhuan 专转赚
zhuang 装状庄
zhui 追
zhun 准
zhuo 着桌卓
zi 子自字资紫
zong 总宗纵
zou 走
zu 组足族
zuan 钻
zui 最嘴罪
zun 尊
zuo 做作坐左
`.trim().split('\n')){
    const [syllable,characters]=line.trim().split(/\s+/)
    for(const character of characters||'')if(!pinyinIndex.has(character))pinyinIndex.set(character,syllable)
  }
  const compactSearch=(value)=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'')
  function searchForms(value){
    const direct=compactSearch(value);let full='',initials=''
    for(const character of direct){const syllable=pinyinIndex.get(character);full+=syllable||character;initials+=syllable?syllable[0]:character}
    return {direct,full,initials}
  }
  function matchesSearch(value,query){
    const needle=compactSearch(query);if(!needle)return true
    const forms=searchForms(value)
    return forms.direct.includes(needle)||forms.full.includes(needle)||forms.initials.includes(needle)
  }
  function metaAliases(meta){
    const source=Array.isArray(meta&&meta.aliases)?meta.aliases:(meta&&meta.alias?[meta.alias]:[])
    return source.map((alias)=>String(alias||'').trim()).filter(Boolean)
  }
  const login={bilibili:'https://passport.bilibili.com/login',douyu:'https://www.douyu.com/',huya:'https://www.huya.com/'}
  const platformSearch={
    douyu:(query)=>'https://www.douyu.com/search?kw='+encodeURIComponent(query),
    huya:(query)=>'https://www.huya.com/search?hsk='+encodeURIComponent(query),
    bilibili:(query)=>'https://search.bilibili.com/all?keyword='+encodeURIComponent(query)
  }
  const state={rooms:[],diagnostics:{},favorites:[],order:[],streamerOrder:[],groups:{},groupNames:[],settings:{},streamerMeta:{},enabledPlatforms:Object.keys(names),filter:'all',liveCardMode:false,platform:'all',group:'all',query:'',refreshing:false,authNoticeDismissed:false,temporary:YuboTemporary.empty(),temporaryOnlyLive:false,temporaryMessage:''}
  const readLiveTimes=YuboRoomData.createTimeReader(local)
  let timer,searchComposing=false,pendingActivityRefresh='',orderingBusy=false,orderNeedsReload=false
  let coverTimer,coverReading=false,coverNextAt=0
  const viewDetails=new Map()
  const detailKey=room=>YuboRoomData.roomIdentity(room)?.key||room.platform+':'+room.url
  const coverView=()=>state.liveCardMode&&!document.hidden
  function currentRoomList(){
    const activity=state.filter==='temporary'?currentActivity():null
    return activity?{key:'activity:'+activity.id,rooms:activity.rooms,temporary:true}:{key:'official',rooms:state.rooms,temporary:false}
  }
  function withRoomDetails(rooms){
    return rooms.map(room=>{
      const details=viewDetails.get(detailKey(room))
      if(!details||Date.now()-details.checkedAt>300000||!room.live||room.stale||room.statusKnown===false)return room
      if(room.liveStartedAt&&details.liveStartedAt&&room.liveStartedAt!==details.liveStartedAt)return room
      const cover=room.coverKind==='snapshot'?{}:{cover:details.cover,coverFallback:details.coverFallback,coverKind:details.coverKind}
      return {...room,...cover,coverRetryAt:details.coverRetryAt,liveStartedAt:room.liveStartedAt||details.liveStartedAt}
    })
  }
  function scheduleCoverFill(){
    clearTimeout(coverTimer)
    if(!coverView()||state.refreshing||coverReading)return
    const missing=visible().filter(room=>room.live&&!room.stale&&room.statusKnown!==false&&room.coverKind!=='snapshot')
    if(!missing.length)return
    const earliest=Math.min(...missing.map(room=>Number(room.coverRetryAt)||0))
    coverTimer=setTimeout(fillRoomCovers,Math.max(500,coverNextAt-Date.now(),earliest-Date.now()))
  }
  async function fillRoomCovers(){
    if(!coverView()||state.refreshing||coverReading)return
    const source=currentRoomList(),candidates=visible().filter(room=>room.live&&!room.stale&&room.statusKnown!==false&&room.coverKind!=='snapshot'&&!(room.coverRetryAt>Date.now())).slice(0,6)
    if(!candidates.length){scheduleCoverFill();return}
    coverReading=true;coverNextAt=Date.now()+30000
    try{
      const result=await readLiveTimes(candidates)
      // List identity and source revision must still match; never write another tab's roster.
      const current=currentRoomList()
      if(current.key!==source.key||current.rooms!==source.rooms||!coverView())return
      const updates=new Map(result.map(room=>[room.id,room]))
      for(const room of result)viewDetails.set(detailKey(room),{cover:room.cover,coverFallback:room.coverFallback,coverKind:room.coverKind,coverRetryAt:room.coverRetryAt,liveStartedAt:room.liveStartedAt,checkedAt:Date.now()})
      // Activity definitions remain worker-owned. Both sources use the same detail cache above.
      if(!source.temporary){
        state.rooms=source.rooms.map(room=>updates.has(room.id)?withRoomDetails([room])[0]:room)
        await set(local,{yubo_last_rooms:state.rooms})
      }
      render()
    }catch{ /* Keep current covers; retry through the same rate-limited reader. */ }
    finally{coverReading=false;scheduleCoverFill()}
  }
  document.addEventListener('visibilitychange',scheduleCoverFill)
  function activateActivity(id){
    state.filter='temporary';state.group=id;state.temporaryMessage='';render()
    if(state.refreshing)pendingActivityRefresh=id
    else void refresh()
  }
  function finishRefresh(){
    state.refreshing=false;render()
    const pending=pendingActivityRefresh;pendingActivityRefresh=''
    if(pending&&state.filter==='temporary'&&state.group===pending)void refresh()
    else void schedule()
  }
  document.addEventListener('click',(e)=>{
    if(document.querySelector('dialog[open]'))return
    if(!state.query)return
    const target=e.target instanceof Element?e.target:null
    if(target&&target.closest('input,textarea,select,button,a,[contenteditable="true"],[contenteditable=""],.row'))return
    state.query='';render()
  })
  document.addEventListener('keydown',(e)=>{
    if(document.querySelector('dialog[open]'))return
    if(e.key==='Escape'){
      if(!e.isComposing&&!searchComposing&&state.query){e.preventDefault();state.query='';render()}
      return
    }
    const target=e.target instanceof Element?e.target:null
    if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing||searchComposing)return
    const targetIsFilterTab=!!(target&&target.closest('.filter-tab'))
    if(target&&target.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""]'))return
    if(target&&!targetIsFilterTab&&!target.closest('#live-view-toggle,#room-sort')&&target.closest('button,a'))return
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
      const tabs=[{filter:'all',group:'all'},{filter:'live',group:'all'},{filter:'favorites',group:'all'},...state.groupNames.map((group)=>({filter:'favorites',group})),...state.temporary.activities.map((activity)=>({filter:'temporary',group:activity.id}))]
      const current=tabs.findIndex((tab)=>tab.filter===state.filter&&tab.group===state.group)
      const index=current<0?0:(current+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length
      e.preventDefault()
      if(tabs[index].filter==='temporary')activateActivity(tabs[index].group)
      else{state.filter=tabs[index].filter;state.group=tabs[index].group;render()}
      const activeTab=document.querySelector('.filter-tab.active');if(activeTab)activeTab.focus()
      return
    }
    if(e.key==='/'){
      e.preventDefault()
      const search=document.getElementById('search')
      if(search){search.focus();search.select()}
      return
    }
    if(e.key.toLowerCase()==='v'){if(!e.repeat){e.preventDefault();state.liveCardMode=!state.liveCardMode;render()}return}
    if(e.key.toLowerCase()==='s'){
      if(state.filter==='temporary')return
      if(!e.repeat){const modes=['default','newest','oldest'],index=modes.indexOf(YuboRoomData.sortMode(state.settings.liveSort));e.preventDefault();setRoomSort(modes[(index+1)%modes.length])}
      return
    }
    if(e.key.toLowerCase()==='r'){e.preventDefault();void refresh({force:true});return}
    const filterByKey={'1':'all','2':'live','3':'favorites'}
    if(filterByKey[e.key]){state.filter=filterByKey[e.key];state.group='all';render();return}
    if(e.key==='?'){e.preventDefault();location.href='shortcuts.html'}
  })
  const get=(area,key)=>new Promise((resolve)=>area.get(key,(x)=>resolve(x[key])))
  const set=(area,values)=>new Promise((resolve)=>area.set(values,resolve))
  function setRoomSort(mode){state.settings={...state.settings,liveSort:YuboRoomData.sortMode(mode)};render();void set(local,{yubo_settings:state.settings})}
  const decode=(x)=>{if(typeof x!=='string')return x;try{return JSON.parse(x)}catch{return x}}
  const esc=(x)=>String(x==null?'':x).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  const time=(x)=>x?new Date(x).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):'—'
  const currentActivity=()=>state.temporary.activities.find((activity)=>activity.id===state.group)
  class AuthError extends Error{constructor(id){super((names[id]||id)+'登录已失效');this.platform=id;this.authRequired=true}}
  async function enabled(){const x=decode(await get(sync,'enabled_platforms'));return Array.isArray(x)?[...new Set(x.filter((id)=>names[id]))]:Object.keys(names)}
  async function fetchPlatform(id){
    if(id==='bilibili'){
      const r=await fetch('https://api.live.bilibili.com/xlive/web-ucenter/user/following?page=1&page_size=50&ignoreRecord=0&hit_ab=true',{credentials:'include'}),j=await r.json()
      if(Number(j.code)===-101||/账号未登录|未登录|登录失效/.test((j.message||'')+' '+(j.msg||'')))throw new AuthError(id)
      return (j.data&&j.data.list||[]).map(x=>YuboRoomData.followRoom(id,x))
    }
    if(id==='douyu'){
      const r=await fetch('https://www.douyu.com/wgapi/livenc/liveweb/follow/list',{credentials:'include'}),j=await r.json()
      const authCode=[j.code,j.error,j.errno].some((value)=>[-1,401,403].includes(Number(value))),message=[j.msg,j.message,j.errorMsg,j.error_msg].filter(Boolean).join(' ')
      if(authCode||/未登录|请登录|登录失效|未授权|unauthori[sz]ed|login required/i.test(message))throw new AuthError(id)
      return (j.data&&j.data.list||[]).map(x=>YuboRoomData.followRoom(id,x))
    }
    if(id==='huya'){
      const l=await fetch('https://www.huya.com/udb_web/checkLogin.php',{credentials:'include'}).then((r)=>r.json())
      if(![true,1,'1','true'].includes(l.isLogined))throw new AuthError(id)
      const j=await fetch('https://fw.huya.com/dispatch?do=subscribeList&uid='+encodeURIComponent(l.uid),{credentials:'include'}).then((r)=>r.json())
      if(Number(j.status)===1401||/未登录|请登录|登录失效/.test(String(j.message||j.msg||'')))throw new AuthError(id)
      if(!Array.isArray(j.result?.list))throw new Error('虎牙关注列表返回格式异常')
      return (j.result&&j.result.list||[]).map(x=>YuboRoomData.followRoom(id,x))
    }
    return []
  }
  async function loadSaved(){
    const v=await Promise.all([get(sync,'favorite_streamers'),get(local,'yubo_favorite_order'),get(local,'yubo_favorite_groups'),get(local,'yubo_favorite_group_names'),get(local,'yubo_settings'),get(local,'yubo_platform_diagnostics'),get(local,'yubo_last_rooms'),get(local,'yubo_last_refresh_at'),get(local,'yubo_streamer_meta'),get(sync,'enabled_platforms'),get(local,YuboTemporary.KEY)])
    const f=decode(v[0]),savedPlatforms=decode(v[9]);state.favorites=Array.isArray(f)?f:[];state.order=Array.isArray(v[1])?v[1]:[];state.groups=v[2]||{};state.groupNames=Array.isArray(v[3])?v[3]:['常看'];state.settings=v[4]||{};state.enabledPlatforms=Array.isArray(savedPlatforms)?[...new Set(savedPlatforms.filter((id)=>names[id]))]:Object.keys(names);state.diagnostics=Object.fromEntries(Object.entries(v[5]||{}).filter(([id])=>state.enabledPlatforms.includes(id)));state.rooms=Array.isArray(v[6])?v[6].filter((room)=>names[room.platform]&&state.enabledPlatforms.includes(room.platform)):[];state.updated=v[7]||0;state.streamerMeta=v[8]||{}
    state.temporary=v[10]&&Array.isArray(v[10].activities)?v[10]:await YuboTemporaryUI.request('read')
    const manual=await get(local,'yubo_streamer_order');state.streamerOrder=Array.isArray(manual)?manual:[]
  }
  function visible(){
    const list=currentRoomList(),q=state.query.trim()
    return YuboRoomData.selectCardRooms(withRoomDetails(list.rooms),{
      temporary:list.temporary,favorites:state.favorites,favoriteOrder:state.order,streamerOrder:state.streamerOrder,
      roomOrder:list.temporary?currentActivity()?.roomOrder:[],
      mode:state.settings.liveSort,coverMode:state.liveCardMode,onlyLive:list.temporary&&state.temporaryOnlyLive,
      filter:list.temporary?'all':state.filter,platform:state.platform,group:list.temporary?'all':state.group,groups:state.groups,
      defaultAvatar:chrome.runtime.getURL('icon-fish-48.png'),aliases:room=>metaAliases(state.streamerMeta[room.id]||{}),
      matches:q?room=>[room.name,room.title,room.category,room.displayRoomId,room.roomKey,room.id,room.url,names[room.platform],list.temporary?'':state.groups[room.id],...room.aliases].some(value=>matchesSearch(value,q)):null
    })
  }
  const titleEntityDecoder=document.createElement('textarea')
  function displayRoomTitle(value){
    let text=String(value||'')
    // Decode entity tokens only, never parse the platform's title as HTML.
    // A small depth limit handles double-encoded API responses without a loop.
    for(let depth=0;depth<3;depth++){
      const decoded=text.replace(/&(?:#[xX][\da-fA-F]{1,8}|#\d{1,10}|[a-zA-Z][a-zA-Z\d]{1,40});/g,(entity)=>{
        titleEntityDecoder.innerHTML=entity
        return titleEntityDecoder.value
      })
      if(decoded===text)break
      text=decoded
    }
    return text.replace(/\u00a0/g,' ').trim()
  }
  function roomHeading(r, staleLabel) {
    const title=displayRoomTitle(r.title)
    const tooltip=(r.titleStale?'上次标题（本次接口未返回）：':'')+title
    return '<span class="name-line '+(title?'has-room-title':'')+'"><span class="name">'+esc(r.name)+(r.stale?'<small class="stale-label">'+esc(staleLabel)+'</small>':'')+'</span>'+(title?'<span class="room-title" data-room-title="'+esc(tooltip)+'"><span class="room-title-text">'+esc(title)+'</span></span>':'')+'</span>'
  }
  let titleTooltip,titleTooltipTimer,titleTooltipAnchor
  function hideRoomTitleTooltip(){
    clearTimeout(titleTooltipTimer)
    titleTooltipAnchor?.removeAttribute('aria-describedby')
    titleTooltipAnchor=null
    if(titleTooltip)titleTooltip.hidden=true
  }
  function showRoomTitleTooltip(anchor){
    hideRoomTitleTooltip()
    titleTooltipTimer=setTimeout(()=>{
      if(!anchor.isConnected)return
      if(!titleTooltip){
        titleTooltip=document.createElement('div')
        titleTooltip.id='room-title-tooltip'
        titleTooltip.className='room-title-tooltip'
        titleTooltip.setAttribute('role','tooltip')
        document.body.append(titleTooltip)
      }
      titleTooltip.textContent=anchor.dataset.roomTitle
      titleTooltip.hidden=false
      titleTooltipAnchor=anchor
      anchor.setAttribute('aria-describedby',titleTooltip.id)
      const rect=anchor.getBoundingClientRect(),bounds=titleTooltip.getBoundingClientRect(),gap=9,edge=12
      titleTooltip.style.left=Math.max(edge,Math.min(rect.left,window.innerWidth-bounds.width-edge))+'px'
      const top=rect.bottom+gap+bounds.height<=window.innerHeight-edge?rect.bottom+gap:rect.top-bounds.height-gap
      titleTooltip.style.top=Math.max(edge,top)+'px'
    },220)
  }
  window.addEventListener('scroll',hideRoomTitleTooltip,true)
  window.addEventListener('resize',hideRoomTitleTooltip)
  window.addEventListener('blur',hideRoomTitleTooltip)
  document.addEventListener('keydown',(event)=>{if(event.key==='Escape')hideRoomTitleTooltip()})
  function measureRoomTitle(title) {
    if(!title?.isConnected)return
    const text=title.querySelector('.room-title-text'),distance=Math.max(0,text.scrollWidth-title.clientWidth)
    title.classList.toggle('is-scrolling',distance>1)
    title.style.setProperty('--title-travel',(-distance)+'px')
    title.style.setProperty('--title-duration',Math.max(6,distance/28+3)+'s')
  }
  const roomTitleObserver=new ResizeObserver((entries)=>{
    for(const entry of entries)measureRoomTitle(entry.target.closest('.room-title'))
  })
  function observeRoomTitles(){
    hideRoomTitleTooltip()
    roomTitleObserver.disconnect()
    app.querySelectorAll('.room-title').forEach((title)=>{
      measureRoomTitle(title);roomTitleObserver.observe(title);roomTitleObserver.observe(title.firstElementChild)
      title.addEventListener('mouseenter',()=>showRoomTitleTooltip(title))
      title.addEventListener('mouseleave',hideRoomTitleTooltip)
      const link=title.closest('.stream-link')
      link?.addEventListener('focus',()=>showRoomTitleTooltip(title))
      link?.addEventListener('blur',hideRoomTitleTooltip)
      link?.addEventListener('click',hideRoomTitleTooltip)
    })
    app.querySelectorAll('.live-duration').forEach((label)=>{
      label.addEventListener('mouseenter',()=>showRoomTitleTooltip(label))
      label.addEventListener('mouseleave',hideRoomTitleTooltip)
      label.addEventListener('focus',()=>showRoomTitleTooltip(label))
      label.addEventListener('blur',hideRoomTitleTooltip)
    })
    durationObserver.disconnect()
    app.querySelectorAll('.meta-line').forEach((line)=>{measureDuration(line);durationObserver.observe(line)})
  }
  function durationMarkup(room){
    const start=YuboRoomData.liveStart(room)
    if(!start)return ''
    const detail='平台开播时间：'+new Date(start).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）'
    return '<span class="live-duration" tabindex="0" data-live-start="'+start+'" data-room-title="'+esc(detail)+'" aria-label="'+esc(detail)+'"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 4.5V8l2.2 1.4" stroke-linecap="round"/></svg><span class="duration-text">'+esc(YuboRoomData.durationText(start))+'</span></span>'
  }
  function measureDuration(line){
    const label=line.querySelector('.live-duration'),tags=line.querySelector('.tags')
    if(!label||!tags)return
    if(!YuboRoomData.timestamp(Number(label.dataset.liveStart))){label.hidden=true;return}
    label.hidden=false
    label.hidden=tags.scrollWidth+label.offsetWidth+8>line.clientWidth+1
  }
  const durationObserver=new ResizeObserver((entries)=>entries.forEach((entry)=>measureDuration(entry.target)))
  function updateDurations(){
    app.querySelectorAll('[data-live-start]').forEach((label)=>{
      const text=YuboRoomData.durationText(Number(label.dataset.liveStart))
      label.querySelector('.duration-text').textContent=text
      if(!text)label.hidden=true
    })
    app.querySelectorAll('.meta-line').forEach(measureDuration)
  }
  setInterval(()=>{if(!document.hidden)updateDurations()},60000)
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateDurations()})
  function coverImage(room,lazy=true){
    return '<img data-stream-cover data-cover-fallback="'+esc(room.coverFallback||'')+'" src="'+esc(room.cover)+'" alt="'+esc(room.name)+'直播预览"'+(lazy?' loading="lazy"':'')+'>'
  }
  function observeCoverImages(){
    app.querySelectorAll('img[data-stream-cover]').forEach((img)=>{
      const fallback=()=>{
        const next=img.dataset.coverFallback;img.dataset.coverFallback=''
        if(next&&next!==img.getAttribute('src')){img.src=next;return}
        const parent=img.parentElement
        if(parent?.classList.contains('live-card-background')){const empty=document.createElement('span');empty.className='live-card-no-cover';empty.textContent='直播预览暂不可用';parent.replaceChildren(empty)}
        else if(parent?.classList.contains('hover-cover'))parent.hidden=true
      }
      img.addEventListener('error',fallback)
      if(img.complete&&!img.naturalWidth)fallback()
    })
  }
  const renderCard=YuboRoomCard.create({escape:esc,icons:platformIcons,heading:roomHeading,duration:durationMarkup,image:coverImage})
  const card=room=>renderCard(room,{coverMode:state.liveCardMode})
  function render(){
    state.rooms=YuboRoomData.mergeActivitySnapshots(state.rooms,state.temporary)
    if(state.filter==='temporary'&&!currentActivity()){state.filter='all';state.group='all'}
    const isTemporary=state.filter==='temporary',activity=currentActivity(),source=isTemporary?activity.rooms:state.rooms
    const liveOnlyFocused=document.activeElement?.id==='temporary-only-live'
    const list=visible(),live=source.filter((r)=>r.live&&(!isTemporary||(r.statusKnown&&!r.stale))).length,mainLive=state.rooms.filter((r)=>r.live).length,fav=state.rooms.filter((r)=>state.favorites.includes(r.id)).length
    const auth=isTemporary?[]:Object.entries(state.diagnostics).filter(([id,v])=>state.enabledPlatforms.includes(id)&&v.authRequired),failed=isTemporary?[]:Object.entries(state.diagnostics).filter(([id,v])=>state.enabledPlatforms.includes(id)&&!v.ok&&!v.authRequired)
    const platforms=Object.entries(names).filter(([id])=>isTemporary||state.enabledPlatforms.includes(id))
    const focused=document.activeElement&&document.activeElement.id==='search',cursor=focused?document.activeElement.selectionStart:null,sortFocused=!!document.activeElement?.closest('#room-sort')
    const previousTabs=app.querySelector('.filter-tabs'),previousActive=previousTabs?.querySelector('.active')
    const tabsScroll=previousTabs?.scrollLeft||0,previousTabKey=JSON.stringify(previousActive?.dataset||{})
    const platformOptions=platforms.map(([id,n])=>'<option value="'+id+'" '+(state.platform===id?'selected':'')+'>'+esc(n)+'</option>').join('')
    const groupTabs=state.groupNames.map((n)=>{
      const count=state.favorites.filter((id)=>state.groups[id]===n).length,active=state.filter==='favorites'&&state.group===n
      return '<button data-group-tab="'+esc(n)+'" class="filter-tab group-tab '+(active?'active':'')+'">'+esc(n)+' <span>'+count+'</span></button>'
    }).join('')+state.temporary.activities.map((item)=>'<button data-activity-tab="'+esc(item.id)+'" class="filter-tab '+(isTemporary&&item.id===state.group?'active':'')+'">'+esc(item.name)+' <span>'+item.rooms.length+'</span></button>').join('')
    const emptySearch=state.query.trim()?'<div class="empty-search"><span>是否到平台搜索“'+esc(state.query.trim())+'”？</span><div class="empty-search-actions"><button type="button" class="empty-search-button" data-platform-search="douyu">搜索斗鱼</button><button type="button" class="empty-search-button" data-platform-search="huya">搜索虎牙</button><button type="button" class="empty-search-button" data-platform-search="bilibili">搜索 B 站</button></div></div>':''
    const health=platforms.map(([id,n])=>{const x=state.diagnostics[id],cls=x&&x.ok?'ok':x&&x.authRequired?'auth':x?'failed':'unknown',label=x&&x.ok?x.count+' 位':x&&x.authRequired?'需登录':x?'读取失败':'',action=x&&x.authRequired?'<button type="button" class="health-auth-button" data-auth="'+esc(id)+'">重新授权</button>':'';return '<span class="health-item '+cls+'"><i></i>'+esc(n)+(label?' · '+esc(label):'')+action+'</span>'}).join('')+(auth.length?'<span class="health-auth-hint">或到“<a class="health-auth-button" href="settings.html#diagnostics">平台诊断</a>”设置取消勾选“启用平台”</span>':'')
    const authMarkup=auth.length&&!state.authNoticeDismissed?'<section class="auth-notices"><div class="auth-notice-heading"><strong>平台授权需要恢复</strong><button type="button" class="auth-dismiss" id="dismiss-auth-notices" title="暂时关闭提示" aria-label="暂时关闭平台授权提示">×</button></div>'+auth.map(([id])=>'<div class="auth-notice"><span>'+esc(names[id]||id)+'登录已失效</span><div class="auth-notice-actions"><button class="auth-button" data-auth="'+esc(id)+'">重新授权</button></div></div>').join('')+'</section>':''
    const failedMarkup=failed.length?'<div class="load-notice">'+failed.map(([id])=>esc(names[id]||id)).join('、')+'暂时读取失败；保留上次数据并稍后重试。</div>':''
    const unknown=isTemporary?source.filter((r)=>!r.statusKnown||r.stale).length:0
    const temporaryStatus=orderNeedsReload?'临时活动后台仍是旧版，排序尚未保存。请重新加载鱼播后重试；现有活动和关注不会清除。':state.temporaryMessage||(isTemporary?(state.refreshing?'正在刷新开播状态和时长…':activity.updatedAt?(unknown?unknown+' 位状态未知':'状态已更新'):'等待检测开播状态'):'')
    app.innerHTML='<header class="top"><div class="brand"><span class="title">鱼播</span><span class="subtitle">'+(isTemporary?esc(activity.name):'关注列表')+'</span></div><div class="top-meta"><span class="count">'+live+' 正在直播 · '+source.length+' 位'+(isTemporary?'临时主播':'关注')+'</span><span class="updated">更新于 '+esc(time(isTemporary?activity.updatedAt:state.updated))+'</span></div><div class="top-actions"><button class="tool-button" id="refresh" '+(state.refreshing?'disabled':'')+'>'+(state.refreshing?'更新中…':'↻ 刷新')+'</button><nav class="site-nav" aria-label="页面导航"><a class="tool-button nav-link active" href="index.html" aria-current="page">关注列表</a><a class="tool-button nav-link" href="history.html">直播记录</a><a class="tool-button nav-link" href="shortcuts.html">快捷键</a><a class="tool-button nav-link" href="settings.html">设置</a></nav></div></header>'+
      '<section class="toolbar"><div class="filter-tabs"><button data-filter="all" class="filter-tab '+(state.filter==='all'?'active':'')+'">全部 <span>'+state.rooms.length+'</span></button><button data-filter="live" class="filter-tab '+(state.filter==='live'?'active':'')+'">正在直播 <span>'+mainLive+'</span></button><button data-filter="favorites" class="filter-tab '+(state.filter==='favorites'&&state.group==='all'?'active':'')+'">收藏 <span>'+fav+'</span></button>'+groupTabs+'</div><input id="search" class="search" type="search" placeholder="支持中文、拼音、首字母、房间号" value="'+esc(state.query)+'"><select id="platform-filter" class="select-filter"><option value="all">全部平台</option>'+platformOptions+'</select>'+'<button id="live-view-toggle" class="tool-button live-view-toggle '+(state.liveCardMode?'active':'')+'" type="button" title="切换封面模式（V）；仅显示当前标签的开播主播" aria-pressed="'+state.liveCardMode+'">'+(state.liveCardMode?'切回原样':'封面模式')+'</button>'+'</section>'+
      '<section class="platform-health">'+(isTemporary?'<span role="status">'+esc(temporaryStatus)+'</span><label class="live-only-toggle" title="仅显示正在直播的主播；封面模式下自动开启"><input role="switch" id="temporary-only-live" type="checkbox" '+((state.temporaryOnlyLive||state.liveCardMode)?'checked':'')+(state.liveCardMode?' disabled':'')+'>只看正在直播</label><a class="diagnostics-link" href="settings.html#temporary-activities">管理活动</a>':health+'<a class="diagnostics-link" href="settings.html#diagnostics">诊断详情</a>')+'</section>'+authMarkup+failedMarkup+'<section class="rows '+(state.liveCardMode?'live-view':'')+'">'+(list.length?list.map(card).join(''):'<div class="empty"><div>'+(state.liveCardMode?'当前标签没有符合条件的开播主播':isTemporary?'没有符合条件的活动主播':state.rooms.length?'没有符合条件的主播':state.enabledPlatforms.length?'暂无关注主播':'尚未启用平台，请前往设置启用')+'</div>'+(!isTemporary?emptySearch:'')+'</div>')+'</section>'
    const nextTabs=app.querySelector('.filter-tabs'),nextActive=nextTabs.querySelector('.active')
    nextTabs.scrollLeft=tabsScroll
    if(nextActive&&previousTabKey!==JSON.stringify(nextActive.dataset)){
      const bounds=nextTabs.getBoundingClientRect(),activeBounds=nextActive.getBoundingClientRect()
      if(activeBounds.left<bounds.left)nextTabs.scrollLeft-=bounds.left-activeBounds.left+3
      else if(activeBounds.right>bounds.right)nextTabs.scrollLeft+=activeBounds.right-bounds.right+3
    }
    if(focused){const input=document.getElementById('search');input.focus();const position=Math.min(cursor,input.value.length);input.setSelectionRange(position,position)}
    observeRoomTitles()
    if(liveOnlyFocused)document.getElementById('temporary-only-live')?.focus({preventScroll:true})
    observeCoverImages()
    if(isTemporary&&orderNeedsReload){
      const button=document.createElement('button');button.id='reload-activity-runtime';button.type='button';button.className='tool-button';button.textContent='重新加载鱼播'
      button.addEventListener('click',()=>{if(confirm('重新加载鱼播以启用活动排序？不会清除活动、收藏或设置。当前扩展页面可能关闭，请重新打开关注列表。'))chrome.runtime.reload()})
      app.querySelector('.platform-health .diagnostics-link').before(button)
    }
    scheduleCoverFill()
    if(!isTemporary){
      const sortSwitch=document.createElement('div')
      sortSwitch.id='room-sort';sortSwitch.className='sort-switch'
      sortSwitch.setAttribute('role','group');sortSwitch.setAttribute('aria-label','主播排序')
      sortSwitch.title='S 循环切换；收藏、正在直播始终优先'
      sortSwitch.innerHTML=[['default','默认'],['newest','刚开播'],['oldest','播得最久']].map(([mode,label])=>'<button type="button" data-sort-mode="'+mode+'" aria-pressed="'+(YuboRoomData.sortMode(state.settings.liveSort)===mode)+'">'+label+'</button>').join('')
      app.querySelector('.platform-health .diagnostics-link').before(sortSwitch)
      sortSwitch.querySelectorAll('[data-sort-mode]').forEach((button)=>button.addEventListener('click',()=>setRoomSort(button.dataset.sortMode)))
      if(sortFocused)sortSwitch.querySelector('[aria-pressed="true"]').focus({preventScroll:true})
    }
    app.querySelectorAll('[data-filter]').forEach((b)=>b.addEventListener('click',()=>{state.filter=b.dataset.filter;state.group='all';render()}))
    app.querySelectorAll('[data-group-tab]').forEach((b)=>b.addEventListener('click',()=>{state.filter='favorites';state.group=b.dataset.groupTab;render()}))
    const search=document.getElementById('search')
    search.addEventListener('compositionstart',()=>{searchComposing=true})
    search.addEventListener('compositionend',(e)=>{searchComposing=false;state.query=e.target.value;render()})
    search.addEventListener('input',(e)=>{state.query=e.target.value;if(!searchComposing)render()})
    app.querySelectorAll('[data-platform-search]').forEach((button)=>button.addEventListener('click',()=>{
      const query=state.query.trim(),buildUrl=platformSearch[button.dataset.platformSearch]
      if(query&&buildUrl)chrome.tabs.create({url:buildUrl(query)})
    }))
    document.getElementById('platform-filter').addEventListener('change',(e)=>{state.platform=e.target.value;render()})
    const liveViewToggle=document.getElementById('live-view-toggle')
    if(liveViewToggle)liveViewToggle.addEventListener('click',()=>{state.liveCardMode=!state.liveCardMode;render()})
    document.getElementById('refresh').addEventListener('click',()=>void refresh({force:true}))
    app.querySelectorAll('[data-activity-tab]').forEach((button)=>button.addEventListener('click',()=>activateActivity(button.dataset.activityTab)))
    document.getElementById('temporary-only-live')?.addEventListener('change',(event)=>{state.temporaryOnlyLive=event.target.checked;render()})
    const dismissAuth=document.getElementById('dismiss-auth-notices')
    if(dismissAuth)dismissAuth.addEventListener('click',()=>{state.authNoticeDismissed=true;render()})
    app.querySelectorAll('[data-room-move]').forEach(button=>button.addEventListener('click',async event=>{
      event.preventDefault();event.stopPropagation()
      if(orderingBusy||state.filter!=='temporary'||button.disabled)return
      const activityId=state.group,roomId=button.dataset.roomId,move=button.dataset.roomMove,list=visible(),index=list.findIndex(room=>room.id===roomId)
      if(index<0)return
      const neighborId=list[index+(move==='up'?-1:1)]?.id
      orderingBusy=true;button.disabled=true
      try{
        state.temporary=await YuboTemporaryUI.request('reorder',{id:activityId,roomId,move,neighborId,mode:state.settings.liveSort})
        orderNeedsReload=false
        state.temporaryMessage=''
      }catch(error){if(error.requiresReload)orderNeedsReload=true;if(state.filter==='temporary'&&state.group===activityId)state.temporaryMessage=error.message}
      finally{
        orderingBusy=false;render()
        if(state.filter==='temporary'&&state.group===activityId)[...app.querySelectorAll('[data-room-move]')].find(node=>node.dataset.roomId===roomId&&node.dataset.roomMove===move&&!node.disabled)?.focus({preventScroll:true})
      }
    }))
    app.querySelectorAll('[data-star]').forEach((b)=>b.addEventListener('click',async()=>{
      const id=b.dataset.star,was=state.favorites.includes(id)
      state.favorites=was?state.favorites.filter((x)=>x!==id):[...state.favorites,id]
      state.order=was?state.order.filter((x)=>x!==id):[...state.order,id]
      if(was)delete state.groups[id]
      await set(sync,{favorite_streamers:state.favorites});await set(local,{yubo_favorite_order:state.order,yubo_favorite_groups:state.groups});render()
    }))
    app.querySelectorAll('.row.live').forEach((row)=>row.addEventListener('mouseenter',()=>{
      const preview=row.querySelector('.hover-cover');if(!preview)return
      const rect=row.getBoundingClientRect(),headerBottom=document.querySelector('.top')?.getBoundingClientRect().bottom||0,above=rect.top-headerBottom,below=window.innerHeight-rect.bottom,previewHeight=preview.offsetHeight+9
      row.classList.toggle('preview-below',above<previewHeight&&below>=above)
    }))
    app.querySelectorAll('[data-auth]').forEach((b)=>b.addEventListener('click',()=>{
      const id=b.dataset.auth
      chrome.tabs.create({url:login[id]||login.bilibili})
    }))
  }
  async function refresh(options={}){
    if(state.refreshing)return
    state.refreshing=true;render()
    if(state.filter==='temporary'){
      const activityId=state.group
      try{
        const result=await YuboTemporaryUI.request('refresh',{id:activityId,force:options.force===true,liveTimeCapabilities:true,coverCapabilities:true})
        state.temporary=result
        if(state.filter==='temporary'&&state.group===activityId)state.temporaryMessage=result.liveTimeProtocol===1&&result.coverProtocol===1?'':'临时活动后台尚未更新，请在扩展管理页重新加载鱼播后重试。'
      }catch(error){if(state.filter==='temporary'&&state.group===activityId)state.temporaryMessage=error.message}
      finally{finishRefresh()}
      return
    }
    const ids=await enabled();state.enabledPlatforms=ids
    const old=[...state.rooms],results=await Promise.allSettled(ids.map(fetchPlatform)),rooms=[],diagnostics=Object.fromEntries(Object.entries(state.diagnostics).filter(([id])=>ids.includes(id)))
    results.forEach((result,i)=>{
      const id=ids[i]
      if(result.status==='fulfilled'){rooms.push(...result.value);diagnostics[id]={ok:true,authRequired:false,count:result.value.length,checkedAt:Date.now()}}
      else{const e=result.reason;diagnostics[id]={ok:false,authRequired:!!e.authRequired,error:String(e.message||'读取失败'),count:old.filter((r)=>r.platform===id).length,checkedAt:Date.now()};rooms.push(...old.filter((r)=>r.platform===id).map((r)=>({...r,stale:true})))}
    })
    state.rooms=YuboRoomData.mergeTitles(await readLiveTimes(rooms).catch(()=>rooms),old);state.diagnostics=diagnostics;state.updated=Date.now()
    await set(local,{yubo_last_rooms:state.rooms,yubo_platform_diagnostics:diagnostics,yubo_last_refresh_at:state.updated})
    state.authNoticeDismissed=false;finishRefresh()
  }
  async function schedule(){clearTimeout(timer);const n=Math.min(60,Math.max(1,Number(decode(await get(sync,'check_interval')))||3));timer=setTimeout(refresh,n*60000)}
  try{
    document.title='鱼播 · 关注列表';await loadSaved();render()
    chrome.storage.onChanged.addListener((c,area)=>{
      if(area==='local'&&c[YuboTemporary.KEY]){const value=c[YuboTemporary.KEY].newValue;state.temporary=value&&Array.isArray(value.activities)?value:YuboTemporary.empty();state.temporaryMessage='';render()}
      if(area==='sync'&&c.enabled_platforms)void refresh()
      if(area==='sync'&&c.favorite_streamers){const v=decode(c.favorite_streamers.newValue);state.favorites=Array.isArray(v)?v:[];render()}
      if(area==='local'&&(c.yubo_favorite_order||c.yubo_streamer_order||c.yubo_favorite_groups||c.yubo_favorite_group_names||c.yubo_settings||c.yubo_streamer_meta))void loadSaved().then(render)
      if(area==='sync'&&c.check_interval)void schedule()
    })
    window.addEventListener('focus',()=>{if(Object.values(state.diagnostics).some((x)=>x.authRequired))void refresh()})
    await refresh()
    schedule()
  }catch(e){app.innerHTML='<div class="error">读取关注列表失败，请确认已登录平台后刷新页面</div>';console.error(e)}
})()
