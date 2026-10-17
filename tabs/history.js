(() => {
  const names={bilibili:'哔哩哔哩',douyu:'斗鱼',huya:'虎牙'}
  const list=document.getElementById('history-list')
  const get=()=>new Promise((resolve)=>chrome.storage.local.get('yubo_recent_live_history',(x)=>resolve(x.yubo_recent_live_history)))
  const esc=(value)=>String(value==null?'':value).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  const date=(value)=>value?new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'
  const duration=(entry)=>{
    const minutes=Math.max(0,Math.floor(((entry.endedAt||Date.now())-entry.startedAt)/60000))
    return minutes<60?minutes+' 分钟':Math.floor(minutes/60)+' 小时 '+(minutes%60)+' 分钟'
  }
  async function render(){
    const records=await get()
    const supported=Array.isArray(records)?records.filter((entry)=>names[entry.platform]):[]
    if(!supported.length){list.innerHTML='<div class="empty-note">暂时没有开播记录</div>';return}
    list.innerHTML=supported.slice(0,100).map((entry)=>'<a class="history-item" href="'+esc(entry.url)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(entry.avatar||'')+'" alt=""><span class="history-name"><strong>'+esc(entry.name)+'</strong><small>'+esc(names[entry.platform])+' · '+esc(entry.category||'直播')+'</small></span><span class="history-time"><strong>'+date(entry.startedAt)+'</strong><small>'+(entry.endedAt?'直播 '+duration(entry):'仍在直播 · '+duration(entry))+'</small></span><span class="history-arrow">↗</span></a>').join('')
  }
  document.title='直播记录 · 鱼播'
  document.getElementById('clear-history').addEventListener('click',async()=>{
    if(!confirm('确定清空本机保存的开播记录吗？'))return
    await new Promise((resolve)=>chrome.storage.local.set({yubo_recent_live_history:[]},resolve));render()
  })
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.yubo_recent_live_history)render()})
  render()
})()
