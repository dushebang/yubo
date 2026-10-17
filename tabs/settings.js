(() => {
  const sync = chrome.storage.sync, local = chrome.storage.local
  const get = (area, key) => new Promise((resolve) => area.get(key, (x) => resolve(x[key])))
  const set = (area, values) => new Promise((resolve) => area.set(values, resolve))
  const decode = (value) => { if (typeof value !== 'string') return value; try { return JSON.parse(value) } catch { return value } }
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c])
  const objectOrEmpty = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const normalizeNotificationOverrides = (value) => Object.fromEntries(Object.entries(objectOrEmpty(value)).filter(([id,enabled])=>supportedStreamerId(id)&&typeof enabled==='boolean'))
  const normalizeAliases = (meta) => {
    const source=Array.isArray(meta&&meta.aliases)?meta.aliases:(meta&&meta.alias?[meta.alias]:[])
    const seen=new Set()
    return source.map((x)=>String(x||'').trim()).filter((x)=>{const key=x.toLocaleLowerCase();if(!x||seen.has(key))return false;seen.add(key);return true})
  }
  const normalizeStreamerMeta = (value) => Object.fromEntries(Object.entries(objectOrEmpty(value)).flatMap(([id,meta])=>{
    const aliases=normalizeAliases(meta)
    return aliases.length?[[id,{aliases}]]:[]
  }))
  const names = { bilibili:'哔哩哔哩',douyu:'斗鱼',huya:'虎牙' }
  const loginUrls = { bilibili:'https://passport.bilibili.com/login',douyu:'https://www.douyu.com/',huya:'https://www.huya.com/' }
  const supportedStreamerId = (id) => /^(bili_|dy_|huya_)/.test(String(id||''))
  const defaults = { notifyMode:'all',quietEnabled:false,quietStart:'23:00',quietEnd:'08:00',groupNotifications:true }
  let favorites=[], order=[], streamerOrder=[], groups={}, groupNames=['常看'], rooms=[], settings={}, notificationOverrides={}, hidden=[], groupNotificationRules={}, streamerMeta={}, rawStreamerMeta={}, webdavConfig={}, enabledPlatforms=Object.keys(names), editingAliases=[]
  const status = (text) => { const n=document.getElementById('save-status'); n.textContent=text; setTimeout(()=>{if(n.textContent===text)n.textContent=''},2500) }
  function showDialog(dialog,input){dialog.showModal();if(input)requestAnimationFrame(()=>input.focus({preventScroll:true}))}

  async function load() {
    const v=await Promise.all([get(sync,'favorite_streamers'),get(local,'yubo_favorite_order'),get(local,'yubo_favorite_groups'),get(local,'yubo_favorite_group_names'),get(local,'yubo_last_rooms'),get(local,'yubo_settings'),get(local,'yubo_snoozed_streamers'),get(sync,'hidden_rooms'),get(sync,'mute_notification'),get(sync,'check_interval'),get(local,'yubo_platform_diagnostics'),get(sync,'enabled_platforms'),get(local,'yubo_group_notification_rules'),get(local,'yubo_streamer_meta'),get(local,'yubo_webdav_config'),get(local,'yubo_streamer_order'),get(local,'yubo_streamer_notification_overrides')])
    const savedFavorites=Array.isArray(decode(v[0]))?decode(v[0]):[]
    favorites=savedFavorites.filter(supportedStreamerId)
    order=Array.isArray(v[1])&&v[1].length?v[1].filter((id)=>favorites.includes(id)):[...favorites]
    favorites.forEach((id)=>{if(!order.includes(id))order.push(id)})
    groups=Object.fromEntries(Object.entries(objectOrEmpty(v[2])).filter(([id])=>supportedStreamerId(id))); groupNames=Array.isArray(v[3])&&v[3].length?v[3]:['常看']; rooms=Array.isArray(v[4])?v[4].filter((room)=>names[room.platform]):[]
    settings={...defaults,...(v[5]||{})}; hidden=Array.isArray(decode(v[7]))?decode(v[7]):[]
    groupNotificationRules=v[12]&&typeof v[12]==='object'?v[12]:{};rawStreamerMeta=Object.fromEntries(Object.entries(objectOrEmpty(v[13])).filter(([id])=>supportedStreamerId(id)));streamerMeta=normalizeStreamerMeta(rawStreamerMeta);webdavConfig=v[14]&&typeof v[14]==='object'?v[14]:{}
    streamerOrder=Array.isArray(v[15])?[...new Set(v[15].filter(supportedStreamerId))]:[]
    notificationOverrides=normalizeNotificationOverrides(v[16])
    if(Object.keys(objectOrEmpty(v[6])).length)await set(local,{yubo_snoozed_streamers:{}})
    const savedPlatforms=decode(v[11])
    enabledPlatforms=Array.isArray(savedPlatforms)?[...new Set(savedPlatforms.filter((id)=>names[id]))]:Object.keys(names)
    ;[...rooms].sort((a,b)=>String(a.name).localeCompare(String(b.name),'zh-CN')).forEach((room)=>{if(!streamerOrder.includes(room.id))streamerOrder.push(room.id)})
    document.getElementById('notify-mode').value=settings.notifyMode
    document.getElementById('quiet-enabled').checked=!!settings.quietEnabled
    document.getElementById('quiet-start').value=settings.quietStart
    document.getElementById('quiet-end').value=settings.quietEnd
    document.getElementById('group-notifications').checked=settings.groupNotifications!==false
    document.getElementById('mute-all').checked=!!decode(v[8])
    document.getElementById('refresh-minutes').value=Math.max(1,Number(decode(v[9]))||3)
    const webdavFields=webdavFormParts(webdavConfig)
    document.getElementById('webdav-server-url').value=webdavFields.serverUrl
    document.getElementById('webdav-directory').value=webdavFields.directory
    document.getElementById('webdav-username').value=webdavConfig.username||''
    document.getElementById('webdav-password').value=webdavConfig.password||''
    renderGroups(); renderLists(); renderDiagnostics(v[10]||{})
  }

  function renderGroups() {
    const node=document.getElementById('groups')
    node.innerHTML=groupNames.map((name)=>'<span class="group-chip">'+esc(name)+'<button type="button" data-delgroup="'+esc(name)+'">×</button></span>').join('')
    node.querySelectorAll('[data-delgroup]').forEach((b)=>b.addEventListener('click',async()=>{
      if(groupNames.length<2)return status('至少保留一个分组')
      const name=b.dataset.delgroup; groupNames=groupNames.filter((x)=>x!==name)
      Object.keys(groups).forEach((id)=>{if(groups[id]===name)delete groups[id]})
      delete groupNotificationRules[name]
      await set(local,{yubo_favorite_group_names:groupNames,yubo_favorite_groups:groups,yubo_group_notification_rules:groupNotificationRules}); renderGroups();renderLists()
    }))
    renderGroupNotificationRules()
  }
  function renderGroupNotificationRules(){
    const node=document.getElementById('group-notify-rules')
    node.innerHTML=groupNames.map((name)=>'<label class="group-notify-item"><input type="checkbox" data-group-notify="'+esc(name)+'" '+(groupNotificationRules[name]===false?'':'checked')+'>'+esc(name)+'</label>').join('')+'<button type="button" class="group-add-trigger" id="group-manage-open" title="管理收藏分组" aria-label="管理收藏分组"><span class="group-add-icon" aria-hidden="true"></span></button>'
    node.querySelectorAll('[data-group-notify]').forEach((input)=>input.addEventListener('change',()=>{groupNotificationRules[input.dataset.groupNotify]=input.checked}))
    document.getElementById('group-manage-open').addEventListener('click',()=>showDialog(document.getElementById('groups-dialog'),document.getElementById('new-group')))
  }
  function roomFor(id){return rooms.find((x)=>x.id===id)||{id,name:id,platform:id.split('_')[0]}}
  function groupOptions(value){return '<option value="">未分组</option>'+groupNames.map((x)=>'<option value="'+esc(x)+'" '+(x===value?'selected':'')+'>'+esc(x)+'</option>').join('')}
  function notificationOptions(id){
    const mode=settings.notifyMode||'all',defaultEnabled=mode==='all'||(mode==='favorites'&&favorites.includes(id)),override=notificationOverrides[id]
    const value=override===true?'on':override===false?'off':'inherit'
    const inheritedLabel=defaultEnabled?'跟随全局（开启）':'跟随全局（关闭）'
    const label=value==='on'?'单独开启提醒':value==='off'?'单独关闭提醒':inheritedLabel
    const title=override===true?'单人设置已开启，优先于全局和分组提醒':override===false?'单人设置已关闭，优先于全局和分组提醒':'未设置单人覆盖，跟随全局提醒默认设置'
    return '<select data-notification-override="'+esc(id)+'" title="'+esc(title)+'" aria-label="'+esc(roomFor(id).name)+'：'+esc(label)+'"><option value="inherit" '+(value==='inherit'?'selected':'')+'>'+esc(inheritedLabel)+'</option><option value="on" '+(value==='on'?'selected':'')+'>单独开启提醒</option><option value="off" '+(value==='off'?'selected':'')+'>单独关闭提醒</option></select>'
  }
  function renderAliasEditor(){
    const node=document.getElementById('meta-alias-list')
    node.innerHTML=editingAliases.map((alias,index)=>'<span class="meta-alias-chip"><span>'+esc(alias)+'</span><button type="button" data-remove-alias="'+index+'" aria-label="删除别名 '+esc(alias)+'">×</button></span>').join('')
    node.querySelectorAll('[data-remove-alias]').forEach((button)=>button.addEventListener('click',()=>{
      editingAliases.splice(Number(button.dataset.removeAlias),1);renderAliasEditor()
      document.getElementById('meta-dialog-status').textContent='别名已移除，保存后生效。'
    }))
  }
  function addAlias(){
    const input=document.getElementById('meta-alias-input'),value=input.value.trim(),statusNode=document.getElementById('meta-dialog-status')
    if(!value)return
    if(editingAliases.some((alias)=>alias.toLocaleLowerCase()===value.toLocaleLowerCase())){statusNode.textContent='这个别名已经添加过了。';return}
    editingAliases.push(value);input.value='';statusNode.textContent='别名已添加，点击“保存别名”后生效。';renderAliasEditor();input.focus()
  }
  function renderLists() {
    const streamerNode=document.getElementById('streamer-list')
    const favoriteSet=new Set(favorites),orderIndex=new Map(order.map((id,index)=>[id,index])),streamerOrderIndex=new Map(streamerOrder.map((id,index)=>[id,index]))
    const managedRooms=[...rooms].sort((a,b)=>{
      const favoriteDiff=Number(favoriteSet.has(b.id))-Number(favoriteSet.has(a.id))
      if(favoriteDiff)return favoriteDiff
      if(favoriteSet.has(a.id)&&favoriteSet.has(b.id)){
        const orderDiff=(orderIndex.get(a.id)??Number.MAX_SAFE_INTEGER)-(orderIndex.get(b.id)??Number.MAX_SAFE_INTEGER)
        if(orderDiff)return orderDiff
      }
      const groupDiff=Number(!!groups[b.id])-Number(!!groups[a.id])
      if(groupDiff)return groupDiff
      const manualDiff=(streamerOrderIndex.get(a.id)??Number.MAX_SAFE_INTEGER)-(streamerOrderIndex.get(b.id)??Number.MAX_SAFE_INTEGER)
      if(manualDiff)return manualDiff
      return String(a.name).localeCompare(String(b.name),'zh-CN')
    })
    streamerNode.innerHTML=managedRooms.length?managedRooms.map((room)=>{
      const id=room.id,meta=streamerMeta[id]||{},aliases=normalizeAliases(meta),favIndex=order.indexOf(id),favorite=favorites.includes(id),priority=favorite?'favorite':groups[id]?'grouped':'plain'
      const favoriteTools=favorite?'<span class="streamer-favorite-tools"><button class="icon-button" data-move="'+esc(id)+'" data-dir="-1" title="收藏顺序上移" aria-label="'+esc(room.name)+'收藏顺序上移" '+(favIndex<=0?'disabled':'')+'>↑</button><button class="icon-button" data-move="'+esc(id)+'" data-dir="1" title="收藏顺序下移" aria-label="'+esc(room.name)+'收藏顺序下移" '+(favIndex<0||favIndex===order.length-1?'disabled':'')+'>↓</button><button class="icon-button favorite-remove" data-unfav="'+esc(id)+'" title="取消收藏" aria-label="取消收藏 '+esc(room.name)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button></span>':''
      const aliasTags=aliases.map((alias)=>'<span class="managed-alias-tag" title="'+esc(alias)+'">'+esc(alias)+'</span>').join('')
      return '<article class="streamer-manage-item" data-streamer-row data-streamer-id="'+esc(id)+'" data-priority="'+priority+'" data-meta-name="'+esc(room.name)+'" data-meta-alias="'+esc(aliases.join(' '))+'"><span class="streamer-drag-handle" draggable="true" title="拖动调整同类顺序" aria-label="拖动调整同类顺序">⠿</span><span class="managed-name"><span class="managed-primary">'+esc(room.name)+'<small class="managed-sub"> · '+esc(names[room.platform]||room.platform)+'</small></span>'+(aliases.length?'<span class="managed-aliases">'+aliasTags+'</span>':'')+'</span><div class="streamer-controls">'+favoriteTools+'<select data-group="'+esc(id)+'" aria-label="为'+esc(room.name)+'选择分组">'+groupOptions(groups[id]||'')+'</select>'+notificationOptions(id)+'<button class="secondary-button streamer-meta-button" data-edit-meta="'+esc(id)+'">设置别名</button></div></article>'
    }).join(''):'<div class="empty-note">暂无关注主播，请先刷新列表</div>'
    streamerNode.querySelectorAll('[data-group]').forEach((s)=>s.addEventListener('change',async()=>{
      if(s.value)groups[s.dataset.group]=s.value;else delete groups[s.dataset.group]
      const scroll=streamerNode.scrollTop;await set(local,{yubo_favorite_groups:groups});renderLists();streamerNode.scrollTop=scroll;status('分组已保存')
    }))
    streamerNode.querySelectorAll('[data-notification-override]').forEach((s)=>s.addEventListener('change',async()=>{
      const id=s.dataset.notificationOverride
      if(s.value==='inherit')delete notificationOverrides[id];else notificationOverrides[id]=s.value==='on'
      await set(local,{yubo_streamer_notification_overrides:notificationOverrides})
      const scroll=streamerNode.scrollTop;renderLists();streamerNode.scrollTop=scroll
      status(s.value==='inherit'?'已恢复跟随全局提醒':s.value==='on'?'该主播已单独开启提醒':'该主播已单独关闭提醒')
    }))
    streamerNode.querySelectorAll('[data-move]').forEach((b)=>b.addEventListener('click',async()=>{
      const i=order.indexOf(b.dataset.move),j=i+Number(b.dataset.dir);if(i<0||j<0||j>=order.length)return
      ;[order[i],order[j]]=[order[j],order[i]];await set(local,{yubo_favorite_order:order});renderLists()
    }))
    streamerNode.querySelectorAll('[data-unfav]').forEach((b)=>b.addEventListener('click',async()=>{
      const id=b.dataset.unfav;favorites=favorites.filter((x)=>x!==id);order=order.filter((x)=>x!==id);delete groups[id]
      await set(sync,{favorite_streamers:favorites});await set(local,{yubo_favorite_order:order,yubo_favorite_groups:groups});renderLists()
    }))
    streamerNode.querySelectorAll('[data-edit-meta]').forEach((b)=>b.addEventListener('click',()=>{
      const id=b.dataset.editMeta,room=roomFor(id),meta=streamerMeta[id]||{},dialog=document.getElementById('meta-dialog')
      dialog.dataset.roomId=id
      document.getElementById('meta-dialog-title').textContent=room.name+' · 设置别名'
      editingAliases=normalizeAliases(meta)
      document.getElementById('meta-alias-input').value=''
      renderAliasEditor()
      showDialog(dialog,document.getElementById('meta-alias-input'))
    }))
    let draggedId='',draggedPriority=''
    streamerNode.querySelectorAll('[data-streamer-row]').forEach((row)=>{
      row.addEventListener('dragstart',(event)=>{
        if(!event.target.closest('.streamer-drag-handle')){event.preventDefault();return}
        draggedId=row.dataset.streamerId;draggedPriority=row.dataset.priority
        event.dataTransfer.effectAllowed='move'
        event.dataTransfer.setData('text/plain',draggedId)
        row.classList.add('dragging')
      })
      row.addEventListener('dragend',()=>{
        draggedId='';draggedPriority=''
        streamerNode.querySelectorAll('.dragging,.drag-over').forEach((node)=>node.classList.remove('dragging','drag-over'))
      })
      row.addEventListener('dragover',(event)=>{
        if(!draggedId||row.dataset.streamerId===draggedId||row.dataset.priority!==draggedPriority)return
        event.preventDefault();event.dataTransfer.dropEffect='move';row.classList.add('drag-over')
      })
      row.addEventListener('dragleave',()=>row.classList.remove('drag-over'))
      row.addEventListener('drop',async(event)=>{
        const targetId=row.dataset.streamerId
        if(!draggedId||targetId===draggedId||row.dataset.priority!==draggedPriority)return
        event.preventDefault();event.stopPropagation()
        const sourceId=draggedId,priority=draggedPriority,isFavorite=priority==='favorite'
        let sequence=isFavorite?[...order]:[...streamerOrder]
        if(!sequence.includes(sourceId))sequence.push(sourceId)
        if(!sequence.includes(targetId))sequence.push(targetId)
        sequence=sequence.filter((id)=>id!==sourceId)
        const targetIndex=sequence.indexOf(targetId),rect=row.getBoundingClientRect(),after=event.clientY>rect.top+rect.height/2
        sequence.splice(targetIndex+(after?1:0),0,sourceId)
        const scroll=streamerNode.scrollTop
        if(isFavorite){order=sequence.filter((id)=>favorites.includes(id));favorites.forEach((id)=>{if(!order.includes(id))order.push(id)});await set(local,{yubo_favorite_order:order})}
        else{streamerOrder=sequence;await set(local,{yubo_streamer_order:streamerOrder})}
        renderLists();streamerNode.scrollTop=scroll;status(isFavorite?'收藏顺序已调整':'主播顺序已调整')
      })
    })
    filterStreamerRows()
  }
  function renderDiagnostics(data){
    const list=document.getElementById('diagnostics-list')
    list.innerHTML=Object.keys(names).map((id)=>{
      const x=data[id],active=enabledPlatforms.includes(id),label=!active?'未启用 · 不检查':!x?'尚未检查':x.ok?'正常 · '+x.count+' 位':x.authRequired?'需要重新登录':'读取失败'
      const dot=!active||!x?'':x.ok?'ok':'error',detail=active&&x?(x.error||x.checkedAt?x.error||new Date(x.checkedAt).toLocaleString('zh-CN'):'—'):'—'
      const reminder='<label class="platform-enable-toggle"><input type="checkbox" data-enabled-platform="'+esc(id)+'" '+(active?'checked':'')+'><span>启用平台</span></label>'
      const action=active&&x&&x.authRequired?'<button type="button" class="secondary-button diagnostic-reauthorize" data-login-platform="'+esc(id)+'">重新授权</button>':''
      return '<div class="diagnostic-row"><i class="diagnostic-dot '+dot+'"></i><strong>'+esc(names[id])+'</strong><span>'+esc(label)+'</span><span class="diagnostic-message">'+esc(detail)+'</span><div class="diagnostic-actions">'+reminder+action+'</div></div>'
    }).join('')
    list.querySelectorAll('[data-enabled-platform]').forEach((input)=>input.addEventListener('change',async()=>{
      const id=input.dataset.enabledPlatform
      enabledPlatforms=input.checked?[...new Set([...enabledPlatforms,id])]:enabledPlatforms.filter((platform)=>platform!==id)
      await set(sync,{enabled_platforms:enabledPlatforms})
      renderDiagnostics(data)
    }))
    list.querySelectorAll('[data-login-platform]').forEach((button)=>button.addEventListener('click',()=>{
      chrome.tabs.create({url:loginUrls[button.dataset.loginPlatform]||loginUrls.bilibili})
    }))
  }
  function filterStreamerRows(){
    const q=String(document.getElementById('meta-search').value||'').trim().toLocaleLowerCase()
    document.querySelectorAll('[data-streamer-row]').forEach((row)=>{
      const values=[row.dataset.metaName,row.dataset.metaAlias]
      row.hidden=!!q&&!values.some((value)=>String(value||'').toLocaleLowerCase().includes(q))
    })
  }
  document.getElementById('add-group-form').addEventListener('submit',async(e)=>{
    e.preventDefault();const input=document.getElementById('new-group'),name=input.value.trim()
    if(!name||groupNames.includes(name))return
    groupNames.push(name);await set(local,{yubo_favorite_group_names:groupNames});input.value='';renderGroups();renderLists()
  })
  document.getElementById('close-groups').addEventListener('click',()=>document.getElementById('groups-dialog').close())
  document.getElementById('close-groups-top').addEventListener('click',()=>document.getElementById('groups-dialog').close())
  document.getElementById('meta-search').addEventListener('input',filterStreamerRows)
  document.getElementById('add-meta-alias').addEventListener('click',addAlias)
  document.getElementById('meta-alias-input').addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();addAlias()}})
  document.getElementById('cancel-meta').addEventListener('click',()=>document.getElementById('meta-dialog').close())
  document.getElementById('cancel-meta-top').addEventListener('click',()=>document.getElementById('meta-dialog').close())
  document.getElementById('webdav-open').addEventListener('click',()=>{
    const fields=webdavFormParts(webdavConfig)
    document.getElementById('webdav-server-url').value=fields.serverUrl
    document.getElementById('webdav-directory').value=fields.directory
    document.getElementById('webdav-username').value=webdavConfig.username||''
    document.getElementById('webdav-password').value=webdavConfig.password||''
    document.getElementById('webdav-status').textContent=''
    showDialog(document.getElementById('webdav-dialog'),document.getElementById('webdav-server-url'))
  })
  document.getElementById('webdav-close').addEventListener('click',()=>document.getElementById('webdav-dialog').close())
  document.getElementById('webdav-close-top').addEventListener('click',()=>document.getElementById('webdav-dialog').close())
  document.getElementById('meta-edit-form').addEventListener('submit',async(event)=>{
    event.preventDefault()
    const dialog=document.getElementById('meta-dialog'),id=dialog.dataset.roomId,pending=document.getElementById('meta-alias-input').value.trim()
    if(pending&&!editingAliases.some((alias)=>alias.toLocaleLowerCase()===pending.toLocaleLowerCase()))editingAliases.push(pending)
    if(editingAliases.length){streamerMeta[id]={aliases:[...editingAliases]};rawStreamerMeta[id]={aliases:[...editingAliases]}}
    else{delete streamerMeta[id];delete rawStreamerMeta[id]}
    const savedAliases=[...editingAliases],roomName=roomFor(id).name
    await set(local,{yubo_streamer_meta:rawStreamerMeta});dialog.close();renderLists()
    const feedback=document.getElementById('streamer-meta-status')
    feedback.textContent=savedAliases.length?roomName+'：已保存 '+savedAliases.length+' 个别名。':'已清空 '+roomName+' 的别名。'
    feedback.classList.add('is-visible')
    clearTimeout(feedback.hideTimer)
    feedback.hideTimer=setTimeout(()=>{
      feedback.classList.remove('is-visible')
      setTimeout(()=>{if(!feedback.classList.contains('is-visible'))feedback.textContent=''},220)
    },2200)
  })
  document.getElementById('save-settings').addEventListener('click',async()=>{
    settings={...settings,notifyMode:document.getElementById('notify-mode').value,quietEnabled:document.getElementById('quiet-enabled').checked,quietStart:document.getElementById('quiet-start').value||'23:00',quietEnd:document.getElementById('quiet-end').value||'08:00',groupNotifications:document.getElementById('group-notifications').checked}
    const interval=Math.max(1,Math.min(60,Number(document.getElementById('refresh-minutes').value)||3))
    await set(local,{yubo_settings:settings,yubo_group_notification_rules:groupNotificationRules});await set(sync,{mute_notification:document.getElementById('mute-all').checked,check_interval:interval});status('设置已保存')
  })
  document.getElementById('notify-mode').addEventListener('change',(event)=>{
    settings.notifyMode=event.target.value
    const node=document.getElementById('streamer-list'),scroll=node.scrollTop
    renderLists();node.scrollTop=scroll
  })
  async function createBackup(){
    const [intervalValue,enabledValue,muteValue]=await Promise.all([get(sync,'check_interval'),get(sync,'enabled_platforms'),get(sync,'mute_notification')])
    const savedPlatforms=decode(enabledValue),enabled=Array.isArray(savedPlatforms)?savedPlatforms.filter((id)=>names[id]):Object.keys(names)
    return {format:'yubo-backup-v1',exportedAt:new Date().toISOString(),favorites,favoriteOrder:order,streamerOrder,favoriteGroups:groups,favoriteGroupNames:groupNames,groupNotificationRules,streamerMeta,streamerNotificationOverrides:notificationOverrides,settings,hiddenRooms:hidden,checkInterval:Number(decode(intervalValue))||3,enabledPlatforms:enabled,muteAll:!!decode(muteValue)}
  }
  async function applyBackup(b){
    if(!b||b.format!=='yubo-backup-v1')throw new Error('备份格式不正确')
    const fav=Array.isArray(b.favorites)?b.favorites:[],groupNamesIn=Array.isArray(b.favoriteGroupNames)&&b.favoriteGroupNames.length?b.favoriteGroupNames:['常看']
    const enabled=Array.isArray(b.enabledPlatforms)?b.enabledPlatforms.filter((id)=>names[id]):Object.keys(names)
    await set(sync,{favorite_streamers:fav,hidden_rooms:Array.isArray(b.hiddenRooms)?b.hiddenRooms:[],check_interval:Math.max(1,Math.min(60,Number(b.checkInterval)||3)),enabled_platforms:enabled,mute_notification:!!b.muteAll})
    await set(local,{yubo_favorite_order:Array.isArray(b.favoriteOrder)?b.favoriteOrder:fav,yubo_streamer_order:Array.isArray(b.streamerOrder)?b.streamerOrder:[],yubo_favorite_groups:objectOrEmpty(b.favoriteGroups),yubo_favorite_group_names:groupNamesIn,yubo_group_notification_rules:objectOrEmpty(b.groupNotificationRules),yubo_streamer_meta:normalizeStreamerMeta(b.streamerMeta),yubo_streamer_notification_overrides:normalizeNotificationOverrides(b.streamerNotificationOverrides),yubo_settings:{...defaults,...objectOrEmpty(b.settings)},yubo_snoozed_streamers:{}})
    await load()
  }
  function webdavFormParts(config){
    if(config&&config.serverUrl)return {serverUrl:config.serverUrl,directory:config.directory||'',filename:config.filename||'yubo-backup.json'}
    if(config&&config.url){
      try{
        const parsed=new URL(config.url),segments=parsed.pathname.split('/').filter(Boolean).map((segment)=>{try{return decodeURIComponent(segment)}catch{return segment}})
        let filename='yubo-backup.json'
        if(segments.length&&/\.json$/i.test(segments[segments.length-1]))filename=segments.pop()
        return {serverUrl:parsed.origin+'/',directory:segments.join('/'),filename}
      }catch{}
    }
    return {serverUrl:'',directory:'',filename:'yubo-backup.json'}
  }
  function readWebdavForm(){
    const rawServer=document.getElementById('webdav-server-url').value.trim(),rawDirectory=document.getElementById('webdav-directory').value.trim()
    let parsed
    try{parsed=new URL(rawServer)}catch{throw new Error('请输入有效的 WebDAV 服务器地址')}
    if(!['https:','http:'].includes(parsed.protocol)||!parsed.hostname)throw new Error('服务器地址需为有效的 HTTP(S) WebDAV 地址')
    if(parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('服务器地址中不要包含用户名、密码、查询参数或片段')
    const directory=rawDirectory.split(/[\\/]+/).map((segment)=>segment.trim()).filter(Boolean)
    if(directory.some((segment)=>segment==='.'||segment==='..'))throw new Error('目录路径不能包含 . 或 .. 路径段')
    return {serverUrl:parsed.href,directory:directory.join('/'),filename:webdavFormParts(webdavConfig).filename,username:document.getElementById('webdav-username').value.trim(),password:document.getElementById('webdav-password').value}
  }
  function webdavFileUrl(config){
    const base=new URL(config.serverUrl),directory=(config.directory||'').split('/').filter(Boolean),filename=String(config.filename||'yubo-backup.json')
    if(directory.some((segment)=>segment==='.'||segment==='..'))throw new Error('目录路径不能包含 . 或 .. 路径段')
    if(/[\\/]/.test(filename))throw new Error('备份文件名无效')
    const baseUrl=base.href.replace(/\/+$/,'')+'/',path=[...directory.map(encodeURIComponent),encodeURIComponent(filename)].join('/')
    return new URL(path,baseUrl).href
  }
  function requestWebdavPermission(url){
    const parsed=new URL(url),origin=parsed.protocol+'//'+parsed.hostname+'/*'
    return new Promise((resolve)=>chrome.permissions.request({origins:[origin]},(granted)=>resolve(!chrome.runtime.lastError&&!!granted)))
  }
  function webdavAuth(config){
    if(!config.username&&!config.password)return ''
    const bytes=new TextEncoder().encode(config.username+':'+config.password),binary=Array.from(bytes,(byte)=>String.fromCharCode(byte)).join('')
    return 'Basic '+btoa(binary)
  }
  async function webdavRequest(config,method,body){
    const headers={};const auth=webdavAuth(config);if(auth)headers.Authorization=auth
    if(body!==undefined)headers['Content-Type']='application/json'
    const response=await fetch(webdavFileUrl(config),{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',cache:'no-store'})
    if(!response.ok){
      const detail=response.status===409?'目标目录不存在或路径冲突；目录地址会自动使用 yubo-backup.json，请确认远端目录已创建且可写。':response.status===401||response.status===403?'账号或应用专用密码无效，或该账号没有目录权限。':response.status===404?'目标文件或目录不存在，请检查 WebDAV 地址。':''
      throw new Error((method==='PUT'?'上传':'读取')+'失败（HTTP '+response.status+'）'+(detail?'：'+detail:''))
    }
    return response
  }
  async function saveWebdavForm(){
    webdavConfig=readWebdavForm();await set(local,{yubo_webdav_config:webdavConfig});return webdavConfig
  }
  document.getElementById('export-backup').addEventListener('click',async()=>{
    const backup=await createBackup()
    const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'})),link=document.createElement('a')
    link.href=url;link.download='yubo-backup-'+new Date().toISOString().slice(0,10)+'.json';link.click();URL.revokeObjectURL(url)
    document.getElementById('backup-status').textContent='备份已导出；文件不含 Cookie 或令牌。'
  })
  document.getElementById('import-backup').addEventListener('change',async(e)=>{
    const file=e.target.files&&e.target.files[0];if(!file)return
    try{
      const b=JSON.parse(await file.text());await applyBackup(b);document.getElementById('backup-status').textContent='备份已导入；令牌需在本扩展中重新获取。'
    }catch(error){document.getElementById('backup-status').textContent=error.message||'导入失败'}
    finally{e.target.value=''}
  })
  document.getElementById('save-webdav').addEventListener('click',async()=>{
    try{await saveWebdavForm();document.getElementById('webdav-status').textContent='WebDAV 配置已保存在本机。'}catch(error){document.getElementById('webdav-status').textContent=error.message||'配置保存失败'}
  })
  document.getElementById('webdav-upload').addEventListener('click',async()=>{
    const statusNode=document.getElementById('webdav-status')
    try{
      const config=readWebdavForm(),target=webdavFileUrl(config),permission=requestWebdavPermission(target);webdavConfig=config;await set(local,{yubo_webdav_config:config})
      if(!await permission)throw new Error('未授予此 WebDAV 服务器的访问权限')
      await webdavRequest(config,'PUT',await createBackup());statusNode.textContent='配置已上传：'+target
    }catch(error){statusNode.textContent=error.message||'上传失败'}
  })
  document.getElementById('webdav-download').addEventListener('click',async()=>{
    const statusNode=document.getElementById('webdav-status')
    try{
      const config=readWebdavForm(),target=webdavFileUrl(config),permission=requestWebdavPermission(target);webdavConfig=config;await set(local,{yubo_webdav_config:config})
      if(!await permission)throw new Error('未授予此 WebDAV 服务器的访问权限')
      const backup=await (await webdavRequest(config,'GET')).json()
      if(!confirm('从 WebDAV 恢复会覆盖当前收藏、分组和提醒设置，确定继续吗？'))return
      await applyBackup(backup);statusNode.textContent='已从此文件恢复：'+target
    }catch(error){statusNode.textContent=error.message||'恢复失败'}
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.yubo_platform_diagnostics) renderDiagnostics(changes.yubo_platform_diagnostics.newValue || {})
    if (area === 'sync' && changes.enabled_platforms) {
      const value=decode(changes.enabled_platforms.newValue)
      enabledPlatforms=Array.isArray(value)?[...new Set(value.filter((id)=>names[id]))]:Object.keys(names)
      get(local,'yubo_platform_diagnostics').then((data)=>renderDiagnostics(data||{}))
    }
  })
  load().then(()=>{
    if(location.hash==='#diagnostics'){
      requestAnimationFrame(()=>requestAnimationFrame(()=>document.getElementById('diagnostics').scrollIntoView({behavior:'smooth',block:'start'})))
    }
  }).catch((error)=>{document.getElementById('backup-status').textContent='设置读取失败：'+error.message})
})()
