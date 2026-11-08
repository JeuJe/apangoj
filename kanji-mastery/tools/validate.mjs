import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const context = { window: {} }
vm.createContext(context)
vm.runInContext(fs.readFileSync(path.join(root, "web/data/kanji-data.js"), "utf8"), context)
vm.runInContext(fs.readFileSync(path.join(root, "web/data/kanji-hun.js"), "utf8"), context)
vm.runInContext(fs.readFileSync(path.join(root, "web/data/kanji-site.js"), "utf8"), context)
vm.runInContext(fs.readFileSync(path.join(root, "web/data/kanji-radicals.js"), "utf8"), context)
vm.runInContext(fs.readFileSync(path.join(root, "web/data/kanji-examples.js"), "utf8"), context)
vm.runInContext(fs.readFileSync(path.join(root, "web/data/kanji-study-extras.js"), "utf8"), context)

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

const extras = context.window.KANJI_STUDY_EXTRAS
if (!extras || typeof extras !== "object") errors.push("추가 학습 데이터 객체가 없습니다.")
if (extras?.radicals?.length !== 214) errors.push(`214부수 데이터 오류: ${extras?.radicals?.length}/214`)
if (Object.keys(extras?.examples || {}).length < 1800) errors.push(`문맥 예문 데이터 부족: ${Object.keys(extras?.examples || {}).length}/2136`)
for (const passage of extras?.passages || []) {
  if (!/[가-힣]/u.test(passage.translation || "")) errors.push(`한국어 예문 해석 누락: ${passage.japanese}`)
}
for (const [character, example] of Object.entries(extras?.examples || {})) {
  if (!/[가-힣]/u.test(example.meaning || "")) errors.push(`한국어 관련 단어 뜻 누락: ${character}`)
}
const n2ContextCount = (db?.items || []).filter((item) => item.level === "N2" && extras?.examples?.[item.char]?.level === "N2").length
if (n2ContextCount < 380) errors.push(`N2 문맥 예문 부족: ${n2ContextCount}/415`)
for (const radical of extras?.radicals || []) {
  if (!radical.character || !radical.name || !radical.number || !radical.strokes) errors.push(`부수 데이터 형식 오류: ${JSON.stringify(radical)}`)
}

const hun = context.window.KANJI_HUN
if (!hun || typeof hun !== "object") errors.push("대표 훈음 데이터 객체가 없습니다.")
if (Object.keys(hun || {}).length !== 2136) errors.push(`대표 훈음 데이터 오류: ${Object.keys(hun || {}).length}/2136`)
for (const item of db?.items || []) {
  const label = hun?.[item.char]
  if (!label) errors.push(`대표 훈음 누락: ${item.char}`)
}

const site = context.window.KANJI_SITE
if (!site || typeof site !== "object") errors.push("사이트 원문 데이터 객체가 없습니다.")
if (site?.meta?.total !== 2136) errors.push(`사이트 메타데이터 오류: ${site?.meta?.total}/2136`)
if (Object.keys(site?.items || {}).length !== 2136) errors.push(`사이트 원문 데이터 오류: ${Object.keys(site?.items || {}).length}/2136`)
const actualSiteCounts = {
  explanationContentUnits: 0,
  onDetail: { groups: 0, prose: 0, entries: 0, examples: 0, sentences: 0 },
  kunDetail: { groups: 0, prose: 0, entries: 0, examples: 0, sentences: 0 }
}
function validateExplanationBlocks(blocks, character, pathLabel = "한자 설명") {
  let units = 0
  for (const block of blocks || []) {
    if (["formula", "paragraph"].includes(block?.type)) {
      if (!block.text) errors.push(`${pathLabel} 문구 누락: ${character}`)
      units += 1
      continue
    }
    if (block?.type === "list") {
      if (!Array.isArray(block.items) || !block.items.length || block.items.some((value) => !String(value || "").trim())) errors.push(`${pathLabel} 목록 오류: ${character}`)
      units += block.items?.length || 0
      continue
    }
    if (block?.type === "details") {
      if (!block.summary || !Array.isArray(block.blocks) || !block.blocks.length) errors.push(`${pathLabel} 접힌 상세 오류: ${character}`)
      units += 1 + validateExplanationBlocks(block.blocks, character, `${pathLabel} 접힌 상세`)
      continue
    }
    errors.push(`${pathLabel} 블록 형식 오류: ${character} ${JSON.stringify(block)}`)
  }
  return units
}
function validateReadingDetail(detail, character, label, aggregate) {
  if (!Array.isArray(detail?.blocks)) {
    errors.push(`사이트 ${label} 상세 형식 오류: ${character}`)
    return
  }
  for (const block of detail.blocks) {
    if (block?.type === "heading") aggregate.groups += 1
    else if (["paragraph", "subheading", "imageAlt"].includes(block?.type)) {
      if (!block.text) errors.push(`사이트 ${label} 설명 문구 누락: ${character}`)
      aggregate.prose += 1
    } else if (block?.type === "list") {
      if (!Array.isArray(block.items) || !block.items.length || block.items.some((value) => !String(value || "").trim())) errors.push(`사이트 ${label} 목록 오류: ${character}`)
      aggregate.prose += block.items?.length || 0
    } else if (block?.type === "entry") {
      aggregate.entries += 1
      if (!block.reading || !Array.isArray(block.examples) || !block.examples.length) errors.push(`사이트 ${label} 독음 예시 오류: ${character}`)
      for (const example of block.examples || []) {
        aggregate.examples += 1
        if (!['word', 'sentence'].includes(example.kind) || !example.japanese || !example.meaning) errors.push(`사이트 ${label} 예시 형식 오류: ${character}`)
        if (example.kind === "sentence") aggregate.sentences += 1
      }
    } else errors.push(`사이트 ${label} 블록 형식 오류: ${character} ${JSON.stringify(block)}`)
  }
}
for (const item of db?.items || []) {
  const source = site?.items?.[item.char]
  if (!source) errors.push(`사이트 원문 누락: ${item.char}`)
  if (source?.id !== item.id) errors.push(`사이트 번호 불일치: ${item.char} ${source?.id}/${item.id}`)
  if (!source?.hun || source.hun !== hun?.[item.char]) errors.push(`사이트 훈음 불일치: ${item.char}`)
  if (!source?.meaning) errors.push(`사이트 대표 뜻 누락: ${item.char}`)
  if (!Array.isArray(source?.explanation) || !source.explanation.length) errors.push(`사이트 한자 설명 누락: ${item.char}`)
  actualSiteCounts.explanationContentUnits += validateExplanationBlocks(source?.explanation, item.char)
  for (const [key, label] of [["onDetail", "음독"], ["kunDetail", "훈독"]]) {
    validateReadingDetail(source?.[key], item.char, label, actualSiteCounts[key])
    const noReading = (key === "kunDetail" && !source?.kun) || (key === "onDetail" && !source?.on)
    if (!noReading && !source?.[key]?.blocks?.length) errors.push(`사이트 ${label} 상세 내용 누락: ${item.char}`)
    if (noReading && source?.[key]?.blocks?.length) errors.push(`사이트 ${label} 없음 표기와 상세 내용 불일치: ${item.char}`)
  }
  if (!/^https:\/\/nihongokanji\.com\//.test(source?.sourceUrl || "")) errors.push(`사이트 출처 링크 오류: ${item.char}`)
}
if (JSON.stringify(actualSiteCounts) !== JSON.stringify(site?.meta?.counts)) errors.push(`사이트 완전성 집계 불일치: ${JSON.stringify(actualSiteCounts)} / ${JSON.stringify(site?.meta?.counts)}`)
if (actualSiteCounts.explanationContentUnits < 9800) errors.push(`한자 모양 해설 수집 부족: ${actualSiteCounts.explanationContentUnits}/9800+`)
if (actualSiteCounts.onDetail.sentences < 11) errors.push(`음독 문장 예시 수집 부족: ${actualSiteCounts.onDetail.sentences}/11+`)
if (actualSiteCounts.kunDetail.entries < 2048 || actualSiteCounts.kunDetail.examples < 3526 || actualSiteCounts.kunDetail.sentences < 2311) errors.push(`훈독 상세 수집 부족: ${JSON.stringify(actualSiteCounts.kunDetail)}`)

const detailBlocks = (character, key) => site?.items?.[character]?.[key]?.blocks || []
if (!site?.items?.["時"]?.explanation?.some((block) => block.type === "details") || !site.items["時"].explanation.some((block) => block.text?.includes("시간"))) errors.push("時의 접힌 모양 해설 또는 최종 뜻 누락")
if (!site?.items?.["荘"]?.explanation?.some((block) => block.type === "details") || !site.items["荘"].explanation.some((block) => block.text?.includes("별장"))) errors.push("荘의 전체 모양 해설 누락")
if (detailBlocks("上", "kunDetail").filter((block) => block.type === "heading").length < 4 || detailBlocks("上", "kunDetail").flatMap((block) => block.examples || []).filter((example) => example.kind === "sentence").length < 9) errors.push("上의 훈독 4그룹 또는 문장 예시 누락")
if (!detailBlocks("会", "kunDetail").flatMap((block) => block.examples || []).some((example) => example.meaning.includes("카페"))) errors.push("会의 훈독 문장 예시 누락")
if (detailBlocks("散", "kunDetail").filter((block) => block.type === "list").length < 2 || detailBlocks("散", "kunDetail").flatMap((block) => block.examples || []).filter((example) => example.kind === "sentence").length < 4) errors.push("散의 훈독 목록 또는 문장 예시 누락")
if (!detailBlocks("体", "onDetail").some((block) => block.type === "list") || detailBlocks("体", "onDetail").flatMap((block) => block.examples || []).filter((example) => example.kind === "sentence").length < 2) errors.push("体의 음독 목록 또는 문장 예시 누락")
if (!detailBlocks("三", "kunDetail").some((block) => block.type === "imageAlt" && block.text === "三つ指")) errors.push("三의 훈독 그림 설명 누락")
if (detailBlocks("席", "kunDetail").length || site?.items?.["席"]?.kun) errors.push("席의 정식 훈독 없음 데이터 오류")

const shapeParts = context.window.KANJI_RADICALS
if (!shapeParts || typeof shapeParts !== "object") errors.push("모양자·부수 데이터 객체가 없습니다.")
if (shapeParts?.meta?.total !== 156 || shapeParts?.items?.length !== 156) errors.push(`모양자·부수 데이터 오류: ${shapeParts?.items?.length}/156`)
for (const part of shapeParts?.items || []) {
  if (!part.character || !Array.isArray(part.forms) || !part.display || !part.meaning) errors.push(`모양자·부수 형식 오류: ${JSON.stringify(part)}`)
  if (!/^https:\/\/nihongokanji\.com\//.test(part.sourceUrl || "")) errors.push(`모양자·부수 출처 링크 오류: ${part.character}`)
  if (!Array.isArray(part.explanation)) errors.push(`모양자·부수 설명 형식 오류: ${part.character}`)
}

const expectedJapaneseGlyphLabels = { "送": "보낼 송", "輸": "보낼 수", "捨": "버릴 사" }
for (const [character, label] of Object.entries(expectedJapaneseGlyphLabels)) {
  if (db?.items?.find((item) => item.char === character)?.hun !== label) errors.push(`일본어 한자 표기 점검 오류: ${character}`)
  if (site?.items?.[character]?.hun !== label) errors.push(`사이트 일본어 한자 표기 오류: ${character}`)
}

const expectedJapaneseCharacters = { "더할 증": "増", "연기 연": "煙", "붓 필": "筆", "버릴 사": "捨" }
for (const [label, character] of Object.entries(expectedJapaneseCharacters)) {
  const item = db?.items?.find((entry) => entry.hun === label)
  if (item?.char !== character) errors.push(`일본어 자형 점검 오류: ${label} → ${item?.char || "누락"}`)
  if (site?.items?.[character]?.hun !== label) errors.push(`일본어 원문 자형 불일치: ${label}`)
}

const counts = Object.fromEntries(["N5", "N4", "N3", "N2", "N1"].map((level) => [
  level,
  db.items.filter((item) => item.level === level).length
]))
const expected = { N5: 103, N4: 181, N3: 324, N2: 415, N1: 1113 }
if (JSON.stringify(counts) !== JSON.stringify(expected)) errors.push(`분포 오류: ${JSON.stringify(counts)}`)

for (const file of ["index.html", "styles.css", "main.js", "assets/icon.svg", "data/kanji-hun.js", "data/kanji-site.js", "data/kanji-radicals.js", "data/kanji-examples.js", "data/kanji-study-extras.js"]) {
  if (!fs.existsSync(path.join(root, "web", file))) errors.push(`파일 누락: web/${file}`)
}

if (errors.length) {
  console.error(errors.slice(0, 50).join("\n"))
  process.exit(1)
}

console.log(`검증 완료: ${db.items.length}자`, counts)
