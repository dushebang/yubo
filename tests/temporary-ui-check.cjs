// Isolated headless UI test. No existing browser profile or external network is used.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict')
const { chromium } = require('playwright')
const root = path.resolve(__dirname, '..')
let webdavDocument = null, webdavServeLegacy = false
const server = http.createServer((req, res) => {
  if(new URL(req.url,'http://localhost').pathname==='/test-webdav/yubo-backup.json'){
    if(req.method==='PUT'){
      let body='';req.on('data',(chunk)=>{body+=chunk});req.on('end',()=>{webdavDocument=JSON.parse(body);res.writeHead(204);res.end()});return
    }
    if(req.method==='GET'){
      if(!webdavDocument){res.writeHead(404);res.end();return}
      const returned=structuredClone(webdavDocument);if(webdavServeLegacy)delete returned.temporaryActivities
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(returned));return
    }
    res.writeHead(405);res.end();return
  }
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname)
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return }
  const mime = { '.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml' }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'text/plain' }); fs.createReadStream(file).pipe(res)
})
;(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch({ executablePath: process.env.YUBO_TEST_BROWSER, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('dialog', (dialog) => dialog.accept())
    await page.route('**/*', (route) => route.request().url().startsWith(origin+'/') ? route.continue() : route.abort())
    const mockEnvironment = () => {
      const local = JSON.parse(sessionStorage.getItem('test-local') || '{}'), sync = JSON.parse(sessionStorage.getItem('test-sync') || '{"enabled_platforms":["douyu"],"favorite_streamers":["dy_9999"],"check_interval":3}'), listeners = []
      const area = (data, name) => ({
        get(key, callback) { queueMicrotask(() => callback({ [key]: structuredClone(data[key]) })) },
        set(values, callback) {
          const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: data[key], newValue: structuredClone(value) }]))
          Object.assign(data, structuredClone(values)); sessionStorage.setItem('test-'+name,JSON.stringify(data)); callback?.(); queueMicrotask(() => listeners.forEach((fn) => fn(changes, name)))
        }
      })
      globalThis.chrome = { storage: { local: area(local,'local'), sync: area(sync,'sync'), onChanged: { addListener(fn) { listeners.push(fn) } } },
        runtime: { reload(){globalThis.__reloadRequested=(globalThis.__reloadRequested||0)+1},getURL: (file) => location.origin+'/'+file, id: 'test-extension', sendMessage(message, callback) {
          if(sessionStorage.getItem('test-old-backup-worker')&&['export-backup','restore-backup'].includes(message.action)){
            callback({ok:false,error:'不支持的临时列表操作'});return
          }
          const controller = globalThis.__controller ||= YuboTemporary.createController(chrome.storage.local)
          ;(async () => {
            let value
            if (message.action === 'preview') value = await controller.preview(message.input, message.mode)
            if (message.action === 'read') {
              value = await controller.read()
              if(message.backupCapabilities&&!sessionStorage.getItem('test-old-backup-worker'))value={...value,backupProtocol:1}
            }
            if (message.action === 'export-backup') value = await controller.exportBackup()
            if (message.action === 'restore-backup') value = await controller.restoreBackup(message.backup)
            if (message.action === 'save') { value = await controller.save(message); void controller.refresh(message.id || value.activities.at(-1).id,true) }
            if (message.action === 'rename') value = await controller.rename(message.id,message.name)
            if (message.action === 'remove') value = await controller.remove(message.id)
            if (message.action === 'refresh') value = await controller.refresh(message.id,message.force)
            callback({ ok: true, value })
          })().catch((error) => callback({ ok: false, error: error.message }))
        } }, permissions:{request(options,callback){callback(true)}}, tabs: { create() { throw new Error('Temporary list must not open tabs') } } }
      globalThis.__testLocal = local; globalThis.__testSync = sync
      const browserFetch=globalThis.fetch.bind(globalThis)
      globalThis.fetch = async (address, init = {}) => {
        const url = new URL(address)
        if(url.origin===location.origin&&url.pathname.startsWith('/test-webdav/'))return browserFetch(address,init)
        if(url.hostname==='dav.example.test'){
          if(init.method==='PUT'){sessionStorage.setItem('test-webdav',init.body);return new Response('',{status:200})}
          if(init.method==='GET')return new Response(sessionStorage.getItem('test-webdav'),{status:200,headers:{'Content-Type':'application/json'}})
          throw new Error('Unexpected test WebDAV method')
        }
        let body
        if (url.pathname.endsWith('/follow/list')) body = { data: { list: [{ room_id: 9999, nickname: '正式关注主播', room_name:'今天一起看比赛，这是一个很长的直播间标题！&nbsp;空格 &amp; &quot;引号&quot; &#39;单引号&#39; &#x1F3AE; &amp;nbsp; &bogus; <b>原样显示</b> &lt;img src=x onerror=alert(1)&gt;', show_status: 1, videoLoop: 0, url: '/9999' }, { room_id:8888,nickname:'未开播正式主播',show_status:2,videoLoop:0,url:'/8888' }] } }
        else if (url.pathname.includes('/user/following')&&sessionStorage.getItem('test-bili-logged-out')) body = {code:-101,message:'账号未登录'}
        else if (url.pathname.includes('checkLogin.php')) body = {isLogined:!sessionStorage.getItem('test-huya-logged-out'),uid:'test-user'}
        else if (url.hostname==='fw.huya.com') body = {status:200,result:{list:[{uid:'huya-fixture',profileRoom:660000,nick:'虎牙测试主播',gameName:'英雄联盟',isLive:true,intro:sessionStorage.getItem('test-huya-no-title')?'':sessionStorage.getItem('test-huya-new-title')?'虎牙最新标题':'回来开工'}]}}
        else if (url.pathname === '/91124') body = `<script>window.zhtName='STLD';var webm_page_config='//butterfly.douyucdn.cn/api/page/loadPage?name=pageData2&pageId=59047&ver=abc';</script>`
        else if (url.hostname === 'butterfly.douyucdn.cn') body = { code: 0, data: { roomIds: sessionStorage.getItem('test-updated') ? ['1','4'] : ['1','2','3'] } }
        else if (url.pathname.startsWith('/betard/')) {
          const id = url.pathname.split('/').at(-1)
          if (id === '3') throw new Error('Simulated failure')
          body = { room: { room_id: Number(id), nickname: id === '1' ? '活动开播主播' : '活动未开播主播', show_status: id === '1' ? 1 : 2, videoLoop: 0, second_lvl_name:'户外', room_name: id==='1'?'今天一起看比赛，这是一个很长的活动直播间标题，欢迎来到直播间！':'短' } }
        } else if (url.pathname.includes('get_info')) body = { code: 0, data: { room_id: 6, live_status: 1, title: 'B站活动直播' } }
        else if (url.pathname.includes('get_anchor_in_room')) body = { code: 0, data: { info: { uname: 'B站活动主播' } } }
        else throw new Error('Unexpected fetch '+address)
        return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 })
      }
    }
    await page.addInitScript(mockEnvironment)
    await page.goto(origin+'/tabs/settings.html#temporary-activities')
    await page.locator('#temporary-add').click()
    await page.locator('#temporary-name').fill('活动 A')
    await page.locator('#temporary-input').fill('https://www.douyu.com/91124')
    await page.locator('#temporary-parse').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-temp-select]').length === 3)
    assert.match(await page.locator('#temporary-import-status').innerText(), /活动官方配置/)
    await page.locator('[data-temp-select="temp_douyu_3"]').uncheck()
    await page.locator('[data-temp-select="temp_douyu_3"]').check()
    await page.locator('#temporary-apply').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-activity]').length === 1 && __testLocal.yubo_temporary_activities.activities[0].updatedAt)
    const activityA = await page.locator('[data-activity]').getAttribute('data-activity')
    await page.locator('#temporary-add').click()
    await page.locator('#temporary-name').fill('活动 B')
    await page.locator('#temporary-file').setInputFiles({name:'rooms.txt',mimeType:'text/plain',buffer:Buffer.from('https://live.bilibili.com/6')})
    await page.waitForFunction(() => document.getElementById('temporary-input').value.includes('bilibili'))
    await page.locator('#temporary-parse').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-temp-select]').length === 1)
    await page.locator('#temporary-apply').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-activity]').length === 2 && __testLocal.yubo_temporary_activities.activities[1].updatedAt)
    const activityB = await page.locator('[data-activity]').nth(1).getAttribute('data-activity')
    const a = page.locator('[data-activity="'+activityA+'"]')
    await a.locator('[data-activity-name]').fill('改名活动')
    await a.locator('[data-action="rename"]').click()
    await page.waitForFunction(() => __testLocal.yubo_temporary_activities.activities[0].name === '改名活动')
    const artifacts = path.join(__dirname,'artifacts'); fs.mkdirSync(artifacts,{recursive:true})
    await page.locator('#temporary-activities').screenshot({path:path.join(artifacts,'activities-settings.png')})
    // Export through the real UI and restore into a completely fresh browser context.
    await page.evaluate(()=>sessionStorage.setItem('test-old-backup-worker','1'))
    const [backupDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#export-backup').click()])
    const exported=JSON.parse(fs.readFileSync(await backupDownload.path(),'utf8'))
    assert.deepEqual(exported.temporaryActivities.activities.map(a=>a.name),['改名活动','活动 B'])
    assert.equal(exported.temporaryActivities.activities[0].sources[0],'https://www.douyu.com/91124')
    assert.equal(exported.temporaryActivities.activities[0].rooms.length,3)
    assert.equal(exported.temporaryActivities.activities[0].rooms[0].live,undefined)
    const target=await browser.newPage({viewport:{width:1440,height:1000}})
    target.on('pageerror',(error)=>errors.push(error.message));target.on('dialog',(dialog)=>dialog.accept())
    await target.route('**/*',(route)=>route.request().url().startsWith(origin+'/')?route.continue():route.abort())
    await target.addInitScript(mockEnvironment)
    await target.goto(origin+'/tabs/settings.html#temporary-activities')
    assert.equal(await target.locator('[data-activity]').count(),0)
    const importFile=(backup)=>target.locator('#import-backup').setInputFiles({name:'yubo-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))})
    await importFile(exported)
    await target.waitForFunction(()=>document.getElementById('backup-status').textContent.includes('备份已导入'))
    assert.deepEqual(await target.locator('[data-activity-name]').evaluateAll(nodes=>nodes.map(node=>node.value)),['改名活动','活动 B'])
    assert.ok(await target.evaluate(()=>__testLocal.yubo_temporary_activities.activities.every(a=>a.rooms.every(r=>r.statusKnown===false))))
    await target.goto(origin+'/tabs/index.html')
    await target.locator('[data-activity-tab]').first().click()
    assert.equal(await target.locator('.row').count(),3)
    await target.locator('#refresh').click()
    await target.waitForFunction(()=>document.querySelectorAll('.row.live').length===1)
    await target.goto(origin+'/tabs/settings.html#temporary-activities')

    const legacyBackup=structuredClone(exported);delete legacyBackup.temporaryActivities
    await importFile(legacyBackup)
    await target.waitForFunction(()=>document.getElementById('backup-status').textContent.includes('当前活动已保留'))
    assert.equal(await target.locator('[data-activity]').count(),2)
    const beforeInvalid=await target.evaluate(()=>JSON.stringify({local:__testLocal,sync:__testSync}))
    const invalidBackup=structuredClone(exported);invalidBackup.temporaryActivities.activities[0].rooms[0].url='https://evil.example/secret';invalidBackup.favorites=[]
    await importFile(invalidBackup)
    await target.waitForFunction(()=>document.getElementById('backup-status').textContent.includes('无效'))
    assert.equal(await target.evaluate(()=>JSON.stringify({local:__testLocal,sync:__testSync})),beforeInvalid)
    // Reproduce the user's error: new page + old worker. Export remains available;
    // restore performs no writes and offers an explicit runtime update instead.
    await target.evaluate(()=>sessionStorage.setItem('test-old-backup-worker','1'))
    await importFile(exported)
    await target.waitForFunction(()=>document.getElementById('backup-status').textContent.includes('后台尚未更新'))
    assert.equal(await target.evaluate(()=>JSON.stringify({local:__testLocal,sync:__testSync})),beforeInvalid)
    assert.ok(await target.locator('#reload-backup-runtime').isVisible())
    await target.locator('#reload-backup-runtime').click()
    assert.equal(await target.evaluate(()=>__reloadRequested),1)
    await target.evaluate(()=>sessionStorage.removeItem('test-old-backup-worker'))
    const emptyBackup=structuredClone(exported);emptyBackup.temporaryActivities.activities=[]
    await importFile(emptyBackup)
    await target.waitForFunction(()=>document.querySelectorAll('[data-activity]').length===0)
    await importFile(exported)
    await target.waitForFunction(()=>document.querySelectorAll('[data-activity]').length===2)

    // Actual HTTP PUT/GET to a local-only server, including a different browser context.
    await target.locator('#webdav-open').click()
    await target.locator('#webdav-server-url').fill(origin+'/test-webdav/')
    await target.locator('#webdav-username').fill('test-account')
    await target.locator('#webdav-password').fill('test-password')
    await target.locator('#webdav-upload').click()
    await target.waitForFunction(()=>document.getElementById('webdav-status').textContent.includes('配置已上传'))
    const webdavBackup=structuredClone(webdavDocument)
    assert.deepEqual(webdavBackup.temporaryActivities.activities,exported.temporaryActivities.activities)
    assert.ok(!JSON.stringify(webdavBackup).includes('test-password'))
    assert.match(await target.locator('#webdav-status').innerText(),/读回核验：2 个临时活动 \/ 4 个主播条目/)

    const davTarget=await browser.newPage({viewport:{width:1440,height:1000}})
    davTarget.on('pageerror',(error)=>errors.push(error.message));davTarget.on('dialog',(dialog)=>dialog.accept())
    await davTarget.route('**/*',(route)=>route.request().url().startsWith(origin+'/')?route.continue():route.abort())
    await davTarget.addInitScript(mockEnvironment)
    await davTarget.goto(origin+'/tabs/settings.html#temporary-activities')
    assert.equal(await davTarget.locator('[data-activity]').count(),0)
    await davTarget.locator('#webdav-open').click()
    await davTarget.locator('#webdav-server-url').fill(origin+'/test-webdav/')
    await davTarget.locator('#webdav-download').click()
    await davTarget.waitForFunction(()=>document.getElementById('webdav-status').textContent.includes('已从此文件恢复'))
    assert.match(await davTarget.locator('#webdav-status').innerText(),/已恢复并核验 2 个临时活动 \/ 4 个主播条目/)
    await davTarget.locator('#webdav-close').click()
    assert.deepEqual(await davTarget.locator('[data-activity-name]').evaluateAll(nodes=>nodes.map(node=>node.value)),['改名活动','活动 B'])
    await davTarget.goto(origin+'/tabs/index.html')
    await davTarget.waitForFunction(()=>document.querySelectorAll('[data-activity-tab]').length===2)
    await davTarget.close()

    webdavServeLegacy=true
    await target.locator('#webdav-upload').click()
    await target.waitForFunction(()=>document.getElementById('webdav-status').textContent.includes('读回核验失败'))
    assert.match(await target.locator('#webdav-status').innerText(),/不含临时活动/)
    await target.locator('#webdav-download').click()
    await target.waitForFunction(()=>document.getElementById('webdav-status').textContent.includes('未恢复任何活动'))
    assert.equal(await target.locator('[data-activity]').count(),2)
    webdavServeLegacy=false
    await target.evaluate(()=>YuboTemporaryUI.request('restore-backup',{backup:{version:1,activities:[]}}))
    await target.locator('#webdav-download').click()
    await target.waitForFunction(()=>document.getElementById('webdav-status').textContent.includes('已从此文件恢复'))
    assert.equal(await target.locator('[data-activity]').count(),2)
    await target.close()


    await page.goto(origin+'/tabs/index.html')
    await page.locator('.row .name').filter({hasText:'正式关注主播'}).waitFor()
    await page.waitForFunction(()=>document.querySelector('.room-title.is-scrolling'))
    assert.equal(await page.locator('.room-title').count(),1)
    assert.equal(await page.locator('.room-title b').count(),0)
    const decodedTitle=await page.locator('.room-title-text').first().textContent()
    assert.ok(decodedTitle.includes(' 空格 & "引号" \'单引号\' 🎮'))
    assert.ok(!decodedTitle.includes('&nbsp;'))
    assert.ok(decodedTitle.includes('&bogus;'))
    assert.ok(decodedTitle.includes('<img src=x onerror=alert(1)>'))
    assert.equal(await page.locator('.room-title img,.room-title script').count(),0)
    assert.equal(await page.locator('.room-title').first().getAttribute('title'),null)
    assert.equal(await page.locator('.room-title').first().getAttribute('data-room-title'),decodedTitle)
    await page.mouse.move(0,0)
    assert.equal(await page.locator('.room-title-text').first().evaluate((node)=>getComputedStyle(node).animationName),'none')
    await page.locator('.room-title').first().hover()
    const titleTooltip=page.locator('#room-title-tooltip')
    await titleTooltip.waitFor({state:'visible'})
    assert.equal(await titleTooltip.textContent(),decodedTitle)
    assert.equal(await titleTooltip.locator('img,script,b').count(),0)
    const tooltipBounds=await titleTooltip.boundingBox()
    assert.ok(tooltipBounds.x>=0&&tooltipBounds.x+tooltipBounds.width<=1440)
    await page.screenshot({path:path.join(artifacts,'modern-title-tooltip.png')})
    await page.keyboard.press('Escape')
    await titleTooltip.waitFor({state:'hidden'})
    assert.equal(await page.locator('.name-line').first().evaluate((node)=>getComputedStyle(node).alignItems),'baseline')
    const titleStyle=await page.locator('.room-title').first().evaluate((node)=>({size:parseFloat(getComputedStyle(node).fontSize),nameSize:parseFloat(getComputedStyle(node.previousElementSibling).fontSize),italic:getComputedStyle(node).fontStyle}))
    assert.ok(titleStyle.size<titleStyle.nameSize&&titleStyle.italic==='italic')
    await page.locator('.row').filter({hasText:'正式关注主播'}).first().hover()
    assert.equal(await page.locator('.room-title-text').first().evaluate((node)=>getComputedStyle(node).animationName),'room-title-scroll')
    assert.equal(await page.locator('.room-title-text').first().evaluate((node)=>getComputedStyle(node).animationPlayState),'running')
    await page.mouse.move(0,0)
    assert.equal(await page.locator('.room-title-text').first().evaluate((node)=>getComputedStyle(node).animationName),'none')
    assert.equal(await page.locator('.room-title-text').first().evaluate((node)=>getComputedStyle(node).transform),'none')
    await page.locator('.row').filter({hasText:'正式关注主播'}).first().hover()
    await page.emulateMedia({reducedMotion:'reduce'})
    assert.equal(await page.locator('.room-title-text').first().evaluate((node)=>getComputedStyle(node).animationName),'none')
    await page.emulateMedia({reducedMotion:'no-preference'})
    const originalHeight = await page.locator('.row').first().evaluate((row)=>row.getBoundingClientRect().height)
    await page.locator('[data-activity-tab="'+activityA+'"]').click()
    assert.equal(await page.locator('.row').count(),3)
    assert.equal(await page.locator('.row .star').count(),0)
    assert.equal(await page.locator('.row.live').count(),1)
    assert.equal(await page.locator('.row.stale').count(),1)
    assert.equal(await page.locator('.row .area').count(),3)
    await page.waitForFunction(()=>document.querySelector('.room-title.is-scrolling'))
    assert.equal(await page.locator('.room-title').count(),2)
    assert.ok(!(await page.locator('.room-title').filter({hasText:'短'}).evaluate((node)=>node.classList.contains('is-scrolling'))))
    assert.equal(await page.locator('.temporary-room-title,.temporary-room-status').count(),0)
    assert.ok(Math.abs(await page.locator('.row').first().evaluate((row)=>row.getBoundingClientRect().height)-originalHeight)<0.5,'Card heights must match within browser subpixel rounding')
    await page.screenshot({path:path.join(artifacts,'activities-list.png')})
    await page.locator('#temporary-only-live').check()
    assert.equal(await page.locator('.row').count(),1)
    await page.locator('#temporary-only-live').uncheck()
    await page.locator('#search').fill('未开播')
    assert.equal(await page.locator('.row').count(),1)
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.row').count(),3)
    // Cover mode is shared by every tab, but its live-only filter is scoped to that tab.
    await page.locator('#live-view-toggle').click()
    assert.equal(await page.locator('.live-card').count(),1)
    assert.equal(await page.locator('.live-card .star').count(),0)
    assert.equal(await page.locator('.live-card .name-line .room-title').count(),1)
    assert.ok(await page.locator('#temporary-only-live').isDisabled())
    await page.screenshot({path:path.join(artifacts,'activity-cover-mode.png')})
    await page.locator('[data-filter="all"]').click()
    assert.equal(await page.locator('.live-card').count(),1)
    assert.equal(await page.locator('.live-card .star').count(),1)
    await page.locator('[data-filter="live"]').click()
    assert.equal(await page.locator('.live-card').count(),1)
    await page.locator('[data-filter="favorites"]').click()
    assert.equal(await page.locator('.live-card').count(),1)
    assert.equal(await page.locator('.live-card .room-title').count(),1)
    await page.evaluate(()=>new Promise((resolve)=>chrome.storage.local.set({yubo_favorite_groups:{dy_9999:'常看'}},resolve)))
    await page.waitForFunction(()=>document.querySelector('[data-group-tab="常看"]').innerText.includes('1'))
    await page.locator('[data-group-tab="常看"]').click()
    assert.equal(await page.locator('.live-card').count(),1)
    assert.equal(await page.locator('.live-card .room-title').count(),1)
    await page.locator('[data-activity-tab="'+activityB+'"]').click()
    assert.equal(await page.locator('.live-card').count(),1)
    assert.equal(await page.locator('.live-card .star').count(),0)
    await page.locator('[data-activity-tab="'+activityA+'"]').click()
    await page.locator('[data-activity-tab="'+activityA+'"]').press('v')
    assert.equal(await page.locator('.live-card').count(),0)
    assert.equal(await page.locator('.row').count(),3)
    assert.ok(!(await page.locator('#temporary-only-live').isDisabled()))
    await page.locator('#search').fill('v')
    await page.locator('#search').press('v')
    assert.equal(await page.locator('#live-view-toggle').getAttribute('aria-pressed'),'false')
    await page.keyboard.press('Escape')
    await page.locator('[data-activity-tab="'+activityA+'"]').focus()
    await page.keyboard.press('Control+v')
    assert.equal(await page.locator('#live-view-toggle').getAttribute('aria-pressed'),'false')
    await page.locator('[data-filter="all"]').click()
    assert.equal(await page.locator('.row').count(),2)
    await page.locator('[data-filter="all"]').press('v')
    assert.equal(await page.locator('.row').count(),1)
    await page.locator('[data-filter="all"]').press('v')
    assert.equal(await page.locator('.row').count(),2)
    await page.locator('[data-activity-tab="'+activityB+'"]').click()
    assert.equal(await page.locator('.row').count(),1)
    assert.match(await page.locator('.row .name').innerText(),/B站活动主播/)
    await page.locator('[data-activity-tab="'+activityB+'"]').press('ArrowLeft')
    assert.match(await page.locator('.filter-tab.active').innerText(),/改名活动/)

    await page.goto(origin+'/tabs/settings.html#temporary-activities')
    await page.evaluate(()=>sessionStorage.setItem('test-updated','true'))
    await page.locator('[data-activity="'+activityA+'"] [data-action="update"]').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-temp-select]').length === 2)
    assert.match(await page.locator('#temporary-import-status').innerText(),/新增 1 位、移除 2 位/)
    assert.equal(await page.locator('#temporary-name').inputValue(),'改名活动')
    await page.locator('#temporary-apply').click()
    await page.waitForFunction(() => __testLocal.yubo_temporary_activities.activities[0].rooms.length === 2 && !document.querySelector('#temporary-dialog').open)
    assert.equal(await page.evaluate(()=>__testLocal.yubo_temporary_activities.activities[1].rooms[0].roomKey),'6')
    await page.locator('[data-activity="'+activityA+'"] [data-action="remove"]').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-activity]').length === 1)
    assert.equal(await page.locator('[data-activity]').getAttribute('data-activity'),activityB)

    await page.goto(origin+'/tabs/index.html')
    await page.locator('[data-activity-tab="'+activityB+'"]').waitFor()
    assert.equal(await page.locator('[data-activity-tab]').count(),1)
    assert.deepEqual(await page.evaluate(()=>__testSync.favorite_streamers),['dy_9999'])
    assert.equal(await page.evaluate(()=>__testLocal.yubo_last_rooms.length),2)
    await page.locator('[data-filter="all"]').press('ArrowLeft')
    assert.match(await page.locator('.filter-tab.active').innerText(),/活动 B/)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth))
    // Many groups must scroll within their own row, never consume search width.
    const searchWidthBefore = await page.locator('#search').evaluate((node)=>node.getBoundingClientRect().width)
    await page.evaluate(()=>new Promise((resolve)=>chrome.storage.local.set({yubo_favorite_group_names:Array.from({length:30},(_,i)=>'测试分组 '+(i+1))},resolve)))
    await page.waitForFunction(()=>document.querySelectorAll('[data-group-tab]').length===30)
    assert.equal(await page.locator('#search').evaluate((node)=>node.getBoundingClientRect().width),searchWidthBefore)
    for(const width of [1440,900,480]){
      await page.setViewportSize({width,height:1000})
      await page.locator('[data-filter="all"]').click()
      await page.locator('[data-filter="all"]').press('ArrowLeft')
      const layout = await page.evaluate(()=>{
        const tabs=document.querySelector('.filter-tabs'),active=tabs.querySelector('.active'),search=document.getElementById('search')
        const t=tabs.getBoundingClientRect(),a=active.getBoundingClientRect(),s=search.getBoundingClientRect()
        return {overflows:tabs.scrollWidth>tabs.clientWidth,searchBelow:s.top>=t.bottom,searchWidth:s.width,activeVisible:a.left>=t.left&&a.right<=t.right+1,pageFits:document.documentElement.scrollWidth<=innerWidth,scroll:tabs.scrollLeft}
      })
      assert.ok(layout.overflows&&layout.searchBelow&&layout.searchWidth>=190&&layout.activeVisible&&layout.pageFits,JSON.stringify(layout))
      await page.locator('#search').fill('测试')
      assert.ok(Math.abs(await page.locator('.filter-tabs').evaluate((node)=>node.scrollLeft)-layout.scroll)<=1)
      await page.keyboard.press('Escape')
      await page.screenshot({path:path.join(artifacts,'many-groups-'+width+'.png')})
    }
    // Compact management must remain bounded even at the maximum activity count.
    await page.setViewportSize({width:1440,height:1000})
    await page.goto(origin+'/tabs/settings.html#temporary-activities')
    await page.locator('[data-activity]').waitFor()
    assert.ok(await page.locator('[data-activity]').first().evaluate((row)=>row.getBoundingClientRect().height<=60))
    assert.equal(await page.locator('.temporary-activity-details:visible').count(),0)
    await page.evaluate(()=>new Promise((resolve)=>{
      const saved=structuredClone(__testLocal.yubo_temporary_activities),original=saved.activities[0]
      saved.activities=[original,...Array.from({length:19},(_,i)=>({...structuredClone(original),id:'fixture-'+i,name:'测试活动 '+(i+1)}))]
      chrome.storage.local.set({yubo_temporary_activities:saved},resolve)
    }))
    await page.waitForFunction(()=>document.querySelectorAll('[data-activity]').length===20)
    const compact = await page.locator('#temporary-activity-list').evaluate((list)=>({height:list.getBoundingClientRect().height,overflows:list.scrollHeight>list.clientHeight}))
    assert.ok(compact.height<=360&&compact.overflows)
    await page.locator('[data-activity]').last().locator('[data-action="details"]').click()
    assert.equal(await page.locator('.temporary-activity-details:visible').count(),1)
    const beforeRefresh=await page.locator('#temporary-activity-list').evaluate((list)=>list.scrollTop)
    await page.evaluate(()=>new Promise((resolve)=>chrome.storage.local.set({yubo_temporary_activities:structuredClone(__testLocal.yubo_temporary_activities)},resolve)))
    assert.equal(await page.locator('.temporary-activity-details:visible').count(),1)
    assert.ok(Math.abs(await page.locator('#temporary-activity-list').evaluate((list)=>list.scrollTop)-beforeRefresh)<=1)
    await page.locator('#temporary-activities').screenshot({path:path.join(artifacts,'compact-activities-desktop.png')})
    await page.setViewportSize({width:480,height:1000})
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    assert.ok(await page.locator('#temporary-activity-list').evaluate((list)=>list.getBoundingClientRect().height<=360))
    await page.locator('#temporary-activities').screenshot({path:path.join(artifacts,'compact-activities-mobile.png')})
    await page.setViewportSize({width:1440,height:1000})
    await page.goto(origin+'/tabs/index.html')
    await page.evaluate(()=>new Promise((resolve)=>chrome.storage.sync.set({enabled_platforms:['huya']},resolve)))
    await page.locator('.row .name').filter({hasText:'虎牙测试主播'}).waitFor()
    assert.equal(await page.locator('.room-title-text').textContent(),'回来开工')
    await page.evaluate(()=>sessionStorage.setItem('test-huya-no-title','1'))
    await page.locator('#refresh').click()
    await page.waitForFunction(()=>__testLocal.yubo_last_rooms[0].titleStale===true)
    assert.equal(await page.locator('.room-title-text').textContent(),'回来开工')
    assert.match(await page.locator('.room-title').getAttribute('data-room-title'),/上次标题/)
    await page.reload()
    await page.locator('.row .name').filter({hasText:'虎牙测试主播'}).waitFor()
    assert.equal(await page.locator('.room-title-text').textContent(),'回来开工')
    await page.evaluate(()=>{sessionStorage.removeItem('test-huya-no-title');sessionStorage.setItem('test-huya-new-title','1')})
    await page.locator('#refresh').click()
    await page.waitForFunction(()=>document.querySelector('.room-title-text')?.textContent==='虎牙最新标题')
    assert.equal(await page.locator('.room-title').getAttribute('data-room-title'),'虎牙最新标题')
    await page.locator('#live-view-toggle').click()
    assert.equal(await page.locator('.live-card .room-title-text').textContent(),'虎牙最新标题')
    await page.evaluate(()=>sessionStorage.setItem('test-huya-logged-out','1'))
    await page.locator('#refresh').click()
    const authHint=page.locator('.health-item.auth')
    await authHint.waitFor()
    assert.match(await authHint.textContent(),/重新授权/)
    assert.equal(await authHint.locator('[data-auth]').getAttribute('data-auth'),'huya')
    const sharedAuthHint=page.locator('.platform-health .health-auth-hint')
    assert.equal(await sharedAuthHint.count(),1)
    assert.equal(await sharedAuthHint.textContent(),'或到“平台诊断”设置取消勾选“启用平台”')
    assert.equal(await sharedAuthHint.locator('a').getAttribute('href'),'settings.html#diagnostics')
    await page.evaluate(()=>{sessionStorage.setItem('test-bili-logged-out','1');return new Promise((resolve)=>chrome.storage.sync.set({enabled_platforms:['bilibili','huya']},resolve))})
    await page.waitForFunction(()=>document.querySelectorAll('.health-item.auth').length===2)
    assert.equal(await sharedAuthHint.count(),1)
    assert.equal(await page.locator('.health-item.auth [data-auth]').count(),2)
    assert.deepEqual(errors,[])
    console.log('UI passed: old-worker export compatibility and safe restore checks, cross-browser JSON and real local HTTP WebDAV migration, activity management, cards, shortcuts and official-list isolation.')
  } finally { await browser.close() }
})().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => server.close())
