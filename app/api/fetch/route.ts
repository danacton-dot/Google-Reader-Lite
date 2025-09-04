import { NextRequest, NextResponse } from 'next/server'
import { XMLParser } from 'fast-xml-parser'

export const revalidate = 0
export const dynamic = 'force-dynamic' // avoid edge cache issues

function normalizeItem(it: any, isAtom = false) {
  if (isAtom) {
    const id =
      it.id ||
      it.link?.['@_href'] ||
      it.link?.[0]?.['@_href'] ||
      it.title ||
      Math.random().toString(36).slice(2)
    const link =
      typeof it.link === 'string'
        ? it.link
        : it.link?.['@_href'] || it.link?.[0]?.['@_href'] || ''
    return {
      id,
      title: it.title?.['#text'] || it.title || '',
      link,
      summary: it.summary?.['#text'] || it.content?.['#text'] || '',
      content: it.content?.['#text'] || '',
      published: it.updated || it.published || '',
    }
  } else {
    const guid =
      typeof it.guid === 'object' ? it.guid?.['#text'] || '' : it.guid || ''
    const id = guid || it.link || it.title || Math.random().toString(36).slice(2)
    const desc =
      typeof it.description === 'object'
        ? it.description?.['#text'] || ''
        : it.description || ''
    const content =
      typeof it['content:encoded'] === 'object'
        ? it['content:encoded']?.['#text'] || ''
        : it['content:encoded'] || ''
    return {
      id,
      title: it.title || '',
      link: it.link || '',
      summary: desc || content || '',
      content,
      published: it.pubDate || '',
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const url = typeof body?.url === 'string' ? body.url.trim() : ''

    if (!url) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 })
    }

    const upstream = await fetch(url, {
      headers: { 'user-agent': 'ReaderLite/1.0 (+https://github.com/)' },
      // @ts-ignore
      cache: 'no-store',
    })

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: 502 }
      )
    }

    const text = await upstream.text()
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      allowBooleanAttributes: true,
      trimValues: true,
      cdataPropName: 'cdata',
      preserveOrder: false,
    })

    let data: any
    try {
      data = parser.parse(text)
    } catch {
      return NextResponse.json({ error: 'Invalid XML' }, { status: 422 })
    }

    const isRSS = !!data?.rss
    const isAtom = !!data?.feed

    let feedTitle = ''
    let siteLink = ''
    let items: any[] = []

    if (isRSS) {
      const ch = data.rss.channel
      feedTitle = ch?.title || ''
      siteLink = ch?.link || ''
      items = Array.isArray(ch?.item) ? ch.item : ch?.item ? [ch.item] : []
      items = items.map((it: any) => normalizeItem(it, false))
    } else if (isAtom) {
      const feed = data.feed
      feedTitle = feed?.title?.['#text'] || feed?.title || ''
      siteLink =
        typeof feed?.link === 'string'
          ? feed.link
          : feed?.link?.['@_href'] || feed?.link?.[0]?.['@_href'] || ''
      const entries = Array.isArray(feed?.entry) ? feed.entry : feed?.entry ? [feed.entry] : []
      items = entries.map((it: any) => normalizeItem(it, true))
    } else {
      return NextResponse.json(
        { error: 'Unsupported feed (expect RSS/Atom)' },
        { status: 415 }
      )
    }

    // newest first
    items.sort(
      (a: any, b: any) =>
        new Date(b.published || 0).getTime() - new Date(a.published || 0).getTime()
    )

    const resp = NextResponse.json({
      url,
      title: feedTitle,
      link: siteLink,
      items,
    })
    resp.headers.set('Cache-Control', 'no-store')
    return resp
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Fetch error' },
      { status: 500 }
    )
  }
}
