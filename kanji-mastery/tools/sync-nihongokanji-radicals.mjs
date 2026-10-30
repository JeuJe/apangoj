import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const target = path.join(root, "web", "data", "kanji-radicals.js")
const indexUrl = "https://nihongokanji.com/notice/radicals/"
const expectedTotal = 156
const concurrency = 8

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim()
}

async function fetchText(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Kanji2136 personal-study data sync/1.4" },
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

function parseIndex(html) {
  const dom = new JSDOM(html)
  const document = dom.window.document
  const rows = [...document.querySelectorAll("a.rc2")].map((link, index) => {
    const display = normalizeText(link.querySelector(".gl")?.textContent)
    const forms = display.split(/[·、]/u).map((value) => value.trim()).filter(Boolean)
    const section = normalizeText(link.closest("section")?.querySelector("h2")?.textContent)
    return {
      id: index + 1,
      character: forms[0] || display,
      forms: forms.length ? forms : [display],
      display,
      meaning: normalizeText(link.querySelector(".mn")?.textContent),
      frequency: section,
      sourceUrl: new URL(link.getAttribute("href"), indexUrl).href
    }
  })
  dom.window.close()
  if (rows.length !== expectedTotal) throw new Error(`부수·모양자 목록 오류: ${rows.length}/${expectedTotal}`)
  return rows
}

function parseDetail(html, row) {
  const dom = new JSDOM(html)
  const document = dom.window.document
  const info = document.querySelector(".info.wide")
  const values = [...(info?.querySelectorAll(".v") || [])].map((node) => normalizeText(node.textContent))
  const explanation = [...document.querySelectorAll(".pr .gap")]
    .map((node) => normalizeText(node.textContent))
    .filter(Boolean)
  const detail = {
    ...row,
    meaning: values[0] || row.meaning,
    frequency: values[1] || row.frequency,
    explanation
  }
  dom.window.close()
  return detail
}

const indexHtml = await fetchText(indexUrl)
const rows = parseIndex(indexHtml)
const details = new Array(rows.length)
let next = 0
async function worker() {
  while (next < rows.length) {
    const index = next++
    const row = rows[index]
    details[index] = parseDetail(await fetchText(row.sourceUrl), row)
    process.stdout.write(`\r모양자·부수 원문 수집 ${index + 1}/${rows.length}`)
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()))
process.stdout.write("\n")

const payload = {
  meta: {
    source: indexUrl,
    fetchedAt: new Date().toISOString(),
    total: details.length,
    usage: "개인 학습용 저장·표시, 재배포 금지"
  },
  items: details
}
fs.writeFileSync(target, `window.KANJI_RADICALS=${JSON.stringify(payload)};\n`, "utf8")
console.log(`동기화 완료: ${details.length}개 모양자·부수`)
