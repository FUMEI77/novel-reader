import { useState, useEffect, useRef } from "react";

const VERSION = "v1.4.0";
const CHANGELOG = [
  { version: "v1.4.0", date: "2026-05", notes: ["修正繁體中文（Big5）亂碼問題", "長按書籍可重新命名或刪除", "底部進度條避開 Home Bar", "修正左右留白不對稱", "閱讀背景跟隨主題色"] },
  { version: "v1.3.0", date: "2026-05", notes: ["自動偵測簡體中文並轉換為繁體", "底部改為閱讀進度顯示", "書庫右上角版本紀錄"] },
  { version: "v1.2.0", date: "2026-05", notes: ["修正簡體中文亂碼（GBK編碼支援）", "新增手勢自訂設定", "介面改為淡藍色系", "加強禁止頁面縮放"] },
  { version: "v1.1.0", date: "2026-05", notes: ["支援大檔案上傳不卡頓", "書庫三種顯示模式", "書籍重開後不消失", "點書進入速度提升"] },
  { version: "v1.0.0", date: "2026-05", notes: ["基本閱讀功能", "書籤、章節跳轉", "夜間模式、字體調整", "語音朗讀"] },
];

const noZoomStyle = `
  html { touch-action: manipulation; }
  body { touch-action: manipulation; overflow: hidden; position: fixed; width: 100%; }
  * { -webkit-user-select: none; user-select: none; box-sizing: border-box; }
  input, textarea { -webkit-user-select: text; user-select: text; }
`;

const S2T_MAP = {"爱":"愛","罢":"罷","备":"備","贝":"貝","笔":"筆","毕":"畢","边":"邊","变":"變","标":"標","别":"別","补":"補","参":"參","产":"產","长":"長","场":"場","车":"車","称":"稱","齿":"齒","冲":"衝","虫":"蟲","处":"處","传":"傳","从":"從","错":"錯","达":"達","带":"帶","单":"單","导":"導","灯":"燈","点":"點","电":"電","东":"東","动":"動","断":"斷","队":"隊","对":"對","发":"發","飞":"飛","费":"費","风":"風","复":"復","盖":"蓋","干":"乾","刚":"剛","个":"個","给":"給","够":"夠","关":"關","观":"觀","广":"廣","过":"過","还":"還","汉":"漢","号":"號","后":"後","护":"護","话":"話","画":"畫","怀":"懷","换":"換","黄":"黃","会":"會","机":"機","极":"極","几":"幾","际":"際","继":"繼","价":"價","见":"見","将":"將","奖":"獎","节":"節","尽":"盡","经":"經","举":"舉","开":"開","块":"塊","来":"來","劳":"勞","乐":"樂","类":"類","离":"離","历":"歷","联":"聯","两":"兩","临":"臨","灵":"靈","龙":"龍","楼":"樓","乱":"亂","妈":"媽","买":"買","满":"滿","门":"門","灭":"滅","难":"難","内":"內","脑":"腦","鸟":"鳥","农":"農","强":"強","亲":"親","区":"區","热":"熱","认":"認","时":"時","实":"實","书":"書","树":"樹","说":"說","岁":"歲","台":"臺","态":"態","体":"體","听":"聽","头":"頭","团":"團","万":"萬","为":"為","问":"問","无":"無","务":"務","习":"習","现":"現","线":"線","乡":"鄉","响":"響","协":"協","写":"寫","寻":"尋","学":"學","选":"選","压":"壓","严":"嚴","样":"樣","业":"業","义":"義","应":"應","营":"營","拥":"擁","优":"優","鱼":"魚","语":"語","园":"園","远":"遠","运":"運","战":"戰","这":"這","证":"證","种":"種","众":"眾","转":"轉","装":"裝","状":"狀","资":"資","总":"總","组":"組"};
function s2t(text) { return text.split("").map(c => S2T_MAP[c] || c).join(""); }

function isSimplified(text) {
  const sample = text.slice(0, 3000);
  let simp = 0, total = 0;
  for (const c of sample) {
    const code = c.charCodeAt(0);
    if (code > 0x4E00 && code < 0x9FFF) {
      total++;
      if (S2T_MAP[c]) simp++;
    }
  }
  return total > 50 && simp / total > 0.12;
}

// ── 編碼偵測：UTF-8 → Big5 → GBK ──────────────────────────────
function decodeBuffer(ab) {
  const u8 = new Uint8Array(ab);
  // BOM
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF)
    return new TextDecoder("utf-8").decode(ab);
  // UTF-8 strict
  try {
    const t = new TextDecoder("utf-8", { fatal: true }).decode(ab);
    // 如果含明顯亂碼特徵才放棄
    if (!t.includes("�") && !t.includes("\uFFFD")) return t;
    throw new Error("bad utf8");
  } catch {}
  // Big5（繁體中文優先）
  try {
    const t = new TextDecoder("big5").decode(ab);
    // 驗證：Big5 結果不應有過多亂碼字
    const badCount = (t.match(/[□〾]/g) || []).length;
    if (badCount < 10) return t;
  } catch {}
  // GBK（簡體中文）
  try { return new TextDecoder("gbk").decode(ab); } catch {}
  return new TextDecoder("utf-8", { fatal: false }).decode(ab);
}

function parseFile(ab, name) {
  let text;
  if (name.toLowerCase().endsWith(".epub")) {
    text = new TextDecoder("utf-8", { fatal: false }).decode(ab);
    text = text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
  } else {
    text = decodeBuffer(ab);
  }
  if (isSimplified(text)) text = s2t(text);
  return text;
}

// ── IndexedDB ─────────────────────────────────────────────────
const DB_NAME = "NovelReaderDB2";
const STORE = "books";
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbGetAll() { const db = await openDB(); return new Promise((res,rej)=>{ const r=db.transaction(STORE,"readonly").objectStore(STORE).getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error); }); }
async function dbPut(b) { const db = await openDB(); return new Promise((res,rej)=>{ const r=db.transaction(STORE,"readwrite").objectStore(STORE).put(b); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }
async function dbDelete(id) { const db = await openDB(); return new Promise((res,rej)=>{ const r=db.transaction(STORE,"readwrite").objectStore(STORE).delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }

function detectChapters(content) {
  const lines = content.split("\n");
  const re = /^(第[零一二三四五六七八九十百千萬\d]+[章節回卷部篇][^\n]{0,20}|Chapter\s*\d+|CHAPTER\s*\d+|卷[零一二三四五六七八九十百千\d]+)/;
  const chapters = []; let cc = 0;
  lines.forEach((line, idx) => { const t = line.trim(); if (t && re.test(t)) chapters.push({ title: t, lineIndex: idx, charOffset: cc }); cc += line.length + 1; });
  if (!chapters.length || chapters[0].lineIndex > 0) chapters.unshift({ title: "開頭", lineIndex: 0, charOffset: 0 });
  return chapters;
}

const PAGE_SIZE = 3000;
function getPage(content, page) { return content.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE); }
function totalPages(content) { return Math.max(1, Math.ceil(content.length / PAGE_SIZE)); }

const SAMPLE = `第一章\n\n小時候，有一次我在一本描寫原始森林的書裡，看到了一幅精彩的插圖。那本書叫做《真實的故事》。那幅圖畫的是一條蟒蛇，正在吞食一頭猛獸。\n\n在書上說，蟒蛇把獵獲的動物不加咀嚼，整個地吞下去，然後就再也不能動彈了，就這樣沉睡六個月，等著消化吃進去的食物。\n\n第二章\n\n這樣，我只好選擇了另一個職業，學會了開飛機。世界各地差不多我都飛到過。\n\n第三章\n\n就這樣，我孤獨地生活著，沒有一個真正可以交心的人，直到六年前，在撒哈拉沙漠發生了飛機故障。`;
const SAMPLE_BOOK = { id: "sample1", title: "小王子（範例）", author: "聖-埃克蘇佩里", content: SAMPLE, progress: 0, page: 0, bookmarks: [], addedAt: Date.now() };

const FSZ = [14, 16, 18, 20, 22, 24, 28];
const CC = [["#5b8db8","#2d6a9f"],["#4a9b8e","#2d7a6e"],["#7b6eb0","#5a4d8f"],["#c4704a","#8b4a2e"],["#5a8a5a","#3a6a3a"]];
const DEFAULT_GESTURES = { nextPage: "tap_right", prevPage: "two_tap", brightness: "two_swipe" };

export default function App() {
  const [books, setBooks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [cur, setCur] = useState(null);
  const [view, setView] = useState("library");
  const [libMode, setLibMode] = useState("large");
  const [dark, setDark] = useState(false);
  const [fs, setFs] = useState(18);
  const [bright, setBright] = useState(1);
  const [sets, setSets] = useState(false);
  const [bms, setBms] = useState(false);
  const [chaps, setChaps] = useState(false);
  const [gestureSets, setGestureSets] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [page, setPage] = useState(0);
  const [tts, setTts] = useState(false);
  const [rate, setRate] = useState(1);
  const [bright_fb, setBrightFb] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [gestures, setGestures] = useState(DEFAULT_GESTURES);
  const [gestureHint, setGestureHint] = useState(null);
  // 長按選單
  const [ctxMenu, setCtxMenu] = useState(null); // { book }
  const [renameBook, setRenameBook] = useState(null); // { book }
  const [renameVal, setRenameVal] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { book }

  const rdr = useRef(null);
  const fir = useRef(null);
  const utt = useRef(null);
  const fbt = useRef(null);
  const ght = useRef(null);
  const longPressTimer = useRef(null);
  const touchRef = useRef({ startX: 0, startY: 0, fingers: 0, startB: 1, twoStartY: 0 });

  useEffect(() => {
    document.addEventListener("gesturestart", e => e.preventDefault(), { passive: false });
    document.addEventListener("gesturechange", e => e.preventDefault(), { passive: false });
    document.addEventListener("gestureend", e => e.preventDefault(), { passive: false });
    dbGetAll().then(saved => {
      if (!saved.length) { setBooks([SAMPLE_BOOK]); dbPut(SAMPLE_BOOK); }
      else setBooks(saved.sort((a, b) => b.addedAt - a.addedAt));
      setLoaded(true);
    }).catch(() => { setBooks([SAMPLE_BOOK]); setLoaded(true); });
  }, []);

  function showBF(v) { setBrightFb(Math.round(v * 100)); clearTimeout(fbt.current); fbt.current = setTimeout(() => setBrightFb(null), 1200); }
  function showHint(msg) { setGestureHint(msg); clearTimeout(ght.current); ght.current = setTimeout(() => setGestureHint(null), 800); }

  const chapters = cur ? detectChapters(cur.content) : [];
  const pages = cur ? totalPages(cur.content) : 1;

  // ── 閱讀器觸控 ────────────────────────────────────────────
  function onTouchStart(e) {
    const t = e.touches;
    touchRef.current.fingers = t.length;
    if (t.length === 1) { touchRef.current.startX = t[0].clientX; touchRef.current.startY = t[0].clientY; }
    if (t.length === 2) { const y = (t[0].clientY + t[1].clientY) / 2; touchRef.current.twoStartY = y; touchRef.current.startB = bright; }
  }
  function onTouchMove(e) {
    if (e.touches.length === 2 && gestures.brightness === "two_swipe") {
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const d = (touchRef.current.twoStartY - y) / 250;
      const nb = Math.min(1, Math.max(0.2, touchRef.current.startB + d));
      setBright(nb); showBF(nb); e.preventDefault();
    }
  }
  function onTouchEnd(e) {
    const { startX, startY, fingers } = touchRef.current;
    if (!e.changedTouches.length) return;
    const endX = e.changedTouches[0].clientX, endY = e.changedTouches[0].clientY;
    const dx = endX - startX, dy = endY - startY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    const W = window.innerWidth;
    if (view !== "reader") return;
    if (sets || bms || chaps || gestureSets || showInfo) return;
    if (fingers === 2 && absDx < 20 && absDy < 20) { if (gestures.prevPage === "two_tap") { goPage(page - 1); showHint("← 上一頁"); } return; }
    if (fingers !== 1) return;
    if (absDx > 40 && absDx > absDy) {
      if (dx < 0 && gestures.nextPage === "swipe_left") { goPage(page + 1); showHint("下一頁 →"); return; }
      if (dx > 0 && gestures.prevPage === "swipe_right") { goPage(page - 1); showHint("← 上一頁"); return; }
    }
    if (absDy > 40 && absDy > absDx) {
      if (dy < 0 && gestures.nextPage === "swipe_up") { goPage(page + 1); showHint("下一頁 →"); return; }
      if (dy > 0 && gestures.prevPage === "swipe_down") { goPage(page - 1); showHint("← 上一頁"); return; }
    }
    if (absDx < 15 && absDy < 15 && gestures.nextPage === "tap_right" && endX > W * 0.6) { goPage(page + 1); showHint("下一頁 →"); }
  }

  // ── 書庫長按 ──────────────────────────────────────────────
  function onBookLongPress(book) {
    setCtxMenu({ book });
  }
  function startLongPress(book) {
    longPressTimer.current = setTimeout(() => onBookLongPress(book), 600);
  }
  function cancelLongPress() { clearTimeout(longPressTimer.current); }

  function goPage(p) {
    const np = Math.max(0, Math.min(pages - 1, p));
    setPage(np);
    if (rdr.current) rdr.current.scrollTop = 0;
    if (cur) { const u = { ...cur, page: np, progress: np / Math.max(1, pages - 1) }; setCur(u); setBooks(prev => prev.map(b => b.id === cur.id ? u : b)); dbPut(u); }
  }
  function openBook(b) { setCur(b); setPage(b.page || 0); setView("reader"); setSets(false); setBms(false); setChaps(false); setGestureSets(false); stopTTS(); setTimeout(() => { if (rdr.current) rdr.current.scrollTop = 0; }, 60); }
  function addBM() { if (!cur) return; const bm = { id: Date.now(), page, label: `第 ${page + 1} 頁` }; const u = { ...cur, bookmarks: [...cur.bookmarks, bm] }; setCur(u); setBooks(p => p.map(b => b.id === cur.id ? u : b)); dbPut(u); }
  function delBM(id) { const u = { ...cur, bookmarks: cur.bookmarks.filter(x => x.id !== id) }; setCur(u); setBooks(p => p.map(b => b.id === cur.id ? u : b)); dbPut(u); }
  function jumpBM(bm) { goPage(bm.page); setBms(false); }
  function jumpCh(ch) { goPage(Math.floor(ch.charOffset / PAGE_SIZE)); setChaps(false); }

  function doDelete(id) { setBooks(p => p.filter(b => b.id !== id)); dbDelete(id); setDeleteConfirm(null); setCtxMenu(null); }
  function doRename() {
    if (!renameVal.trim()) return;
    const u = { ...renameBook.book, title: renameVal.trim() };
    setBooks(p => p.map(b => b.id === u.id ? u : b)); dbPut(u);
    setRenameBook(null); setRenameVal(""); setCtxMenu(null);
  }

  async function upload(e) {
    const f = e.target.files[0]; if (!f) return;
    setUploading(true);
    try {
      const ab = await f.arrayBuffer();
      const content = parseFile(ab, f.name);
      const book = { id: Date.now().toString(), title: f.name.replace(/\.(txt|epub)$/i, ""), author: "未知作者", content, progress: 0, page: 0, bookmarks: [], addedAt: Date.now() };
      await dbPut(book); setBooks(p => [book, ...p]);
    } catch { alert("上傳失敗，請確認檔案格式"); }
    setUploading(false); e.target.value = "";
  }

  function stopTTS() { window.speechSynthesis?.cancel(); setTts(false); }
  function startTTS() {
    if (!cur || !window.speechSynthesis) return; stopTTS();
    const u = new SpeechSynthesisUtterance(getPage(cur.content, page));
    u.lang = "zh-TW"; u.rate = rate; u.onend = () => setTts(false);
    utt.current = u; window.speechSynthesis.speak(u); setTts(true);
  }
  function toggleTTS() { tts ? stopTTS() : startTTS(); }
  useEffect(() => () => stopTTS(), []);

  // ── 顏色 ──────────────────────────────────────────────────
  const bg = dark ? "#0f1a24" : "#eef4f9";
  const sf = dark ? "#162030" : "#ffffff";
  const sf2 = dark ? "#1a2a3a" : "#f0f7ff";
  const tc = dark ? "#d0e4f0" : "#1a3a50";
  const mu = dark ? "#6a9ab8" : "#7aaac8";
  const ac = dark ? "#4a9fd4" : "#2e7fb8";
  const bd = dark ? "#243a50" : "#c8dfef";
  const hd = dark ? "#162030" : "#daeaf8";
  const ib = { background: "none", border: "none", cursor: "pointer", padding: "8px 10px", borderRadius: 8, fontSize: 14, color: tc };
  const pn = { position: "fixed", top: 0, right: 0, bottom: 0, width: 290, background: sf, borderLeft: `1px solid ${bd}`, zIndex: 100, display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,80,150,0.15)" };
  const ph = { padding: "18px 20px", borderBottom: `1px solid ${bd}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: "bold", fontSize: 16, color: tc };
  const pb = { flex: 1, overflowY: "auto", padding: 16 };
  const sl = { fontSize: 12, color: mu, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 };

  function Cover({ i, size }) {
    const [c1, c2] = CC[i % CC.length];
    const h = size === "large" ? 150 : size === "small" ? 85 : 44;
    return <div style={{ height: h, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${c1},${c2})`, flexShrink: 0 }}><span style={{ fontSize: size === "list" ? 22 : 34 }}>📖</span></div>;
  }
  function Toggle({ on, onToggle }) {
    return <div style={{ width: 40, height: 22, background: on ? ac : "#bbb", borderRadius: 11, position: "relative", cursor: "pointer", transition: "background 0.3s", flexShrink: 0 }} onClick={onToggle}>
      <div style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, background: "#fff", borderRadius: "50%", transition: "left 0.3s" }} />
    </div>;
  }
  function GestureOption({ label, value, current, onChange }) {
    const on = current === value;
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, marginBottom: 6, background: on ? ac : sf2, cursor: "pointer", border: `1px solid ${on ? ac : bd}` }} onClick={() => onChange(value)}>
      <span style={{ fontSize: 13, color: on ? "#fff" : tc }}>{label}</span>
      {on && <span style={{ color: "#fff" }}>✓</span>}
    </div>;
  }

  if (!loaded) return <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: tc, fontFamily: "Georgia,serif" }}><style>{noZoomStyle}</style><div style={{ textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 12 }}>📚</div><div>載入中...</div></div></div>;

  // ════════════════════════════════════════════
  // 書庫
  // ════════════════════════════════════════════
  if (view === "library") return (
    <div style={{ minHeight: "100vh", background: bg, color: tc, fontFamily: "Georgia,'Noto Serif TC',serif", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <style>{noZoomStyle}</style>
      <input ref={fir} type="file" accept=".txt,.epub" style={{ display: "none" }} onChange={upload} />

      {/* 上傳中 */}
      {uploading && <div style={{ position: "fixed", inset: 0, background: "rgba(0,40,80,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: sf, borderRadius: 18, padding: "32px 40px", textAlign: "center", color: tc }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 16, fontWeight: "bold" }}>正在解析檔案...</div>
          <div style={{ fontSize: 12, color: mu, marginTop: 8 }}>大檔案需要較長時間</div>
        </div>
      </div>}

      {/* 版本資訊 */}
      {showInfo && <>
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,30,60,0.4)", zIndex: 199 }} onClick={() => setShowInfo(false)} />
        <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "88%", maxWidth: 380, background: sf, borderRadius: 20, zIndex: 200, boxShadow: "0 8px 40px rgba(0,60,120,0.25)", overflow: "hidden" }}>
          <div style={{ background: ac, padding: "20px 24px", color: "#fff" }}>
            <div style={{ fontSize: 20, fontWeight: "bold" }}>📖 小說閱讀器</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>目前版本：{VERSION}</div>
          </div>
          <div style={{ padding: "16px 20px", maxHeight: 360, overflowY: "auto" }}>
            {CHANGELOG.map((log, i) => (
              <div key={i} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ background: i === 0 ? ac : sf2, color: i === 0 ? "#fff" : mu, fontSize: 12, fontWeight: "bold", padding: "3px 10px", borderRadius: 20, border: `1px solid ${i === 0 ? ac : bd}` }}>{log.version}</span>
                  <span style={{ fontSize: 11, color: mu }}>{log.date}</span>
                  {i === 0 && <span style={{ fontSize: 11, color: ac, fontWeight: "bold" }}>最新</span>}
                </div>
                {log.notes.map((n, j) => <div key={j} style={{ fontSize: 13, color: tc, padding: "4px 0 4px 12px", borderLeft: `2px solid ${i === 0 ? ac : bd}`, marginBottom: 4 }}>{n}</div>)}
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${bd}`, display: "flex", justifyContent: "center" }}>
            <button style={{ background: ac, color: "#fff", border: "none", borderRadius: 10, padding: "10px 32px", cursor: "pointer", fontSize: 14, fontWeight: "bold" }} onClick={() => setShowInfo(false)}>關閉</button>
          </div>
        </div>
      </>}

      {/* 長按選單 */}
      {ctxMenu && <>
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,30,60,0.35)", zIndex: 199 }} onClick={() => setCtxMenu(null)} />
        <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "80%", maxWidth: 320, background: sf, borderRadius: 18, zIndex: 200, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,60,120,0.2)" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${bd}`, fontWeight: "bold", fontSize: 15, color: tc, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📖 {ctxMenu.book.title}</div>
          <div style={{ padding: "8px 0" }}>
            <div style={{ padding: "14px 20px", cursor: "pointer", fontSize: 15, color: tc, display: "flex", alignItems: "center", gap: 12 }}
              onClick={() => { setRenameVal(ctxMenu.book.title); setRenameBook(ctxMenu); setCtxMenu(null); }}>
              ✏️ 重新命名
            </div>
            <div style={{ height: 1, background: bd, margin: "0 20px" }} />
            <div style={{ padding: "14px 20px", cursor: "pointer", fontSize: 15, color: "#e05555", display: "flex", alignItems: "center", gap: 12 }}
              onClick={() => { setDeleteConfirm(ctxMenu); setCtxMenu(null); }}>
              🗑️ 刪除書籍
            </div>
          </div>
          <div style={{ padding: "8px 20px 16px", display: "flex", justifyContent: "center" }}>
            <button style={{ background: "none", border: `1px solid ${bd}`, borderRadius: 10, padding: "8px 28px", cursor: "pointer", fontSize: 14, color: mu }} onClick={() => setCtxMenu(null)}>取消</button>
          </div>
        </div>
      </>}

      {/* 刪除確認 */}
      {deleteConfirm && <>
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,30,60,0.4)", zIndex: 199 }} onClick={() => setDeleteConfirm(null)} />
        <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "80%", maxWidth: 320, background: sf, borderRadius: 18, zIndex: 200, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,60,120,0.2)" }}>
          <div style={{ padding: "24px 20px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontWeight: "bold", fontSize: 16, color: tc, marginBottom: 8 }}>確定要刪除嗎？</div>
            <div style={{ fontSize: 13, color: mu }}>「{deleteConfirm.book.title}」</div>
            <div style={{ fontSize: 12, color: mu, marginTop: 4 }}>刪除後無法復原</div>
          </div>
          <div style={{ display: "flex", borderTop: `1px solid ${bd}` }}>
            <button style={{ flex: 1, padding: "14px", background: "none", border: "none", cursor: "pointer", fontSize: 15, color: mu, borderRight: `1px solid ${bd}` }} onClick={() => setDeleteConfirm(null)}>取消</button>
            <button style={{ flex: 1, padding: "14px", background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#e05555", fontWeight: "bold" }} onClick={() => doDelete(deleteConfirm.book.id)}>刪除</button>
          </div>
        </div>
      </>}

      {/* 重新命名 */}
      {renameBook && <>
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,30,60,0.4)", zIndex: 199 }} onClick={() => setRenameBook(null)} />
        <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "85%", maxWidth: 340, background: sf, borderRadius: 18, zIndex: 200, padding: "24px 20px", boxShadow: "0 8px 32px rgba(0,60,120,0.2)" }}>
          <div style={{ fontWeight: "bold", fontSize: 16, color: tc, marginBottom: 16 }}>✏️ 重新命名</div>
          <input value={renameVal} onChange={e => setRenameVal(e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${bd}`, fontSize: 15, color: tc, background: sf2, outline: "none" }} autoFocus onKeyDown={e => e.key === "Enter" && doRename()} />
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button style={{ flex: 1, padding: "12px", background: sf2, border: `1px solid ${bd}`, borderRadius: 10, cursor: "pointer", fontSize: 14, color: mu }} onClick={() => setRenameBook(null)}>取消</button>
            <button style={{ flex: 1, padding: "12px", background: ac, border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, color: "#fff", fontWeight: "bold" }} onClick={doRename}>確認</button>
          </div>
        </div>
      </>}

      {/* Header */}
      <div style={{ padding: "20px 16px 12px", borderBottom: `1px solid ${bd}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: hd }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: "bold", color: tc }}>我的書庫</div>
          <button style={{ ...ib, padding: "4px 6px", fontSize: 16, opacity: 0.7 }} onClick={() => setShowInfo(true)}>ℹ️</button>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button style={{ ...ib, fontSize: 17, opacity: libMode === "large" ? 1 : 0.4 }} onClick={() => setLibMode("large")}>⊞</button>
          <button style={{ ...ib, fontSize: 17, opacity: libMode === "small" ? 1 : 0.4 }} onClick={() => setLibMode("small")}>⊟</button>
          <button style={{ ...ib, fontSize: 17, opacity: libMode === "list" ? 1 : 0.4 }} onClick={() => setLibMode("list")}>☰</button>
          <button style={ib} onClick={() => setDark(d => !d)}>{dark ? "☀️" : "🌙"}</button>
          <button style={{ background: ac, color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: "bold" }} onClick={() => fir.current?.click()}>＋ 匯入</button>
        </div>
      </div>

      {books.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 24px", color: mu }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          <div style={{ fontSize: 18, color: tc, marginBottom: 8 }}>書庫是空的</div>
          <div style={{ fontSize: 14 }}>點擊「匯入」上傳 TXT 或 EPUB 檔案</div>
        </div>
      ) : libMode === "list" ? (
        <div style={{ padding: "8px 0" }}>
          {books.map((b, i) => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${bd}`, cursor: "pointer", background: sf }}
              onClick={() => openBook(b)}
              onTouchStart={() => startLongPress(b)}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}>
              <Cover i={i} size="list" />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 15, fontWeight: "bold", color: tc, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                <div style={{ fontSize: 12, color: mu }}>{b.author}</div>
                {b.progress > 0 && <div style={{ fontSize: 11, color: ac }}>已讀 {Math.round(b.progress * 100)}%</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: libMode === "large" ? "repeat(auto-fill,minmax(145px,1fr))" : "repeat(auto-fill,minmax(100px,1fr))", gap: libMode === "large" ? 14 : 10, padding: libMode === "large" ? 14 : 10 }}>
          {books.map((b, i) => (
            <div key={b.id} style={{ background: sf, borderRadius: 12, overflow: "hidden", cursor: "pointer", border: `1px solid ${bd}`, position: "relative" }}
              onClick={() => openBook(b)}
              onTouchStart={() => startLongPress(b)}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}>
              <Cover i={i} size={libMode} />
              <div style={{ height: 3, background: bd }}><div style={{ height: "100%", background: ac, width: `${(b.progress || 0) * 100}%` }} /></div>
              <div style={{ padding: libMode === "large" ? "10px 12px" : "6px 8px" }}>
                <div style={{ fontSize: libMode === "large" ? 13 : 11, fontWeight: "bold", color: tc, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{b.title}</div>
                {libMode === "large" && <div style={{ fontSize: 11, color: mu, marginTop: 2 }}>{b.author}</div>}
                {b.progress > 0 && <div style={{ fontSize: 10, color: ac, marginTop: 2 }}>已讀 {Math.round(b.progress * 100)}%</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: "12px 16px", textAlign: "center", fontSize: 12, color: mu }}>長按書籍可重新命名或刪除</div>
    </div>
  );

  // ════════════════════════════════════════════
  // 閱讀器
  // ════════════════════════════════════════════
  const pageText = cur ? getPage(cur.content, page) : "";
  const anyP = sets || bms || chaps || gestureSets;
  const progressPct = pages > 1 ? Math.round((page / (pages - 1)) * 100) : 100;

  return (
    <div style={{ background: bg, color: tc, fontFamily: "Georgia,'Noto Serif TC',serif", display: "flex", flexDirection: "column", height: "100vh", width: "100vw", overflow: "hidden", filter: `brightness(${bright})` }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <style>{noZoomStyle}</style>

      {bright_fb !== null && <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(0,40,80,0.8)", color: "#fff", borderRadius: 16, padding: "14px 24px", fontSize: 22, fontWeight: "bold", zIndex: 300, pointerEvents: "none" }}>☀️ {bright_fb}%</div>}
      {gestureHint && <div style={{ position: "fixed", top: "42%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(0,40,80,0.7)", color: "#fff", borderRadius: 12, padding: "10px 20px", fontSize: 16, zIndex: 300, pointerEvents: "none" }}>{gestureHint}</div>}

      {/* Header */}
      <div style={{ padding: "10px 16px", paddingTop: "calc(10px + env(safe-area-inset-top))", borderBottom: `1px solid ${bd}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: hd, flexShrink: 0 }}>
        <button style={{ ...ib, fontSize: 13 }} onClick={() => { setView("library"); setSets(false); setBms(false); setChaps(false); setGestureSets(false); stopTTS(); }}>← 書庫</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 6px", color: tc }}>{cur?.title}</div>
        <div style={{ display: "flex" }}>
          <button style={ib} onClick={addBM}>🔖</button>
          <button style={{ ...ib, color: tts ? ac : tc }} onClick={toggleTTS}>🔊</button>
          <button style={ib} onClick={() => { setChaps(s => !s); setSets(false); setBms(false); setGestureSets(false); }}>📋</button>
          <button style={ib} onClick={() => { setBms(s => !s); setSets(false); setChaps(false); setGestureSets(false); }}>📑</button>
          <button style={ib} onClick={() => { setSets(s => !s); setBms(false); setChaps(false); setGestureSets(false); }}>⚙️</button>
        </div>
      </div>

      {tts && <div style={{ background: dark ? "#1a2a3a" : "#e8f4ff", borderBottom: `1px solid ${bd}`, padding: "7px 16px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: ac, fontWeight: "bold" }}>🔊 朗讀中</span>
        {[0.75, 1, 1.25, 1.5, 2].map(r => <button key={r} style={{ background: rate === r ? ac : dark ? "#243a50" : "#d0e8f8", color: rate === r ? "#fff" : tc, border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11 }} onClick={() => setRate(r)}>{r}x</button>)}
        <button style={{ marginLeft: "auto", background: "none", border: `1px solid ${bd}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: tc }} onClick={stopTTS}>停止</button>
      </div>}

      <div style={{ height: 2, background: bd, flexShrink: 0 }}><div style={{ height: "100%", background: ac, width: `${progressPct}%`, transition: "width 0.2s" }} /></div>

      {/* 內文 — 左右 padding 對稱 */}
      <div ref={rdr} style={{ flex: 1, overflowY: "auto", padding: "20px 20px", maxWidth: 680, margin: "0 auto", width: "100%", lineHeight: 1.95, fontSize: fs, color: tc, whiteSpace: "pre-wrap", wordBreak: "break-word", WebkitOverflowScrolling: "touch" }}>
        {pageText}
        <div style={{ height: 16 }} />
      </div>

      {/* 底部進度 — 加 safe-area */}
      <div style={{ padding: "10px 20px", paddingBottom: "calc(10px + env(safe-area-inset-bottom))", borderTop: `1px solid ${bd}`, background: hd, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: mu, whiteSpace: "nowrap" }}>第 {page + 1} 頁，共 {pages} 頁</span>
        <div style={{ flex: 1, margin: "0 12px", height: 4, background: bd, borderRadius: 2 }}>
          <div style={{ height: "100%", background: ac, width: `${progressPct}%`, borderRadius: 2, transition: "width 0.2s" }} />
        </div>
        <span style={{ fontSize: 13, color: ac, fontWeight: "bold", whiteSpace: "nowrap" }}>{progressPct}%</span>
      </div>

      {anyP && <div style={{ position: "fixed", inset: 0, background: "rgba(0,30,60,0.35)", zIndex: 99 }} onClick={() => { setSets(false); setBms(false); setChaps(false); setGestureSets(false); }} />}

      {/* 設定面板 */}
      {sets && <div style={pn}>
        <div style={ph}><span>設定</span><button style={{ ...ib, padding: 4 }} onClick={() => setSets(false)}>✕</button></div>
        <div style={pb}>
          <div style={{ marginBottom: 20 }}><div style={sl}>字體大小</div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{FSZ.map(s => <button key={s} style={{ padding: "7px 11px", borderRadius: 8, border: `1px solid ${fs === s ? ac : bd}`, cursor: "pointer", fontSize: 13, background: fs === s ? ac : sf2, color: fs === s ? "#fff" : tc }} onClick={() => setFs(s)}>{s}</button>)}</div></div>
          <div style={{ marginBottom: 20 }}><div style={sl}>主題</div><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: sf2, borderRadius: 10, cursor: "pointer" }} onClick={() => setDark(d => !d)}><span style={{ fontSize: 14 }}>{dark ? "🌙 夜間模式" : "☀️ 白天模式"}</span><Toggle on={dark} onToggle={() => setDark(d => !d)} /></div></div>
          <div style={{ marginBottom: 20 }}><div style={sl}>亮度 {Math.round(bright * 100)}%</div><input type="range" min={20} max={100} value={Math.round(bright * 100)} onChange={e => { const v = e.target.value / 100; setBright(v); showBF(v); }} style={{ width: "100%", accentColor: ac }} /></div>
          <div><div style={sl}>手勢操作</div><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: sf2, borderRadius: 10, cursor: "pointer" }} onClick={() => { setGestureSets(true); setSets(false); }}><span style={{ fontSize: 14 }}>👆 自訂手勢設定</span><span style={{ color: mu }}>›</span></div></div>
        </div>
      </div>}

      {/* 手勢面板 */}
      {gestureSets && <div style={pn}>
        <div style={ph}><span>手勢設定</span><button style={{ ...ib, padding: 4 }} onClick={() => setGestureSets(false)}>✕</button></div>
        <div style={pb}>
          <div style={{ marginBottom: 20 }}><div style={sl}>下一頁</div>
            <GestureOption label="👆 點擊右側（預設）" value="tap_right" current={gestures.nextPage} onChange={v => setGestures(g => ({ ...g, nextPage: v }))} />
            <GestureOption label="← 向左滑動" value="swipe_left" current={gestures.nextPage} onChange={v => setGestures(g => ({ ...g, nextPage: v }))} />
            <GestureOption label="↑ 向上滑動" value="swipe_up" current={gestures.nextPage} onChange={v => setGestures(g => ({ ...g, nextPage: v }))} />
          </div>
          <div style={{ marginBottom: 20 }}><div style={sl}>上一頁</div>
            <GestureOption label="✌️ 兩指點擊（預設）" value="two_tap" current={gestures.prevPage} onChange={v => setGestures(g => ({ ...g, prevPage: v }))} />
            <GestureOption label="→ 向右滑動" value="swipe_right" current={gestures.prevPage} onChange={v => setGestures(g => ({ ...g, prevPage: v }))} />
            <GestureOption label="↓ 向下滑動" value="swipe_down" current={gestures.prevPage} onChange={v => setGestures(g => ({ ...g, prevPage: v }))} />
          </div>
          <div style={{ marginBottom: 20 }}><div style={sl}>亮度調整</div>
            <GestureOption label="✌️ 兩指上下滑動（預設）" value="two_swipe" current={gestures.brightness} onChange={v => setGestures(g => ({ ...g, brightness: v }))} />
            <GestureOption label="🚫 關閉（僅用滑桿）" value="disabled" current={gestures.brightness} onChange={v => setGestures(g => ({ ...g, brightness: v }))} />
          </div>
          <div style={{ padding: "12px 14px", background: sf2, borderRadius: 10, fontSize: 12, color: mu, lineHeight: 1.6 }}>💡 若兩指調亮度時頁面縮放，建議關閉亮度手勢改用滑桿。</div>
        </div>
      </div>}

      {/* 章節面板 */}
      {chaps && <div style={pn}>
        <div style={ph}><span>章節（{chapters.length}）</span><button style={{ ...ib, padding: 4 }} onClick={() => setChaps(false)}>✕</button></div>
        <div style={pb}>{!chapters.length ? <div style={{ color: mu, textAlign: "center", padding: "32px 0" }}>未偵測到章節</div> : chapters.map((ch, i) => <div key={i} style={{ padding: "11px 14px", borderRadius: 10, marginBottom: 6, background: sf2, cursor: "pointer", border: `1px solid ${bd}` }} onClick={() => jumpCh(ch)}><div style={{ fontSize: 14, fontWeight: "bold", color: tc }}>{ch.title}</div><div style={{ fontSize: 11, color: mu, marginTop: 2 }}>第 {i + 1} 章</div></div>)}</div>
      </div>}

      {/* 書籤面板 */}
      {bms && <div style={pn}>
        <div style={ph}><span>書籤（{cur?.bookmarks?.length || 0}）</span><button style={{ ...ib, padding: 4 }} onClick={() => setBms(false)}>✕</button></div>
        <div style={pb}>{!cur?.bookmarks?.length ? <div style={{ color: mu, textAlign: "center", padding: "32px 0" }}><div style={{ fontSize: 32, marginBottom: 8 }}>🔖</div>尚無書籤<br /><span style={{ fontSize: 12 }}>按上方 🔖 新增</span></div> : cur.bookmarks.map(bm => <div key={bm.id} style={{ padding: "11px 14px", borderRadius: 10, marginBottom: 6, background: sf2, display: "flex", alignItems: "center", border: `1px solid ${bd}` }}><div style={{ flex: 1, cursor: "pointer" }} onClick={() => jumpBM(bm)}><div style={{ fontSize: 14, fontWeight: "bold", color: tc }}>{bm.label}</div><div style={{ fontSize: 11, color: mu }}>第 {bm.page + 1} 頁</div></div><button style={{ background: "none", border: "none", color: mu, cursor: "pointer", fontSize: 16 }} onClick={() => delBM(bm.id)}>✕</button></div>)}</div>
      </div>}
    </div>
  );
}
