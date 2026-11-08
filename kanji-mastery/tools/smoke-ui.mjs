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
let openedUrl = ""
window.open = (url) => { openedUrl = String(url) }
window.eval(fs.readFileSync(path.join(root, "web/data/kanji-data.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "web/data/kanji-hun.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "web/data/kanji-site.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "web/data/kanji-radicals.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "web/data/kanji-examples.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "web/data/kanji-study-extras.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "web/data/kanji-glyphs.js"), "utf8"))
window.eval(fs.readFileSync(path.join(root, "web/main.js"), "utf8"))

const click = (selector) => {
  const el = window.document.querySelector(selector)
  if (!el) throw new Error(`요소를 찾지 못했습니다: ${selector}`)
  el.click()
  return el
}
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const text = () => window.document.getElementById("app").textContent
const rubyPair = (ruby) => ({
  base: [...ruby.childNodes].filter((node) => node.nodeName !== "RT").map((node) => node.textContent).join(""),
  reading: ruby.querySelector("rt")?.textContent || ""
})

assert(text().includes("하루 10자씩"), "홈 화면 렌더링 실패")
assert(window.document.querySelectorAll(".level-card").length === 5, "JLPT 카드 렌더링 실패")
assert(window.document.querySelectorAll(".bottom-nav [data-nav]").length === 5, "하단 메뉴 5개 구성 누락")

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
assert(window.document.querySelector(".search-clear"), "큰 검색어 지우기 버튼 누락")

click(".kanji-card")
assert(window.document.querySelector(".detail-glyph"), "상세 화면 렌더링 실패")
assert(window.document.querySelector('.detail-glyph [lang="ja"]'), "상세 한자 일본어 글리프 설정 누락")
assert(window.document.querySelector("#searchInput")?.type === "search" && window.document.querySelector("#searchInput")?.getAttribute("enterkeyhint") === "search", "상세 검색창 키보드 검색 설정 누락")
assert(window.document.querySelector(".explanation-card"), "한자 설명 렌더링 실패")
assert(text().includes("음독 : ニチ · ジツ") && text().includes("훈독 : ひ · か"), "기본 정보 독음 요약 누락")
assert(window.document.querySelectorAll(".reading-detail-card").length === 2, "음독·훈독 상세 카드 누락")
assert(text().includes("3. 音読み · 음독 상세") && text().includes("4. 訓読み · 훈독 상세"), "독음 상세 제목 누락")
assert(text().includes("음독은 ニチ、ジツ입니다. 특별한 구분법은 없습니다."), "한자공부방 음독 원문 누락")
assert(text().includes("훈독은 ひ、か입니다."), "한자공부방 훈독 원문 누락")
const firstOnRuby = window.document.querySelector(".on-reading .reading-word-japanese ruby")
assert(window.document.querySelector(".reading-entry-reading")?.textContent === "ニチ" && firstOnRuby && rubyPair(firstOnRuby).base === "一日" && rubyPair(firstOnRuby).reading === "いちにち" && text().includes("하루"), "독음 원문 루비 또는 읽기 제목 누락")
assert(!text().includes("원문 상세"), "중복 원문 상세 링크 잔존")
assert(!window.document.querySelector("[data-speak]") && !text().includes("문장 듣기") && !text().includes("발음 듣기"), "음성 재생 UI 잔존")
assert(!text().includes("영문 해석") && text().includes("오늘은 일요일입니다."), "한국어 예문 해석 누락")
assert(window.document.querySelectorAll(".sentence-japanese ruby").length >= 1 && !window.document.querySelector(".sentence-reading"), "예문 후리가나 표시 실패")
const detailRubyPairs = [...window.document.querySelectorAll(".reading-detail-card .reading-word-japanese ruby")].map(rubyPair)
assert(detailRubyPairs.some(({ base, reading }) => base === "一日" && reading === "いちにち") && text().includes("하루") && detailRubyPairs.some(({ base, reading }) => base === "三日" && reading === "みっか"), "한자공부방 대표 단어 루비 누락")
assert(!/[\p{Script=Han}々〆ヵヶ0-9０-９]+\([ぁ-ゖァ-ヺー]+\)/u.test(window.document.querySelector(".reading-detail-card")?.textContent || ""), "괄호식 요미가나가 상세에 남아 있습니다")
assert(window.document.querySelector(".on-reading .reading-word-meaning"), "음독 예문 해석 누락")
assert(text().includes("日는 “태양”의 모습을 본따 그린 상형문자입니다."), "사이트 원문 한자 설명 렌더링 실패")
assert(text().includes("“날 일”. 하루, 날, 태양"), "사이트 대표 뜻 렌더링 실패")
assert(window.document.querySelector(".source-link")?.href === "https://nihongokanji.com/8/", "한자별 원문 링크 누락")
assert(window.document.querySelector(".source-link")?.dataset.externalUrl === "https://nihongokanji.com/8/", "외부 브라우저 링크 설정 누락")
assert(window.document.querySelectorAll(".part-directory-item").length === 156, "일본어 한자 공부방 모양자·부수 일람 누락")
assert(window.document.getElementById("textActionMenu"), "복사·검색하기 선택 메뉴 누락")
assert(!text().includes("관련 단어") && !window.document.querySelector(".part-card"), "삭제 대상 컨테이너 잔존")
assert(window.document.querySelector(".sentence-japanese")?.textContent.includes("今日") && window.document.querySelector(".sentence-japanese")?.textContent.includes("日曜日"), "예문 렌더링 실패")
assert(text().includes("오늘은 일요일입니다."), "예문 해석 렌더링 실패")

const selectedText = window.getSelection
window.getSelection = () => ({ toString: () => "日", rangeCount: 0 })
window.document.querySelector(".explanation-text p").dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, clientX: 100, clientY: 180 }))
assert(window.document.getElementById("textActionMenu")?.textContent === "복사검색하기", "길게 누르기 복사·검색하기 메뉴 구성 실패")
assert(!window.document.querySelector('[data-action="translateSelection"]'), "길게 누르기 번역 메뉴 잔존")
click('[data-action="searchSelection"]')
assert(openedUrl === "https://www.google.com/search?q=%E6%97%A5", `선택 글자 검색 URL 오류: ${openedUrl}`)
window.getSelection = selectedText

const searchDetail = (character) => {
  const detailSearchInput = window.document.getElementById("searchInput")
  detailSearchInput.value = character
  window.document.getElementById("searchForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
  assert(window.document.querySelector(".detail-glyph")?.textContent === character, `${character} 상세 이동 실패`)
}
searchDetail("会")
assert(window.document.querySelector(".kun-reading .reading-sentence-line")?.textContent.includes("カフェ") && !window.document.querySelector(".kun-reading .no-reading"), "会 훈독 문장 예시 또는 빈 상세 문구 오류")
assert(!window.document.querySelector(".kun-reading .reading-word-meaning"), "훈독 예문 해석이 남아 있습니다")
searchDetail("時")
assert(window.document.querySelector(".shape-more") && text().includes("寺의 자세한 유래 더보기") && text().includes("“시간”이라는 뜻의 글자"), "時 접힌 모양 상세 또는 최종 뜻 누락")
searchDetail("上")
assert(window.document.querySelectorAll(".kun-reading .reading-group-title").length >= 4 && window.document.querySelectorAll(".kun-reading .reading-sentence-line").length >= 9, "上 훈독 4그룹 또는 문장 9개 렌더링 실패")
searchDetail("散")
assert(window.document.querySelectorAll(".kun-reading .reading-guide-list").length >= 2 && window.document.querySelectorAll(".kun-reading .reading-sentence-line").length >= 4, "散 훈독 목록 또는 문장 렌더링 실패")
searchDetail("体")
assert(window.document.querySelector(".on-reading .reading-guide-list") && window.document.querySelectorAll(".on-reading .reading-sentence-line").length >= 2, "体 음독 목록 또는 문장 렌더링 실패")
searchDetail("三")
assert(text().includes("그림 설명 · 三つ指"), "三 훈독 그림 설명 렌더링 실패")
searchDetail("尽")
const kunRubyPairs = [...window.document.querySelectorAll(".kun-reading .reading-word-japanese ruby")].map(rubyPair)
assert(kunRubyPairs.some(({ base, reading }) => base === "心" && reading === "こころ") && kunRubyPairs.some(({ base, reading }) => base === "尽" && reading === "つ"), "훈독 문장 요미가나 루비 변환 실패")
assert(!window.document.querySelector(".kun-reading .reading-word-meaning"), "훈독 예문 해석 제거 실패")
assert(/\.kun-reading\s+\.reading-entry\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s.test(fs.readFileSync(path.join(root, "web/styles.css"), "utf8")), "훈독 예문 전체 너비 레이아웃 누락")

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
assert(window.document.getElementById("searchInput")?.value === "日", "상세 뒤 검색어 보존 실패")
const hardwareBackSearch = window.document.getElementById("searchInput")
hardwareBackSearch.value = "会"
hardwareBackSearch.dispatchEvent(new window.Event("input", { bubbles: true }))
window.document.getElementById("searchForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
window.history.replaceState({ route: "learn" }, "", "#learn")
window.dispatchEvent(new window.PopStateEvent("popstate", { state: { route: "learn" } }))
assert(window.document.getElementById("searchInput")?.value === "会", "기기 뒤로가기 검색어 보존 실패")
const clearInput = window.document.getElementById("searchInput")
clearInput.value = "날 일"
clearInput.dispatchEvent(new window.Event("input", { bubbles: true }))
click(".search-clear")
assert(window.document.getElementById("searchInput").value === "" && window.document.querySelectorAll(".kanji-card").length === 100, "검색어 지우기 실패")

const n2Search = window.document.getElementById("searchInput")
n2Search.value = "党"
n2Search.dispatchEvent(new window.Event("input", { bubbles: true }))
click(".kanji-card")
assert(!text().includes("OpenJLPT N2 문맥 예문") && !text().includes("(member of) political party") && text().includes("정당"), "한국어 뜻 또는 문맥 링크 잔존")
assert(!text().includes("という言葉を覚えました"), "반복 자동 예문이 남아 있습니다")

click('[data-action="back"]')
click('[data-level="N5"]')
const unrestrictedSearch = window.document.getElementById("searchInput")
unrestrictedSearch.value = "鬱"
unrestrictedSearch.dispatchEvent(new window.Event("input", { bubbles: true }))
assert(window.document.querySelectorAll(".kanji-card").length >= 1 && text().includes("鬱"), "검색어 입력 시 전체 2136자 검색 실패")
click(".search-clear")
click('[data-level="ALL"]')
const seatSearch = window.document.getElementById("searchInput")
seatSearch.value = "席"
window.document.getElementById("searchForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
assert(window.document.querySelector(".detail-glyph")?.textContent === "席", "정확한 席 상세 이동 실패")
const seatReadings = window.document.querySelector(".basic-readings")?.textContent || ""
assert(seatReadings.includes("훈독 : 정식 훈독 없음") && !seatReadings.includes("むしろ"), "원문에 없는 훈독 fallback 노출")
click('[data-action="back"]')
const sourceGlyphSearch = window.document.getElementById("searchInput")
sourceGlyphSearch.value = "印"
window.document.getElementById("searchForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
assert(window.document.querySelector(".detail-glyph")?.textContent === "印", "정확한 印 상세 이동 실패")
assert(text().includes("印 =𠀉+卩") && !text().includes("印 = 手 + 卩"), "원문 모양자 치환 노출")
assert(window.document.querySelector(".explanation-card .source-glyph path"), "확장 한자 글리프 SVG 렌더링 누락")
click('[data-action="back"]')

click('[data-nav="range"]')
assert(window.document.querySelector("#rangeQuizForm"), "독립 범위 테스트 메뉴 누락")
const rangeStart = window.document.getElementById("rangeStartInput")
const rangeEnd = window.document.getElementById("rangeEndInput")
rangeStart.value = "50"
rangeEnd.value = "120"
window.document.getElementById("rangeQuizForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
assert(window.document.querySelector(".quiz-top strong")?.textContent === "1/71", "번호 범위 전체 랜덤 출제 실패")
assert(window.document.querySelector(".range-question-card .question-glyph"), "범위 테스트 한자 카드 누락")
assert(text().includes("답안 확인") && !window.document.querySelector(".range-question-card .answer-list"), "범위 테스트가 답안 확인 방식이 아님")
assert(!text().includes("획수"), "범위 테스트에 획수 문제가 남아 있습니다")
click(".range-answer summary")
assert(text().includes("음독") && text().includes("훈독") && text().includes("알고 있었어요"), "범위 테스트 답안 펼치기 실패")
click('[data-range-result="correct"]')
assert(window.document.querySelector(".quiz-top strong")?.textContent === "2/71", "범위 테스트 다음 문항 이동 실패")
click('[data-action="quitQuiz"]')
assert(window.document.querySelector("#rangeQuizForm"), "범위 테스트 종료 후 메뉴 복귀 실패")
click('[data-nav="quiz"]')
assert(!window.document.querySelector('[data-mode="range"]'), "범위 테스트가 시험 화면에 중복 노출됨")
click('[data-mode="practice"]')
click('[data-quiz-count="10"]')
click('[data-action="startQuiz"]')
assert(window.document.querySelectorAll(".answer").length === 4, "시험 선택지 렌더링 실패")
assert(!text().includes("획수"), "시험에 획수 문제가 남아 있습니다")
click(".answer")
assert(window.document.querySelector(".feedback"), "정오답 피드백 렌더링 실패")

click('[data-action="quitQuiz"]')
click('[data-mode="diagnostic"]')
click('[data-action="startDiagnostic"]')
assert(text().includes("1/25"), "25문항 수준진단 시작 실패")

console.log("UI 스모크 테스트 완료: 검색·독음 상세·N2 예문·상세 복귀·번호 범위 시험·저장·시험·수준진단")
dom.window.close()
