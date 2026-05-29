import { useState, useEffect, useRef } from "react";

// ── v1.2.0 ────────────────────────────────────────────────────
const VERSION = "v1.2.0";

// ── 禁止縮放（強力版）────────────────────────────────────────
const noZoomStyle = `
  html { touch-action: manipulation; }
  body { touch-action: manipulation; overflow: hidden; position: fixed; width: 100%; }
  * { -webkit-user-select: none; user-select: none; box-sizing: border-box; }
  input, textarea { -webkit-user-select: text; user-select: text; }
`;

// ── 簡繁轉換 ──────────────────────────────────────────────────
const S2T_MAP = {"爱":"愛","罢":"罷","备":"備","贝":"貝","笔":"筆","毕":"畢","边":"邊","变":"變","标":"標","别":"別","补":"補","参":"參","产":"產","长":"長","场":"場","车":"車","称":"稱","齿":"齒","冲":"衝","虫":"蟲","处":"處","传":"傳","从":"從","错":"錯","达":"達","带":"帶","单":"單","导":"導","灯":"燈","点":"點","电":"電","东":"東","动":"動","断":"斷","队":"隊","对":"對","发":"發","飞":"飛","费":"費","风":"風","复":"復","盖":"蓋","干":"乾","刚":"剛","个":"個","给":"給","够":"夠","关":"關","观":"觀","广":"廣","过":"過","还":"還","汉":"漢","号":"號","后":"後","护":"護","话":"話","画":"畫","怀":"懷","换":"換","黄":"黃","会":"會","机":"機","极":"極","几":"幾","际":"際","继":"繼","价":"價","见":"見","将":"將","奖":"獎","节":"節","尽":"盡","经":"經","举":"舉","开":"開","块":"塊","来":"來","劳":"勞","乐":"樂","类":"類","离":"離","历":"歷","联":"聯","两":"兩","临":"臨","灵":"靈","龙":"龍","楼":"樓","乱":"亂","妈":"媽","买":"買","满":"滿","门":"門","灭":"滅","难":"難","内":"內","脑":"腦","鸟":"鳥","农":"農","强":"強","亲":"親","区":"區","热":"熱","认":"認","时":"時","实":"實","书":"書","树":"樹","说":"說","岁":"歲","台":"臺","态":"態","体":"體","听":"聽","头":"頭","团":"團","万":"萬","为":"為","问":"問","无":"無","务":"務","习":"習","现":"現","线":"線","乡":"鄉","响":"響","协":"協","写":"寫","寻":"尋","学":"學","选":"選","压":"壓","严":"嚴","样":"樣","业":"業","义":"義","应":"應","营":"營","拥":"擁","优":"優","鱼":"魚","语":"語","园":"園","远":"遠","运":"運","战":"戰","这":"這","证":"證","种":"種","众":"眾","转":"轉","装":"裝","状":"狀","资":"資","总":"總","组":"組"};
function s2t(text) { return text.split("").map(c => S2T_MAP[c] || c).join(""); }

// ── 編碼偵測（GBK優先）────────────────────────────────────────
function decodeBuffer(ab) {
  const u8 = new Uint8Array(ab);
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF)
    return new TextDecoder("utf-8").decode(ab);
  // 計算非ASCII字節比例，判斷是否可能是GBK
  let highBytes = 0;
  for (let i = 0; i < Math.min(u8.length, 2000); i++)
    if (u8[i] > 0x7F) highBytes++;
  const ratio = highBytes / Math.min(u8.length, 2000);
  // 先試UTF-8 strict
  try {
    const t = new TextDecoder("utf-8", { fatal: true }).decode(ab);
    // 若高字節比例高且含亂碼特徵，改用GBK
    if (ratio > 0.3 && (t.includes("â") || t.includes("ã") || t.includes("�"))) throw new Error("likely gbk");
    return t;
  } catch {
    try { return new TextDecoder("gbk").decode(ab); } catch {}
    try { return new TextDecoder("big5").decode(ab); } catch {}
    return new TextDecoder("utf-8", { fatal: false }).decode(ab);
  }
}

function parseFile(ab, name) {
  if (name.toLowerCase().endsWith(".epub")) {
    const t = new TextDecoder("utf-8", { fatal: false }).decode(ab);
    return t.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
  }
  return decodeBuffer(ab);
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

// ── 章節偵測 ──────────────────────────────────────────────────
function detectChapters(content) {
  const lines = content.split("\n");
  const re = /^(第[零一二三四五六七八九十百千萬\d]+[章節回卷部篇][^\n]{0,20}|Chapter\s*\d+|CHAPTER\s*\d+|卷[零一二三四五六七八九十百千\d]+)/;
  const chapters = []; let cc = 0;
  lines.forEach((line, idx) => {
    const t = line.trim();
    if (t && re.test(t)) chapters.push({ title: t, lineIndex: idx, charOffset: cc });
    cc += line.length + 1;
  });
  if (!chapters.length || chapters[0].lineIndex > 0) chapters.unshift({ title: "開頭", lineIndex: 0, charOffset: 0 });
  return chapters;
}

// ── 分頁 ──────────────────────────────────────────────────────
const PAGE_SIZE = 3000;
function getPage(content, page) { return content.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE); }
function totalPages(content) { return Math.max(1, Math.ceil(content.length / PAGE_SIZE)); }

// ── 範例 ──────────────────────────────────────────────────────
const SAMPLE = `第一章\n\n小時候，有一次我在一本描寫原始森林的書裡，看到了一幅精彩的插圖。那本書叫做《真實的故事》。那幅圖畫的是一條蟒蛇，正在吞食一頭猛獸。\n\n在書上說，蟒蛇把獵獲的動物不加咀嚼，整個地吞下去，然後就再也不能動彈了，就這樣沉睡六個月，等著消化吃進去的食物。\n\n第二章\n\n這樣，我只好選擇了另一個職業，學會了開飛機。世界各地差不多我都飛到過。不錯，地理學確實幫了我很大的忙。\n\n第三章\n\n就這樣，我孤獨地生活著，沒有一個真正可以交心的人，直到六年前，在撒哈拉沙漠發生了飛機故障。當天亮的時候，有一個奇怪的小聲音把我叫醒。那個聲音說：「請……給我畫一隻綿羊！」`;
const SAMPLE_BOOK = { id: "sample1", title: "小王子（範例）", author: "聖-埃克蘇佩里", content: SAMPLE, progress: 0, page: 0, bookmarks: [], converted: false, addedAt: Date.now() };

const FSZ = [14, 16, 18, 20, 22, 24, 28];
const CC = [["#5b8db8","#2d6a9f"],["#4a9b8e","#2d7a6e"],["#7b6eb0","#5a4d8f"],["#c4704a","#8b4a2e"],["#5a8a5a","#3a6a3a"]];

// ── 預設手勢設定 ──────────────────────────────────────────────
const DEFAULT_GESTURES = {
  nextPage: "tap_right",     // tap_right | swipe_left | swipe_up
  prevPage: "two_tap",       // two_tap | swipe_right | swipe_down
  brightness: "two_swipe",   // two_swipe | disabled
};

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
  const [page, setPage] = useState(0);
  const [tts, setTts] = useState(false);
  const [rate, setRate] = useState(1);
  const [bfb, setBfb] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [gestures, setGestures] = useState(DEFAULT_GESTURES);
  const [gestureHint, setGestureHint] = useState(null);
  const rdr = useRef(null);
  const fir = useRef(null);
  const utt = useRef(null);
  const fbt = useRef(null);
  const ght = useRef(null);
  const touchRef = useRef({ startX: 0, startY: 0, fingers: 0, startB: 1, twoStartY: 0 });

  // ── 載入 DB ────────────────────────────────────────────────
  useEffect(() => {
    // 防止 Safari 縮放
    document.addEventListener("gesturestart", e => e.preventDefault(), { passive: false });
    document.addEventListener("gesturechange", e => e.preventDefault(), { passive: false });
    document.addEventListener("gestureend", e => e.preventDefault(), { passive: false });
    dbGetAll().then(saved => {
      if (!saved.length) { setBooks([SAMPLE_BOOK]); dbPut(SAMPLE_BOOK); }
      else setBooks(saved.sort((a, b) => b.addedAt - a.addedAt));
      setLoaded(true);
    }).catch(() => { setBooks([SAMPLE_BOOK]); setLoaded(true); });
  }, []);

  function showBF(v) { setBfb(Math.round(v * 100)); clearTimeout(fbt.current); fbt.current = setTimeout(() => setBfb(null), 1200); }
  function showHint(msg) { setGestureHint(msg); clearTimeout(ght.current); ght.current = setTimeout(() => setGestureHint(null), 800); }

  const chapters = cur ? detectChapters(cur.content) : [];
  const pages = cur ? totalPages(cur.content) : 1;

  // ── 觸控手勢 ──────────────────────────────────────────────
  function onTouchStart(e) {
    const t = e.touches;
    touchRef.current.fingers = t.length;
    if (t.length === 1) {
      touchRef.current.startX = t[0].clientX;
      touchRef.current.startY = t[0].clientY;
    }
    if (t.length === 2) {
      const y = (t[0].clientY + t[1].clientY) / 2;
      touchRef.current.twoStartY = y;
      touchRef.current.startB = bright;
      if (gestures.brightness !== "two_swipe") e.preventDefault();
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2 && gestures.brightness === "two_swipe") {
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const d = (touchRef.current.twoStartY - y) / 250;
      const nb = Math.min(1, Math.max(0.2, touchRef.current.startB + d));
      setBright(nb); showBF(nb);
      e.preventDefault();
    }
  }

  function onTouchEnd(e) {
    const { startX, startY, fingers } = touchRef.current;
    const changedTouches = e.changedTouches;
    if (!changedTouches.length) return;
    const endX = changedTouches[0].clientX;
    const endY = changedTouches[0].clientY;
    const dx = endX - startX;
    const dy = endY - startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const W = window.innerWidth;

    if (view !== "reader") return;
    if (sets || bms || chaps || gestureSets) return;

    // 兩指點擊 → 上一頁
    if (fingers === 2 && absDx < 20 && absDy < 20) {
      if (gestures.prevPage === "two_tap") { goPage(page - 1); showHint("← 上一頁"); }
      return;
    }

    if (fingers !== 1) return;

    // 單指滑動
    if (absDx > 40 && absDx > absDy) {
      if (dx < 0 && gestures.nextPage === "swipe_left") { goPage(page + 1); showHint("下一頁 →"); }
      if (dx > 0 && gestures.prevPage === "swipe_right") { goPage(page - 1); showHint("← 上一頁"); }
      return;
    }
    if (absDy > 40 && absDy > absDx) {
      if (dy < 0 && gestures.nextPage === "swipe_up") { goPage(page + 1); showHint("下一頁 →"); }
      if (dy > 0 && gestures.prevPage === "swipe_down") { goPage(page - 1); showHint("← 上一頁"); }
      return;
    }

    // 單指點擊
    if (absDx < 15 && absDy < 15) {
      if (gestures.nextPage === "tap_right" && endX > W * 0.6) { goPage(page + 1); showHint("下一頁 →"); }
      if (gestures.prevPage === "two_tap") {/* handled above */}
    }
  }

  // ── 換頁 ──────────────────────────────────────────────────
  function goPage(p) {
    const np = Math.max(0, Math.min(pages - 1, p));
    setPage(np);
    if (rdr.current) rdr.current.scrollTop = 0;
    if (cur) {
      const updated = { ...cur, page: np, progress: np / Math.max(1, pages - 1) };
      setCur(updated);
      setBooks(prev => prev.map(b => b.id === cur.id ? updated : b));
      dbPut(updated);
    }
  }

  function openBook(b) { setCur(b); setPage(b.page || 0); setView("reader"); setSets(false); setBms(false); setChaps(false); setGestureSets(false); stopTTS(); setTimeout(() => { if (rdr.current) rdr.current.scrollTop = 0; }, 60); }

  function addBM() {
    if (!cur) return;
    const bm = { id: Date.now(), page, label: `第 ${page + 1} 頁` };
    const updated = { ...cur, bookmarks: [...cur.bookmarks, bm] };
    setCur(updated); setBooks(p => p.map(b => b.id === cur.id ? updated : b)); dbPut(updated);
  }
  function delBM(id) { const u = { ...cur, bookmarks: cur.bookmarks.filter(x => x.id !== id) }; setCur(u); setBooks(p => p.map(b => b.id === cur.id ? u : b)); dbPut(u); }
  function jumpBM(bm) { goPage(bm.page); setBms(false); }
  function jumpCh(ch) { goPage(Math.floor(ch.charOffset / PAGE_SIZE)); setChaps(false); }
  function delBook(id) { setBooks(p => p.filter(b => b.id !== id)); dbDelete(id); }

  function toggleConv() {
    if (!cur) return;
    const nc = !cur.converted;
    const updated = { ...cur, converted: nc, content: nc ? s2t(cur.content) : cur.content };
    setCur(updated); setBooks(p => p.map(b => b.id === cur.id ? updated : b)); dbPut(updated);
  }

  async function upload(e) {
    const f = e.target.files[0]; if (!f) return;
    setUploading(true);
    try {
      const ab = await f.arrayBuffer();
      const content = parseFile(ab, f.name);
      const book = { id: Date.now().toString(), title: f.name.replace(/\.(txt|epub)$/i, ""), author: "未知作者", content, progress: 0, page: 0, bookmarks: [], converted: false, addedAt: Date.now() };
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

  // ── 淡藍色系 ──────────────────────────────────────────────
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
    return <div style={{ width: 40, height: 22, background: on ? ac : "#ccc", borderRadius: 11, position: "relative", cursor: "pointer", transition: "background 0.3s", flexShrink: 0 }} onClick={onToggle}>
      <div style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, background: "#fff", borderRadius: "50%", transition: "left 0.3s" }} />
    </div>;
  }

  function GestureOption({ label, value, current, onChange }) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, marginBottom: 6, background: current === value ? ac : sf2, cursor: "pointer", border: `1px solid ${current === value ? ac : bd}` }} onClick={() => onChange(value)}>
      <span style={{ fontSize: 13, color: current === value ? "#fff" : tc }}>{label}</span>
      {current === value && <span style={{ color: "#fff", fontSize: 16 }}>✓</span>}
    </div>;
  }

  if (!loaded) return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: tc, fontFamily: "Georgia,serif" }}>
      <style>{noZoomStyle}</style>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 12 }}>📚</div><div>載入中...</div></div>
    </div>
  );

  // ════════════════════════════════════════════
  // 書庫
  // ════════════════════════════════════════════
  if (view === "library") return (
    <div style={{ minHeight: "100vh", background: bg, color: tc, fontFamily: "Georgia,'Noto Serif TC',serif" }}>
      <style>{noZoomStyle}</style>
      <input ref={fir} type="file" accept=".txt,.epub" style={{ display: "none" }} onChange={upload} />

      {uploading && <div style={{ position: "fixed", inset: 0, background: "rgba(0,40,80,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: sf, borderRadius: 18, padding: "32px 40px", textAlign: "center", color: tc, boxShadow: "0 8px 32px rgba(0,80,150,0.2)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 16, fontWeight: "bold" }}>正在解析檔案...</div>
          <div style={{ fontSize: 12, color: mu, marginTop: 8 }}>大檔案需要較長時間</div>
        </div>
      </div>}

      {/* Header */}
      <div style={{ padding: "20px 16px 12px", borderBottom: `1px solid ${bd}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: hd }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: "bold", color: tc }}>我的書庫</div>
          <div style={{ fontSize: 10, color: mu, marginTop: 2 }}>{VERSION}</div>
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
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${bd}`, cursor: "pointer", background: sf }} onClick={() => openBook(b)}>
              <Cover i={i} size="list" />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 15, fontWeight: "bold", color: tc, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                <div style={{ fontSize: 12, color: mu }}>{b.author}</div>
                {b.progress > 0 && <div style={{ fontSize: 11, color: ac }}>已讀 {Math.round(b.progress * 100)}%</div>}
              </div>
              <button style={{ background: "none", border: "none", color: mu, cursor: "pointer", fontSize: 18, padding: "4px 8px" }} onClick={e => { e.stopPropagation(); delBook(b.id); }}>✕</button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: libMode === "large" ? "repeat(auto-fill,minmax(145px,1fr))" : "repeat(auto-fill,minmax(100px,1fr))", gap: libMode === "large" ? 14 : 10, padding: libMode === "large" ? 14 : 10 }}>
          {books.map((b, i) => (
            <div key={b.id} style={{ background: sf, borderRadius: 12, overflow: "hidden", cursor: "pointer", border: `1px solid ${bd}`, position: "relative" }} onClick={() => openBook(b)}>
              <Cover i={i} size={libMode} />
              <button style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.45)", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => { e.stopPropagation(); delBook(b.id); }}>✕</button>
              <div style={{ height: 3, background: bd }}>
                <div style={{ height: "100%", background: ac, width: `${(b.progress || 0) * 100}%` }} />
              </div>
              <div style={{ padding: libMode === "large" ? "10px 12px" : "6px 8px" }}>
                <div style={{ fontSize: libMode === "large" ? 13 : 11, fontWeight: "bold", color: tc, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{b.title}</div>
                {libMode === "large" && <div style={{ fontSize: 11, color: mu, marginTop: 2 }}>{b.author}</div>}
                {b.progress > 0 && <div style={{ fontSize: 10, color: ac, marginTop: 2 }}>已讀 {Math.round(b.progress * 100)}%</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════════
  // 閱讀器
  // ════════════════════════════════════════════
  const pageText = cur ? getPage(cur.content, page) : "";
  const anyP = sets || bms || chaps || gestureSets;

  return (
    <div style={{ background: bg, color: tc, fontFamily: "Georgia,'Noto Serif TC',serif", display: "flex", flexDirection: "column", height: "100vh", width: "100vw", overflow: "hidden", filter: `brightness(${bright})` }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <style>{noZoomStyle}</style>

      {/* 亮度提示 */}
      {bfb !== null && <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(0,40,80,0.8)", color: "#fff", borderRadius: 16, padding: "14px 24px", fontSize: 22, fontWeight: "bold", zIndex: 300, pointerEvents: "none" }}>☀️ {bfb}%</div>}

      {/* 手勢提示 */}
      {gestureHint && <div style={{ position: "fixed", top: "40%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(0,40,80,0.7)", color: "#fff", borderRadius: 12, padding: "10px 20px", fontSize: 16, zIndex: 300, pointerEvents: "none" }}>{gestureHint}</div>}

      {/* Header */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${bd}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: hd, flexShrink: 0 }}>
        <button style={{ ...ib, fontSize: 13 }} onClick={() => { setView("library"); setSets(false); setBms(false); setChaps(false); setGestureSets(false); stopTTS(); }}>← 書庫</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 4px", color: tc }}>{cur?.title}</div>
        <div style={{ display: "flex" }}>
          <button style={ib} onClick={addBM} title="書籤">🔖</button>
          <button style={{ ...ib, color: tts ? ac : tc }} onClick={toggleTTS} title="朗讀">🔊</button>
          <button style={ib} onClick={() => { setChaps(s => !s); setSets(false); setBms(false); setGestureSets(false); }} title="章節">📋</button>
          <button style={ib} onClick={() => { setBms(s => !s); setSets(false); setChaps(false); setGestureSets(false); }} title="書籤">📑</button>
          <button style={ib} onClick={() => { setSets(s => !s); setBms(false); setChaps(false); setGestureSets(false); }} title="設定">⚙️</button>
        </div>
      </div>

      {/* TTS列 */}
      {tts && <div style={{ background: dark ? "#1a2a3a" : "#e8f4ff", borderBottom: `1px solid ${bd}`, padding: "7px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: ac, fontWeight: "bold" }}>🔊 朗讀中</span>
        {[0.75, 1, 1.25, 1.5, 2].map(r => <button key={r} style={{ background: rate === r ? ac : dark ? "#243a50" : "#d0e8f8", color: rate === r ? "#fff" : tc, border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11 }} onClick={() => setRate(r)}>{r}x</button>)}
        <button style={{ marginLeft: "auto", background: "none", border: `1px solid ${bd}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: tc }} onClick={stopTTS}>停止</button>
      </div>}

      {/* 進度條 */}
      <div style={{ height: 2, background: bd, flexShrink: 0 }}>
        <div style={{ height: "100%", background: ac, width: `${pages > 1 ? (page / (pages - 1)) * 100 : 100}%`, transition: "width 0.2s" }} />
      </div>

      {/* 內文 */}
      <div ref={rdr} style={{ flex: 1, overflowY: "auto", padding: "20px 20px 20px 20px", maxWidth: 680, margin: "0 auto", width: "100%", lineHeight: 1.95, fontSize: fs, color: tc, whiteSpace: "pre-wrap", wordBreak: "break-word", WebkitOverflowScrolling: "touch" }}>
        {pageText}
        <div style={{ height: 16 }} />
      </div>

      {/* 底部頁碼 */}
      <div style={{ padding: "8px 16px", borderTop: `1px solid ${bd}`, background: hd, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <button style={{ ...ib, background: page > 0 ? sf2 : "transparent", borderRadius: 8, padding: "7px 14px", fontSize: 13, color: page > 0 ? tc : mu, border: `1px solid ${page > 0 ? bd : "transparent"}` }} onClick={() => goPage(page - 1)} disabled={page === 0}>← 上一頁</button>
        <span style={{ fontSize: 12, color: mu }}>第 {page + 1} / {pages} 頁</span>
        <button style={{ ...ib, background: page < pages - 1 ? sf2 : "transparent", borderRadius: 8, padding: "7px 14px", fontSize: 13, color: page < pages - 1 ? tc : mu, border: `1px solid ${page < pages - 1 ? bd : "transparent"}` }} onClick={() => goPage(page + 1)} disabled={page === pages - 1}>下一頁 →</button>
      </div>

      {anyP && <div style={{ position: "fixed", inset: 0, background: "rgba(0,30,60,0.35)", zIndex: 99 }} onClick={() => { setSets(false); setBms(false); setChaps(false); setGestureSets(false); }} />}

      {/* 設定面板 */}
      {sets && <div style={pn}>
        <div style={ph}><span>設定</span><button style={{ ...ib, padding: 4 }} onClick={() => setSets(false)}>✕</button></div>
        <div style={pb}>
          <div style={{ marginBottom: 20 }}>
            <div style={sl}>字體大小</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {FSZ.map(s => <button key={s} style={{ padding: "7px 11px", borderRadius: 8, border: `1px solid ${fs === s ? ac : bd}`, cursor: "pointer", fontSize: 13, background: fs === s ? ac : sf2, color: fs === s ? "#fff" : tc }} onClick={() => setFs(s)}>{s}</button>)}
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={sl}>主題</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: sf2, borderRadius: 10, cursor: "pointer" }} onClick={() => setDark(d => !d)}>
              <span style={{ fontSize: 14 }}>{dark ? "🌙 夜間模式" : "☀️ 白天模式"}</span>
              <Toggle on={dark} onToggle={() => setDark(d => !d)} />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={sl}>亮度 {Math.round(bright * 100)}%</div>
            <input type="range" min={20} max={100} value={Math.round(bright * 100)} onChange={e => { const v = e.target.value / 100; setBright(v); showBF(v); }} style={{ width: "100%", accentColor: ac }} />
            <div style={{ fontSize: 11, color: mu, marginTop: 4 }}>手勢設定可調整亮度操作方式</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={sl}>文字轉換</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: sf2, borderRadius: 10 }}>
              <span style={{ fontSize: 14 }}>🔄 簡體→繁體</span>
              <Toggle on={!!cur?.converted} onToggle={toggleConv} />
            </div>
          </div>
          <div>
            <div style={sl}>手勢操作</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: sf2, borderRadius: 10, cursor: "pointer" }} onClick={() => { setGestureSets(true); setSets(false); }}>
              <span style={{ fontSize: 14 }}>👆 自訂手勢設定</span>
              <span style={{ color: mu }}>›</span>
            </div>
          </div>
        </div>
      </div>}

      {/* 手勢設定面板 */}
      {gestureSets && <div style={pn}>
        <div style={ph}><span>手勢設定</span><button style={{ ...ib, padding: 4 }} onClick={() => setGestureSets(false)}>✕</button></div>
        <div style={pb}>
          <div style={{ marginBottom: 24 }}>
            <div style={sl}>下一頁手勢</div>
            <GestureOption label="👆 點擊右側（預設）" value="tap_right" current={gestures.nextPage} onChange={v => setGestures(g => ({ ...g, nextPage: v }))} />
            <GestureOption label="← 向左滑動" value="swipe_left" current={gestures.nextPage} onChange={v => setGestures(g => ({ ...g, nextPage: v }))} />
            <GestureOption label="↑ 向上滑動" value="swipe_up" current={gestures.nextPage} onChange={v => setGestures(g => ({ ...g, nextPage: v }))} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <div style={sl}>上一頁手勢</div>
            <GestureOption label="✌️ 兩指點擊（預設）" value="two_tap" current={gestures.prevPage} onChange={v => setGestures(g => ({ ...g, prevPage: v }))} />
            <GestureOption label="→ 向右滑動" value="swipe_right" current={gestures.prevPage} onChange={v => setGestures(g => ({ ...g, prevPage: v }))} />
            <GestureOption label="↓ 向下滑動" value="swipe_down" current={gestures.prevPage} onChange={v => setGestures(g => ({ ...g, prevPage: v }))} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <div style={sl}>亮度調整手勢</div>
            <GestureOption label="✌️ 兩指上下滑動（預設）" value="two_swipe" current={gestures.brightness} onChange={v => setGestures(g => ({ ...g, brightness: v }))} />
            <GestureOption label="🚫 關閉（僅用滑桿）" value="disabled" current={gestures.brightness} onChange={v => setGestures(g => ({ ...g, brightness: v }))} />
          </div>
          <div style={{ padding: "12px 14px", background: sf2, borderRadius: 10, fontSize: 12, color: mu, lineHeight: 1.6 }}>
            💡 若兩指調亮度時頁面會縮放，建議關閉亮度手勢，改用設定裡的滑桿調整。
          </div>
        </div>
      </div>}

      {/* 章節面板 */}
      {chaps && <div style={pn}>
        <div style={ph}><span>章節（{chapters.length}）</span><button style={{ ...ib, padding: 4 }} onClick={() => setChaps(false)}>✕</button></div>
        <div style={pb}>
          {!chapters.length ? <div style={{ color: mu, textAlign: "center", padding: "32px 0" }}>未偵測到章節</div> :
            chapters.map((ch, i) => <div key={i} style={{ padding: "11px 14px", borderRadius: 10, marginBottom: 6, background: sf2, cursor: "pointer", border: `1px solid ${bd}` }} onClick={() => jumpCh(ch)}>
              <div style={{ fontSize: 14, fontWeight: "bold", color: tc }}>{ch.title}</div>
              <div style={{ fontSize: 11, color: mu, marginTop: 2 }}>第 {i + 1} 章</div>
            </div>)}
        </div>
      </div>}

      {/* 書籤面板 */}
      {bms && <div style={pn}>
        <div style={ph}><span>書籤（{cur?.bookmarks?.length || 0}）</span><button style={{ ...ib, padding: 4 }} onClick={() => setBms(false)}>✕</button></div>
        <div style={pb}>
          {!cur?.bookmarks?.length ? <div style={{ color: mu, textAlign: "center", padding: "32px 0" }}><div style={{ fontSize: 32, marginBottom: 8 }}>🔖</div>尚無書籤<br /><span style={{ fontSize: 12 }}>按上方 🔖 新增</span></div> :
            cur.bookmarks.map(bm => <div key={bm.id} style={{ padding: "11px 14px", borderRadius: 10, marginBottom: 6, background: sf2, display: "flex", alignItems: "center", border: `1px solid ${bd}` }}>
              <div style={{ flex: 1, cursor: "pointer" }} onClick={() => jumpBM(bm)}>
                <div style={{ fontSize: 14, fontWeight: "bold", color: tc }}>{bm.label}</div>
                <div style={{ fontSize: 11, color: mu }}>第 {bm.page + 1} 頁</div>
              </div>
              <button style={{ background: "none", border: "none", color: mu, cursor: "pointer", fontSize: 16 }} onClick={() => delBM(bm.id)}>✕</button>
            </div>)}
        </div>
      </div>}
    </div>
  );
}
