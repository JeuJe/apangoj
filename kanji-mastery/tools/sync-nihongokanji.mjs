import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const siteTarget = path.join(root, "web", "data", "kanji-site.js")
const hunTarget = path.join(root, "web", "data", "kanji-hun.js")
const endpoint = "https://nihongokanji.com/wp-json/wp/v2/posts"
const expectedTotal = 2136
const concurrency = 5

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim()
}

function decodedText(html) {
  const fragment = JSDOM.fragment(String(html || ""))
  return normalizeText(fragment.textContent)
}

function textWithRuby(node) {
  const clone = node.cloneNode(true)
  const rubyText = (ruby) => {
    const reading = normalizeText(ruby.querySelector("rt")?.textContent)
    const base = [...ruby.childNodes]
      .filter((child) => !(child.nodeType === 1 && ["RT", "RP"].includes(child.tagName)))
      .map((child) => child.textContent)
      .join("")
    return { base, reading }
  }
  for (const ruby of [...clone.querySelectorAll("ruby")]) {
    if (!ruby.parentNode) continue
    const group = [ruby]
    let sibling = ruby.nextSibling
    while (sibling && ((sibling.nodeType === 1 && sibling.tagName === "RUBY") || (sibling.nodeType === 3 && !sibling.textContent.trim()))) {
      group.push(sibling)
      sibling = sibling.nextSibling
    }
    const parts = group.filter((element) => element.nodeType === 1 && element.tagName === "RUBY").map(rubyText)
    const base = parts.map((part) => part.base).join("")
    const reading = parts.map((part) => part.reading).join("")
    const replacement = clone.ownerDocument.createTextNode(reading ? `${base}(${reading})` : base)
    ruby.parentNode.insertBefore(replacement, ruby)
    group.forEach((element) => element.remove())
  }
  return normalizeText(clone.textContent)
}

async function fetchJson(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Kanji2136 personal-study data sync/1.3" },
      signal: AbortSignal.timeout(90000)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return { data: await response.json(), headers: response.headers }
  } catch (error) {
    if (attempt >= 4) throw error
    await new Promise((resolve) => setTimeout(resolve, attempt * 1200))
    return fetchJson(url, attempt + 1)
  }
}

function basicInformation(document) {
  const heading = [...document.querySelectorAll("h2,h3,h4")]
    .find((element) => normalizeText(element.textContent).startsWith("1.") && normalizeText(element.textContent).includes("기본 정보"))
  if (!heading) return null

  const rows = []
  let node = heading.nextElementSibling
  while (node && !/^H[234]$/.test(node.tagName)) {
    if (node.matches("ul,ol")) {
      rows.push(...[...node.querySelectorAll(":scope > li")].map((item) => normalizeText(item.textContent)))
    } else if (node.matches("p")) {
      rows.push(normalizeText(node.textContent))
    }
    node = node.nextElementSibling
  }

  const meaning = rows.find((row) => row.startsWith("의미"))?.replace(/^의미\s*/, "") || ""
  const on = rows.find((row) => row.startsWith("음독"))?.replace(/^음독\s*/, "") || ""
  const kun = rows.find((row) => row.startsWith("훈독"))?.replace(/^훈독\s*/, "") || ""
  const quotedHun = meaning.match(/[“\"]\s*([^”\"]+?)\s*[”\"]/)?.[1]
  const fallbackHun = meaning.split(/[.。]/)[0].trim()
  return { hun: normalizeText(quotedHun || fallbackHun), meaning, on, kun }
}

function explanationParagraphs(document) {
  const heading = [...document.querySelectorAll("h2,h3,h4")]
    .find((element) => {
      const text = normalizeText(element.textContent)
      return text.startsWith("2.") && (text.includes("한자 모양 해설") || text.includes("구성 원리"))
    })
  if (!heading) return []

  const paragraphs = []
  let node = heading.nextElementSibling
  while (node && !(/^H[234]$/.test(node.tagName) && normalizeText(node.textContent).startsWith("3."))) {
    if (node.matches("ul,ol")) {
      for (const item of node.querySelectorAll(":scope > li")) {
        const text = normalizeText(item.textContent)
        if (text) paragraphs.push(text)
      }
    } else if (node.matches("p,h4,blockquote")) {
      const clone = node.cloneNode(true)
      clone.querySelectorAll("figure,img,figcaption,script,style,iframe,noscript").forEach((element) => element.remove())
      const text = textWithRuby(clone)
      if (text) paragraphs.push(text)
    }
    node = node.nextElementSibling
  }
  return paragraphs
}

function detailSection(document, sectionNumber, nextSectionNumber) {
  const heading = [...document.querySelectorAll("h2,h3,h4")]
    .find((element) => normalizeText(element.textContent).startsWith(`${sectionNumber}.`))
  if (!heading) return { paragraphs: [], entries: [] }

  const paragraphs = []
  const entries = []
  let readingWordsStarted = false
  let node = heading.nextElementSibling
  while (node && !(/^H[234]$/.test(node.tagName) && normalizeText(node.textContent).startsWith(`${nextSectionNumber}.`))) {
    if (node.matches("h4")) {
      readingWordsStarted = /대표단어|예문/u.test(normalizeText(node.textContent))
    } else if (node.matches("ul,ol") && readingWordsStarted) {
      for (const item of node.querySelectorAll(":scope > li")) {
        const text = textWithRuby(item)
        if (text) entries.push({ text })
      }
    } else if (node.matches("p,blockquote") && !readingWordsStarted) {
      const clone = node.cloneNode(true)
      clone.querySelectorAll("figure,img,figcaption,script,style,iframe,noscript").forEach((element) => element.remove())
      const text = textWithRuby(clone)
      if (text) paragraphs.push(text)
    }
    node = node.nextElementSibling
  }
  return { paragraphs, entries }
}

function parsePost(post) {
  const title = decodedText(post.title?.rendered)
  const match = title.match(/^(\d+)\.\s*[「『](.+?)[」』]/u)
  if (!match) return null
  const id = Number(match[1])
  if (!Number.isInteger(id) || id < 1 || id > expectedTotal) return null

  const character = [...match[2]][0]
  const dom = new JSDOM(`<!doctype html><body>${post.content?.rendered || ""}</body>`)
  const info = basicInformation(dom.window.document)
  const explanation = explanationParagraphs(dom.window.document)
  const onDetail = detailSection(dom.window.document, 3, 4)
  const kunDetail = detailSection(dom.window.document, 4, 5)
  dom.window.close()
  if (!info?.hun || !info.meaning || !explanation.length) {
    throw new Error(`${id}.「${character}」 데이터 파싱 실패 (훈음=${info?.hun || "없음"}, 설명=${explanation.length}문단)`)
  }
  return {
    id,
    char: character,
    hun: info.hun,
    meaning: info.meaning,
    on: info.on,
    kun: info.kun,
    onDetail,
    kunDetail,
    explanation,
    sourceUrl: post.link
  }
}

async function loadAllPosts() {
  const fields = "id,slug,link,title,content"
  const firstUrl = `${endpoint}?per_page=100&page=1&orderby=id&order=asc&_fields=${fields}`
  const first = await fetchJson(firstUrl)
  const pages = Number(first.headers.get("x-wp-totalpages"))
  if (!Number.isInteger(pages) || pages < 1) throw new Error("WordPress 전체 페이지 수를 확인하지 못했습니다.")

  const results = new Array(pages)
  results[0] = first.data
  let nextPage = 2
  async function worker() {
    while (nextPage <= pages) {
      const page = nextPage++
      const url = `${endpoint}?per_page=100&page=${page}&orderby=id&order=asc&_fields=${fields}`
      const result = await fetchJson(url)
      results[page - 1] = result.data
      process.stdout.write(`\r사이트 원문 수집 ${page}/${pages}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pages - 1) }, () => worker()))
  process.stdout.write("\n")
  return results.flat()
}

const posts = await loadAllPosts()
const parsed = posts.map(parsePost).filter(Boolean).sort((a, b) => a.id - b.id)
const byId = new Map()
for (const item of parsed) {
  if (byId.has(item.id)) throw new Error(`중복 번호: ${item.id}`)
  byId.set(item.id, item)
}

if (byId.size !== expectedTotal) {
  const missing = Array.from({ length: expectedTotal }, (_, index) => index + 1).filter((id) => !byId.has(id))
  throw new Error(`사이트 한자 수 오류: ${byId.size}/${expectedTotal}, 누락=${missing.slice(0, 30).join(",")}`)
}

const items = Object.fromEntries([...byId.values()].map((item) => [item.char, item]))
if (Object.keys(items).length !== expectedTotal) throw new Error("중복 한자가 있어 2,136자 매칭에 실패했습니다.")

const payload = {
  meta: {
    source: "https://nihongokanji.com/",
    fetchedAt: new Date().toISOString(),
    usage: "개인 학습용 저장·표시, 재배포 금지",
    total: expectedTotal
  },
  items
}
const hun = Object.fromEntries([...byId.values()].map((item) => [item.char, item.hun]))
fs.writeFileSync(siteTarget, `window.KANJI_SITE=${JSON.stringify(payload)};\n`, "utf8")
fs.writeFileSync(hunTarget, `window.KANJI_HUN=${JSON.stringify(hun)};\n`, "utf8")
console.log(`동기화 완료: ${expectedTotal}자, 한자 설명 ${[...byId.values()].reduce((sum, item) => sum + item.explanation.length, 0)}문단`)
