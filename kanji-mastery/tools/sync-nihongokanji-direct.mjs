import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const siteTarget = path.join(root, "web", "data", "kanji-site.js")
const hunTarget = path.join(root, "web", "data", "kanji-hun.js")
const expectedTotal = 2136
const concurrency = 12

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim()
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

async function fetchText(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Kanji2136 personal-study data sync/1.5" },
      signal: AbortSignal.timeout(90000)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.text()
  } catch (error) {
    if (attempt >= 4) throw error
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
    return fetchText(url, attempt + 1)
  }
}

function parseBasicInformation(document) {
  const info = document.querySelector("#sec1 .info")
  if (!info) throw new Error("기본 정보 영역 누락")
  const values = {}
  for (const label of info.querySelectorAll(":scope > b")) {
    values[normalizeText(label.textContent)] = normalizeText(label.nextElementSibling?.textContent)
  }
  const meaning = values["의미"] || ""
  const quotedHun = meaning.match(/[“"]\s*([^”"]+?)\s*[”"]/)?.[1]
  const on = values["음독"] || ""
  const kun = values["훈독"] || ""
  return {
    hun: normalizeText(quotedHun || meaning.split(/[.。]/)[0]),
    meaning,
    on: /정식 음독은 없습니다/u.test(on) ? "" : on,
    kun: /정식 훈독은 없습니다/u.test(kun) ? "" : kun
  }
}

function directSectionParagraphs(document, id) {
  const section = document.querySelector(id)
  if (!section) return []
  const result = []
  const formula = section.querySelector(":scope > .eq")
  if (formula) result.push(normalizeText(formula.textContent))
  const prose = section.querySelector(":scope > .pr")
  for (const paragraph of prose?.querySelectorAll(":scope > p") || []) {
    const text = textWithRuby(paragraph)
    if (text) result.push(text)
  }
  return result
}

function detailSection(document, id) {
  const section = document.querySelector(id)
  if (!section) return { paragraphs: [], entries: [] }
  const paragraphs = [...(section.querySelector(":scope > .pr")?.querySelectorAll(":scope > p") || [])]
    .map(textWithRuby)
    .filter(Boolean)
  const entries = []
  for (const readingGroup of section.querySelectorAll(":scope > .rl")) {
    const reading = normalizeText(readingGroup.textContent)
    const words = []
    let node = readingGroup.nextElementSibling
    while (node?.matches(".wr")) {
      const text = textWithRuby(node)
      if (text) words.push(text)
      node = node.nextElementSibling
    }
    if (words.length) entries.push({ text: `${reading} ${words.join(", ")}`.trim() })
  }
  return { paragraphs, entries }
}

function parsePage(html, source) {
  const dom = new JSDOM(html)
  const document = dom.window.document
  const info = parseBasicInformation(document)
  const explanation = directSectionParagraphs(document, "#sec2")
  const onDetail = detailSection(document, "#sec3")
  const kunDetail = detailSection(document, "#sec4")
  dom.window.close()
  if (!info.hun || !info.meaning || !explanation.length) {
    throw new Error(`${source.id}.「${source.char}」 데이터 파싱 실패`)
  }
  return {
    id: source.id,
    char: source.char,
    hun: info.hun,
    meaning: info.meaning,
    on: info.on,
    kun: info.kun,
    onDetail,
    kunDetail,
    explanation,
    sourceUrl: source.sourceUrl
  }
}

const currentSource = fs.readFileSync(siteTarget, "utf8").match(/^window\.KANJI_SITE=(.*);\s*$/s)
if (!currentSource) throw new Error("기존 원문 데이터 형식을 확인하지 못했습니다.")
const sourceItems = Object.values(JSON.parse(currentSource[1]).items)
if (sourceItems.length !== expectedTotal) throw new Error(`원문 링크 수 오류: ${sourceItems.length}/${expectedTotal}`)

const result = new Array(sourceItems.length)
let next = 0
let completed = 0
async function worker() {
  while (true) {
    const index = next++
    if (index >= sourceItems.length) return
    const source = sourceItems[index]
    result[index] = parsePage(await fetchText(source.sourceUrl), source)
    completed += 1
    if (completed % 100 === 0 || completed === sourceItems.length) process.stdout.write(`\r한자 원문 직접 수집 ${completed}/${sourceItems.length}`)
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))
process.stdout.write("\n")

result.sort((a, b) => a.id - b.id)
const items = Object.fromEntries(result.map((item) => [item.char, item]))
const payload = {
  meta: {
    source: "https://nihongokanji.com/",
    fetchedAt: new Date().toISOString(),
    usage: "개인 학습용 저장·표시, 재배포 금지",
    total: expectedTotal
  },
  items
}
fs.writeFileSync(siteTarget, `window.KANJI_SITE=${JSON.stringify(payload)};\n`, "utf8")
fs.writeFileSync(hunTarget, `window.KANJI_HUN=${JSON.stringify(Object.fromEntries(result.map((item) => [item.char, item.hun])))};\n`, "utf8")
console.log(`동기화 완료: ${result.length}자, 한자 설명 ${result.reduce((sum, item) => sum + item.explanation.length, 0)}문단`)
