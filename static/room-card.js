/* One card component for all lists. No storage, requests, tab names or list-specific branches. */
(() => {
  function create({escape:esc,icons,heading,duration,image}) {
    const heart='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
    function favorite(room){
      if(!room.canFavorite)return ''
      const label=room.favorite?'取消收藏':'收藏'
      return '<button class="star '+(room.favorite?'selected':'')+'" data-star="'+esc(room.id)+'" title="'+label+'" aria-label="'+label+' '+esc(room.name)+'">'+heart+'</button>'
    }
    function ordering(room){
      if(!room.canReorder)return ''
      return '<span class="room-order-controls" role="group" aria-label="临时主播排序">'+[['top','置顶','M4 3h12M10 17V6m-4 4 4-4 4 4',room.canMoveUp],['up','上移','M10 16V4m-4 4 4-4 4 4',room.canMoveUp],['down','下移','M10 4v12m-4-4 4 4 4-4',room.canMoveDown]].map(([move,label,path,enabled])=>'<button type="button" data-room-move="'+move+'" data-room-id="'+esc(room.id)+'" title="'+label+'" aria-label="'+label+' '+esc(room.name)+'" '+(enabled?'':'disabled')+'><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg></button>').join('')+'</span>'
    }
    return (room,{coverMode=false}={})=>{
      const platform=icons[room.platform]?room.platform:'bilibili'
      const classes=(room.favorite?'favorite ':'')+(room.canReorder?'has-room-order ':'')+(room.stale?'stale':'')
      const link='href="'+esc(room.url)+'" target="_blank" rel="noopener noreferrer"'
      const avatar='<img class="avatar" src="'+esc(room.avatar)+'" alt="">'
      const title=heading(room,room.statusLabel)
      if(coverMode){
        const background=room.cover?image(room):'<span class="live-card-no-cover">直播预览暂不可用</span>'
        return '<div class="row live-card '+classes+'"><a class="stream-link live-card-link" '+link+'><span class="live-card-background">'+background+'</span>'+duration(room)+'<span class="live-card-info">'+avatar+'<span class="live-card-text">'+title+'</span></span></a>'+favorite(room)+ordering(room)+'</div>'
      }
      const number=room.displayRoomId||String(room.url||'').match(/([0-9]+)\/?(?:[?#].*)?$/)?.[1]||''
      const aliases=room.aliases.map(value=>'<span class="alias-tag" title="'+esc(value)+'"><span class="alias-text">'+esc(value)+'</span></span>').join('')
      const preview=room.live&&room.cover?'<span class="hover-cover">'+image(room)+'</span>':''
      return '<div class="row '+(room.live?'live ':'')+classes+'"><a class="stream-link" '+link+'><span class="tv platform-'+platform+'">'+icons[platform]+'</span>'+avatar+'<span class="info">'+title+'<span class="meta-line"><span class="tags"><span class="area">'+esc(room.category||'直播')+'</span>'+(number?'<span class="room">'+esc(number)+'</span>':'')+aliases+'</span>'+duration(room)+'</span></span>'+preview+'</a>'+favorite(room)+ordering(room)+'</div>'
    }
  }
  globalThis.YuboRoomCard={create}
})()
