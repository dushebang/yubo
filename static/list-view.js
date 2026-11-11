/* Browser-local presentation memory only; never store rooms, search text or credentials here. */
(() => {
  const KEY='yubo_list_view',modes=['default','newest','oldest'],platforms=['douyu','huya','bilibili']
  function normalize(raw,context={}){
    const value=raw&&typeof raw==='object'&&!Array.isArray(raw)&&raw.version===1?raw:{}
    let filter=['all','live','favorites','temporary'].includes(value.filter)?value.filter:'all'
    let group=typeof value.group==='string'?value.group:'all'
    if(filter==='temporary'&&!(context.activityIds||[]).includes(group)){filter='all';group='all'}
    else if(filter==='favorites'&&group!=='all'&&!(context.groupNames||[]).includes(group))group='all'
    else if(filter!=='temporary'&&filter!=='favorites')group='all'
    const available=filter==='temporary'?platforms:context.enabledPlatforms||platforms
    const platform=available.includes(value.platform)?value.platform:'all'
    return {version:1,filter,group,platform,liveCardMode:value.liveCardMode===true,temporaryOnlyLive:value.temporaryOnlyLive===true,
      sort:modes.includes(value.sort)?value.sort:modes.includes(context.fallbackSort)?context.fallbackSort:'default'}
  }
  globalThis.YuboListView={KEY,normalize}
})()
