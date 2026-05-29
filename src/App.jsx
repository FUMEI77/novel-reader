bash

cat > /mnt/user-data/outputs/novel-reader.jsx << 'ENDOFFILE'
import { useState, useEffect, useRef, useCallback } from "react";

// ── 禁止縮放 ──────────────────────────────────────────────────
const noZoomStyle = `
  html, body { touch-action: pan-x pan-y; }
  * { -webkit-user-select: none; user-select: none; }
  input, textarea { -webkit-user-select: text; user-select: text; }
`;

// ── 簡繁轉換 ──────────────────────────────────────────────────
const S2T_MAP = {"爱":"愛","罢":"罷","备":"備","贝":"貝","笔":"筆","毕":"畢","边":"邊","变":"變","标":"標","别":"別","补":"補","参":"參","产":"產","长":"長","场":"場","车":"車","称":"稱","齿":"齒","冲":"衝","虫":"蟲","处":"處","传":"傳","从":"從","错":"錯","达":"達","带":"帶","单":"單","导":"導","灯":"燈","点":"點","电":"電","东":"東","动":"動","断":"斷","队":"隊","对":"對","发":"發","飞":"飛","费":"費","风":"風","复":"復","盖":"蓋","干":"乾","刚":"剛","个":"個","给":"給","够":"夠","关":"關","观":"觀","广":"廣","过":"過","还":"還","汉":"漢","号":"號","后":"後","护":"護","话":"話","画":"畫","怀":"懷","换":"換","黄":"黃","会":"會","机":"機","极":"極","几":"幾","际":"際","继":"繼","价":"價","见":"見","将":"將","奖":"獎","节":"節","尽":"盡","经":"經","举":"舉","开":"開","块":"塊","来":"來","劳":"勞","乐":"樂","类":"類","离":"離","历":"歷","联":"聯","两":"兩","临":"臨","灵":"靈","龙":"龍","楼":"樓","乱":"亂","妈":"媽","买":"買","满":"滿","门":"門","灭":"滅","难":"難","内":"內","脑":"腦","鸟":"鳥","农":"農","强":"強","亲":"親","区":"區","热":"熱","认":"認","时":"時","实":"實","书":"書","树":"樹","说":"說","岁":"歲","台":"臺","态":"態","体":"體","听":"聽","头":"頭","团":"團","万":"萬","为":"為","问":"問","无":"無","务":"務","习":"習","现":"現","线":"線","乡":"鄉","响":"響","协":"協","写":"寫","寻":"尋","学":"學","选":"選","压":"壓","严":"嚴","样":"樣","业":"業","义":"義","应":"應","营":"營","拥":"擁","优":"優","鱼":"魚","语":"語","园":"園","远":"遠","运":"運","战":"戰","这":"這","证":"證","种":"種","众":"眾","转":"轉","装":"裝","状":"狀","资":"資","总":"總","组":"組"};
function s2t(text) { return text.split("").map(c => S2T_MAP[c] || c).join(""); }

// ── Big5 / 編碼偵測 ────────────────────────────────────────────
function decodeBuffer(ab) {
  const u8 = new Uint8Array(ab);
  // 偵測 BOM
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) {
    return new TextDecoder("utf-8").decode(ab);
  }
  // 嘗試 UTF-8
  try {
    const t = new TextDecoder("utf-8", { fatal: true }).decode(ab);
    return t;
  } catch {
    // 嘗試 Big5
    try { return new TextDecoder("big5").decode(ab); } catch {}
    // 嘗試 GBK
    try { return new TextDecoder("gbk").decode(ab); } catch {}
    return new TextDecoder("utf-8", { fatal: false }).decode(ab);
  }
}

function parseFile(ab, name) {
  if (name.toLowerCase().endsWith(".epub")) {
    const t = new TextDecoder("utf-8", { fatal: false }).decode(ab);
    return t.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  }
  return decodeBuffer(ab);
}

// ── IndexedDB 儲存 ─────────────────────────────────────────────
const DB_NAME = "NovelReaderDB";
const DB_VER = 1;
const STORE = "books";

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbGetAll() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}
async function dbPut(book) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(book);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}
async function dbDelete(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

// ── 章節偵測 ──────────────────────────────────────────────────
function detectChapters(content) {
  const lines = content.split("\n");
  const re = /^(第[零一二三四五六七八九十百千萬\d]+[章節回卷部篇][^\n]{0,20}|Chapter\s*\d+|CHAPTER\s*\d+|卷[零一二三四五六七八九十百千\d]+)/;
  const chapters = [];
  let charCount = 0;
  lines.forEach((line, idx) => {
    const t = line.trim();
    if (t && re.test(t)) chapters.push({ title: t, lineIndex: idx, charOffset: charCount });
    charCount += line.length + 1;
  });
  if (chapters.length === 0 || chapters[0].lineIndex > 0)
    chapters.unshift({ title: "開頭", lineIndex: 0, charOffset: 0 });
  return chapters;
}

// ── 分頁渲染（虛擬化）─────────────────────────────────────────
const PAGE_SIZE = 3000; // 每頁字數
function getPage(content, page) {
  const start = page * PAGE_SIZE;
  return content.slice(start, start + PAGE_SIZE);
}
function totalPages(content) {
  return Math.ceil(content.length / PAGE_SIZE);
}

const SAMPLE = `第一章

小時候，有一次我在一本描寫原始森林的書裡，看到了一幅精彩的插圖。那本書叫做《真實的故事》。那幅圖畫的是一條蟒蛇，正在吞食一頭猛獸。

在書上說，蟒蛇把獵獲的動物不加咀嚼，整個地吞下去，然後就再也不能動彈了，就這樣沉睡六個月，等著消化吃進去的食物。

那時候，我對叢林歷險的遭遇想了很多，後來，我也用彩色鉛筆，第一次畫出了我的傑作。大人們勸我把畫放在一邊，還是把興趣放到地理、歷史、算術和語法上去。就這樣，在六歲的時候，我放棄了成為畫家的美好前途。

第二章

這樣，我只好選擇了另一個職業，學會了開飛機。世界各地差不多我都飛到過。不錯，地理學確實幫了我很大的忙。我一眼就能分辨出中國和亞利桑那。如果夜裡迷失了方向，這種本領是很有用的。

就這樣，在我的一生中，我和許許多多嚴肅的大人有過很多接觸。我在大人們中間生活了很長時間。這並沒有使我對他們的看法有多大改變。

第三章

就這樣，我孤獨地生活著，沒有一個真正可以交心的人，直到六年前，在撒哈拉沙漠發生了飛機故障。

第一天晚上，我就這樣睡在沙漠上，離人煙稠密的地方足有幾千英里。因此，當天亮的時候，有一個奇怪的小聲音把我叫醒。那個聲音說：「請……給我畫一隻綿羊！」`;

const SAMPLE_BOOK = { id: "sample1", title: "小王子（範例）", author: "聖-埃克蘇佩里", content: SAMPLE, progress: 0, page: 0, bookmarks: [], converted: false, addedAt: Date.now() };

const FSZ = [14, 16, 18, 20, 22, 24, 28];
const CC = [["#c4704a","#8b4a2e"],["#4a7c8b","#2e5a6b"],["#6b8b4a","#4a6b2e"],["#8b4a7c","#6b2e5a"],["#7c6b4a","#5a4a2e"]];

export default function App() {
  const [books, setBooks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [cur, setCur] = useState(null);
  const [view, setView] = useState("library");
  const [libMode, setLibMode] = useState("large"); // large | small | list
  const [dark, setDark] = useState(false);
  const [fs, setFs] = useState(18);
  const [bright, setBright] = useState(1);
  const [sets, setSets] = useState(false);
  const [bms, setBms] = useState(false);
  const [chaps, setChaps] = useState(false);
  const [page, setPage] = useState(0);
  const [tts, setTts] = useState(false);
  const [rate, setRate] = useState(1);
  const [bfb, setBfb] = useState(null);
  const [uploading, setUploading] = useState(false);
  const rdr = useRef(null);
  const fir = useRef(null);
  const utt = useRef(null);
  const tfr = useRef({ active: false, startY: 0, startB: 1 });
  const fbt = useRef(null);

  // ── 載入 IndexedDB ──────────────────────────────────────────
  useEffect(() => {
    dbGetAll().then(saved => {
      if (saved.length === 0) {
        setBooks([SAMPLE_BOOK]);
        dbPut(SAMPLE_BOOK);
      } else {
        setBooks(saved.sort((a, b) => b.addedAt - a.addedAt));
      }
      setLoaded(true);
    }).catch(() => {
      setBooks([SAMPLE_BOOK]);
      setLoaded(true);
    });
  }, []);

  const chapters = cur ? detectChapters(cur.content) : [];
  const pages = cur ? totalPages(cur.content) : 0;

  function showBF(v) { setBfb(Math.round(v * 100)); clearTimeout(fbt.current); fbt.current = setTimeout(() => setBfb(null), 1200); }

  // ── 兩指亮度 ────────────────────────────────────────────────
  function onTS(e) {
    if (e.touches.length === 2) {
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      tfr.current = { active: true, startY: y, startB: bright };
      e.preventDefault();
    }
  }
  function onTM(e) {
    if (!tfr.current.active || e.touches.length !== 2) return;
    const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const d = (tfr.current.startY - y) / 300;
    const nb = Math.min(1, Math.max(0.2, tfr.current.startB + d));
    setBright(nb); showBF(nb); e.preventDefault();
  }
  function onTE(e) { if (e.touches.length < 2) tfr.current.active = false; }

  // ── 儲存進度 ────────────────────────────────────────────────
  function saveProgress(bookId, progress, pg) {
    setBooks(prev => {
      const updated = prev.map(b => b.id === bookId ? { ...b, progress, page: pg } : b);
      const book = updated.find(b => b.id === bookId);
      if (book) dbPut(book);
      return updated;
    });
  }

  // ── 換頁 ────────────────────────────────────────────────────
  function goPage(p) {
    const np = Math.max(0, Math.min(pages - 1, p));
    setPage(np);
    if (rdr.current) rdr.current.scrollTop = 0;
    if (cur) saveProgress(cur.id, np / Math.max(1, pages - 1), np);
  }

  // ── 開書 ────────────────────────────────────────────────────
  function openBook(b) {
    setCur(b);
    const pg = b.page || 0;
    setPage(pg);
    setView("reader");
    setSets(false); setBms(false); setChaps(false);
    stopTTS();
    setTimeout(() => { if (rdr.current) rdr.current.scrollTop = 0; }, 80);
  }

  // ── 書籤 ────────────────────────────────────────────────────
  function addBM() {
    if (!cur) return;
    const bm = { id: Date.now(), page, label: `第${page + 1}頁` };
    const updated = { ...cur, bookmarks: [...cur.bookmarks, bm] };
    setCur(updated);
    setBooks(prev => prev.map(b => b.id === cur.id ? updated : b));
    dbPut(updated);
  }
  function delBM(id) {
    const updated = { ...cur, bookmarks: cur.bookmarks.filter(x => x.id !== id) };
    setCur(updated);
    setBooks(prev => prev.map(b => b.id === cur.id ? updated : b));
    dbPut(updated);
  }
  function jumpBM(bm) { goPage(bm.page); setBms(false); }

  // ── 章節跳轉 ────────────────────────────────────────────────
  function jumpCh(ch) {
    const pg = Math.floor(ch.charOffset / PAGE_SIZE);
    goPage(pg);
    setChaps(false);
  }

  // ── 刪書 ────────────────────────────────────────────────────
  function delBook(id) {
    setBooks(prev => prev.filter(b => b.id !== id));
    dbDelete(id);
  }

  // ── 簡繁轉換 ────────────────────────────────────────────────
  function toggleConv() {
    if (!cur) return;
    const nc = !cur.converted;
    const newContent = nc ? s2t(cur.content) : cur.content;
    const updated = { ...cur, converted: nc, content: newContent };
    setCur(updated);
    setBooks(prev => prev.map(b => b.id === cur.id ? updated : b));
    dbPut(updated);
  }

  // ── 上傳 ────────────────────────────────────────────────────
  async function upload(e) {
    const f = e.target.files[0];
    if (!f) return;
    setUploading(true);
    try {
      const ab = await f.arrayBuffer();
      const content = parseFile(ab, f.name);
      const book = {
        id: Date.now().toString(),
        title: f.name.replace(/\.(txt|epub)$/i, ""),
        author: "未知作者",
        content,
        progress: 0,
        page: 0,
        bookmarks: [],
        converted: false,
        addedAt: Date.now(),
      };
      await dbPut(book);
      setBooks(prev => [book, ...prev]);
    } catch (err) {
      alert("上傳失敗，請確認檔案格式");
    }
    setUploading(false);
    e.target.value = "";
  }

  // ── TTS ─────────────────────────────────────────────────────
  function stopTTS() { window.speechSynthesis?.cancel(); setTts(false); }
  function startTTS() {
    if (!cur || !window.speechSynthesis) return;
    stopTTS();
    const text = getPage(cur.content, page);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-TW"; u.rate = rate;
    u.onend = () => setTts(false);
    utt.current = u;
    window.speechSynthesis.speak(u);
    setTts(true);
  }
  function toggleTTS() { tts ? stopTTS() : startTTS(); }
  useEffect(() => () => stopTTS(), []);

  // ── 顏色 ────────────────────────────────────────────────────
  const bg = dark ? "#1a1a1a" : "#faf7f2";
  const sf = dark ? "#242424" : "#ffffff";
  const tc = dark ? "#e8e0d0" : "#2c2416";
  const mu = dark ? "#888" : "#9a8f7e";
  const ac = "#c4704a";
  const bd = dark ? "#333" : "#e8e0d0";
  const ib = { background: "none", border: "none", cursor: "pointer", padding: "8px 10px", borderRadius: 8, fontSize: 14, color: tc };
  const pn = { position: "fixed", top: 0, right: 0, bottom: 0, width: 280, background: sf, borderLeft: `1px solid ${bd}`, zIndex: 100, display: "flex", flexDirection: "column", boxShadow: "-4px 0 20px rgba(0,0,0,0.1)" };

  function Cover({ i, size }) {
    const [c1, c2] = CC[i % CC.length];
    const h = size === "large" ? 160 : size === "small" ? 90 : 48;
    return <div style={{ height: h, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${c1},${c2})`, flexShrink: 0 }}><span style={{ fontSize: size === "list" ? 24 : 36 }}>📖</span></div>;
  }

  // ── Loading ──────────────────────────────────────────────────
  if (!loaded) return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: tc, fontFamily: "Georgia,serif" }}>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 12 }}>📚</div><div>載入中...</div></div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // 書庫
  // ════════════════════════════════════════════════════════════
  if (view === "library") return (
    <div style={{ minHeight: "100vh", background: bg, color: tc, fontFamily: "Georgia,serif", filter: `brightness(${bright})` }}>
      <style>{noZoomStyle}</style>
      <input ref={fir} type="file" accept=".txt,.epub" style={{ display: "none" }} onChange={upload} />

      {/* Header */}
      <div style={{ padding: "24px 16px 12px", borderBottom: `1px solid ${bd}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 22, fontWeight: "bold" }}>我的書庫</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* 顯示模式切換 */}
          <button style={{ ...ib, fontSize: 18, padding: "6px 8px" }} onClick={() => setLibMode("large")} title="大圖">
            <span style={{ opacity: libMode === "large" ? 1 : 0.4 }}>⊞</span>
          </button>
          <button style={{ ...ib, fontSize: 18, padding: "6px 8px" }} onClick={() => setLibMode("small")} title="小圖">
            <span style={{ opacity: libMode === "small" ? 1 : 0.4 }}>⊟</span>
          </button>
          <button style={{ ...ib, fontSize: 18, padding: "6px 8px" }} onClick={() => setLibMode("list")} title="列表">
            <span style={{ opacity: libMode === "list" ? 1 : 0.4 }}>☰</span>
          </button>
          <button style={ib} onClick={() => setDark(d => !d)}>{dark ? "☀️" : "🌙"}</button>
          <button style={{ background: ac, color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: "bold", whiteSpace: "nowrap" }}
            onClick={() => fir.current?.click()}>
            {uploading ? "上傳中..." : "＋ 匯入"}
          </button>
        </div>
      </div>

      {/* 上傳中遮罩 */}
      {uploading && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: sf, borderRadius: 16, padding: "32px 40px", textAlign: "center", color: tc }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 16 }}>正在解析檔案...</div>
            <div style={{ fontSize: 12, color: mu, marginTop: 8 }}>大檔案需要較長時間</div>
          </div>
        </div>
      )}

      {books.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 24px", color: mu }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          <div style={{ fontSize: 18, color: tc, marginBottom: 8 }}>書庫是空的</div>
          <div style={{ fontSize: 14 }}>點擊「匯入」上傳 TXT 或 EPUB 檔案</div>
        </div>
      ) : libMode === "list" ? (
        // 列表模式
        <div style={{ padding: "8px 0" }}>
          {books.map((b, i) => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${bd}`, cursor: "pointer", background: sf, marginBottom: 1 }}
              onClick={() => openBook(b)}>
              <Cover i={i} size="list" />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 15, fontWeight: "bold", color: tc, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                <div style={{ fontSize: 12, color: mu }}>{b.author}</div>
                {b.progress > 0 && <div style={{ fontSize: 11, color: ac }}>已讀 {Math.round(b.progress * 100)}%</div>}
              </div>
              <button style={{ background: "none", border: "none", color: mu, cursor: "pointer", fontSize: 18, padding: "4px 8px" }}
                onClick={e => { e.stopPropagation(); delBook(b.id); }}>✕</button>
            </div>
          ))}
        </div>
      ) : (
        // 大圖 / 小圖模式
        <div style={{ display: "grid", gridTemplateColumns: libMode === "large" ? "repeat(auto-fill,minmax(150px,1fr))" : "repeat(auto-fill,minmax(100px,1fr))", gap: libMode === "large" ? 16 : 10, padding: libMode === "large" ? 16 : 10 }}>
          {books.map((b, i) => (
            <div key={b.id} style={{ background: sf, borderRadius: 12, overflow: "hidden", cursor: "pointer", border: `1px solid ${bd}`, position: "relative" }}
              onClick={() => openBook(b)}>
              <Cover i={i} size={libMode} />
              <button style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={e => { e.stopPropagation(); delBook(b.id); }}>✕</button>
              <div style={{ height: 3, background: dark ? "#333" : "#ede9e2" }}>
                <div style={{ height: "100%", background: ac, width: `${(b.progress || 0) * 100}%` }} />
              </div>
              <div style={{ padding: libMode === "large" ? "10px 12px" : "6px 8px" }}>
                <div style={{ fontSize: libMode === "large" ? 13 : 11, fontWeight: "bold", color: tc, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{b.title}</div>
                {libMode === "large" && <div style={{ fontSize: 11, color: mu, marginTop: 2 }}>{b.author}</div>}
                {b.progress > 0 && <div style={{ fontSize: 10, color: ac, marginTop: 2 }}>已讀{Math.round(b.progress * 100)}%</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // 閱讀器
  // ════════════════════════════════════════════════════════════
  const pageText = cur ? getPage(cur.content, page) : "";
  const anyP = sets || bms || chaps;

  return (
    <div style={{ background: bg, color: tc, fontFamily: "Georgia,serif", display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", filter: `brightness(${bright})` }}
      onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>
      <style>{noZoomStyle}</style>

      {/* 亮度提示 */}
      {bfb !== null && (
        <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(0,0,0,0.7)", color: "#fff", borderRadius: 16, padding: "14px 24px", fontSize: 22, fontWeight: "bold", zIndex: 200, pointerEvents: "none" }}>
          ☀️ {bfb}%
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${bd}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: sf, flexShrink: 0 }}>
        <button style={ib} onClick={() => { setView("library"); setSets(false); setBms(false); setChaps(false); stopTTS(); }}>← 書庫</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 6px" }}>{cur?.title}</div>
        <div style={{ display: "flex", gap: 0 }}>
          <button style={ib} onClick={addBM}>🔖</button>
          <button style={{ ...ib, color: tts ? ac : tc }} onClick={toggleTTS}>🔊</button>
          <button style={ib} onClick={() => { setChaps(s => !s); setSets(false); setBms(false); }}>📋</button>
          <button style={ib} onClick={() => { setBms(s => !s); setSets(false); setChaps(false); }}>📑</button>
          <button style={ib} onClick={() => { setSets(s => !s); setBms(false); setChaps(false); }}>⚙️</button>
        </div>
      </div>

      {/* TTS 控制列 */}
      {tts && (
        <div style={{ background: dark ? "#2a2a2a" : "#fff8f3", borderBottom: `1px solid ${bd}`, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: ac, fontWeight: "bold" }}>🔊 朗讀中</span>
          {[0.75, 1, 1.25, 1.5, 2].map(r => (
            <button key={r} style={{ background: rate === r ? ac : dark ? "#333" : "#eee", color: rate === r ? "#fff" : tc, border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}
              onClick={() => setRate(r)}>{r}x</button>
          ))}
          <button style={{ marginLeft: "auto", background: "none", border: `1px solid ${bd}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: tc }} onClick={stopTTS}>停止</button>
        </div>
      )}

      {/* 頁數進度條 */}
      <div style={{ height: 2, background: dark ? "#333" : "#ede9e2", flexShrink: 0 }}>
        <div style={{ height: "100%", background: ac, width: `${pages > 1 ? (page / (pages - 1)) * 100 : 100}%`, transition: "width 0.2s" }} />
      </div>

      {/* 內文 */}
      <div ref={rdr} style={{ flex: 1, overflowY: "auto", padding: "24px 20px", maxWidth: 680, margin: "0 auto", width: "100%", lineHeight: 1.9, fontSize: fs, color: tc, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {pageText}
        <div style={{ height: 20 }} />
      </div>

      {/* 換頁控制 */}
      <div style={{ padding: "10px 16px", borderTop: `1px solid ${bd}`, background: sf, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <button style={{ ...ib, background: page > 0 ? (dark ? "#2e2e2e" : "#f0ebe3") : "transparent", borderRadius: 8, padding: "8px 16px", fontSize: 13, color: page > 0 ? tc : mu, border: `1px solid ${page > 0 ? bd : "transparent"}` }}
          onClick={() => goPage(page - 1)} disabled={page === 0}>← 上一頁</button>
        <span style={{ fontSize: 12, color: mu }}>第 {page + 1} / {pages} 頁</span>
        <button style={{ ...ib, background: page < pages - 1 ? (dark ? "#2e2e2e" : "#f0ebe3") : "transparent", borderRadius: 8, padding: "8px 16px", fontSize: 13, color: page < pages - 1 ? tc : mu, border: `1px solid ${page < pages - 1 ? bd : "transparent"}` }}
          onClick={() => goPage(page + 1)} disabled={page === pages - 1}>下一頁 →</button>
      </div>

      {/* Overlay */}
      {anyP && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 99 }} onClick={() => { setSets(false); setBms(false); setChaps(false); }} />}

      {/* 設定面板 */}
      {sets && (
        <div style={pn}>
          <div style={{ padding: "18px 20px", borderBottom: `1px solid ${bd}`, display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: 16 }}>
            <span>設定</span><button style={{ ...ib, padding: 4 }} onClick={() => setSets(false)}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: mu, marginBottom: 8, textTransform: "uppercase" }}>字體大小</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {FSZ.map(s => <button key={s} style={{ padding: "7px 11px", borderRadius: 8, border: `1px solid ${fs === s ? ac : bd}`, cursor: "pointer", fontSize: 13, background: fs === s ? ac : dark ? "#2e2e2e" : "#f5f0ea", color: fs === s ? "#fff" : tc }} onClick={() => setFs(s)}>{s}</button>)}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: mu, marginBottom: 8, textTransform: "uppercase" }}>主題</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: dark ? "#2e2e2e" : "#f5f0ea", borderRadius: 10, cursor: "pointer" }} onClick={() => setDark(d => !d)}>
                <span style={{ fontSize: 14 }}>{dark ? "🌙 夜間" : "☀️ 白天"}</span>
                <span style={{ width: 38, height: 20, background: dark ? ac : "#ccc", borderRadius: 10, position: "relative", display: "inline-block" }}>
                  <span style={{ position: "absolute", top: 2, left: dark ? 18 : 2, width: 16, height: 16, background: "#fff", borderRadius: "50%", transition: "left 0.3s" }} />
                </span>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: mu, marginBottom: 8, textTransform: "uppercase" }}>亮度 {Math.round(bright * 100)}%</div>
              <input type="range" min={20} max={100} value={Math.round(bright * 100)} onChange={e => { const v = e.target.value / 100; setBright(v); showBF(v); }} style={{ width: "100%", accentColor: ac }} />
              <div style={{ fontSize: 11, color: mu, marginTop: 4 }}>或在閱讀時兩指上下滑動</div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: mu, marginBottom: 8, textTransform: "uppercase" }}>文字轉換</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: dark ? "#2e2e2e" : "#f5f0ea", borderRadius: 10, cursor: "pointer" }} onClick={toggleConv}>
                <span style={{ fontSize: 14 }}>🔄 簡體→繁體</span>
                <span style={{ width: 38, height: 20, background: cur?.converted ? ac : "#ccc", borderRadius: 10, position: "relative", display: "inline-block" }}>
                  <span style={{ position: "absolute", top: 2, left: cur?.converted ? 18 : 2, width: 16, height: 16, background: "#fff", borderRadius: "50%", transition: "left 0.3s" }} />
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 章節面板 */}
      {chaps && (
        <div style={pn}>
          <div style={{ padding: "18px 20px", borderBottom: `1px solid ${bd}`, display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: 16 }}>
            <span>章節（{chapters.length}）</span><button style={{ ...ib, padding: 4 }} onClick={() => setChaps(false)}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            {chapters.length === 0 ? <div style={{ color: mu, textAlign: "center", padding: "32px 0" }}>未偵測到章節</div> :
              chapters.map((ch, i) => (
                <div key={i} style={{ padding: "11px 14px", borderRadius: 10, marginBottom: 6, background: dark ? "#2e2e2e" : "#f5f0ea", cursor: "pointer" }} onClick={() => jumpCh(ch)}>
                  <div style={{ fontSize: 14, fontWeight: "bold", color: tc }}>{ch.title}</div>
                  <div style={{ fontSize: 11, color: mu, marginTop: 2 }}>第 {i + 1} 章</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 書籤面板 */}
      {bms && (
        <div style={pn}>
          <div style={{ padding: "18px 20px", borderBottom: `1px solid ${bd}`, display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: 16 }}>
            <span>書籤（{cur?.bookmarks?.length || 0}）</span><button style={{ ...ib, padding: 4 }} onClick={() => setBms(false)}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            {!cur?.bookmarks?.length ?
              <div style={{ color: mu, textAlign: "center", padding: "32px 0" }}><div style={{ fontSize: 32, marginBottom: 8 }}>🔖</div>尚無書籤</div> :
              cur.bookmarks.map(bm => (
                <div key={bm.id} style={{ padding: "11px 14px", borderRadius: 10, marginBottom: 6, background: dark ? "#2e2e2e" : "#f5f0ea", display: "flex", alignItems: "center", cursor: "pointer" }}>
                  <div style={{ flex: 1 }} onClick={() => jumpBM(bm)}>
                    <div style={{ fontSize: 14, fontWeight: "bold" }}>{bm.label}</div>
                    <div style={{ fontSize: 11, color: mu }}>第 {bm.page + 1} 頁</div>
                  </div>
                  <button style={{ background: "none", border: "none", color: mu, cursor: "pointer", fontSize: 16 }} onClick={() => delBM(bm.id)}>✕</button>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}
ENDOFFILE
echo "Done"
Output

Done
