const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/list-view.js'),'utf8'),context)
const normalize=(raw,scope)=>JSON.parse(JSON.stringify(context.YuboListView.normalize(raw,scope)))
const scope={activityIds:['activity-a'],groupNames:['户外'],enabledPlatforms:['douyu'],fallbackSort:'oldest'}
test('local view retains selected activity, cover mode, manual live filter and sort independently',()=>{
  const saved={version:1,filter:'temporary',group:'activity-a',platform:'huya',liveCardMode:true,temporaryOnlyLive:false,sort:'newest',query:'not persisted',rooms:['not persisted']}
  const result=normalize(saved,scope)
  assert.deepEqual(result,{version:1,filter:'temporary',group:'activity-a',platform:'huya',liveCardMode:true,temporaryOnlyLive:false,sort:'newest'})
  assert.equal(saved.query,'not persisted')
  assert.equal(normalize({...saved,liveCardMode:false,temporaryOnlyLive:true},scope).temporaryOnlyLive,true)
})
test('deleted activity, removed group and disabled platform fall back safely',()=>{
  assert.deepEqual(normalize({version:1,filter:'temporary',group:'deleted',platform:'huya'},scope),{version:1,filter:'all',group:'all',platform:'all',liveCardMode:false,temporaryOnlyLive:false,sort:'oldest'})
  const result=normalize({version:1,filter:'favorites',group:'deleted',platform:'douyu'},scope)
  assert.equal(result.filter,'favorites');assert.equal(result.group,'all');assert.equal(result.platform,'douyu')
  assert.equal(normalize({version:1,filter:'favorites',group:'户外'},scope).group,'户外')
})
test('bad or missing local memory uses existing saved sorting and strict safe defaults',()=>{
  for(const raw of [null,[],true,'bad',{version:9,filter:'temporary',group:'activity-a'},{version:1,filter:'invalid',group:{},platform:'evil',liveCardMode:'true',temporaryOnlyLive:1,sort:'invalid'}]){
    assert.deepEqual(normalize(raw,scope),{version:1,filter:'all',group:'all',platform:'all',liveCardMode:false,temporaryOnlyLive:false,sort:'oldest'})
  }
})
