/* Shared platform title mapping for both the list page and background polling. */
(() => {
  const firstText = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim() || ''
  function titleFor(platform, item = {}) {
    if (platform === 'huya') return firstText(item.intro, item.introduction, item.sLiveDesc, item.roomName, item.room_name, item.title, item.liveTitle)
    if (platform === 'douyu') return firstText(item.room_name, item.title)
    if (platform === 'bilibili') return firstText(item.title)
    return ''
  }
  function mergeTitles(rooms, cached = []) {
    const previous = new Map(cached.map((room) => [room.id, room]))
    return rooms.map((room) => {
      if (room.stale) return room
      if (firstText(room.title)) return { ...room, title: room.title.trim(), titleStale: false }
      const old = previous.get(room.id)
      if (old?.platform === room.platform && old.url === room.url && firstText(old.title)) return { ...room, title: old.title, titleStale: true }
      return { ...room, title: '', titleStale: false }
    })
  }
  globalThis.YuboRoomData = { titleFor, mergeTitles }
})()
