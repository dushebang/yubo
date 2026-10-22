const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const base='chrome-extension://fish/tabs/index.html'
const source=fs.readFileSync(path.join(__dirname,'../static/background/single-list-tab.js'),'utf8')
function harness(initial=[]){
  const tabs=new Map(initial.map(tab=>[tab.id,{...tab}])),removed=[],events={}
  const event=name=>({addListener(fn){events[name]=fn}})
  let onQuery
  const api={onCreated:event('created'),onUpdated:event('updated'),onRemoved:event('removed'),
    async query(){const result=[...tabs.values()].map(tab=>({...tab}));if(onQuery){const fn=onQuery;onQuery=null;await fn()}return result},
    async get(id){if(!tabs.has(id))throw Error('closed');return {...tabs.get(id)}},
    async remove(id){removed.push(id);tabs.delete(id);events.removed?.(id)}}
  vm.runInNewContext(source,{URL,console,chrome:{runtime:{getURL:file=>'chrome-extension://fish/'+file},tabs:api}})
  return {tabs,removed,create(tab){tabs.set(tab.id,{...tab});events.created(tab)},navigate(id,url){Object.assign(tabs.get(id),{url,pendingUrl:undefined});events.updated(id,{url},tabs.get(id))},status(id){events.updated(id,{status:'loading'},tabs.get(id))},queryHook(fn){onQuery=fn},flush:async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate)}}
}
test('new list closes older lists across windows but never other pages or private context',async()=>{
  const h=harness([{id:1,url:base,windowId:1},{id:2,url:base+'?group=x#live',windowId:2},{id:3,url:'chrome-extension://fish/tabs/settings.html'},{id:4,url:'https://www.douyu.com/1'},{id:5,url:'chrome-extension://other/tabs/index.html'},{id:6,url:base,incognito:true}])
  h.create({id:7,url:base,windowId:3});await h.flush()
  assert.deepEqual(h.removed,[1,2]);assert.ok(h.tabs.has(7));for(const id of [3,4,5,6])assert.ok(h.tabs.has(id))
})
test('pending list URL is recognized and reloading the same tab never closes it',async()=>{
  const h=harness([{id:1,url:base}]);h.create({id:2,url:'about:blank',pendingUrl:base});await h.flush()
  h.navigate(2,base);h.status(2);await h.flush()
  assert.deepEqual(h.removed,[1]);assert.ok(h.tabs.has(2))
})
test('rapid consecutive opens keep the newest tab',async()=>{
  const h=harness([{id:1,url:base}]);h.create({id:2,url:base});h.create({id:3,url:base});h.create({id:4,url:base});await h.flush()
  assert.deepEqual([...h.tabs.keys()],[4])
})
test('slower first tab must not displace a newer tab',async()=>{
  const h=harness();h.create({id:1,url:'about:blank'});h.create({id:2,url:base});h.navigate(1,base);await h.flush()
  assert.deepEqual([...h.tabs.keys()],[2])
})
test('late initial navigation is cleaned up even after the newer tab already finished cleanup',async()=>{
  const h=harness();h.create({id:1,url:'about:blank'});h.create({id:2,url:base});await h.flush()
  assert.equal(h.tabs.size,2)
  h.navigate(1,base);await h.flush();assert.deepEqual([...h.tabs.keys()],[2])
})
test('navigating from settings into a list keeps the newly navigated tab',async()=>{
  const h=harness([{id:1,url:base},{id:2,url:'chrome-extension://fish/tabs/settings.html'}]);h.navigate(2,base);await h.flush()
  assert.deepEqual([...h.tabs.keys()],[2])
})
test('do not close a list candidate that navigated to settings during cleanup',async()=>{
  const h=harness([{id:1,url:base}]);h.queryHook(()=>h.navigate(1,'chrome-extension://fish/tabs/settings.html'));h.create({id:2,url:base});await h.flush()
  assert.deepEqual(h.removed,[]);assert.equal(h.tabs.size,2)
})
test('a newer claim during cleanup supersedes older queued cleanup',async()=>{
  const h=harness([{id:1,url:base}]);h.queryHook(()=>h.create({id:3,url:base}));h.create({id:2,url:base});await h.flush()
  assert.deepEqual([...h.tabs.keys()],[3])
})
