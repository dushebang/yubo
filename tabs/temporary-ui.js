(() => {
  function send(action, details = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'yubo-temporary-action', action, ...details }, (result) => {
        const error = chrome.runtime.lastError
        if (error || !result) reject(new Error('临时列表后台尚未加载，请在扩展管理页重新加载鱼播后重试。'))
        else if (!result.ok) reject(new Error(result.error || '操作失败'))
        else resolve(result.value)
      })
    })
  }
  async function request(action,details={}) {
    if(action!=='reorder')return send(action,details)
    const reloadError=()=>Object.assign(new Error('临时活动后台仍是旧版，排序尚未保存。请重新加载鱼播后重试；现有活动和关注不会清除。'),{requiresReload:true})
    // Old workers understand read, but not reorder. Probe before sending any mutation.
    const capabilities=await send('read',{orderCapabilities:true})
    if(capabilities?.orderProtocol!==1)throw reloadError()
    try{return await send(action,details)}catch(error){if(/不支持的临时列表操作/.test(error.message))throw reloadError();throw error}
  }
  globalThis.YuboTemporaryUI = { request }
})()
