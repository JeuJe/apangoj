import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8")
  .replace(/<script[^>]*src=["'][^"']+["'][^>]*><\/script>/g, "")
const dom = new JSDOM(html, { url: "https://kanji2136.local/", runScripts: "outside-only", pretendToBeVisual: true })
const { window } = dom
window.scrollTo = () => {}
window.confirm = () => true
window.eval(fs.readFileSync(path.join(root, "web/data/kanji-data.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "web/data/kanji-hun.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "web/data/kanji-site.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "web/data/kanji-radicals.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "web/data/kanji-examples.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "web/data/kanji-study-extras.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "web/main.js"), "utf8"))

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
assert(!window.document.querySelector(".mini-level"), "목록 카드 급수 배지 잔존")
assert(/\.kanji-grid\s*\{[^}]*repeat\(4,/s.test(fs.readFileSync(path.join(root, "web/styles.css"), "utf8")), "한자 목록 4열 CSS 누락")
assert(window.document.querySelector('[data-action="toggleListReadings"]'), "목록 훈음·음독 토글 누락")
click('[data-action="toggleListReadings"]')
assert(window.document.querySelectorAll(".kanji-card.is-reading-hidden").length === 100, "목록 훈음·음독 가리기 실패")
assert(text().includes("#1") && !text().includes("한자명 가림") && !text().includes("음독 가림"), "목록 가림 번호 표시 실패")
click('[data-action="toggleListReadings"]')
assert(!window.document.querySelector(".kanji-card.is-reading-hidden"), "목록 훈음·음독 다시 보기 실패")
const input = window.document.getElementById("searchInput")
input.value = "날 일"
input.dispatchEvent(new window.Event("input", { bubbles: true }))
assert(window.document.querySelectorAll(".kanji-card").length >= 1, "한국 훈음 검색 실패")
assert(text().includes("日"), "검색 결과 한자 누락")
assert(window.document.getElementById("searchInput") === input, "검색 중 입력창 교체 실패")
assert(window.document.querySelector(".search-clear"), "검색어 지우기 버튼 누락")

click(".kanji-card")
assert(window.document.querySelector(".detail-glyph"), "상세 화면 렌더링 실패")
assert(window.document.querySelector("#searchInput")?.type === "search" && window.document.querySelector("#searchInput")?.getAttribute("enterkeyhint") === "search", "상세 검색창 키보드 검색 설정 누락")
assert(window.document.querySelector(".explanation-card"), "한자 설명 렌더링 실패")
assert(text().includes("음독 : ニチ · ジツ") && text().includes("훈독 : ひ · か"), "기본 정보 독음 요약 누락")
assert(window.document.querySelectorAll(".reading-detail-card").length === 2, "음독·훈독 상세 카드 누락")
assert(text().includes("3. 音読み · 음독 상세") && text().includes("4. 訓読み · 훈독 상세"), "독음 상세 제목 누락")
assert(text().includes("음독은 ニチ、ジツ입니다. 특별한 구분법은 없습니다."), "한자공부방 음독 원문 누락")
assert(text().includes("훈독은 ひ、か입니다."), "한자공부방 훈독 원문 누락")
assert(window.document.querySelector(".reading-entry-reading")?.textContent === "ニチ" && window.document.querySelector(".reading-word-japanese")?.textContent.includes("一日(いちにち") && text().includes("하루"), "독음 원문 표기 또는 읽기 제목 누락")
assert(!text().includes("원문 상세"), "중복 원문 상세 링크 잔존")
assert(!window.document.querySelector("[data-speak]") && !text().includes("문장 듣기") && !text().includes("발음 듣기"), "음성 재생 UI 잔존")
assert(!text().includes("영문 해석") && text().includes("오늘은 일요일입니다."), "한국어 예문 해석 누락")
assert(window.document.querySelectorAll(".sentence-japanese ruby").length >= 1 && !window.document.querySelector(".sentence-reading"), "예문 후리가나 표시 실패")
assert(text().includes("一日(いちにち") && text().includes("하루") && text().includes("三日(みっか") && text().includes("사흘/3일"), "한자공부방 대표 단어 원문 누락")
assert(text().includes("日는 “태양”의 모습을 본따 그린 상형문자입니다."), "사이트 원문 한자 설명 렌더링 실패")
assert(text().includes("“날 일”. 하루, 날, 태양"), "사이트 대표 뜻 렌더링 실패")
assert(window.document.querySelector(".source-link")?.href === "https://nihongokanji.com/8/", "한자별 원문 링크 누락")
assert(window.document.querySelector(".source-link")?.dataset.externalUrl === "https://nihongokanji.com/8/", "외부 브라우저 링크 설정 누락")
assert(window.document.querySelectorAll(".part-directory-item").length === 156, "일본어 한자 공부방 모양자·부수 일람 누락")
assert(window.document.getElementById("textActionMenu"), "복사·번역 선택 메뉴 누락")
assert(!text().includes("관련 단어") && !window.document.querySelector(".part-card"), "삭제 대상 컨테이너 잔존")
assert(window.document.querySelector(".sentence-japanese")?.textContent.includes("今日") && window.document.querySelector(".sentence-japanese")?.textContent.includes("日曜日"), "예문 렌더링 실패")
assert(text().includes("오늘은 일요일입니다."), "예문 해석 렌더링 실패")

const detailSearch = window.document.getElementById("searchInput")
detailSearch.value = "国"
window.document.getElementById("searchForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
assert(window.document.querySelector(".detail-glyph")?.textContent === "国", "상세 화면 상단 검색 이동 실패")
assert(window.document.querySelector(".inline-kanji-link[data-detail]"), "모양 해설 속 한자 상세 링크 누락")
click('[data-action="back"]')
const returnToKanji = window.document.getElementById("searchInput")
returnToKanji.value = "日"
window.document.getElementById("searchForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
assert(window.document.querySelector(".detail-glyph")?.textContent === "日", "상세 상단 검색 후 한자 복귀 실패")
click('[data-rate="correct"]')
assert(JSON.parse(window.localStorage.getItem("kanji2136.progress.v1")).kanji[1].correct === 1, "학습 기록 저장 실패")
assert(window.KANJI_HUN["体"] === "몸 체" && window.KANJI_HUN["台"] === "대 대", "사이트 훈음 동기화 실패")

click('[data-action="back"]')
assert(window.document.getElementById("searchInput"), "상세 뒤 목록 복귀 실패")
const exactSearch = window.document.getElementById("searchInput")
exactSearch.value = "日"
exactSearch.dispatchEvent(new window.Event("input", { bubbles: true }))
window.document.getElementById("searchForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
assert(window.document.querySelector(".detail-glyph")?.textContent === "日", "정확한 한자 검색 상세 이동 실패")

click('[data-action="back"]')
const clearButton = window.document.querySelector(".search-clear")
clearButton.click()
assert(window.document.getElementById("searchInput").value === "" && window.document.querySelectorAll(".kanji-card").length === 100, "검색어 지우기 실패")

const n2Search = window.document.getElementById("searchInput")
n2Search.value = "党"
n2Search.dispatchEvent(new window.Event("input", { bubbles: true }))
click(".kanji-card")
assert(!text().includes("OpenJLPT N2 문맥 예문") && !text().includes("(member of) political party") && text().includes("정당"), "한국어 뜻 또는 문맥 링크 잔존")
assert(!text().includes("という言葉を覚えました"), "반복 자동 예문이 남아 있습니다")

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

console.log("UI 스모크 테스트 완료: 검색·독음 상세·N2 예문·상세 복귀·저장·시험·수준진단")
dom.window.close()
