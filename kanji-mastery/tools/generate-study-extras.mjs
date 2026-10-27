import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const options = Object.fromEntries(process.argv.slice(2).map((entry) => {
  const split = entry.indexOf("=")
  return split < 0 ? [entry, true] : [entry.slice(0, split), entry.slice(split + 1)]
}))
const openJlptRoot = path.resolve(String(options["--openjlpt"] || ""))
const kangxiWiki = path.resolve(String(options["--kangxi-wikitext"] || ""))

if (!fs.existsSync(path.join(openJlptRoot, "data/json/vocab/n2.json"))) {
  throw new Error("--openjlpt=/path/to/OpenJLPT 가 필요합니다.")
}
if (!fs.existsSync(kangxiWiki)) throw new Error("--kangxi-wikitext=/path/to/Kangxi.wiki 가 필요합니다.")

const context = { window: {} }
vm.createContext(context)
vm.runInContext(fs.readFileSync(path.join(root, "web/data/kanji-data.js"), "utf8"), context)
const kanji = context.window.KANJI_DB.items
const kanjiChars = new Set(kanji.map((item) => item.char))
const kangxiCharacters = [..."一丨丶丿乙亅二亠人儿入八冂冖冫几凵刀力勹匕匚匸十卜卩厂厶又口囗土士夂夊夕大女子宀寸小尢尸屮山巛工己巾干幺广廴廾弋弓彐彡彳心戈戶手支攴文斗斤方无日曰月木欠止歹殳毋比毛氏气水火爪父爻爿片牙牛犬玄玉瓜瓦甘生用田疋疒癶白皮皿目矛矢石示禸禾穴立竹米糸缶网羊羽老而耒耳聿肉臣自至臼舌舛舟艮色艸虍虫血行衣襾見角言谷豆豕豸貝赤走足身車辛辰辵邑酉釆里金長門阜隶隹雨靑非面革韋韭音頁風飛食首香馬骨高髟鬥鬯鬲鬼魚鳥鹵鹿麥麻黃黍黑黹黽鼎鼓鼠鼻齊齒龍龜龠"]

function radicalStrokes(number) {
  const ends = [6, 29, 60, 94, 117, 146, 166, 175, 186, 194, 200, 204, 208, 210, 211, 213, 214]
  return ends.findIndex((end) => number <= end) + 1
}

const radicalNames = {}
for (const block of fs.readFileSync(kangxiWiki, "utf8").split("|----")) {
  const number = Number(block.match(/\[\[Radical (\d+)\|/)?.[1])
  const name = block.match(/\{\{lang\|ko\|([^}]+)\}\}/)?.[1]
  if (number && name) radicalNames[number] = name.replace(/\s+/g, " ").trim()
}
if (Object.keys(radicalNames).length !== 214) throw new Error(`강희 부수 이름 오류: ${Object.keys(radicalNames).length}/214`)

const records = []
for (const level of ["n2", "n1", "n3", "n4", "n5"]) {
  const vocab = JSON.parse(fs.readFileSync(path.join(openJlptRoot, `data/json/vocab/${level}.json`), "utf8"))
  const grammar = JSON.parse(fs.readFileSync(path.join(openJlptRoot, `data/json/grammar/${level}.json`), "utf8"))
  for (const entry of vocab) {
    for (const example of entry.examples || []) records.push({
      level: entry.level, kind: "vocab", word: entry.word, reading: entry.reading,
      meaning: entry.meanings?.[0] || "", ...example
    })
  }
  for (const entry of grammar) {
    for (const example of entry.examples || []) records.push({
      level: entry.level, kind: "grammar", word: entry.pattern, reading: entry.reading,
      meaning: entry.meaning || "", ...example
    })
  }
}

const byCharacter = new Map()
for (const record of records) {
  for (const character of new Set([...record.ja])) {
    if (!kanjiChars.has(character)) continue
    if (!byCharacter.has(character)) byCharacter.set(character, [])
    byCharacter.get(character).push(record)
  }
}

function score(record, item) {
  let value = record.level === "N2" ? 100 : record.level === item.level ? 35 : 0
  if (record.word?.includes(item.char)) value += 45
  if (record.word && record.ja.includes(record.word.replaceAll("〜", ""))) value += 10
  if (record.furigana) value += 5
  if (record.ja.length >= 12 && record.ja.length <= 70) value += 3
  if (record.kind === "grammar") value += 1
  return value
}

const passages = []
const passageIndex = new Map()
const examples = {}
for (const item of kanji) {
  const candidates = byCharacter.get(item.char) || []
  const selected = candidates.sort((a, b) => score(b, item) - score(a, item) || a.ja.length - b.ja.length)[0]
  if (!selected) continue
  const key = `${selected.ja}\n${selected.en}`
  let index = passageIndex.get(key)
  if (index === undefined) {
    index = passages.length
    passageIndex.set(key, index)
    passages.push({
      japanese: selected.ja,
      furigana: selected.furigana || "",
      translation: selected.en,
      tatoebaId: selected.tatoeba_id || null
    })
  }
  examples[item.char] = {
    passage: index,
    level: selected.level,
    kind: selected.kind,
    word: selected.word,
    reading: selected.reading,
    meaning: selected.meaning
  }
}

const payload = {
  meta: {
    generatedAt: new Date().toISOString(),
    exampleSource: "https://github.com/evanclan/OpenJLPT",
    exampleLicense: "CC BY-SA 4.0 (Tatoeba examples: CC BY 2.0 FR)",
    radicalSource: "https://en.wikipedia.org/wiki/Kangxi_radicals",
    radicalLicense: "CC BY-SA 4.0",
    exampleCount: Object.keys(examples).length
  },
  radicals: kangxiCharacters.map((character, index) => ({
    character,
    number: index + 1,
    strokes: radicalStrokes(index + 1),
    name: radicalNames[index + 1]
  })),
  passages,
  examples
}

fs.writeFileSync(path.join(root, "web/data/kanji-study-extras.js"), `window.KANJI_STUDY_EXTRAS=${JSON.stringify(payload)};\n`, "utf8")
const n2Count = kanji.filter((item) => examples[item.char]?.level === "N2").length
console.log(`추가 학습 데이터 생성: 예문 ${Object.keys(examples).length}/2136자 (N2 ${n2Count}자), 부수 ${payload.radicals.length}개`)
