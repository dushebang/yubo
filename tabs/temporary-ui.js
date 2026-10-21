(() => {
  function request(action, details = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'yubo-temporary-action', action, ...details }, (result) => {
        const error = chrome.runtime.lastError
        if (error || !result) reject(new Error('临时列表后台尚未加载，请在扩展管理页重新加载鱼播后重试。'))
        else if (!result.ok) reject(new Error(result.error || '操作失败'))
        else resolve(result.value)
      })
    })
  }
  globalThis.YuboTemporaryUI = { request }
})()
