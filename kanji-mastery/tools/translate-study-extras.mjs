import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const target = path.join(root, "web/data/kanji-study-extras.js")
const context = { window: {} }
vm.createContext(context)
vm.runInContext(fs.readFileSync(target, "utf8"), context)
const payload = context.window.KANJI_STUDY_EXTRAS
const hunContext = { window: {} }
vm.createContext(hunContext)
vm.runInContext(fs.readFileSync(path.join(root, "web/data/kanji-hun.js"), "utf8"), hunContext)
const HUN = hunContext.window.KANJI_HUN || {}
const concurrency = 2
const batchSize = 8
const execFileAsync = promisify(execFile)

async function translateBatch(texts, attempt = 1) {
  const query = texts.join("\n")
  try {
    const { stdout } = await execFileAsync("curl", [
      "-L", "--fail", "--retry", "3", "--retry-all-errors", "--retry-delay", "2", "--max-time", "30", "-sG", "https://translate.googleapis.com/translate_a/single",
      "--data-urlencode", "client=gtx", "--data-urlencode", "sl=en", "--data-urlencode", "tl=ko",
      "--data-urlencode", "dt=t", "--data-urlencode", `q=${query}`
    ], { maxBuffer: 1024 * 1024 })
    const data = JSON.parse(stdout)
    const segments = data?.[0]
    if (!Array.isArray(segments) || !segments.length) throw new Error("번역 결과가 비어 있습니다.")
    if (texts.length === 1) {
      return [segments.map((part) => String(part?.[0] || "")).join("").replace(/\n+$/u, "").trim()]
    }
    const result = segments.map((part) => String(part?.[0] || "").replace(/\n+$/u, "").trim())
    if (result.length !== texts.length || result.some((text) => !text)) {
      const individual = []
      for (const text of texts) {
        individual.push(...await translateBatch([text]))
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      return individual
    }
    return result
  } catch (error) {
    if (attempt >= 4) throw error
    await new Promise((resolve) => setTimeout(resolve, attempt * 5000))
    return translateBatch(texts, attempt + 1)
  }
}

const passages = payload.passages || []
const batches = []
for (let index = 0; index < passages.length; index += batchSize) {
  batches.push(passages.slice(index, index + batchSize))
}
let nextBatch = 0
let completed = 0
async function worker() {
  while (true) {
    const batch = batches[nextBatch++]
    if (!batch) return
    const source = batch.map((passage) => passage.translation)
    const translated = source.some((text) => !text || /[가-힣]/u.test(text))
      ? source
      : await translateBatch(source)
    batch.forEach((passage, index) => { passage.translation = translated[index] })
    completed += batch.length
    if (completed % 25 === 0 || completed === passages.length) {
      process.stdout.write(`\r예문 한국어 번역 ${completed}/${passages.length}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()))
process.stdout.write("\n")

async function translateMeaning(text, attempt = 1) {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-L", "--fail", "--max-time", "20", "-sG", "https://api.mymemory.translated.net/get",
      "--data-urlencode", `q=${text}`, "--data-urlencode", "langpair=en|ko"
    ], { maxBuffer: 1024 * 1024 })
    const translated = String(JSON.parse(stdout)?.responseData?.translatedText || "").trim()
    return /[가-힣]/u.test(translated) ? translated : ""
  } catch (error) {
    if (attempt >= 4) return ""
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
    return translateMeaning(text, attempt + 1)
  }
}

const meaningEntries = Object.entries(payload.examples || {})
  .filter(([, entry]) => entry.meaning && !/[가-힣]/u.test(entry.meaning))
const meaningTexts = [...new Set(meaningEntries.map(([, entry]) => String(entry.meaning).trim()))]
const translatedMeanings = new Map()
let nextMeaning = 0
let meaningCompleted = 0
async function meaningWorker() {
  while (true) {
    const meaning = meaningTexts[nextMeaning++]
    if (!meaning) return
    translatedMeanings.set(meaning, await translateMeaning(meaning))
    meaningCompleted += 1
    if (meaningCompleted % 25 === 0 || meaningCompleted === meaningTexts.length) {
      process.stdout.write(`\r관련 단어 뜻 한국어 번역 ${meaningCompleted}/${meaningTexts.length}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
await Promise.all(Array.from({ length: 8 }, () => meaningWorker()))
process.stdout.write("\n")
for (const [character, entry] of Object.entries(payload.examples || {})) {
  const meaning = String(entry.meaning || "").trim()
  entry.meaning = translatedMeanings.get(meaning) || (/[가-힣]/u.test(meaning) ? meaning : HUN[character] || "뜻 확인")
}
payload.meta.exampleTranslation = "한국어 번역"
payload.meta.wordMeaningTranslation = "한국어 번역 또는 한자 훈음 대체"
payload.meta.translationSource = "Google Translate (OpenJLPT/Tatoeba 영어 원문 기반)"
fs.writeFileSync(target, `window.KANJI_STUDY_EXTRAS=${JSON.stringify(payload)};\n`, "utf8")
