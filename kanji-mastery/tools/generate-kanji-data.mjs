import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { tableData } from "@seyoungsong/hanjadict"

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const kanjiPackage = path.dirname(require.resolve("kanji/package.json"))

const sourcePages = [649, 650, 651, 652, 2285]
const expectedCounts = { N5: 103, N4: 181, N3: 324, N2: 415, N1: 1113 }
const koreanOverrides = { 金: "쇠 금, 성씨 김" }

function decodeHtml(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim()
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "Mozilla/5.0 Kanji2136DataBuilder/1.0" }
  })
  if (!response.ok) throw new Error(`${url} 요청 실패: ${response.status}`)
  return response.text()
}

async function loadStudyOrder() {
  const indexed = new Map()
  for (const page of sourcePages) {
    const html = await fetchText(`https://nihongokanji.com/${page}/`)
    for (const match of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
      const text = decodeHtml(match[1])
      const item = text.match(/^(\d+)\.?\s*[「]?([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF])[」]?$/u)
      if (item) indexed.set(Number(item[1]), item[2])
    }
  }
  const rows = [...indexed.entries()].sort((a, b) => a[0] - b[0])
  if (rows.length !== 2136) throw new Error(`상용한자 순서가 ${rows.length}자입니다. 2136자가 필요합니다.`)
  rows.forEach(([index], offset) => {
    if (index !== offset + 1) throw new Error(`${offset + 1}번 한자가 누락되었습니다.`)
  })
  return rows
}

function levelFor(index) {
  if (index <= 103) return "N5"
  if (index <= 284) return "N4"
  if (index <= 608) return "N3"
  if (index <= 1023) return "N2"
  return "N1"
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

function array(value) {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function first(value, fallback = null) {
  const values = array(value)
  return values.length ? values[0] : fallback
}

function compactReadings(group, type) {
  return array(group?.reading)
    .filter((item) => item?.r_type === type)
    .map((item) => item.$t)
    .filter(Boolean)
}

function englishMeanings(group) {
  return array(group?.meaning)
    .filter((item) => typeof item === "string")
    .slice(0, 5)
}

function treeComponents(character) {
  const hex = character.codePointAt(0).toString(16).padStart(5, "0")
  const file = path.join(kanjiPackage, "dist", "data", "kanji-tree", `${hex}.json`)
  if (!fs.existsSync(file)) return []
  const tree = readJson(file)
  const values = array(tree.g)
    .map((node) => node?.element)
    .filter((item) => item && item !== "？" && item !== character)
  return [...new Set(values)].slice(0, 8)
}

function kanjidicEntry(character) {
  const hex = character.codePointAt(0).toString(16)
  const file = path.join(kanjiPackage, "dist", "data", "kanjidic", `${hex}.json`)
  if (!fs.existsSync(file)) throw new Error(`KANJIDIC 데이터 없음: ${character} (${hex})`)
  return readJson(file)
}

const order = await loadStudyOrder()
const data = order.map(([id, character]) => {
  const raw = kanjidicEntry(character)
  const misc = first(raw.misc, {})
  const radical = first(raw.radical, {})
  const rm = first(raw.reading_meaning, {})
  const group = first(rm.rmgroup, {})
  const classicalRadical = array(radical.rad_value).find((item) => item?.rad_type === "classical")
  const koreanReading = compactReadings(group, "korean_h").join("·")
  return {
    id,
    char: character,
    level: levelFor(id),
    hun: koreanOverrides[character] || tableData[character] || (koreanReading ? `한자음 ${koreanReading}` : "훈음 정보 없음"),
    on: compactReadings(group, "ja_on"),
    kun: compactReadings(group, "ja_kun"),
    strokes: Number(first(misc.stroke_count, 0)),
    radical: classicalRadical?.$t ? Number(classicalRadical.$t) : null,
    grade: first(misc.grade),
    freq: first(misc.freq) ? Number(first(misc.freq)) : null,
    meanings: englishMeanings(group),
    components: treeComponents(character)
  }
})

const actualCounts = Object.fromEntries(Object.keys(expectedCounts).map((level) => [
  level,
  data.filter((item) => item.level === level).length
]))
if (JSON.stringify(actualCounts) !== JSON.stringify(expectedCounts)) {
  throw new Error(`JLPT 분포 오류: ${JSON.stringify(actualCounts)}`)
}

const payload = {
  meta: {
    generatedAt: new Date().toISOString(),
    total: data.length,
    counts: actualCounts,
    scope: "일본 상용한자 2,136자",
    note: "학습 순서와 JLPT 구간은 nihongokanji.com의 공개 일람을 참고했으며, 상세 정보는 KANJIDIC2·KanjiVG·HanjaDict 공개 데이터로 구성했습니다."
  },
  items: data
}

const target = path.join(root, "web", "data", "kanji-data.js")
fs.writeFileSync(target, `window.KANJI_DB=${JSON.stringify(payload)};\n`, "utf8")
console.log(`생성 완료: ${target}`)
console.log(actualCounts)
