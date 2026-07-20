import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const html = fs.readFileSync(path.join(root, "app", "src", "main", "assets", "web", "index.html"), "utf8")
  .replace(/<script[^>]*src=["'][^"']+["'][^>]*><\/script>/g, "")
const dom = new JSDOM(html, { url: "https://kanji2136.local/", runScripts: "outside-only", pretendToBeVisual: true })
const { window } = dom
window.scrollTo = () => {}
window.confirm = () => true
window.speechSynthesis = { cancel() {}, speak() {} }
window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
window.AndroidStore = {
  isPremium: () => true,
  getProductPrice: () => "₩12,000",
  purchasePremium() {},
  restorePurchases() {},
  showInterstitial() {},
  showPrivacyOptions() {}
}

window.eval(fs.readFileSync(path.join(root, "app", "src", "main", "assets", "web", "data", "kanji-data.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "app", "src", "main", "assets", "web", "main.js"), "utf8"))

const click = (selector) => {
  const el = window.document.querySelector(selector)
  if (!el) throw new Error(`요소를 찾지 못했습니다: ${selector}`)
  el.click()
  return el
}
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const text = () => window.document.getElementById("app").textContent

assert(text().includes("하루 10자씩"), "홈 화면 렌더링 실패")
assert(window.document.querySelectorAll(".level-card").length === 5, "JLPT 카드 렌더링 실패")

click('[data-nav="learn"]')
assert(window.document.querySelectorAll(".kanji-card").length === 100, "학습 목록 초기 100자 렌더링 실패")
const input = window.document.getElementById("searchInput")
input.value = "날 일"
input.dispatchEvent(new window.Event("input", { bubbles: true }))
await new Promise((resolve) => setTimeout(resolve, 180))
assert(window.document.querySelectorAll(".kanji-card").length >= 1, "한국 훈음 검색 실패")
assert(text().includes("日"), "검색 결과 한자 누락")

click(".kanji-card")
assert(window.document.querySelector(".detail-glyph"), "상세 화면 렌더링 실패")
click('[data-rate="correct"]')
assert(JSON.parse(window.localStorage.getItem("kanji2136.progress.v1")).kanji[1].correct === 1, "학습 기록 저장 실패")

click('[data-nav="quiz"]')
click('[data-quiz-count="10"]')
click('[data-action="startQuiz"]')
assert(window.document.querySelectorAll(".answer").length === 4, "시험 선택지 렌더링 실패")
click(".answer")
assert(window.document.querySelector(".feedback"), "정오답 피드백 렌더링 실패")

click('[data-action="quitQuiz"]')
click('[data-mode="diagnostic"]')
click('[data-action="startDiagnostic"]')
assert(text().includes("1/25"), "25문항 수준진단 시작 실패")

window.KanjiNative.onPremiumStateChanged(false, "₩12,000")
click('[data-nav="home"]')
assert(text().includes("무료 N5·N4 284자"), "무료 기능 안내 렌더링 실패")
click('[data-level-link="N3"]')
assert(text().includes("전체 기능 영구 해금"), "프리미엄 잠금 화면 이동 실패")

console.log("UI 스모크 테스트 완료: 홈·검색·상세·저장·시험·수준진단·무료/프리미엄 잠금")
dom.window.close()
