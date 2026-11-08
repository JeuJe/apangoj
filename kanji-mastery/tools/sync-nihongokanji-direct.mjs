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
  if (!node) return ""
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

function proseBlocks(container, context, { includeImageAlt = false } = {}) {
  const blocks = []
  for (const node of container.children) {
    if (node.matches("p")) {
      const text = textWithRuby(node)
      if (!text) throw new Error(`${context} 문단이 비어 있습니다.`)
      blocks.push({ type: "paragraph", text })
      continue
    }
    if (node.matches("ul, ol")) {
      const items = [...node.querySelectorAll(":scope > li")].map(textWithRuby).filter(Boolean)
      if (!items.length) throw new Error(`${context} 목록이 비어 있습니다.`)
      blocks.push({ type: "list", ordered: node.matches("ol"), items })
      continue
    }
    if (node.matches("h3")) {
      const text = textWithRuby(node.querySelector(".ja") || node)
      if (!text) throw new Error(`${context} 소제목이 비어 있습니다.`)
      blocks.push({ type: "subheading", text })
      continue
    }
    if (includeImageAlt && node.matches(".wimg")) {
      const text = normalizeText(node.querySelector("img")?.getAttribute("alt") || node.getAttribute("aria-label") || node.textContent)
      if (text) blocks.push({ type: "imageAlt", text })
      continue
    }
    if (node.matches("figure")) continue
    if (node.matches("script, style")) continue
    if (normalizeText(node.textContent)) throw new Error(`${context} 지원하지 않는 설명 요소: ${node.tagName}.${node.className}`)
  }
  return blocks
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

function shapeSectionParagraphs(document, id) {
  const section = document.querySelector(id)
  if (!section) return []
  const blocks = []
  const formula = section.querySelector(":scope > .eq")
  if (formula) blocks.push({ type: "formula", text: textWithRuby(formula) })
  const contentRoot = section.querySelector(':scope > [data-ov="site"]') || section
  for (const node of contentRoot.children) {
    if (node.matches(".pr")) {
      blocks.push(...proseBlocks(node, `${id} 한자 모양 해설`))
      continue
    }
    if (node.matches("details")) {
      const summary = textWithRuby(node.querySelector("summary"))
      const prose = node.querySelector(".pr")
      const detailBlocks = prose ? proseBlocks(prose, `${id} 한자 모양 상세 해설`) : []
      if (!summary || !detailBlocks.length) throw new Error(`${id} 한자 모양 상세 해설 파싱 실패`)
      blocks.push({ type: "details", summary, blocks: detailBlocks })
    }
  }
  if (!blocks.some((block) => block.type !== "formula")) throw new Error(`${id} 한자 모양 설명 본문이 없습니다.`)
  return blocks
}

function readingExample(node) {
  const sentence = node.matches(".sr")
  const japaneseNode = sentence
    ? node.querySelector(".jl .ja, .jl")
    : node.querySelector(".w .ja, .ja")
  const meaningNode = node.querySelector(sentence ? ".tr" : ".m")
  const japanese = japaneseNode ? textWithRuby(japaneseNode) : ""
  const meaning = normalizeText(meaningNode?.textContent)
  if (!japanese || !meaning) throw new Error(`독음 예시 파싱 실패: ${normalizeText(node.textContent)}`)
  return { kind: sentence ? "sentence" : "word", japanese, meaning }
}

function detailSection(document, id) {
  const section = document.querySelector(id)
  if (!section) return { blocks: [] }
  const blocks = []
  let entry = null
  const counts = { headings: 0, entries: 0, examples: 0, images: 0 }

  for (const node of section.children) {
    if (node.matches("h3.gh")) {
      const headingNode = node.querySelector(".ja") || node
      blocks.push({ type: "heading", text: textWithRuby(headingNode) })
      entry = null
      counts.headings += 1
      continue
    }
    if (node.matches(".pr")) {
      blocks.push(...proseBlocks(node, `${id} 독음 설명`, { includeImageAlt: true }))
      entry = null
      continue
    }
    if (node.matches(".rl")) {
      entry = { reading: textWithRuby(node), examples: [] }
      if (!entry.reading) throw new Error(`${id} 독음 표제가 비어 있습니다.`)
      blocks.push({ type: "entry", ...entry })
      counts.entries += 1
      continue
    }
    if (node.matches(".wr, .sr")) {
      if (!entry) throw new Error(`${id} 독음 표제 없이 예시가 나왔습니다: ${normalizeText(node.textContent)}`)
      entry.examples.push(readingExample(node))
      counts.examples += 1
      continue
    }
    if (node.matches(".wimg")) {
      const text = normalizeText(node.querySelector("img")?.getAttribute("alt") || node.getAttribute("aria-label") || node.textContent)
      if (!text) throw new Error(`${id} 독음 예시 그림 설명이 비어 있습니다.`)
      blocks.push({ type: "imageAlt", text })
      counts.images += 1
      continue
    }
    if (!node.matches("h2.sh") && normalizeText(node.textContent)) throw new Error(`${id} 지원하지 않는 독음 요소: ${node.tagName}.${node.className}`)
  }

  const expected = {
    headings: section.querySelectorAll(":scope > h3.gh").length,
    entries: section.querySelectorAll(":scope > .rl").length,
    examples: section.querySelectorAll(":scope > .wr, :scope > .sr").length,
    images: section.querySelectorAll(":scope > .wimg").length
  }
  for (const key of Object.keys(expected)) {
    if (counts[key] !== expected[key]) throw new Error(`${id} ${key} 일부를 읽지 못했습니다: ${counts[key]}/${expected[key]}`)
  }

  return { blocks }
}

function parsePage(html, source) {
  const dom = new JSDOM(html)
  const document = dom.window.document
  const title = normalizeText(document.querySelector("title")?.textContent)
  const titleMatch = title.match(/^(\d+)\.「(.+?)」/u)
  if (!titleMatch || titleMatch[2] !== source.char) {
    dom.window.close()
    throw new Error(`${source.id}.「${source.char}」 원문 페이지 식별 실패: ${title}`)
  }
  const info = parseBasicInformation(document)
  const explanation = shapeSectionParagraphs(document, "#sec2")
  const onDetail = detailSection(document, "#sec3")
  const kunDetail = detailSection(document, "#sec4")
  dom.window.close()
  if (!info.hun || !info.meaning || !explanation.length) {
    throw new Error(`${source.id}.「${source.char}」 데이터 파싱 실패`)
  }
  if (info.on && !onDetail.blocks.length) throw new Error(`${source.id}.「${source.char}」 음독 상세 파싱 실패`)
  if (info.kun && !kunDetail.blocks.length) throw new Error(`${source.id}.「${source.char}」 훈독 상세 파싱 실패`)
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
const contentUnitCount = (blocks) => blocks.reduce((sum, block) => {
  if (block.type === "details") return sum + 1 + contentUnitCount(block.blocks)
  if (block.type === "list") return sum + block.items.length
  return sum + 1
}, 0)
const explanationCount = (item) => contentUnitCount(item.explanation)
const detailCounts = (key) => result.reduce((counts, item) => {
  for (const block of item[key].blocks) {
    if (block.type === "heading") counts.groups += 1
    if (["paragraph", "subheading", "imageAlt"].includes(block.type)) counts.prose += 1
    if (block.type === "list") counts.prose += block.items.length
    if (block.type === "entry") {
      counts.entries += 1
      counts.examples += block.examples.length
      counts.sentences += block.examples.filter((example) => example.kind === "sentence").length
    }
  }
  return counts
}, { groups: 0, prose: 0, entries: 0, examples: 0, sentences: 0 })
const payload = {
  meta: {
    source: "https://nihongokanji.com/",
    fetchedAt: new Date().toISOString(),
    usage: "개인 학습용 저장·표시, 재배포 금지",
    total: expectedTotal,
    counts: {
      explanationContentUnits: result.reduce((sum, item) => sum + explanationCount(item), 0),
      onDetail: detailCounts("onDetail"),
      kunDetail: detailCounts("kunDetail")
    }
  },
  items
}
fs.writeFileSync(siteTarget, `window.KANJI_SITE=${JSON.stringify(payload)};\n`, "utf8")
fs.writeFileSync(hunTarget, `window.KANJI_HUN=${JSON.stringify(Object.fromEntries(result.map((item) => [item.char, item.hun])))};\n`, "utf8")
console.log(`동기화 완료: ${result.length}자, 한자 모양 해설 ${payload.meta.counts.explanationContentUnits}개 내용 단위`)
console.log(`음독 예시 ${payload.meta.counts.onDetail.examples}개 · 훈독 예시 ${payload.meta.counts.kunDetail.examples}개(문장 ${payload.meta.counts.kunDetail.sentences}개)`)
