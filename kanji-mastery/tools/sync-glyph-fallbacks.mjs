import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const sourceTarget = path.join(root, "web", "data", "kanji-site.js")
const radicalTarget = path.join(root, "web", "data", "kanji-radicals.js")
const target = path.join(root, "web", "data", "kanji-glyphs.js")
const concurrency = 8

function loadPayload(file, name) {
  const match = fs.readFileSync(file, "utf8").match(new RegExp(`window\\.${name}=(.*);\\s*$`, "s"))
  if (!match) throw new Error(`${name} 데이터 형식이 올바르지 않습니다.`)
  return JSON.parse(match[1])
}

function collectRareCharacters() {
  const site = loadPayload(sourceTarget, "KANJI_SITE")
  const radicals = loadPayload(radicalTarget, "KANJI_RADICALS")
  const characters = new Set()
  const add = (value) => {
    for (const character of String(value || "")) {
      if (character.codePointAt(0) >= 0x20000) characters.add(character)
    }
  }
  const addBlocks = (blocks) => {
    for (const block of blocks || []) {
      if (typeof block === "string") {
        add(block)
        continue
      }
      add(block.text)
      add(block.summary)
      add(block.reading)
      add(block.items?.join(" "))
      for (const example of block.examples || []) {
        add(example.japanese)
        add(example.meaning)
      }
      addBlocks(block.blocks || block.paragraphs)
    }
  }
  for (const item of Object.values(site.items)) {
    addBlocks(item.explanation)
    for (const detail of [item.onDetail, item.kunDetail]) {
      addBlocks(detail?.blocks)
      add(detail?.paragraphs?.join(" "))
      add(detail?.entries?.map((entry) => entry.text).join(" "))
    }
  }
  for (const item of radicals.items) {
    add(item.character)
    add(item.display)
    add(item.forms?.join(" "))
    add(item.explanation?.join(" "))
  }
  return [...characters]
}

async function fetchGlyph(character, attempt = 1) {
  const codePoint = character.codePointAt(0).toString(16)
  try {
    const response = await fetch(`https://glyphwiki.org/glyph/u${codePoint}.svg`, {
      headers: { "User-Agent": "Kanji2136 glyph fallback sync/1.0" },
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const svg = await response.text()
    const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((match) => match[1])
    if (!paths.length) throw new Error("SVG path 누락")
    return [character, paths]
  } catch (error) {
    if (attempt >= 4) throw new Error(`${character} U+${codePoint}: ${error.message}`)
    await new Promise((resolve) => setTimeout(resolve, attempt * 800))
    return fetchGlyph(character, attempt + 1)
  }
}

const characters = collectRareCharacters()
const result = {}
let next = 0
let completed = 0
async function worker() {
  while (true) {
    const index = next++
    if (index >= characters.length) return
    const [character, paths] = await fetchGlyph(characters[index])
    result[character] = paths
    completed += 1
    process.stdout.write(`\r확장 한자 글리프 수집 ${completed}/${characters.length}`)
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, characters.length) }, worker))
process.stdout.write("\n")

const payload = {
  meta: { source: "https://glyphwiki.org/", total: characters.length },
  paths: result
}
fs.writeFileSync(target, `window.KANJI_GLYPHS=${JSON.stringify(payload)};\n`, "utf8")
console.log(`동기화 완료: ${characters.length}개 확장 한자 글리프`)
