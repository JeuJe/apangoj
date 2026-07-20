import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const context = { window: {} }
vm.createContext(context)
vm.runInContext(fs.readFileSync(path.join(root, "web/data/kanji-data.js"), "utf8"), context)
vm.runInContext(fs.readFileSync(path.join(root, "web/data/kanji-examples.js"), "utf8"), context)

const db = context.window.KANJI_DB
const errors = []
if (!db || !Array.isArray(db.items)) errors.push("데이터 객체가 없습니다.")
if (db?.items?.length !== 2136) errors.push(`한자 수 오류: ${db?.items?.length}`)

const ids = new Set()
const chars = new Set()
for (const item of db?.items || []) {
  if (ids.has(item.id)) errors.push(`중복 ID: ${item.id}`)
  if (chars.has(item.char)) errors.push(`중복 한자: ${item.char}`)
  ids.add(item.id)
  chars.add(item.char)
  if (!/^N[1-5]$/.test(item.level)) errors.push(`레벨 오류: ${item.char}`)
  if (!item.hun) errors.push(`훈음 누락: ${item.char}`)
  if (!Array.isArray(item.on) || !Array.isArray(item.kun)) errors.push(`독음 형식 오류: ${item.char}`)
  if (!Number.isFinite(item.strokes) || item.strokes < 1) errors.push(`획수 오류: ${item.char}`)
}

const examples = context.window.KANJI_EXAMPLES
if (!examples || typeof examples !== "object") errors.push("예문 데이터 객체가 없습니다.")
if (Object.keys(examples || {}).length < 103) errors.push(`N5 예문 데이터 부족: ${Object.keys(examples || {}).length}/103`)
for (const [character, rows] of Object.entries(examples || {})) {
  if (!chars.has(character)) errors.push(`등록되지 않은 예문 한자: ${character}`)
  if (!Array.isArray(rows) || rows.length < 3) errors.push(`예문 형식 오류: ${character}`)
  for (const row of rows || []) {
    if (!Array.isArray(row) || row.length !== 3 || row.some((value) => !String(value || "").trim())) errors.push(`예문 항목 오류: ${character}`)
  }
}

const counts = Object.fromEntries(["N5", "N4", "N3", "N2", "N1"].map((level) => [
  level,
  db.items.filter((item) => item.level === level).length
]))
const expected = { N5: 103, N4: 181, N3: 324, N2: 415, N1: 1113 }
if (JSON.stringify(counts) !== JSON.stringify(expected)) errors.push(`분포 오류: ${JSON.stringify(counts)}`)

for (const file of ["index.html", "styles.css", "main.js", "assets/icon.svg", "data/kanji-examples.js"]) {
  if (!fs.existsSync(path.join(root, "web", file))) errors.push(`파일 누락: web/${file}`)
}

if (errors.length) {
  console.error(errors.slice(0, 50).join("\n"))
  process.exit(1)
}

console.log(`검증 완료: ${db.items.length}자`, counts)
