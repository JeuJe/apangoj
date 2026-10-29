(() => {
  "use strict"

  const DB = window.KANJI_DB
  if (!DB || !Array.isArray(DB.items)) {
    document.getElementById("app").innerHTML = '<div class="empty">한자 데이터를 불러오지 못했습니다.</div>'
    return
  }

  const HUN = window.KANJI_HUN || {}
  const SITE = window.KANJI_SITE?.items || {}
  function siteReadings(value, fallback) {
    const readings = String(value || "").split(/[、,]/u).map((reading) => reading.trim()).filter(Boolean)
    return readings.length ? readings : fallback
  }
  const ITEMS = DB.items.map((item) => {
    const source = SITE[item.char]
    return {
      ...item,
      hun: source?.hun || HUN[item.char] || item.hun,
      on: siteReadings(source?.on, item.on),
      kun: siteReadings(source?.kun, item.kun),
      siteMeaning: source?.meaning || "",
      explanation: source?.explanation || [],
      onDetail: source?.onDetail || { paragraphs: [], entries: [] },
      kunDetail: source?.kunDetail || { paragraphs: [], entries: [] },
      sourceUrl: source?.sourceUrl || `https://nihongokanji.com/?s=${encodeURIComponent(item.char)}`
    }
  })
  const BY_ID = new Map(ITEMS.map((item) => [item.id, item]))
  const BY_CHAR = new Map(ITEMS.map((item) => [item.char, item]))
  const EXAMPLES = window.KANJI_EXAMPLES || {}
  const STUDY_EXTRAS = window.KANJI_STUDY_EXTRAS || { radicals: [], passages: [], examples: {} }
  const RADICALS_BY_NUMBER = new Map((STUDY_EXTRAS.radicals || []).map((radical) => [radical.number, radical]))
  const RADICALS_BY_CHARACTER = new Map((STUDY_EXTRAS.radicals || []).map((radical) => [radical.character, radical]))
  const CONTEXT_EXAMPLES = STUDY_EXTRAS.examples || {}
  const CONTEXT_PASSAGES = STUDY_EXTRAS.passages || []
  const LEVELS = ["N5", "N4", "N3", "N2", "N1"]
  const LEVEL_NAMES = { N5: "입문", N4: "초급", N3: "중급", N2: "중상급", N1: "상급" }
  const STORAGE_KEY = "kanji2136.progress.v1"
  const DAY = 86400000
  const KANGXI_RADICALS = [..."一丨丶丿乙亅二亠人儿入八冂冖冫几凵刀力勹匕匚匸十卜卩厂厶又口囗土士夂夊夕大女子宀寸小尢尸屮山巛工己巾干幺广廴廾弋弓彐彡彳心戈戶手支攴文斗斤方无日曰月木欠止歹殳毋比毛氏气水火爪父爻爿片牙牛犬玄玉瓜瓦甘生用田疋疒癶白皮皿目矛矢石示禸禾穴立竹米糸缶网羊羽老而耒耳聿肉臣自至臼舌舛舟艮色艸虍虫血行衣襾見角言谷豆豕豸貝赤走足身車辛辰辵邑酉釆里金長門阜隶隹雨靑非面革韋韭音頁風飛食首香馬骨高髟鬥鬯鬲鬼魚鳥鹵鹿麥麻黃黍黑黹黽鼎鼓鼠鼻齊齒龍龜龠"]
  const PART_VARIANTS = {
    "亻": "人", "𠆢": "人", "刂": "刀", "忄": "心", "⺗": "心", "扌": "手",
    "氵": "水", "氺": "水", "灬": "火", "爫": "爪", "牜": "牛", "犭": "犬",
    "王": "玉", "礻": "示", "衤": "衣", "糹": "糸", "纟": "糸", "罒": "网",
    "⺲": "网", "艹": "艸", "⺮": "竹", "辶": "辵", "⻌": "辵", "⺼": "肉",
    "钅": "金", "飠": "食", "饣": "食", "門": "門", "门": "門", "车": "車",
    "贝": "貝", "见": "見", "马": "馬", "鱼": "魚", "鸟": "鳥"
  }

  const state = {
    route: "home",
    previousRoute: "learn",
    level: "ALL",
    status: "ALL",
    query: "",
    listLimit: 100,
    showListReadings: true,
    detailId: null,
    partDetail: null,
    quizMode: "practice",
    quizLevel: "N5",
    quizCount: 20,
    quiz: null
  }

  const emptyStore = () => ({
    kanji: {},
    favorites: [],
    sessions: [],
    streak: { current: 0, best: 0, lastDate: null },
    diagnostic: null,
    preferences: { showListReadings: true }
  })

  function loadStore() {
    try {
      return Object.assign(emptyStore(), JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"))
    } catch (_) {
      return emptyStore()
    }
  }

  let store = loadStore()
  state.showListReadings = store.preferences?.showListReadings !== false

  function saveStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    updateStreakBadge()
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]))
  }

  function canonicalPart(part) {
    return PART_VARIANTS[part] || part
  }

  function radicalPart(item) {
    const index = Number(item.radical) - 1
    return RADICALS_BY_NUMBER.get(Number(item.radical))?.character
      || (Number.isInteger(index) && index >= 0 ? KANGXI_RADICALS[index] || "" : "")
  }

  function radicalInfo(part, number = null) {
    return (number ? RADICALS_BY_NUMBER.get(Number(number)) : null)
      || RADICALS_BY_CHARACTER.get(canonicalPart(part))
      || RADICALS_BY_CHARACTER.get(part)
      || null
  }

  function linkedPartItem(part) {
    return BY_CHAR.get(part) || BY_CHAR.get(canonicalPart(part)) || null
  }

  function explanationHtml(item, paragraph) {
    const components = new Set([radicalPart(item), ...item.components, ...item.components.map(canonicalPart)])
    return [...String(paragraph)].map((character) => {
      const linked = linkedPartItem(character)
      const clickable = character !== item.char && /\p{Script=Han}/u.test(character) && (linked || components.has(character))
      return clickable
        ? `<button class="inline-kanji-link" data-part="${escapeHtml(character)}" aria-label="${escapeHtml(character)} 설명 보기">${escapeHtml(character)}</button>`
        : escapeHtml(character)
    }).join("")
  }

  function partDetailTemplate(item) {
    const part = state.partDetail
    if (!part) return ""
    const canonical = canonicalPart(part)
    const linked = linkedPartItem(part)
    const radical = radicalPart(item)
    const isRadical = canonical === canonicalPart(radical)
    const radicalData = isRadical ? radicalInfo(part, item.radical) : radicalInfo(part)
    const localParagraphs = item.explanation.filter((paragraph) => paragraph.includes(part) || (canonical !== part && paragraph.includes(canonical)))
    const sourceItem = linked?.explanation?.length ? linked : item
    const paragraphs = linked?.explanation?.length
      ? linked.explanation.slice(0, 3)
      : localParagraphs.length
        ? localParagraphs
        : [`${part}는 ${item.char}의 ${isRadical ? "부수" : "구성 요소"}로 쓰입니다.`]
    const sourceUrl = linked?.sourceUrl || (radicalData ? STUDY_EXTRAS.meta?.radicalSource : sourceItem?.sourceUrl) || item.sourceUrl
    return `<article class="info-card part-detail-card" id="partDetailCard">
      <div class="info-label"><span>${isRadical ? `부수 ${item.radical}번` : "구성 요소"} · ${escapeHtml(part)}</span><button class="text-button" data-action="closePart">닫기</button></div>
      ${canonical !== part ? `<p class="part-alias">대표 부수형 ${escapeHtml(canonical)}</p>` : ""}
      ${linked
        ? `<p class="part-title">${escapeHtml(linked.char)} · ${escapeHtml(linked.hun)}</p><p class="part-meaning">${escapeHtml(koreanMeaning(linked))}</p>`
        : radicalData
          ? `<p class="part-title">${escapeHtml(radicalData.character)} · ${escapeHtml(radicalData.name)}</p><p class="part-meaning">강희 ${radicalData.number}번 부수 · ${radicalData.strokes}획</p>`
          : ""}
      ${radicalData ? `<p class="radical-note">${escapeHtml(radicalData.character)}는 ‘${escapeHtml(radicalData.name)}’으로 부르는 ${radicalData.strokes}획 부수입니다.</p>` : ""}
      <div class="explanation-text">${paragraphs.map((paragraph) => `<p>${explanationHtml(sourceItem || item, paragraph)}</p>`).join("")}</div>
      <div class="part-detail-actions">
        ${linked && linked.id !== item.id ? `<button class="btn ghost" data-detail="${linked.id}">${escapeHtml(linked.char)} 전체 상세 보기</button>` : ""}
        <a class="source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${linked ? "한자 원문" : radicalData ? "214부수 자료" : "사이트 원문"} 보기 ↗</a>
      </div>
    </article>`
  }

  function koreanMeaning(item) {
    return item.siteMeaning || item.hun
  }

  function topicMarker(text) {
    const lastHangul = [...String(text)].reverse().find((character) => /[가-힣]/.test(character)) || ""
    const code = lastHangul.codePointAt(0) || 0
    return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 ? "은" : "는"
  }

  function kanjiExplanation(item) {
    const on = item.on.length ? `음독 ${item.on.join(" · ")}` : "정식 음독 없음"
    const kun = item.kun.length ? `훈독 ${item.kun.join(" · ")}` : "정식 훈독 없음"
    const structure = item.components.length
      ? `구성 요소는 ${item.components.join(" · ")}입니다.`
      : "기본 글자 형태로 익히면 됩니다."
    return `${item.char}${topicMarker(item.hun)} 한국 훈음으로 ‘${item.hun}’이며, ${item.strokes}획으로 씁니다. 일본어에서는 ${on}, ${kun}으로 읽습니다. ${structure}`
  }

  function shuffle(values) {
    const result = values.slice()
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }

  function todayKey(date = new Date()) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }

  function registerStudyDay() {
    const today = todayKey()
    if (store.streak.lastDate === today) return
    const yesterday = todayKey(new Date(Date.now() - DAY))
    store.streak.current = store.streak.lastDate === yesterday ? store.streak.current + 1 : 1
    store.streak.best = Math.max(store.streak.best, store.streak.current)
    store.streak.lastDate = today
  }

  function updateStreakBadge() {
    const badge = document.getElementById("streakCount")
    if (badge) badge.textContent = String(store.streak.current || 0)
  }

  function progressOf(id) {
    return store.kanji[id] || { seen: 0, correct: 0, wrong: 0, streak: 0, mastery: 0, nextReview: 0, lastSeen: 0 }
  }

  function updateProgress(id, correct) {
    const item = Object.assign({}, progressOf(id))
    item.seen += 1
    item.lastSeen = Date.now()
    if (correct) {
      item.correct += 1
      item.streak += 1
      item.mastery = Math.min(5, item.mastery + (item.streak >= 3 ? 2 : 1))
    } else {
      item.wrong += 1
      item.streak = 0
      item.mastery = Math.max(0, item.mastery - 1)
    }
    const intervals = [0, 5 * 60000, DAY, 3 * DAY, 7 * DAY, 21 * DAY]
    item.nextReview = Date.now() + intervals[item.mastery]
    store.kanji[id] = item
    registerStudyDay()
    saveStore()
  }

  function toast(message) {
    const el = document.getElementById("toast")
    el.textContent = message
    el.classList.add("show")
    clearTimeout(toast.timer)
    toast.timer = setTimeout(() => el.classList.remove("show"), 1800)
  }

  function activeNav(route) {
    const base = route === "detail" ? "learn" : route === "quizRun" || route === "result" ? "quiz" : route
    document.querySelectorAll(".bottom-nav button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.nav === base)
    })
  }

  function navigate(route, options = {}, push = true) {
    if (state.route !== "detail" && route === "detail") state.previousRoute = "learn"
    if (route === "detail" && options.detailId && Number(options.detailId) !== Number(state.detailId)) options.partDetail = null
    Object.assign(state, options, { route })
    activeNav(route)
    const hash = route === "detail" && options.detailId ? `#detail/${Number(options.detailId)}` : `#${route}`
    if (push) history.pushState({ route, options }, "", hash)
    render()
    window.scrollTo(0, 0)
  }

  function levelClass(level) { return level.toLowerCase() }

  function readingWord(item, reading) {
    if (!reading || reading.includes("-")) return null
    const parts = reading.split(".")
    const kana = parts.join("")
    if (!kana) return null
    return {
      word: parts.length > 1 ? `${item.char}${parts.slice(1).join("")}` : item.char,
      reading: kana,
      meaning: item.hun
    }
  }

  function furiganaHtml(value) {
    const source = String(value || "")
    const pattern = /\{([^|{}]+)\|([^{}]+)\}/g
    let html = ""
    let cursor = 0
    for (const match of source.matchAll(pattern)) {
      html += escapeHtml(source.slice(cursor, match.index))
      html += `<ruby>${escapeHtml(match[1])}<rt>${escapeHtml(match[2])}</rt></ruby>`
      cursor = match.index + match[0].length
    }
    return html + escapeHtml(source.slice(cursor))
  }

  function sentenceFuriganaHtml(japanese, reading) {
    const source = [...String(japanese || "")]
    const kana = [...String(reading || "").replace(/\s+/g, "")]
    let cursor = 0
    let html = ""
    const isKanji = (character) => /\p{Script=Han}/u.test(character)
    const isKana = (character) => /[\u3040-\u30ffー]/u.test(character)
    for (let index = 0; index < source.length; index += 1) {
      if (!isKanji(source[index])) {
        html += escapeHtml(source[index])
        if (kana[cursor] === source[index]) cursor += 1
        continue
      }
      const start = index
      while (index + 1 < source.length && isKanji(source[index + 1])) index += 1
      const base = source.slice(start, index + 1).join("")
      const anchor = source.slice(index + 1).find(isKana)
      const anchorIndex = anchor ? kana.indexOf(anchor, cursor) : -1
      const end = anchorIndex >= cursor ? anchorIndex : kana.length
      const rubyReading = kana.slice(cursor, end).join("")
      html += rubyReading ? `<ruby>${escapeHtml(base)}<rt>${escapeHtml(rubyReading)}</rt></ruby>` : escapeHtml(base)
      cursor = end
    }
    return html
  }

  function sentenceHtml(sentence) {
    if (sentence.furigana) return furiganaHtml(sentence.furigana)
    if (sentence.reading) return sentenceFuriganaHtml(sentence.japanese, sentence.reading)
    return escapeHtml(sentence.japanese)
  }

  function readingWordTemplate(value) {
    const text = String(value || "").trim()
    const match = text.match(/^(.+?)\s+([가-힣].*)$/u)
    if (!match) return `<span class="reading-word-line"><span class="reading-word-japanese">${escapeHtml(text)}</span></span>`
    return `<span class="reading-word-line"><span class="reading-word-japanese">${escapeHtml(match[1])}</span><span class="reading-word-meaning">${escapeHtml(match[2])}</span></span>`
  }

  function readingEntryTemplate(entry) {
    const text = String(entry?.text || "").trim()
    const match = text.match(/^(\S+)\s+(.+)$/u)
    if (!match || /[가-힣]/u.test(match[1])) return `<div class="reading-entry reading-entry-plain">${escapeHtml(text)}</div>`
    const words = match[2].split(/\s*,\s*/u).map((word) => word.trim()).filter(Boolean)
    return `<div class="reading-entry"><strong class="reading-entry-reading">${escapeHtml(match[1])}</strong><div class="reading-word-list">${words.map(readingWordTemplate).join("")}</div></div>`
  }

  function fallbackContextSentence(item, target) {
    const templates = [
      [`辞書で「${target.word}」の使い方を確認してから、文章をもう一度読み直した。`, `사전에서 ‘${target.word}’의 쓰임을 확인한 뒤 문장을 다시 읽었다.`],
      [`先生は「${target.word}」が使われている文を例に挙げ、意味の違いを説明した。`, `선생님은 ‘${target.word}’가 쓰인 문장을 예로 들어 의미의 차이를 설명했다.`],
      [`資料の中で「${target.word}」という表現がどのように使われているかを調べた。`, `자료에서 ‘${target.word}’라는 표현이 어떻게 쓰이는지 조사했다.`],
      [`「${target.word}」を含む文章は、前後の文脈を意識すると理解しやすい。`, `‘${target.word}’가 포함된 문장은 앞뒤 문맥을 의식하면 이해하기 쉽다.`],
      [`発表の準備をするため、「${target.word}」に関する資料を何度も読み返した。`, `발표를 준비하기 위해 ‘${target.word}’에 관한 자료를 여러 번 다시 읽었다.`],
      [`筆者が「${target.word}」を選んだ理由について、グループで意見を交換した。`, `필자가 ‘${target.word}’를 선택한 이유에 관해 모둠에서 의견을 나눴다.`]
    ]
    const [japanese, translation] = templates[item.id % templates.length]
    return { japanese, translation, translationLabel: "한국어 해석" }
  }

  function studyContent(item) {
    const curated = EXAMPLES[item.char]
    if (item.level === "N5" && Array.isArray(curated) && curated.length >= 3) {
      return {
        words: curated.slice(0, -1).map(([word, reading, meaning]) => ({ word, reading, meaning })),
        sentence: { japanese: curated.at(-1)[0], reading: curated.at(-1)[1], translation: curated.at(-1)[2], translationLabel: "해석" }
      }
    }

    const words = []
    for (const reading of item.kun) {
      const word = readingWord(item, reading)
      if (word && !words.some((entry) => entry.word === word.word && entry.reading === word.reading)) words.push(word)
      if (words.length === 2) break
    }
    const context = CONTEXT_EXAMPLES[item.char]
    const passage = context ? CONTEXT_PASSAGES[context.passage] : null
    if (context?.word?.includes(item.char) && !context.word.includes("〜")) {
      words.unshift({ word: context.word, reading: context.reading, meaning: context.meaning || item.hun })
    }
    if (!words.length) words.push({ word: item.char, reading: item.on[0] || "독음 없음", meaning: item.hun })
    const uniqueWords = words.filter((word, index, list) => index === list.findIndex((entry) => entry.word === word.word && entry.reading === word.reading)).slice(0, 3)
    if (passage) {
      return {
        words: uniqueWords,
        sentence: {
          japanese: passage.japanese,
          furigana: passage.furigana,
          translation: passage.translation,
          translationLabel: "한국어 해석"
        }
      }
    }

    if (Array.isArray(curated) && curated.length >= 3) {
      return {
        words: curated.slice(0, -1).map(([word, reading, meaning]) => ({ word, reading, meaning })),
        sentence: { japanese: curated.at(-1)[0], reading: curated.at(-1)[1], translation: curated.at(-1)[2], translationLabel: "해석" }
      }
    }

    const target = uniqueWords[0]
    return {
      words: uniqueWords,
      sentence: fallbackContextSentence(item, target)
    }
  }

  function readingDetailTemplate(item, type) {
    const isOn = type === "on"
    const detail = item[`${type}Detail`]
    const label = isOn ? "3. 音読み · 음독 상세" : "4. 訓読み · 훈독 상세"
    const paragraphs = (detail?.paragraphs || []).map((paragraph) => `<p class="reading-guide">${escapeHtml(paragraph)}</p>`).join("")
    const entries = (detail?.entries || []).map(readingEntryTemplate).join("")
    return `<article class="info-card reading-detail-card ${isOn ? "on-reading" : "kun-reading"}">
      <div class="info-label"><span>${label}</span></div>
      ${paragraphs}
      ${entries ? `<div class="reading-entry-list">${entries}</div>` : `<p class="no-reading">정식 ${isOn ? "음독" : "훈독"} 상세가 없습니다.</p>`}
    </article>`
  }

  function countStats(items = ITEMS) {
    let studied = 0
    let mastered = 0
    let due = 0
    for (const item of items) {
      const p = progressOf(item.id)
      if (p.seen > 0) studied++
      if (p.mastery >= 4) mastered++
      if (p.seen > 0 && p.mastery < 4 && p.nextReview <= Date.now()) due++
    }
    return { studied, mastered, due }
  }

  function homeTemplate() {
    const totals = countStats()
    const next = ITEMS.find((item) => progressOf(item.id).seen === 0) || ITEMS.find((item) => progressOf(item.id).mastery < 4) || ITEMS[0]
    const lastLevel = store.diagnostic?.estimated || "미측정"
    return `
      <section class="hero">
        <p class="eyebrow">DAILY KANJI</p>
        <h1>하루 10자씩,<br>상용한자 끝내기</h1>
        <p>2,136자 전체를 JLPT 순서로 학습하고, 시험 결과로 현재 수준을 바로 확인하세요.</p>
        <div class="hero-actions">
          <button class="btn primary" data-detail="${next.id}">#${next.id} ${next.char} 이어서 학습</button>
          <button class="btn light" data-action="diagnostic">수준진단</button>
        </div>
      </section>

      <div class="summary-grid">
        <div class="summary-card"><strong>${totals.studied}</strong><span>학습한 한자</span></div>
        <div class="summary-card"><strong>${totals.mastered}</strong><span>숙달한 한자</span></div>
        <div class="summary-card"><strong>${lastLevel}</strong><span>진단 수준</span></div>
      </div>

      <section class="section">
        <div class="section-head"><h2>JLPT별 진도</h2><button class="text-button" data-nav="learn">전체 보기</button></div>
        <div class="level-list">
          ${LEVELS.map((level) => {
            const items = ITEMS.filter((item) => item.level === level)
            const stats = countStats(items)
            const percent = Math.round(stats.mastered / items.length * 100)
            return `<button class="level-card" data-level-link="${level}">
              <span class="level-badge ${levelClass(level)}">${level}</span>
              <span><h3>${LEVEL_NAMES[level]} · ${items.length}자</h3><span class="progress-track"><span style="width:${percent}%"></span></span><small>${stats.mastered}자 숙달</small></span>
              <strong>${percent}%</strong>
            </button>`
          }).join("")}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>오늘 복습</h2><span class="subtext">${totals.due}자 대기</span></div>
        ${totals.due ? `<button class="btn primary full" data-action="review">복습 시험 시작</button>` : '<div class="empty">지금 복습할 한자가 없습니다.<br>새 한자를 학습해 보세요.</div>'}
      </section>`
  }

  function filteredItems() {
    const query = state.query.trim().toLowerCase()
    return ITEMS.filter((item) => {
      if (state.level !== "ALL" && item.level !== state.level) return false
      const p = progressOf(item.id)
      if (state.status === "NEW" && p.seen > 0) return false
      if (state.status === "LEARNING" && !(p.seen > 0 && p.mastery < 4)) return false
      if (state.status === "MASTERED" && p.mastery < 4) return false
      if (state.status === "FAVORITE" && !store.favorites.includes(item.id)) return false
      if (!query) return true
      return [item.char, item.hun, item.siteMeaning, item.on.join(" "), item.kun.join(" "), item.meanings.join(" "), String(item.id)]
        .some((value) => value.toLowerCase().includes(query))
    })
  }

  function kanjiCard(item) {
    const p = progressOf(item.id)
    const dot = p.mastery >= 4 ? "mastered" : p.seen > 0 ? "learned" : ""
    const reading = state.showListReadings
      ? `<h3>#${item.id} ${escapeHtml(item.hun)}</h3><p>${escapeHtml(item.on.join(" · ") || item.kun.join(" · ") || "독음 없음")}</p>`
      : `<h3 class="reading-mask">#${item.id}</h3>`
    return `<button class="kanji-card ${state.showListReadings ? "" : "is-reading-hidden"}" data-detail="${item.id}">
      <span class="master-dot ${dot}"></span>
      <span class="kanji-glyph">${item.char}</span>
      <span>${reading}</span>
    </button>`
  }

  function learnResultsTemplate(items) {
    const visible = items.slice(0, state.listLimit)
    return `<div class="list-toolbar">
        <p class="result-count">${items.length.toLocaleString()}자 중 ${visible.length.toLocaleString()}자 표시</p>
        <button class="reading-toggle" data-action="toggleListReadings" aria-pressed="${state.showListReadings}">${state.showListReadings ? "한자명·음독 가리기" : "한자명·음독 보기"}</button>
      </div>
      ${visible.length ? `<div class="kanji-grid">${visible.map(kanjiCard).join("")}</div>` : '<div class="empty">검색 조건에 맞는 한자가 없습니다.</div>'}
      ${visible.length < items.length ? `<button class="btn ghost full load-more" data-action="loadMore">100자 더 보기</button>` : ""}`
  }

  function refreshLearnResults() {
    const results = document.getElementById("learnResults")
    if (results) results.innerHTML = learnResultsTemplate(filteredItems())
  }

  function learnTemplate() {
    const items = filteredItems()
    return `
      <div class="page-head">
        <p class="eyebrow">KANJI LIBRARY</p>
        <h1>2,136자 학습</h1>
        <p class="subtext">한자·한국 훈음·음독·훈독으로 검색할 수 있습니다.</p>
      </div>
      <form class="search-box" id="searchForm" role="search">
        <input id="searchInput" value="${escapeHtml(state.query)}" placeholder="예: 日, 날 일, ニチ" autocomplete="off" inputmode="search" aria-label="한자 검색">
        <button type="submit" class="search-submit" aria-label="검색">⌕</button>
        <button type="button" class="search-clear" data-action="clearSearch" aria-label="검색어 지우기">×</button>
      </form>
      <div class="chip-row" data-chip-group="level">
        ${["ALL", ...LEVELS].map((level) => `<button class="chip ${state.level === level ? "is-active" : ""}" data-level="${level}">${level === "ALL" ? "전체" : level}</button>`).join("")}
      </div>
      <div class="chip-row" data-chip-group="status">
        ${[["ALL","전체"],["NEW","미학습"],["LEARNING","학습 중"],["MASTERED","숙달"],["FAVORITE","즐겨찾기"]].map(([value,label]) => `<button class="chip ${state.status === value ? "is-active" : ""}" data-status="${value}">${label}</button>`).join("")}
      </div>
      <div id="learnResults">${learnResultsTemplate(items)}</div>
    `
  }

  function componentLabel(part, item, radical) {
    if (part === radical) {
      const info = radicalInfo(part, item.radical)
      return info ? `${info.name} · ${info.strokes}획` : `부수 ${item.radical}번`
    }
    return linkedPartItem(part)?.hun || radicalInfo(part)?.name || "구성 요소"
  }

  function detailTemplate() {
    const item = BY_ID.get(Number(state.detailId)) || ITEMS[0]
    const p = progressOf(item.id)
    const favorite = store.favorites.includes(item.id)
    const content = studyContent(item)
    const radical = radicalPart(item)
    const radicalData = radicalInfo(radical, item.radical)
    const onReadings = item.on.length ? item.on.join(" · ") : "정식 음독 없음"
    const kunReadings = item.kun.length ? item.kun.join(" · ") : "정식 훈독 없음"
    return `
      <div class="back-row">
        <button class="icon-button" data-action="back" aria-label="뒤로">‹</button>
        <button class="icon-button favorite-button ${favorite ? "is-active" : ""}" data-action="favorite" data-id="${item.id}" aria-label="즐겨찾기">${favorite ? "★" : "☆"}</button>
      </div>
      <section class="detail-hero">
        <div class="detail-glyph">${item.char}</div>
        <div class="detail-meta">
          <p class="eyebrow">#${item.id} · ${item.level}</p>
          <h1>${escapeHtml(item.hun)}</h1>
          <p>${item.strokes}획 · ${radical ? `부수 ${escapeHtml(radical)} ${item.radical}번${radicalData ? ` · ${escapeHtml(radicalData.name)}` : ""}` : `부수 번호 ${item.radical ?? "-"}`}${item.freq ? ` · 빈도 ${item.freq}위` : ""}</p>
          <div class="pill-line"><span class="soft-pill">숙달 ${p.mastery}/5</span>${item.grade ? `<span class="soft-pill">일본 학년 ${item.grade}</span>` : ""}</div>
        </div>
      </section>
      <div class="info-stack">
        <article class="info-card"><div class="info-label"><span>1. 기본 정보 · 대표 뜻</span></div><p class="info-value">${escapeHtml(koreanMeaning(item))}</p><div class="basic-readings"><p><strong>음독 :</strong> ${escapeHtml(onReadings)}</p><p><strong>훈독 :</strong> ${escapeHtml(kunReadings)}</p></div></article>
        <article class="info-card explanation-card">
          <div class="info-label"><span>2. 한자 모양 해설</span><a class="source-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">원문 보기 ↗</a></div>
          <div class="explanation-text">${(item.explanation.length ? item.explanation : [kanjiExplanation(item)]).map((paragraph) => `<p>${explanationHtml(item, paragraph)}</p>`).join("")}</div>
        </article>
        ${readingDetailTemplate(item, "on")}
        ${readingDetailTemplate(item, "kun")}
      </div>
      <section class="study-section">
        <div class="section-head"><h2>예문 · 해석</h2></div>
        <article class="sentence-card">
          <p class="sentence-japanese">${sentenceHtml(content.sentence)}</p>
          <div class="translation"><span>${escapeHtml(content.sentence.translationLabel || "해석")}</span><p>${escapeHtml(content.sentence.translation)}</p></div>
        </article>
      </section>
      <div class="detail-actions">
        <button class="btn outline" data-rate="wrong" data-id="${item.id}">다시 볼래요</button>
        <button class="btn primary" data-rate="correct" data-id="${item.id}">알고 있어요</button>
      </div>
      <div class="pager">
        <button class="btn ghost" data-detail="${Math.max(1, item.id - 1)}" ${item.id === 1 ? "disabled" : ""}>이전 한자</button>
        <button class="btn ghost" data-detail="${Math.min(2136, item.id + 1)}" ${item.id === 2136 ? "disabled" : ""}>다음 한자</button>
      </div>
      <p class="subtext" style="margin-top:14px;text-align:center">한국 훈음·대표 뜻·한자 모양 해설 출처: 일본어 한자 공부방 · 개인 학습용 저장 · 재배포 금지</p>
    `
  }

  function quizSetupTemplate() {
    return `
      <div class="page-head">
        <p class="eyebrow">QUIZ & DIAGNOSIS</p>
        <h1>시험으로 확인</h1>
        <p class="subtext">훈음·음독·훈독을 섞어 출제하고 결과를 학습 진도에 반영합니다.</p>
      </div>
      <div class="mode-grid">
        <button class="mode-card ${state.quizMode === "practice" ? "is-active" : ""}" data-mode="practice"><span class="mode-icon">✎</span><h3>연습 시험</h3><p>급수와 문항 수를 직접 선택합니다.</p></button>
        <button class="mode-card ${state.quizMode === "diagnostic" ? "is-active" : ""}" data-mode="diagnostic"><span class="mode-icon">◎</span><h3>수준진단</h3><p>N5~N1을 고르게 풀고 예상 수준을 봅니다.</p></button>
      </div>
      ${state.quizMode === "practice" ? `
        <div class="form-card">
          <div class="field"><span class="field-label">JLPT 급수</span><div class="select-row">${LEVELS.map((level) => `<button class="select-chip ${state.quizLevel === level ? "is-active" : ""}" data-quiz-level="${level}">${level}</button>`).join("")}</div></div>
          <div class="field"><span class="field-label">문항 수</span><div class="select-row">${[10,20,30,50].map((count) => `<button class="select-chip ${state.quizCount === count ? "is-active" : ""}" data-quiz-count="${count}">${count}문항</button>`).join("")}</div></div>
          <button class="btn primary full" data-action="startQuiz">시험 시작</button>
        </div>` : `
        <div class="form-card">
          <div class="diagnostic-note"><strong>25문항 · 약 5분</strong><br>N5부터 N1까지 각 5문항을 출제합니다. 급수별 정답률과 하위 급수 안정성을 함께 계산해 예상 수준을 냅니다.</div>
          <button class="btn primary full" style="margin-top:14px" data-action="startDiagnostic">진단 시작</button>
        </div>`}
      <section class="section">
        <div class="section-head"><h2>빠른 복습</h2></div>
        <div class="mode-grid">
          <button class="mode-card" data-action="review"><span class="mode-icon">↻</span><h3>복습 대기</h3><p>오늘 다시 볼 한자를 우선 출제합니다.</p></button>
          <button class="mode-card" data-action="mistakes"><span class="mode-icon">!</span><h3>오답 집중</h3><p>틀린 횟수가 많은 한자를 출제합니다.</p></button>
        </div>
      </section>`
  }

  function optionValue(item, type) {
    if (type === "meaning") return item.hun
    if (type === "on") return item.on.join(" · ")
    if (type === "kun") return item.kun.join(" · ")
    if (type === "kanji") return item.char
    return String(item.strokes)
  }

  function availableTypes(item) {
    const types = ["meaning", "kanji", "strokes"]
    if (item.on.length) types.push("on")
    if (item.kun.length) types.push("kun")
    return types
  }

  function makeQuestion(item, pool) {
    let type = shuffle(availableTypes(item))[0]
    const correct = optionValue(item, type)
    let candidates = shuffle(pool.filter((other) => other.id !== item.id && optionValue(other, type) && optionValue(other, type) !== correct))
    const values = []
    for (const candidate of candidates) {
      const value = optionValue(candidate, type)
      if (!values.includes(value)) values.push(value)
      if (values.length === 3) break
    }
    if (values.length < 3) {
      type = "meaning"
      values.length = 0
      for (const candidate of shuffle(pool.filter((other) => other.id !== item.id))) {
        if (candidate.hun !== item.hun && !values.includes(candidate.hun)) values.push(candidate.hun)
        if (values.length === 3) break
      }
    }
    return { item, type, correct: optionValue(item, type), options: shuffle([optionValue(item, type), ...values]) }
  }

  function selectEvenly(pool, count) {
    const shuffled = shuffle(pool)
    return shuffled.slice(0, Math.min(count, shuffled.length))
  }

  function startQuiz(mode, customPool) {
    let selected
    if (mode === "diagnostic") {
      selected = LEVELS.flatMap((level) => selectEvenly(ITEMS.filter((item) => item.level === level), 5))
      selected = shuffle(selected)
    } else {
      if (Array.isArray(customPool) && customPool.length === 0) {
        toast(mode === "mistakes" ? "아직 오답 기록이 없습니다." : "지금 복습할 한자가 없습니다.")
        return
      }
      const pool = Array.isArray(customPool) ? customPool : ITEMS.filter((item) => item.level === state.quizLevel)
      selected = selectEvenly(pool, Math.min(state.quizCount, pool.length))
    }
    if (!selected.length) {
      toast("출제할 한자가 없습니다.")
      return
    }
    const questions = selected.map((item) => makeQuestion(item, ITEMS.filter((candidate) => candidate.level === item.level)))
    state.quiz = { mode, questions, index: 0, answers: [], locked: false, selected: null }
    navigate("quizRun")
  }

  function questionTypeLabel(type) {
    return { meaning: "한국 훈음", on: "음독", kun: "훈독", kanji: "한자 찾기", strokes: "획수" }[type]
  }

  function questionPrompt(question) {
    return {
      meaning: "이 한자의 한국 훈음은?",
      on: "이 한자의 음독으로 맞는 것은?",
      kun: "이 한자의 훈독으로 맞는 것은?",
      kanji: `‘${escapeHtml(question.item.hun)}’에 해당하는 한자는?`,
      strokes: "이 한자의 총 획수는?"
    }[question.type]
  }

  function quizRunTemplate() {
    const quiz = state.quiz
    if (!quiz) return quizSetupTemplate()
    const q = quiz.questions[quiz.index]
    const percent = Math.round((quiz.index + (quiz.locked ? 1 : 0)) / quiz.questions.length * 100)
    const wordQuestion = q.type === "kanji"
    return `
      <div class="quiz-top"><button class="icon-button" data-action="quitQuiz">×</button><span class="progress-track"><span style="width:${percent}%"></span></span><strong>${quiz.index + 1}/${quiz.questions.length}</strong></div>
      <section class="question-card">
        <p class="eyebrow">${q.item.level} · ${questionTypeLabel(q.type)}</p>
        ${wordQuestion ? `<div class="question-word">${questionPrompt(q)}</div>` : `<div class="question-glyph">${q.item.char}</div><p class="question-prompt">${questionPrompt(q)}</p>`}
      </section>
      <div class="answer-list">
        ${q.options.map((option, index) => {
          let cls = ""
          if (quiz.locked) {
            if (option === q.correct) cls = "correct"
            else if (index === quiz.selected) cls = "wrong"
            else cls = "dim"
          }
          return `<button class="answer ${cls}" data-answer="${index}" ${quiz.locked ? "disabled" : ""}>${escapeHtml(option)}${q.type === "strokes" ? "획" : ""}</button>`
        }).join("")}
      </div>
      ${quiz.locked ? `<div class="feedback"><strong>${quiz.answers.at(-1).correct ? "정답입니다" : "오답입니다"}</strong><p>${q.item.char} · ${escapeHtml(q.item.hun)}<br>음독 ${escapeHtml(q.item.on.join(" · ") || "없음")} / 훈독 ${escapeHtml(q.item.kun.join(" · ") || "없음")}</p></div><button class="btn primary full" style="margin-top:12px" data-action="nextQuestion">${quiz.index + 1 === quiz.questions.length ? "결과 보기" : "다음 문제"}</button>` : ""}
    `
  }

  function answerQuestion(index) {
    const quiz = state.quiz
    if (!quiz || quiz.locked) return
    const q = quiz.questions[quiz.index]
    const selected = q.options[index]
    const correct = selected === q.correct
    quiz.locked = true
    quiz.selected = index
    quiz.answers.push({ id: q.item.id, level: q.item.level, type: q.type, correct, selected, answer: q.correct })
    updateProgress(q.item.id, correct)
    render()
  }

  function finishQuiz() {
    const quiz = state.quiz
    const correct = quiz.answers.filter((answer) => answer.correct).length
    const session = { id: Date.now(), date: Date.now(), mode: quiz.mode, total: quiz.answers.length, correct, answers: quiz.answers }
    store.sessions.unshift(session)
    store.sessions = store.sessions.slice(0, 50)
    if (quiz.mode === "diagnostic") {
      const diagnosis = estimateLevel(quiz.answers)
      store.diagnostic = Object.assign({ date: Date.now() }, diagnosis)
    }
    saveStore()
    navigate("result", { result: session })
  }

  function estimateLevel(answers) {
    const rates = {}
    for (const level of LEVELS) {
      const group = answers.filter((answer) => answer.level === level)
      rates[level] = group.length ? Math.round(group.filter((answer) => answer.correct).length / group.length * 100) : 0
    }
    let estimated = "입문"
    for (let i = 0; i < LEVELS.length; i++) {
      const level = LEVELS[i]
      const lowerAverage = LEVELS.slice(0, i + 1).reduce((sum, key) => sum + rates[key], 0) / (i + 1)
      if (rates[level] >= 60 && lowerAverage >= 65) estimated = level
    }
    return { estimated, rates }
  }

  function resultTemplate() {
    const result = state.result || store.sessions[0]
    if (!result) return quizSetupTemplate()
    const score = Math.round(result.correct / result.total * 100)
    const diagnosis = result.mode === "diagnostic" ? estimateLevel(result.answers) : null
    const byLevel = LEVELS.map((level) => {
      const group = result.answers.filter((answer) => answer.level === level)
      return { level, total: group.length, correct: group.filter((answer) => answer.correct).length }
    }).filter((row) => row.total)
    return `
      <section class="result-hero">
        <div class="score-ring"><span><strong>${score}%</strong><small>${result.correct}/${result.total} 정답</small></span></div>
        ${diagnosis ? `<p class="eyebrow">예상 JLPT 한자 수준</p><div class="result-level">${diagnosis.estimated}</div><p>${diagnosis.estimated === "입문" ? "N5 기초 한자부터 차근차근 시작하세요." : `${diagnosis.estimated} 학습 범위에서 안정적인 정답률을 보였습니다.`}<br>공식 JLPT 성적을 대신하지 않는 학습용 추정치입니다.</p>` : `<h2>${score >= 80 ? "탄탄합니다" : score >= 60 ? "조금만 더" : "복습이 필요해요"}</h2><p>틀린 한자는 자동으로 오답 복습에 등록했습니다.</p>`}
      </section>
      <section class="section">
        <div class="section-head"><h2>급수별 결과</h2></div>
        <div class="breakdown">${byLevel.map((row) => {
          const rate = Math.round(row.correct / row.total * 100)
          return `<div class="breakdown-row"><span>${row.level}</span><span class="progress-track"><span style="width:${rate}%"></span></span><strong>${rate}%</strong></div>`
        }).join("")}</div>
      </section>
      <div class="detail-actions" style="margin-top:20px"><button class="btn ghost" data-nav="stats">통계 보기</button><button class="btn primary" data-nav="quiz">다시 풀기</button></div>
    `
  }

  function statsTemplate() {
    const totals = countStats()
    const weak = ITEMS
      .map((item) => ({ item, p: progressOf(item.id) }))
      .filter(({ p }) => p.wrong > 0)
      .sort((a, b) => (b.p.wrong - b.p.correct) - (a.p.wrong - a.p.correct) || b.p.wrong - a.p.wrong)
      .slice(0, 12)
    return `
      <div class="page-head"><p class="eyebrow">MY PROGRESS</p><h1>학습 통계</h1><p class="subtext">기록은 이 기기에만 안전하게 저장됩니다.</p></div>
      <div class="stat-hero"><div class="stat-big"><strong>${totals.mastered}</strong><span>숙달한 한자</span></div><div class="stat-big"><strong>${store.streak.current || 0}일</strong><span>연속 학습 · 최고 ${store.streak.best || 0}일</span></div></div>
      <section class="section">
        <div class="section-head"><h2>레벨별 숙달</h2></div>
        <div class="breakdown">${LEVELS.map((level) => {
          const items = ITEMS.filter((item) => item.level === level)
          const mastered = countStats(items).mastered
          const rate = Math.round(mastered / items.length * 100)
          return `<div class="breakdown-row"><span>${level}</span><span class="progress-track"><span style="width:${rate}%"></span></span><strong>${mastered}</strong></div>`
        }).join("")}</div>
      </section>
      <section class="section">
        <div class="section-head"><h2>취약 한자</h2>${weak.length ? '<button class="text-button" data-action="mistakes">집중 시험</button>' : ""}</div>
        ${weak.length ? `<div class="weak-list">${weak.map(({ item }) => `<button class="weak-kanji" data-detail="${item.id}">${item.char}</button>`).join("")}</div>` : '<div class="empty">아직 오답 기록이 없습니다.</div>'}
      </section>
      <section class="section">
        <div class="section-head"><h2>최근 시험</h2></div>
        ${store.sessions.length ? `<div class="session-list">${store.sessions.slice(0, 8).map((session) => `<div class="session-item"><span><h3>${session.mode === "diagnostic" ? "JLPT 수준진단" : "연습 시험"}</h3><p>${new Date(session.date).toLocaleDateString("ko-KR")} · ${session.total}문항</p></span><strong>${Math.round(session.correct / session.total * 100)}%</strong></div>`).join("")}</div>` : '<div class="empty">시험을 풀면 결과가 여기에 쌓입니다.</div>'}
      </section>
      <section class="section">
        <div class="section-head"><h2>데이터 안내</h2></div>
        <div class="info-card"><p class="subtext">상용한자 범위와 JLPT 학습 순서는 일본어 한자 공부방의 공개 일람을 참고했습니다. 상세 독음·획수·부수는 KANJIDIC2, 구성 요소는 KanjiVG, 한국 훈음은 HanjaDict를 사용했습니다. 사이트 고유 해설과 예문은 포함하지 않았습니다.</p></div>
        <button class="btn danger full" style="margin-top:12px" data-action="reset">학습 기록 초기화</button>
      </section>`
  }

  function render() {
    const app = document.getElementById("app")
    const templates = {
      home: homeTemplate,
      learn: learnTemplate,
      detail: detailTemplate,
      quiz: quizSetupTemplate,
      quizRun: quizRunTemplate,
      result: resultTemplate,
      stats: statsTemplate
    }
    app.innerHTML = (templates[state.route] || homeTemplate)()
    updateStreakBadge()
    const search = document.getElementById("searchInput")
    if (search) {
      search.addEventListener("compositionstart", () => { search.dataset.composing = "true" })
      search.addEventListener("compositionend", (event) => {
        delete search.dataset.composing
        state.query = event.target.value
        state.listLimit = 100
        refreshLearnResults()
      })
      search.addEventListener("input", (event) => {
        state.query = event.target.value
        state.listLimit = 100
        if (event.isComposing || search.dataset.composing === "true") return
        refreshLearnResults()
      })
    }
    const searchForm = document.getElementById("searchForm")
    searchForm?.addEventListener("submit", (event) => {
      event.preventDefault()
      const value = search.value.trim()
      const exact = BY_CHAR.get(value)
      if (exact) navigate("detail", { detailId: exact.id })
      else refreshLearnResults()
    })
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button")
    if (!target) return
    if (target.dataset.nav) navigate(target.dataset.nav)
    if (target.dataset.detail) navigate("detail", { detailId: Number(target.dataset.detail) })
    if (target.dataset.part) {
      state.partDetail = target.dataset.part
      render()
      document.getElementById("partDetailCard")?.scrollIntoView?.({ behavior: "smooth", block: "center" })
    }
    if (target.dataset.levelLink) {
      state.level = target.dataset.levelLink
      state.status = "ALL"
      state.listLimit = 100
      navigate("learn")
    }
    if (target.dataset.level) {
      state.level = target.dataset.level
      state.listLimit = 100
      render()
    }
    if (target.dataset.status) {
      state.status = target.dataset.status
      state.listLimit = 100
      render()
    }
    if (target.dataset.mode) {
      state.quizMode = target.dataset.mode
      render()
    }
    if (target.dataset.quizLevel) {
      state.quizLevel = target.dataset.quizLevel
      render()
    }
    if (target.dataset.quizCount) {
      state.quizCount = Number(target.dataset.quizCount)
      render()
    }
    if (target.dataset.answer) answerQuestion(Number(target.dataset.answer))
    if (target.dataset.rate) {
      updateProgress(Number(target.dataset.id), target.dataset.rate === "correct")
      toast(target.dataset.rate === "correct" ? "학습 기록에 반영했습니다." : "복습 목록에 추가했습니다.")
      render()
    }
    const action = target.dataset.action
    if (!action) return
    if (action === "diagnostic") {
      state.quizMode = "diagnostic"
      navigate("quiz")
    }
    if (action === "startQuiz") startQuiz("practice")
    if (action === "startDiagnostic") startQuiz("diagnostic")
    if (action === "loadMore") { state.listLimit += 100; render() }
    if (action === "clearSearch") {
      state.query = ""
      state.listLimit = 100
      const input = document.getElementById("searchInput")
      if (input) input.value = ""
      refreshLearnResults()
      input?.focus()
    }
    if (action === "toggleListReadings") {
      state.showListReadings = !state.showListReadings
      store.preferences = { ...store.preferences, showListReadings: state.showListReadings }
      saveStore()
      render()
    }
    if (action === "closePart") {
      state.partDetail = null
      render()
    }
    if (action === "favorite") {
      const id = Number(target.dataset.id)
      store.favorites = store.favorites.includes(id) ? store.favorites.filter((value) => value !== id) : [...store.favorites, id]
      saveStore(); render()
    }
    if (action === "back") navigate(state.previousRoute || "learn")
    if (action === "nextQuestion") {
      if (state.quiz.index + 1 >= state.quiz.questions.length) finishQuiz()
      else { state.quiz.index += 1; state.quiz.locked = false; state.quiz.selected = null; render(); window.scrollTo(0, 0) }
    }
    if (action === "quitQuiz") {
      state.quiz = null
      navigate("quiz")
    }
    if (action === "review") {
      const pool = ITEMS.filter((item) => {
        const p = progressOf(item.id)
        return p.seen > 0 && p.mastery < 4 && p.nextReview <= Date.now()
      })
      state.quizCount = Math.min(20, pool.length || 20)
      startQuiz("review", pool)
    }
    if (action === "mistakes") {
      const pool = ITEMS.filter((item) => progressOf(item.id).wrong > 0).sort((a, b) => progressOf(b.id).wrong - progressOf(a.id).wrong)
      state.quizCount = Math.min(20, pool.length || 20)
      startQuiz("mistakes", pool)
    }
    if (action === "reset") {
      if (confirm("학습 기록과 시험 결과를 모두 초기화할까요?")) {
        store = emptyStore(); state.showListReadings = true; saveStore(); toast("학습 기록을 초기화했습니다."); render()
      }
    }
  })

  window.addEventListener("popstate", () => {
    const parts = location.hash.replace(/^#/, "").split("/")
    const route = parts[0] || "home"
    state.route = route
    if (route === "detail") state.detailId = Number(parts[1]) || state.detailId || 1
    if (route !== "detail") state.partDetail = null
    activeNav(route)
    render()
    window.scrollTo(0, 0)
  })

  history.replaceState({ route: "home" }, "", "#home")
  activeNav("home")
  updateStreakBadge()
  render()
})()
