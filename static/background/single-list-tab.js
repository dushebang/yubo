/* Keep the newest follow-list tab only. Never touch settings, platform rooms or other extensions. */
(() => {
  if(!chrome.tabs?.onCreated||!chrome.tabs?.onUpdated||!chrome.tabs?.query||!chrome.tabs?.get||!chrome.tabs?.remove)return
  const base=chrome.runtime.getURL('tabs/index.html'),records=new Map(),latest=new Map(),winners=new Map()
  let sequence=0,queue=Promise.resolve()
  const isList=value=>{
    try{const url=new URL(value),target=new URL(base);return url.protocol===target.protocol&&url.host===target.host&&url.pathname===target.pathname}catch{return false}
  }
  function claim(tab,record){
    const scope=!!tab.incognito,token=record.token
    if(token<(latest.get(scope)||0)){
      // A slower earlier tab can finish after the newer tab has already cleaned up.
      // Run cleanup for the current winner again instead of leaving that late duplicate.
      const winner=winners.get(scope)
      if(winner)claim(winner,{token:latest.get(scope)})
      return
    }
    latest.set(scope,token)
    winners.set(scope,tab)
    const task=async()=>{
      if(latest.get(scope)!==token)return
      const keep=await chrome.tabs.get(tab.id).catch(()=>null)
      if(!keep||!isList(keep.pendingUrl||keep.url)||latest.get(scope)!==token)return
      const tabs=await chrome.tabs.query({})
      for(const old of tabs){
        if(latest.get(scope)!==token)return
        if(old.id===tab.id||!!old.incognito!==scope||!isList(old.pendingUrl||old.url))continue
        // A candidate may have navigated to Settings since the query completed.
        const current=await chrome.tabs.get(old.id).catch(()=>null)
        if(latest.get(scope)!==token)return
        if(current&&!!current.incognito===scope&&isList(current.pendingUrl||current.url))await chrome.tabs.remove(old.id).catch(()=>{})
      }
    }
    queue=queue.catch(()=>{}).then(task).catch(error=>console.warn('[鱼播] 列表标签去重失败，保留页面。',error))
  }
  chrome.tabs.onCreated.addListener(tab=>{
    const url=tab.pendingUrl||tab.url||'',record={token:++sequence,url,waiting:!url||url==='about:blank'}
    records.set(tab.id,record)
    if(isList(url))claim(tab,record)
  })
  chrome.tabs.onUpdated.addListener((id,change,tab)=>{
    if(!change.url)return // Reload/status changes must not make an old tab the newest.
    let record=records.get(id)
    if(record?.url===change.url)return
    const token=record?.waiting?record.token:++sequence
    record={token,url:change.url,waiting:change.url==='about:blank'};records.set(id,record)
    if(isList(change.url))claim({...tab,id,url:change.url,pendingUrl:change.url},record)
  })
  chrome.tabs.onRemoved?.addListener(id=>records.delete(id))
})()
