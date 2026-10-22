/* Activity management belongs to Settings; viewing uses the original list cards. */
(() => {
  const $ = (id) => document.getElementById(id), request = YuboTemporaryUI.request
  const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char])
  const dialog = $('temporary-dialog'), input = $('temporary-input'), mode = $('temporary-mode'), name = $('temporary-name')
  const status = $('temporary-import-status'), preview = $('temporary-preview'), parse = $('temporary-parse'), apply = $('temporary-apply')
  let collection = YuboTemporary.empty(), editing = null, candidate = null, selected = new Set(), nonce = 0, saving = false
  const expanded = new Set()
  function confirmActivityDelete(activity) {
    const warning=$('temporary-delete-dialog')
    if(warning.open)return Promise.resolve(false)
    $('temporary-delete-description').textContent='将删除活动“'+activity.name+'”及其本机名单（'+activity.rooms.length+' 位主播），并移除分组栏中的活动入口。'
    warning.returnValue='cancel'
    return new Promise(resolve=>{
      warning.addEventListener('close',()=>resolve(warning.returnValue==='delete'),{once:true})
      warning.showModal()
      $('temporary-delete-cancel').focus({preventScroll:true})
    })
  }
  function reset() { nonce++; candidate = null; selected.clear(); preview.innerHTML = ''; apply.disabled = true; status.textContent = '' }
  input.addEventListener('input', reset); mode.addEventListener('change', reset)
  dialog.addEventListener('cancel', (event) => { if (saving) event.preventDefault() })
  dialog.addEventListener('close', reset)
  $('temporary-close').addEventListener('click', () => { if (!saving) dialog.close() })
  function render() {
    const list = $('temporary-activity-list'), scrollTop = list.scrollTop
    $('temporary-count').textContent = collection.activities.length ? '（'+collection.activities.length+'）' : ''
    list.innerHTML = collection.activities.length ? collection.activities.map((activity) => {
      const online = activity.rooms.filter((room) => room.statusKnown && !room.stale && room.live).length
      const detailsId = 'activity-details-'+activity.id, showDetails = expanded.has(activity.id)
      const unknown = activity.rooms.filter((room) => !room.statusKnown || room.stale).length
      return '<article class="temporary-activity" data-activity="'+esc(activity.id)+'"><div class="temporary-activity-line"><div class="temporary-activity-heading"><input data-activity-name maxlength="24" aria-label="活动名称" value="'+esc(activity.name)+'"><button class="secondary-button" data-action="rename" aria-label="保存活动名称">保存</button></div><span class="temporary-activity-count" title="'+(unknown?unknown+' 位状态未知':'开播状态已更新')+'">'+activity.rooms.length+' 位主播 · <strong>'+online+'</strong> 在播</span><div class="temporary-actions"><button class="secondary-button" data-action="update" title="重新读取此活动来源，更新参与主播">更新名单</button><button class="secondary-button" data-action="edit" title="编辑来源或直播间链接">编辑</button><button class="secondary-button" data-action="refresh" title="只刷新当前名单的开播状态">刷新状态</button><button class="secondary-button" data-action="details" aria-expanded="'+showDetails+'" aria-controls="'+esc(detailsId)+'">详情</button><button class="secondary-button temporary-delete" data-action="remove">删除</button></div></div><div class="temporary-activity-details" id="'+esc(detailsId)+'" '+(showDetails?'':'hidden')+'><p>来源：'+esc(activity.mode==='activity'?activity.sources.join('、'):'直播间链接列表（'+activity.rooms.length+' 个）')+'</p><p>'+(activity.updatedAt?'最近检测 '+esc(new Date(activity.updatedAt).toLocaleString('zh-CN')):'等待检测')+(unknown?' · '+unknown+' 位状态未知':'')+'</p></div></article>'
    }).join('') : '<p class="hint">暂无临时活动。添加后会在关注列表的分组栏出现。</p>'
    list.scrollTop = scrollTop
  }
  function open(activity = null, autoParse = false) {
    reset(); editing = activity ? structuredClone(activity) : null
    name.value = activity?.name || ''; mode.value = activity?.mode || 'activity'; input.value = activity?.input || ''
    $('temporary-dialog-title').textContent = activity ? '更新活动：'+activity.name : '新增临时活动'
    apply.textContent = activity ? '保存此活动名单' : '添加活动'
    dialog.showModal()
    if (autoParse) void parseInput(); else name.focus()
  }
  async function parseInput() {
    reset(); const started = nonce
    parse.disabled = true; status.textContent = '正在提取主播，现有活动不会改变…'
    try {
      const result = await request('preview', { input: input.value, mode: mode.value })
      if (started !== nonce || !dialog.open) return
      candidate = result; selected = new Set(result.rooms.map((room) => room.id))
      const method = result.mode === 'rooms' ? '直播间链接列表（按输入顺序）' : result.methods?.every((item) => item.method === 'activity-config') ? '活动官方配置（按名单顺序）' : '页面链接（按出现顺序，需核对）'
      const oldIds = new Set((editing?.rooms || []).map((room) => room.id))
      const added = result.rooms.filter((room) => !oldIds.has(room.id)).length
      const removed = [...oldIds].filter((id) => !selected.has(id)).length
      status.textContent = `提取方式：${method}。识别 ${result.rooms.length} 位主播。`+(editing?`相对当前名单新增 ${added} 位、移除 ${removed} 位；仅更新此活动。`:'确认后添加为独立活动。')+(result.warnings || []).join(' ')
      preview.innerHTML = result.rooms.map((room) => '<label class="temporary-preview-row"><input type="checkbox" data-temp-select="'+esc(room.id)+'" checked><span>'+esc(room.name)+'</span><small>'+esc(room.url)+'</small></label>').join('')
      apply.disabled = false
      preview.querySelectorAll('[data-temp-select]').forEach((box) => box.addEventListener('change', () => {
        box.checked ? selected.add(box.dataset.tempSelect) : selected.delete(box.dataset.tempSelect)
        apply.disabled = !selected.size
      }))
    } catch (error) { if (started === nonce) status.textContent = error.message }
    finally { parse.disabled = false }
  }
  parse.addEventListener('click', parseInput)
  $('temporary-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return
    reset(); const started = nonce
    if (file.size > 1000000) { status.textContent = '文件超过 1 MB，请缩小列表。'; return }
    const text = await file.text()
    if (started === nonce) { input.value = text; mode.value = 'rooms' }
    event.target.value = ''
  })
  apply.addEventListener('click', async () => {
    if (!candidate || !selected.size || saving) return
    if (!name.value.trim()) { status.textContent = '请填写活动名称。'; name.focus(); return }
    const chosen = { ...candidate, rooms: candidate.rooms.filter((room) => selected.has(room.id)) }
    if (editing && !confirm('用预览中选定的 '+chosen.rooms.length+' 位主播更新“'+editing.name+'”？只更新这个活动，不影响其他活动。')) return
    saving = true; apply.disabled = true; parse.disabled = true
    input.disabled = mode.disabled = name.disabled = $('temporary-file').disabled = true
    try {
      collection = await request('save', { id: editing?.id, expectedRevision: editing?.revision, name: name.value, candidate: chosen })
      render(); $('temporary-manager-status').textContent = '活动已保存，正在检测开播状态。'; dialog.close()
    } catch (error) { status.textContent = error.message }
    finally {
      saving = false; input.disabled = mode.disabled = name.disabled = $('temporary-file').disabled = false
      apply.disabled = !candidate || !selected.size; parse.disabled = false
    }
  })
  $('temporary-add').addEventListener('click', () => open())
  $('temporary-activity-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]'), row = button?.closest('[data-activity]')
    if (!button || !row || button.disabled) return
    const activity = collection.activities.find((item) => item.id === row.dataset.activity)
    if (!activity) return
    const action = button.dataset.action
    if (action === 'details') {
      expanded.has(activity.id) ? expanded.delete(activity.id) : expanded.add(activity.id)
      render()
      const panel = document.getElementById('activity-details-'+activity.id), list = $('temporary-activity-list')
      if (expanded.has(activity.id)) {
        const below = panel.getBoundingClientRect().bottom-list.getBoundingClientRect().bottom
        if (below > 0) list.scrollTop += below
      }
      // The row remains present; return keyboard focus to its replacement button.
      panel.closest('[data-activity]').querySelector('[data-action="details"]').focus({ preventScroll: true })
      return
    }
    if (action === 'edit' || action === 'update') { open(activity, action === 'update'); return }
    if (action === 'remove' && !await confirmActivityDelete(activity)) return
    button.disabled = true; $('temporary-manager-status').textContent = action === 'refresh' ? '正在刷新此活动的开播状态…' : '正在保存…'
    try {
      collection = await request(action, { id: activity.id, name: row.querySelector('[data-activity-name]').value, force: true })
      render(); $('temporary-manager-status').textContent = action === 'remove' ? '活动已删除。' : '已更新。'
    } catch (error) { $('temporary-manager-status').textContent = error.message; button.disabled = false }
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[YuboTemporary.KEY]?.newValue) {
      // Keep unsaved names intact while background status updates arrive.
      const names = new Map([...document.querySelectorAll('[data-activity]')].flatMap((row) => {
        const value = row.querySelector('[data-activity-name]').value
        return value !== collection.activities.find((item) => item.id === row.dataset.activity)?.name ? [[row.dataset.activity, value]] : []
      }))
      const focused = document.activeElement?.matches('[data-activity-name]') ? { id: document.activeElement.closest('[data-activity]').dataset.activity, start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd } : null
      collection = changes[YuboTemporary.KEY].newValue
      render()
      document.querySelectorAll('[data-activity]').forEach((row) => {
        const field = row.querySelector('[data-activity-name]')
        if (names.has(row.dataset.activity)) field.value = names.get(row.dataset.activity)
        if (focused?.id === row.dataset.activity) { field.focus({ preventScroll: true }); field.setSelectionRange(focused.start, focused.end) }
      })
    }
  })
  request('read').then((value) => { collection = value; render(); if (location.hash === '#temporary-activities') $('temporary-activities').scrollIntoView() }).catch((error) => { $('temporary-manager-status').textContent = error.message })
})()
