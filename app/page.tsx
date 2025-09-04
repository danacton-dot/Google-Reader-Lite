// 'use client' because we need local state and SW registration
'use client'

import { useEffect, useMemo, useState } from 'react'

type FeedItem = {
  id: string
  title: string
  link: string
  content?: string
  summary?: string
  published?: string
}

type Feed = {
  url: string
  title?: string
  link?: string
  items: FeedItem[]
}

const LS_FEEDS = 'reader.feeds'
const LS_READ = 'reader.read'

function saveFeeds(urls: string[]) {
  localStorage.setItem(LS_FEEDS, JSON.stringify(urls))
}
function loadFeeds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_FEEDS) || '[]')
  } catch { return [] }
}
function saveRead(ids: string[]) {
  localStorage.setItem(LS_READ, JSON.stringify(ids))
}
function loadRead(): Set<string> {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_READ) || '[]') as string[]
    return new Set(arr)
  } catch { return new Set() }
}

export default function Page() {
  const [feedUrls, setFeedUrls] = useState<string[]>([])
  const [selectedUrl, setSelectedUrl] = useState<string>('')
  const [currentFeed, setCurrentFeed] = useState<Feed | null>(null)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setFeedUrls(loadFeeds())
    setReadIds(loadRead())
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (selectedUrl) {
      loadFeed(selectedUrl)
    } else if (feedUrls[0]) {
      setSelectedUrl(feedUrls[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUrl, feedUrls.join('|')])

  async function loadFeed(url: string) {
    try {
      setBusy(true); setError(null)
      const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`)
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
      const data = await res.json()
      setCurrentFeed(data as Feed)
    } catch (e:any) {
      setError(e.message || 'Failed to load feed')
    } finally {
      setBusy(false)
    }
  }

  function addFeed(url: string) {
    url = url.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      setError('Feed URL must start with http(s)://')
      return
    }
    if (feedUrls.includes(url)) {
      setSelectedUrl(url); setAdding(''); return
    }
    const next = [url, ...feedUrls]
    setFeedUrls(next); saveFeeds(next)
    setSelectedUrl(url); setAdding(''); setError(null)
  }

  function removeFeed(url: string) {
    const next = feedUrls.filter(u => u !== url)
    setFeedUrls(next); saveFeeds(next)
    if (selectedUrl === url) {
      setSelectedUrl(next[0] || '')
      setCurrentFeed(null)
    }
  }

  function toggleRead(id: string) {
    const next = new Set(readIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setReadIds(next); saveRead([...next])
  }

  function isRead(id: string) {
    return readIds.has(id)
  }

  function exportOPML() {
    const now = new Date().toISOString()
    const outlines = feedUrls.map(u => `<outline type="rss" text="${u}" title="${u}" xmlUrl="${u}" />`).join('\n')
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Reader Lite Export</title><dateCreated>${now}</dateCreated></head>
  <body>
    <outline text="Subscriptions">
      ${outlines}
    </outline>
  </body>
</opml>`
    const blob = new Blob([opml], { type: 'text/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'reader-lite.opml'
    a.click()
    URL.revokeObjectURL(url)
  }

  function importOPML(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result || '')
        const urls = Array.from(text.matchAll(/xmlUrl="([^"]+)"/g)).map(m => m[1])
        if (urls.length) {
          const merged = Array.from(new Set([...urls, ...feedUrls]))
          setFeedUrls(merged); saveFeeds(merged)
          if (!selectedUrl && merged[0]) setSelectedUrl(merged[0])
        } else {
          setError('No feeds found in OPML')
        }
      } catch (e:any) {
        setError('Failed to import OPML')
      }
    }
    reader.readAsText(file)
  }

  const filteredItems = useMemo(() => {
    const items = currentFeed?.items || []
    if (!q.trim()) return items
    const needle = q.toLowerCase()
    return items.filter(it =>
      (it.title || '').toLowerCase().includes(needle) ||
      (it.summary || '').toLowerCase().includes(needle) ||
      (it.content || '').toLowerCase().includes(needle)
    )
  }, [currentFeed, q])

  return (
    <div className="grid grid-cols-12 gap-4 p-4">
      {/* Sidebar */}
      <aside className="col-span-12 md:col-span-3 bg-[var(--panel)] rounded-2xl p-3">
        <h1 className="text-xl font-semibold mb-3">Reader Lite</h1>
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2"
            placeholder="https://example.com/feed"
            value={adding}
            onChange={e => setAdding(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addFeed(adding)}
          />
          <button className="bg-blue-600 hover:bg-blue-500 rounded-xl px-3 py-2"
                  onClick={() => addFeed(adding)}>Add</button>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={exportOPML} className="text-sm bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5">Export OPML</button>
          <label className="text-sm bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 cursor-pointer">
            Import
            <input type="file" accept=".opml,.xml" className="hidden" onChange={e => {
              const f = e.target.files?.[0]; if (f) importOPML(f)
            }}/>
          </label>
        </div>
        <div className="space-y-1 max-h-[60vh] overflow-auto pr-1">
          {feedUrls.length === 0 && (
            <div className="text-sm text-[var(--muted)]">
              Add your first feed URL. Tip: many sites expose /feed or /rss.
            </div>
          )}
          {feedUrls.map(u => (
            <div key={u} className={`group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer ${selectedUrl === u ? 'bg-white/10' : 'hover:bg-white/5'}`}>
              <div className="flex-1 truncate" onClick={() => setSelectedUrl(u)} title={u}>{u}</div>
              <button className="text-xs text-red-300 opacity-0 group-hover:opacity-100" onClick={() => removeFeed(u)}>Remove</button>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-[var(--muted)]">
          PWA ready — use “Add to Home Screen” on iOS.
        </div>
      </aside>

      {/* Main */}
      <main className="col-span-12 md:col-span-9">
        <div className="flex items-center gap-2 mb-3">
          <input
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2"
            placeholder="Search articles..."
            value={q} onChange={e => setQ(e.target.value)}
          />
          <button className="bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2" onClick={() => selectedUrl && loadFeed(selectedUrl)}>
            Refresh
          </button>
        </div>

        {error && <div className="mb-3 text-sm text-red-300">{error}</div>}
        {busy && <div className="mb-3 text-sm opacity-80">Loading…</div>}

        {currentFeed && (
          <div className="bg-[var(--panel)] rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-lg font-semibold">{currentFeed.title || selectedUrl}</div>
                {currentFeed.link && <a href={currentFeed.link} target="_blank" rel="noreferrer" className="text-sm text-[var(--muted)]">{currentFeed.link}</a>}
              </div>
              <div className="text-sm text-[var(--muted)]">{currentFeed.items.length} items</div>
            </div>

            <div className="divide-y divide-white/10">
              {filteredItems.map(item => (
                <article key={item.id} className="py-3">
                  <div className="flex justify-between gap-2">
                    <a className={`font-medium ${isRead(item.id) ? 'text-[var(--muted)]' : ''}`} href={item.link} target="_blank" rel="noreferrer" onClick={() => toggleRead(item.id)}>
                      {item.title || '(no title)'}
                    </a>
                    <button className="text-xs bg-white/10 hover:bg-white/20 rounded-lg px-2" onClick={() => toggleRead(item.id)}>
                      {isRead(item.id) ? 'Unread' : 'Read'}
                    </button>
                  </div>
                  {item.published && <div className="text-xs text-[var(--muted)] mt-0.5">{new Date(item.published).toLocaleString()}</div>}
                  {item.summary && <div className="text-sm opacity-90 mt-1 line-clamp-3" dangerouslySetInnerHTML={{ __html: item.summary }} />}
                </article>
              ))}
            </div>
          </div>
        )}

        {!currentFeed && !busy && (
          <div className="text-sm text-[var(--muted)] bg-[var(--panel)] rounded-2xl p-6">
            Add a feed on the left to begin.
          </div>
        )}
      </main>
    </div>
  )
}
