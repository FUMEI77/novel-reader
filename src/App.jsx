import { useState, useEffect, useRef } from "react";

const VERSION = "v1.7.2";
const CHANGELOG = [
  { version: "v1.7.2", date: "2026-05", notes: ["修正 OpenCC 使用 CDN 載入", "底部留白修正", "版本資訊移入設定"] },
  { version: "v1.7.1", date: "2026-05", notes: ["修正 OpenCC 載入方式", "最後一行文字遮住修正"] },
  { version: "v1.7.0", date: "2026-05", notes: ["整合 OpenCC 簡繁轉換（台灣正體）", "轉換準確度大幅提升"] },
  { version: "v1.6.1", date: "2026-05", notes: ["關掉翻頁手勢提示", "底部留白修正", "詞彙層級簡繁對照表", "版本號顯示在書庫底部"] },
  { version: "v1.6.0", date: "2026-05", notes: ["閱讀器禁止滾動，純翻頁模式", "底部頁數顯示位置修正", "擴充簡繁轉換表（小說常用詞彙）"] },
  { version: "v1.5.1", date: "2026-05", notes: ["修正底部頁碼被 Home Bar 遮住", "改良簡體中文（GBK）自動偵測與轉換"] },
  { version: "v1.5.0", date: "2026-05", notes: ["改良 Big5/GBK 自動辨識（字頻分析）", "修正底部被 Home Bar 遮住", "修正左右留白不對稱", "閱讀背景改為白色", "設定移至書庫頁面"] },
  { version: "v1.4.0", date: "2026-05", notes: ["修正繁體中文（Big5）亂碼", "長按書籍可重新命名或刪除", "底部進度條避開 Home Bar"] },
  { version: "v1.3.0", date: "2026-05", notes: ["自動偵測簡體並轉換繁體", "底部改為閱讀進度顯示", "書庫版本紀錄"] },
  { version: "v1.2.0", date: "2026-05", notes: ["GBK編碼支援", "手勢自訂設定", "淡藍色介面"] },
  { version: "v1.1.0", date: "2026-05", notes: ["大檔案支援", "書庫三種顯示模式", "書籍持久儲存"] },
  { version: "v1.0.0", date: "2026-05", notes: ["基本閱讀功能", "書籤、章節、語音朗讀"] },
];

const noZoomStyle = `
  html { touch-action: manipulation; }
  body { touch-action: manipulation; overflow: hidden; position: fixed; width: 100%; height: 100%; }
  * { -webkit-user-select: none; user-select: none; box-sizing: border-box; }
  input, textarea { -webkit-user-select: text; user-select: text; }
`;

// ── OpenCC 簡繁轉換（CDN 載入）──────────────────────────────────
let _converter = null;
let _converterReady = false;

async function initOpenCC() {
  if (_converterReady) return;
  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/esm/cn2t.js");
    const OpenCC = mod.default || mod;
    _converter = OpenCC.Converter({ from: "cn", to: "twp" });
    _converterReady = true;
  } catch(e) {
    console.warn("OpenCC load failed:", e);
    _converter = (t) => t;
    _converterReady = true;
  }
}

function toTraditional(text) {
  try {
    if (_converter) return _converter(text);
    return text;
  } catch { return text; }
}

// ── 簡體偵測（用簡體專有字）────────────────────────────────────
const SIMP_ONLY = new Set("这们说时对没发还应该过现让则两样请进东书门问给变边带单导电断队飞风复关广汉后护画怀换会机极继见将节经举来劳乐类离联临灵龙楼乱妈买满灭难脑鸟农强认实树岁态听头团为问务习线响写寻学选严样义应营优鱼语园远运战证种众转装资总组".split(""));

// ── 編碼辨識 ──────────────────────────────────────────────────
// ── 編碼辨識 ──────────────────────────────────────────────────
// 簡體專有字（這些字形只在簡體GBK出現，繁體Big5不用這些字形）
const SIMP_ONLY = new Set("这们说时对没发还应该过现让则两样请进东书门问给变边带单导电断队飞风复关广汉后护画怀换会机极继见将节经举来劳乐类离联临灵龙楼乱妈买满灭难脑鸟农强认实树岁态听头团为问务习线响写寻学选严样义应营优鱼语园远运战证种众转装资总组".split(""));

function detectEncoding(ab) {
  // 先試 UTF-8
  try {
    const t = new TextDecoder("utf-8", { fatal: true }).decode(ab);
    if (!t.includes("�")) return { text: t, enc: "utf8" };
  } catch {}
  // 同時解碼 Big5 和 GBK
  let big5Text = "", gbkText = "";
  try { big5Text = new TextDecoder("big5").decode(ab); } catch {}
  try { gbkText = new TextDecoder("gbk").decode(ab); } catch {}
  // 計算GBK解碼後的簡體專有字出現率
  const sample = gbkText.slice(0, 5000);
  let simpCount = 0;
  for (const c of sample) { if (SIMP_ONLY.has(c)) simpCount++; }
  // 超過1.5% → GBK簡體
  if (sample.length > 0 && simpCount / sample.length > 0.015) return { text: gbkText, enc: "gbk" };
  return { text: big5Text || gbkText, enc: "big5" };
}

function parseFile(ab, name) {
  let text;
  if (name.toLowerCase().endsWith(".epub")) {
    text = new TextDecoder("utf-8", { fatal: false }).decode(ab);
    text = text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
  } else {
    const result = detectEncoding(ab);
    text = result.text;
    // GBK = 簡體 → 自動轉繁體
    if (result.enc === "gbk") text = toTraditional(text);
  }
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
async function dbGetAll() { const db = await openDB(); return new Promise((res,rej) => { const r = db.transaction(STORE,"readonly").objectStore(STORE).getAll(); r.onsuccess = () => res(r.result||[]); r.onerror = () => rej(r.error); }); }
async function dbPut(b) { const db = await openDB(); return new Promise((res,rej) => { const r = db.transaction(STORE,"readwrite").objectStore(STORE).put(b); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }
async function dbDelete(id) { const db = await openDB(); return new Promise((res,rej) => { const r = db.transaction(STORE,"readwrite").objectStore(STORE).delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }

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

const SAMPLE = `第一章\n\n小時候，有一次我在一本描寫原始森林的書裡，看到了一幅精彩的插圖。那本書叫做《真實的故事》。那幅圖畫的是一條蟒蛇，正在吞食一頭猛獸。\n\n在書上說，蟒蛇把獵獲的動物不加咀嚼，整個地吞下去，然後就再也不能動彈了。\n\n第二章\n\n這樣，我只好選擇了另一個職業，學會了開飛機。世界各地差不多我都飛到過。\n\n第三章\n\n就這樣，我孤獨地生活著，直到六年前，在撒哈拉沙漠發生了飛機故障。`;
const SAMPLE_BOOK = { id: "sample1", title: "小王子（範例）", author: "聖-埃克蘇佩里", content: SAMPLE, progress: 0, page: 0, bookmarks: [], addedAt: Date.now() };

const FSZ = [14, 16, 18, 20, 22, 24, 28];
const CC = [["#5b8db8","#2d6a9f"],["#4a9b8e","#2d7a6e"],["#7b6eb0","#5a4d8f"],["#c4704a","#8b4a2e"],["#5a8a5a","#3a6a3a"]];
const DEFAULT_GESTURES = { nextPage: "tap_right", prevPage: "two_tap", brightness: "two_swipe" };

export default function App() {
  const [books, setBooks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [cur, setCur] = useState(null);
  const [view, setView] = useState("library"); // library | reader | settings
  const [libMode, setLibMode] = useState("large");
  const [dark, setDark] = useState(false);
  const [fs, setFs] = useState(18);
  const [bright, setBright] = useState(1);
  const [bms, setBms] = useState(false);
  const [chaps, setChaps] = useState(false);
  const [gestureSets, setGestureSets] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [page, setPage] = useState(0);
  const [tts, setTts] = useState(false);
  const [rate, setRate] = useState(1);
  const [brightFb, setBrightFb] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [gestures, setGestures] = useState(DEFAULT_GESTURES);
  const [gestureHint, setGestureHint] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const rdr = useRef(null);
  const fir = useRef(null);
  const utt = useRef(null);
  const fbt = useRef(null);
  const ght = useRef(null);
  const lpTimer = useRef(null);
  const touchRef = useRef({ startX:0, startY:0, fingers:0, startB:1, twoStartY:0 });

  useEffect(() => {
    document.addEventListener("gesturestart", e => e.preventDefault(), { passive: false });
    document.addEventListener("gesturechange", e => e.preventDefault(), { passive: false });
    document.addEventListener("gestureend", e => e.preventDefault(), { passive: false });
    dbGetAll().then(saved => {
      if (!saved.length) { setBooks([SAMPLE_BOOK]); dbPut(SAMPLE_BOOK); }
      else setBooks(saved.sort((a,b) => b.addedAt - a.addedAt));
      setLoaded(true);
    }).catch(() => { setBooks([SAMPLE_BOOK]); setLoaded(true); });
  }, []);

  function showBF(v) { setBrightFb(Math.round(v*100)); clearTimeout(fbt.current); fbt.current = setTimeout(() => setBrightFb(null), 1200); }
  function showHint(msg) { /* hint disabled */ }

  const chapters = cur ? detectChapters(cur.content) : [];
  const pages = cur ? totalPages(cur.content) : 1;
  const progressPct = pages > 1 ? Math.round((page / (pages-1)) * 100) : 100;

  function onTouchStart(e) {
    const t = e.touches;
    touchRef.current.fingers = t.length;
    if (t.length === 1) { touchRef.current.startX = t[0].clientX; touchRef.current.startY = t[0].clientY; }
    if (t.length === 2) { const y = (t[0].clientY+t[1].clientY)/2; touchRef.current.twoStartY = y; touchRef.current.startB = bright; }
  }
  function onTouchMove(e) {
    if (e.touches.length === 2 && gestures.brightness === "two_swipe") {
      const y = (e.touches[0].clientY+e.touches[1].clientY)/2;
      const d = (touchRef.current.twoStartY - y) / 250;
      const nb = Math.min(1, Math.max(0.2, touchRef.current.startB + d));
      setBright(nb); showBF(nb); e.preventDefault();
    }
  }
  function onTouchEnd(e) {
    const { startX, startY, fingers } = touchRef.current;
    if (!e.changedTouches.length) return;
    const endX = e.changedTouches[0].clientX, endY = e.changedTouches[0].clientY;
    const dx = endX-startX, dy = endY-startY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    const W = window.innerWidth;
    if (view !== "reader") return;
    if (bms || chaps || gestureSets) return;
    if (fingers === 2 && absDx < 20 && absDy < 20) { if (gestures.prevPage === "two_tap") { goPage(page-1); showHint("← 上一頁"); } return; }
    if (fingers !== 1) return;
    if (absDx > 40 && absDx > absDy) {
      if (dx < 0 && gestures.nextPage === "swipe_left") { goPage(page+1); showHint("下一頁 →"); return; }
      if (dx > 0 && gestures.prevPage === "swipe_right") { goPage(page-1); showHint("← 上一頁"); return; }
    }
    if (absDy > 40 && absDy > absDx) {
      if (dy < 0 && gestures.nextPage === "swipe_up") { goPage(page+1); showHint("下一頁 →"); return; }
      if (dy > 0 && gestures.prevPage === "swipe_down") { goPage(page-1); showHint("← 上一頁"); return; }
    }
    if (absDx < 15 && absDy < 15 && gestures.nextPage === "tap_right" && endX > W*0.6) { goPage(page+1); showHint("下一頁 →"); }
  }

  function startLP(book) { lpTimer.current = setTimeout(() => setCtxMenu({ book }), 600); }
  function cancelLP() { clearTimeout(lpTimer.current); }

  function goPage(p) {
    const np = Math.max(0, Math.min(pages-1, p));
    setPage(np);
    if (rdr.current) rdr.current.scrollTop = 0;
    if (cur) { const u = {...cur, page:np, progress:np/Math.max(1,pages-1)}; setCur(u); setBooks(prev => prev.map(b => b.id===cur.id ? u : b)); dbPut(u); }
  }
  function openBook(b) { setCur(b); setPage(b.page||0); setView("reader"); setBms(false); setChaps(false); setGestureSets(false); stopTTS(); setTimeout(() => { if (rdr.current) rdr.current.scrollTop = 0; }, 60); }
  function addBM() { if (!cur) return; const bm = {id:Date.now(), page, label:`第 ${page+1} 頁`}; const u = {...cur, bookmarks:[...cur.bookmarks, bm]}; setCur(u); setBooks(p => p.map(b => b.id===cur.id ? u : b)); dbPut(u); }
  function delBM(id) { const u = {...cur, bookmarks:cur.bookmarks.filter(x => x.id!==id)}; setCur(u); setBooks(p => p.map(b => b.id===cur.id ? u : b)); dbPut(u); }
  function jumpBM(bm) { goPage(bm.page); setBms(false); }
  function jumpCh(ch) { goPage(Math.floor(ch.charOffset/PAGE_SIZE)); setChaps(false); }
  function doDelete(id) { setBooks(p => p.filter(b => b.id!==id)); dbDelete(id); setDeleteTarget(null); setCtxMenu(null); }
  function doRename() {
    if (!renameVal.trim()) return;
    const u = {...renameTarget.book, title:renameVal.trim()};
    setBooks(p => p.map(b => b.id===u.id ? u : b)); dbPut(u);
    setRenameTarget(null); setRenameVal(""); setCtxMenu(null);
  }

  async function upload(e) {
    const f = e.target.files[0]; if (!f) return;
    setUploading(true);
    try {
      await initOpenCC();
      const ab = await f.arrayBuffer();
      const content = parseFile(ab, f.name);
      const book = { id:Date.now().toString(), title:f.name.replace(/\.(txt|epub)$/i,""), author:"未知作者", content, progress:0, page:0, bookmarks:[], addedAt:Date.now() };
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

  // ── 顏色系統 ──────────────────────────────────────────────
  // 書庫：淡藍色系
  const lbg = dark ? "#0f1a24" : "#eef4f9";
  const lsf = dark ? "#162030" : "#ffffff";
  const lsf2 = dark ? "#1a2a3a" : "#f0f7ff";
  const ltc = dark ? "#d0e4f0" : "#1a3a50";
  const lmu = dark ? "#6a9ab8" : "#7aaac8";
  const lac = dark ? "#4a9fd4" : "#2e7fb8";
  const lbd = dark ? "#243a50" : "#c8dfef";
  const lhd = dark ? "#162030" : "#daeaf8";
  // 閱讀器：白色背景
  const rbg = dark ? "#1a1a1a" : "#ffffff";
  const rtc = dark ? "#e8e0d0" : "#1a1a1a";
  const rmu = dark ? "#888" : "#999";
  const rac = dark ? "#4a9fd4" : "#2e7fb8";
  const rbd = dark ? "#333" : "#e8e8e8";
  const rhd = dark ? "#111" : "#f8f8f8";

  const ib = (color) => ({ background:"none", border:"none", cursor:"pointer", padding:"8px 10px", borderRadius:8, fontSize:14, color });
  const pn = { position:"fixed", top:0, right:0, bottom:0, width:290, background:lsf, borderLeft:`1px solid ${lbd}`, zIndex:100, display:"flex", flexDirection:"column", boxShadow:"-4px 0 24px rgba(0,80,150,0.15)" };

  function Cover({ i, size }) {
    const [c1,c2] = CC[i%CC.length];
    const h = size==="large" ? 150 : size==="small" ? 85 : 44;
    return <div style={{ height:h, display:"flex", alignItems:"center", justifyContent:"center", background:`linear-gradient(135deg,${c1},${c2})`, flexShrink:0 }}><span style={{ fontSize:size==="list"?22:34 }}>📖</span></div>;
  }
  function Toggle({ on, onToggle, ac }) {
    return <div style={{ width:40, height:22, background:on?ac:"#bbb", borderRadius:11, position:"relative", cursor:"pointer", transition:"background 0.3s", flexShrink:0 }} onClick={onToggle}>
      <div style={{ position:"absolute", top:2, left:on?20:2, width:18, height:18, background:"#fff", borderRadius:"50%", transition:"left 0.3s" }} />
    </div>;
  }
  function GestureOption({ label, value, current, onChange }) {
    const on = current===value;
    return <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:10, marginBottom:6, background:on?lac:lsf2, cursor:"pointer", border:`1px solid ${on?lac:lbd}` }} onClick={() => onChange(value)}>
      <span style={{ fontSize:13, color:on?"#fff":ltc }}>{label}</span>
      {on && <span style={{ color:"#fff" }}>✓</span>}
    </div>;
  }

  // ── 共用彈窗 ──────────────────────────────────────────────
  function Modal({ onClose, children }) {
    return <>
      <div style={{ position:"fixed", inset:0, background:"rgba(0,30,60,0.4)", zIndex:199 }} onClick={onClose} />
      <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:"85%", maxWidth:360, background:lsf, borderRadius:18, zIndex:200, overflow:"hidden", boxShadow:"0 8px 32px rgba(0,60,120,0.2)" }}>
        {children}
      </div>
    </>;
  }

  if (!loaded) return (
    <div style={{ minHeight:"100vh", background:lbg, display:"flex", alignItems:"center", justifyContent:"center", color:ltc, fontFamily:"Georgia,serif" }}>
      <style>{noZoomStyle}</style>
      <div style={{ textAlign:"center" }}><div style={{ fontSize:40, marginBottom:12 }}>📚</div><div>載入中...</div></div>
    </div>
  );

  // ════════════════════════════════════════════
  // 設定頁面（獨立頁面）
  // ════════════════════════════════════════════
  if (view === "settings") return (
    <div style={{ minHeight:"100vh", background:lbg, color:ltc, fontFamily:"Georgia,'Noto Serif TC',serif" }}>
      <style>{noZoomStyle}</style>
      <div style={{ padding:"20px 16px 12px", borderBottom:`1px solid ${lbd}`, display:"flex", alignItems:"center", gap:12, background:lhd }}>
        <button style={ib(ltc)} onClick={() => setView("library")}>← 返回</button>
        <div style={{ fontSize:18, fontWeight:"bold" }}>設定</div>
      </div>
      <div style={{ padding:20 }}>
        {/* 主題 */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, color:lmu, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>主題</div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", background:lsf, borderRadius:12, border:`1px solid ${lbd}` }}>
            <span style={{ fontSize:15 }}>{dark ? "🌙 夜間模式" : "☀️ 白天模式"}</span>
            <Toggle on={dark} onToggle={() => setDark(d=>!d)} ac={lac} />
          </div>
        </div>
        {/* 字體 */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, color:lmu, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>閱讀字體大小</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {FSZ.map(s => <button key={s} style={{ padding:"9px 13px", borderRadius:10, border:`1px solid ${fs===s?lac:lbd}`, cursor:"pointer", fontSize:14, background:fs===s?lac:lsf, color:fs===s?"#fff":ltc, fontWeight:fs===s?"bold":"normal" }} onClick={() => setFs(s)}>{s}</button>)}
          </div>
        </div>
        {/* 亮度 */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, color:lmu, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>亮度 {Math.round(bright*100)}%</div>
          <input type="range" min={20} max={100} value={Math.round(bright*100)} onChange={e => setBright(e.target.value/100)} style={{ width:"100%", accentColor:lac }} />
          <div style={{ fontSize:11, color:lmu, marginTop:6 }}>閱讀時也可用兩指上下滑動調整</div>
        </div>
        {/* 手勢 */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, color:lmu, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>下一頁手勢</div>
          <GestureOption label="👆 點擊右側（預設）" value="tap_right" current={gestures.nextPage} onChange={v => setGestures(g=>({...g,nextPage:v}))} />
          <GestureOption label="← 向左滑動" value="swipe_left" current={gestures.nextPage} onChange={v => setGestures(g=>({...g,nextPage:v}))} />
          <GestureOption label="↑ 向上滑動" value="swipe_up" current={gestures.nextPage} onChange={v => setGestures(g=>({...g,nextPage:v}))} />
        </div>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, color:lmu, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>上一頁手勢</div>
          <GestureOption label="✌️ 兩指點擊（預設）" value="two_tap" current={gestures.prevPage} onChange={v => setGestures(g=>({...g,prevPage:v}))} />
          <GestureOption label="→ 向右滑動" value="swipe_right" current={gestures.prevPage} onChange={v => setGestures(g=>({...g,prevPage:v}))} />
          <GestureOption label="↓ 向下滑動" value="swipe_down" current={gestures.prevPage} onChange={v => setGestures(g=>({...g,prevPage:v}))} />
        </div>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, color:lmu, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>亮度調整手勢</div>
          <GestureOption label="✌️ 兩指上下滑動（預設）" value="two_swipe" current={gestures.brightness} onChange={v => setGestures(g=>({...g,brightness:v}))} />
          <GestureOption label="🚫 關閉（僅用滑桿）" value="disabled" current={gestures.brightness} onChange={v => setGestures(g=>({...g,brightness:v}))} />
          <div style={{ padding:"10px 14px", background:lsf2, borderRadius:10, fontSize:12, color:lmu, marginTop:6 }}>💡 若兩指調亮度時頁面縮放，建議關閉此手勢。</div>
        </div>
        {/* 版本 */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:12, color:lmu, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>關於</div>
          <div style={{ padding:"14px 16px", background:lsf, borderRadius:12, border:`1px solid ${lbd}`, cursor:"pointer" }} onClick={() => setShowInfo(true)}>
            <div style={{ fontSize:15, color:ltc, fontWeight:"bold" }}>📖 小說閱讀器</div>
            <div style={{ fontSize:13, color:lac, marginTop:4, fontWeight:"bold" }}>{VERSION} — 查看更新紀錄 ›</div>
          </div>
        </div>
      </div>

      {/* 版本資訊彈窗 */}
      {showInfo && <Modal onClose={() => setShowInfo(false)}>
        <div style={{ background:lac, padding:"20px 24px", color:"#fff" }}>
          <div style={{ fontSize:20, fontWeight:"bold" }}>📖 小說閱讀器</div>
          <div style={{ fontSize:13, opacity:0.85, marginTop:4 }}>目前版本：{VERSION}</div>
        </div>
        <div style={{ padding:"16px 20px", maxHeight:360, overflowY:"auto" }}>
          {CHANGELOG.map((log, i) => (
            <div key={i} style={{ marginBottom:18 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <span style={{ background:i===0?lac:lsf2, color:i===0?"#fff":lmu, fontSize:12, fontWeight:"bold", padding:"3px 10px", borderRadius:20, border:`1px solid ${i===0?lac:lbd}` }}>{log.version}</span>
                <span style={{ fontSize:11, color:lmu }}>{log.date}</span>
                {i===0 && <span style={{ fontSize:11, color:lac, fontWeight:"bold" }}>最新</span>}
              </div>
              {log.notes.map((n, j) => <div key={j} style={{ fontSize:13, color:ltc, padding:"3px 0 3px 12px", borderLeft:`2px solid ${i===0?lac:lbd}`, marginBottom:3 }}>{n}</div>)}
            </div>
          ))}
        </div>
        <div style={{ padding:"12px 20px", borderTop:`1px solid ${lbd}`, display:"flex", justifyContent:"center" }}>
          <button style={{ background:lac, color:"#fff", border:"none", borderRadius:10, padding:"10px 32px", cursor:"pointer", fontSize:14, fontWeight:"bold" }} onClick={() => setShowInfo(false)}>關閉</button>
        </div>
      </Modal>}
    </div>
  );

  // ════════════════════════════════════════════
  // 書庫
  // ════════════════════════════════════════════
  if (view === "library") return (
    <div style={{ minHeight:"100vh", background:lbg, color:ltc, fontFamily:"Georgia,'Noto Serif TC',serif", paddingBottom:34 }}>
      <style>{noZoomStyle}</style>
      <input ref={fir} type="file" accept=".txt,.epub" style={{ display:"none" }} onChange={upload} />

      {/* 上傳中 */}
      {uploading && <div style={{ position:"fixed", inset:0, background:"rgba(0,40,80,0.6)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ background:lsf, borderRadius:18, padding:"32px 40px", textAlign:"center", color:ltc }}>
          <div style={{ fontSize:40, marginBottom:12 }}>⏳</div>
          <div style={{ fontSize:16, fontWeight:"bold" }}>正在解析檔案...</div>
          <div style={{ fontSize:12, color:lmu, marginTop:8 }}>大檔案需要較長時間</div>
        </div>
      </div>}

      {/* 長按選單 */}
      {ctxMenu && <Modal onClose={() => setCtxMenu(null)}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${lbd}`, fontWeight:"bold", fontSize:15, color:ltc, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>📖 {ctxMenu.book.title}</div>
        <div style={{ padding:"8px 0" }}>
          <div style={{ padding:"14px 20px", cursor:"pointer", fontSize:15, color:ltc, display:"flex", alignItems:"center", gap:12 }} onClick={() => { setRenameVal(ctxMenu.book.title); setRenameTarget(ctxMenu); setCtxMenu(null); }}>✏️ 重新命名</div>
          <div style={{ height:1, background:lbd, margin:"0 20px" }} />
          <div style={{ padding:"14px 20px", cursor:"pointer", fontSize:15, color:"#e05555", display:"flex", alignItems:"center", gap:12 }} onClick={() => { setDeleteTarget(ctxMenu); setCtxMenu(null); }}>🗑️ 刪除書籍</div>
        </div>
        <div style={{ padding:"8px 20px 16px", display:"flex", justifyContent:"center" }}>
          <button style={{ background:"none", border:`1px solid ${lbd}`, borderRadius:10, padding:"8px 28px", cursor:"pointer", fontSize:14, color:lmu }} onClick={() => setCtxMenu(null)}>取消</button>
        </div>
      </Modal>}

      {/* 刪除確認 */}
      {deleteTarget && <Modal onClose={() => setDeleteTarget(null)}>
        <div style={{ padding:"24px 20px 16px", textAlign:"center" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🗑️</div>
          <div style={{ fontWeight:"bold", fontSize:16, color:ltc, marginBottom:8 }}>確定要刪除嗎？</div>
          <div style={{ fontSize:13, color:lmu }}>「{deleteTarget.book.title}」</div>
          <div style={{ fontSize:12, color:lmu, marginTop:4 }}>刪除後無法復原</div>
        </div>
        <div style={{ display:"flex", borderTop:`1px solid ${lbd}` }}>
          <button style={{ flex:1, padding:"14px", background:"none", border:"none", cursor:"pointer", fontSize:15, color:lmu, borderRight:`1px solid ${lbd}` }} onClick={() => setDeleteTarget(null)}>取消</button>
          <button style={{ flex:1, padding:"14px", background:"none", border:"none", cursor:"pointer", fontSize:15, color:"#e05555", fontWeight:"bold" }} onClick={() => doDelete(deleteTarget.book.id)}>刪除</button>
        </div>
      </Modal>}

      {/* 重新命名 */}
      {renameTarget && <Modal onClose={() => setRenameTarget(null)}>
        <div style={{ padding:"24px 20px" }}>
          <div style={{ fontWeight:"bold", fontSize:16, color:ltc, marginBottom:16 }}>✏️ 重新命名</div>
          <input value={renameVal} onChange={e => setRenameVal(e.target.value)} style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:`1px solid ${lbd}`, fontSize:15, color:ltc, background:lsf2, outline:"none" }} autoFocus onKeyDown={e => e.key==="Enter" && doRename()} />
          <div style={{ display:"flex", gap:10, marginTop:16 }}>
            <button style={{ flex:1, padding:"12px", background:lsf2, border:`1px solid ${lbd}`, borderRadius:10, cursor:"pointer", fontSize:14, color:lmu }} onClick={() => setRenameTarget(null)}>取消</button>
            <button style={{ flex:1, padding:"12px", background:lac, border:"none", borderRadius:10, cursor:"pointer", fontSize:14, color:"#fff", fontWeight:"bold" }} onClick={doRename}>確認</button>
          </div>
        </div>
      </Modal>}

      {/* Header */}
      <div style={{ padding:"20px 16px 12px", borderBottom:`1px solid ${lbd}`, display:"flex", alignItems:"center", justifyContent:"space-between", background:lhd }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ fontSize:22, fontWeight:"bold", color:ltc }}>書庫</div>
          <button style={{ ...ib(ltc), padding:"4px 6px", fontSize:16, opacity:0.6 }} onClick={() => setView("settings")}>⚙️</button>
        </div>
        <div style={{ display:"flex", gap:4, alignItems:"center" }}>
          <button style={{ ...ib(ltc), fontSize:17, opacity:libMode==="large"?1:0.4 }} onClick={() => setLibMode("large")}>⊞</button>
          <button style={{ ...ib(ltc), fontSize:17, opacity:libMode==="small"?1:0.4 }} onClick={() => setLibMode("small")}>⊟</button>
          <button style={{ ...ib(ltc), fontSize:17, opacity:libMode==="list"?1:0.4 }} onClick={() => setLibMode("list")}>☰</button>
          <button style={ib(ltc)} onClick={() => setDark(d=>!d)}>{dark?"☀️":"🌙"}</button>
          <button style={{ background:lac, color:"#fff", border:"none", borderRadius:10, padding:"8px 14px", cursor:"pointer", fontSize:13, fontWeight:"bold" }} onClick={() => fir.current?.click()}>＋ 匯入</button>
        </div>
      </div>

      {books.length === 0 ? (
        <div style={{ textAlign:"center", padding:"80px 24px", color:lmu }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📚</div>
          <div style={{ fontSize:18, color:ltc, marginBottom:8 }}>書庫是空的</div>
          <div style={{ fontSize:14 }}>點擊「匯入」上傳 TXT 或 EPUB 檔案</div>
        </div>
      ) : libMode === "list" ? (
        <div style={{ padding:"8px 0" }}>
          {books.map((b, i) => (
            <div key={b.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderBottom:`1px solid ${lbd}`, cursor:"pointer", background:lsf }}
              onClick={() => openBook(b)} onTouchStart={() => startLP(b)} onTouchEnd={cancelLP} onTouchMove={cancelLP}>
              <Cover i={i} size="list" />
              <div style={{ flex:1, overflow:"hidden" }}>
                <div style={{ fontSize:15, fontWeight:"bold", color:ltc, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.title}</div>
                <div style={{ fontSize:12, color:lmu }}>{b.author}</div>
                {b.progress > 0 && <div style={{ fontSize:11, color:lac }}>已讀 {Math.round(b.progress*100)}%</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:libMode==="large"?"repeat(auto-fill,minmax(145px,1fr))":"repeat(auto-fill,minmax(100px,1fr))", gap:libMode==="large"?14:10, padding:libMode==="large"?14:10 }}>
          {books.map((b, i) => (
            <div key={b.id} style={{ background:lsf, borderRadius:12, overflow:"hidden", cursor:"pointer", border:`1px solid ${lbd}`, position:"relative" }}
              onClick={() => openBook(b)} onTouchStart={() => startLP(b)} onTouchEnd={cancelLP} onTouchMove={cancelLP}>
              <Cover i={i} size={libMode} />
              <div style={{ height:3, background:lbd }}><div style={{ height:"100%", background:lac, width:`${(b.progress||0)*100}%` }} /></div>
              <div style={{ padding:libMode==="large"?"10px 12px":"6px 8px" }}>
                <div style={{ fontSize:libMode==="large"?13:11, fontWeight:"bold", color:ltc, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{b.title}</div>
                {libMode==="large" && <div style={{ fontSize:11, color:lmu, marginTop:2 }}>{b.author}</div>}
                {b.progress > 0 && <div style={{ fontSize:10, color:lac, marginTop:2 }}>已讀 {Math.round(b.progress*100)}%</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ padding:"10px 16px 24px", textAlign:"center" }}><div style={{ fontSize:12, color:lmu, marginBottom:4 }}>長按書籍可重新命名或刪除</div><div style={{ fontSize:11, color:lmu, opacity:0.6 }}>小說閱讀器 {VERSION}</div></div>
    </div>
  );

  // ════════════════════════════════════════════
  // 閱讀器
  // ════════════════════════════════════════════
  const pageText = cur ? getPage(cur.content, page) : "";
  const anyP = bms || chaps || gestureSets;

  return (
    <div style={{ background:rbg, color:rtc, fontFamily:"Georgia,'Noto Serif TC',serif", display:"flex", flexDirection:"column", height:"100vh", width:"100vw", overflow:"hidden", filter:`brightness(${bright})` }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <style>{noZoomStyle}</style>

      {brightFb !== null && <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"rgba(0,0,0,0.75)", color:"#fff", borderRadius:16, padding:"14px 24px", fontSize:22, fontWeight:"bold", zIndex:300, pointerEvents:"none" }}>☀️ {brightFb}%</div>}
      

      {/* Header */}
      <div style={{ padding:"10px 16px", borderBottom:`1px solid ${rbd}`, display:"flex", alignItems:"center", justifyContent:"space-between", background:rhd, flexShrink:0 }}>
        <button style={ib(rtc)} onClick={() => { setView("library"); setBms(false); setChaps(false); setGestureSets(false); stopTTS(); }}>← 書庫</button>
        <div style={{ flex:1, textAlign:"center", fontSize:13, fontWeight:"bold", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", padding:"0 6px", color:rtc }}>{cur?.title}</div>
        <div style={{ display:"flex" }}>
          <button style={ib(rtc)} onClick={addBM}>🔖</button>
          <button style={{ ...ib(rtc), color:tts?rac:rtc }} onClick={toggleTTS}>🔊</button>
          <button style={ib(rtc)} onClick={() => { setChaps(s=>!s); setBms(false); setGestureSets(false); }}>📋</button>
          <button style={ib(rtc)} onClick={() => { setBms(s=>!s); setChaps(false); setGestureSets(false); }}>📑</button>

        </div>
      </div>

      {tts && <div style={{ background:dark?"#1a1a1a":"#f8f8f8", borderBottom:`1px solid ${rbd}`, padding:"7px 16px", display:"flex", alignItems:"center", gap:8, flexShrink:0, flexWrap:"wrap" }}>
        <span style={{ fontSize:12, color:rac, fontWeight:"bold" }}>🔊 朗讀中</span>
        {[0.75,1,1.25,1.5,2].map(r => <button key={r} style={{ background:rate===r?rac:dark?"#333":"#eee", color:rate===r?"#fff":rtc, border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", fontSize:11 }} onClick={() => setRate(r)}>{r}x</button>)}
        <button style={{ marginLeft:"auto", background:"none", border:`1px solid ${rbd}`, borderRadius:6, padding:"4px 8px", cursor:"pointer", fontSize:11, color:rtc }} onClick={stopTTS}>停止</button>
      </div>}

      {/* 頂部進度條 */}
      <div style={{ height:2, background:rbd, flexShrink:0 }}><div style={{ height:"100%", background:rac, width:`${progressPct}%`, transition:"width 0.2s" }} /></div>

      {/* 內文 — 禁止滾動，固定顯示 */}
      <div ref={rdr} style={{ flex:1, overflow:"hidden", padding:"20px 24px 16px 24px", lineHeight:1.95, fontSize:fs, color:rtc, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
        {pageText}
      </div>

      {/* 底部進度 — 固定高度避免被遮 */}
      <div style={{ padding:"14px 20px", paddingBottom:"max(36px, env(safe-area-inset-bottom))", borderTop:`1px solid ${rbd}`, background:rhd, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <span style={{ fontSize:12, color:rmu, whiteSpace:"nowrap" }}>第 {page+1} 頁，共 {pages} 頁</span>
        <div style={{ flex:1, margin:"0 12px", height:4, background:rbd, borderRadius:2 }}>
          <div style={{ height:"100%", background:rac, width:`${progressPct}%`, borderRadius:2, transition:"width 0.2s" }} />
        </div>
        <span style={{ fontSize:13, color:rac, fontWeight:"bold", whiteSpace:"nowrap" }}>{progressPct}%</span>
      </div>

      {anyP && <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.3)", zIndex:99 }} onClick={() => { setBms(false); setChaps(false); setGestureSets(false); }} />}

      {/* 章節面板 */}
      {chaps && <div style={{ ...pn, background:dark?"#1a1a1a":"#fff", borderLeft:`1px solid ${rbd}` }}>
        <div style={{ padding:"18px 20px", borderBottom:`1px solid ${rbd}`, display:"flex", justifyContent:"space-between", alignItems:"center", fontWeight:"bold", fontSize:16, color:rtc }}>
          <span>章節（{chapters.length}）</span><button style={ib(rtc)} onClick={() => setChaps(false)}>✕</button>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:12 }}>
          {!chapters.length ? <div style={{ color:rmu, textAlign:"center", padding:"32px 0" }}>未偵測到章節</div> :
            chapters.map((ch, i) => <div key={i} style={{ padding:"11px 14px", borderRadius:10, marginBottom:6, background:dark?"#2a2a2a":"#f5f5f5", cursor:"pointer" }} onClick={() => jumpCh(ch)}>
              <div style={{ fontSize:14, fontWeight:"bold", color:rtc }}>{ch.title}</div>
              <div style={{ fontSize:11, color:rmu, marginTop:2 }}>第 {i+1} 章</div>
            </div>)}
        </div>
      </div>}

      {/* 書籤面板 */}
      {bms && <div style={{ ...pn, background:dark?"#1a1a1a":"#fff", borderLeft:`1px solid ${rbd}` }}>
        <div style={{ padding:"18px 20px", borderBottom:`1px solid ${rbd}`, display:"flex", justifyContent:"space-between", alignItems:"center", fontWeight:"bold", fontSize:16, color:rtc }}>
          <span>書籤（{cur?.bookmarks?.length||0}）</span><button style={ib(rtc)} onClick={() => setBms(false)}>✕</button>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:12 }}>
          {!cur?.bookmarks?.length ?
            <div style={{ color:rmu, textAlign:"center", padding:"32px 0" }}><div style={{ fontSize:32, marginBottom:8 }}>🔖</div>尚無書籤<br /><span style={{ fontSize:12 }}>按上方 🔖 新增</span></div> :
            cur.bookmarks.map(bm => <div key={bm.id} style={{ padding:"11px 14px", borderRadius:10, marginBottom:6, background:dark?"#2a2a2a":"#f5f5f5", display:"flex", alignItems:"center" }}>
              <div style={{ flex:1, cursor:"pointer" }} onClick={() => jumpBM(bm)}>
                <div style={{ fontSize:14, fontWeight:"bold", color:rtc }}>{bm.label}</div>
                <div style={{ fontSize:11, color:rmu }}>第 {bm.page+1} 頁</div>
              </div>
              <button style={{ background:"none", border:"none", color:rmu, cursor:"pointer", fontSize:16 }} onClick={() => delBM(bm.id)}>✕</button>
            </div>)}
        </div>
      </div>}
    </div>
  );
}
