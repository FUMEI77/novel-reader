import { useState, useEffect, useRef } from "react";

const VERSION = "v2.0.4";
const CHANGELOG = [
  { version: "v2.0.4", date: "2026-05", notes: ["移除底部進度條", "底部背景改為透明", "只保留頁數和百分比文字"] },
  { version: "v2.0.3", date: "2026-05", notes: ["最後一行截斷修正，加入一行緩衝高度"] },
  { version: "v2.0.2", date: "2026-05", notes: ["用 ref 取得實際內文高度分頁", "解決分頁空白過多問題"] },
  { version: "v2.0.1", date: "2026-05", notes: ["統一單一 DOM 測量分頁函數", "精確計算段落高度", "移除所有重複分頁邏輯"] },
  { version: "v2.0.0", date: "2026-05", notes: ["統一使用 DOM 測量分頁系統", "移除 B 套 buildBreaks 分頁", "修正 iOS safe area 左右對稱", "修正重複 jumpCh 函數"] },
  { version: "v1.9.4", date: "2026-05", notes: ["修正大字體時段落缺失問題", "改用更精確的行數計算"] },
  { version: "v1.9.3", date: "2026-05", notes: ["修正點擊跳太多頁的問題", "移除重複的 goPage 函數"] },
  { version: "v1.9.2", date: "2026-05", notes: ["放棄 CSS Column，改回精確字數計算翻頁", "解決空白過多問題"] },
  { version: "v1.9.1", date: "2026-05", notes: ["修正 CSS Column 白畫面問題"] },
  { version: "v1.9.0", date: "2026-05", notes: ["改用 CSS Column 分頁（仿 Apple Books）", "文字自動填滿每頁不留空白", "左右滑動或點側邊翻頁", "底部頁數和%正確顯示"] },
  { version: "v1.8.5", date: "2026-05", notes: ["修正每頁空白過多問題", "段落間距計算更精確"] },
  { version: "v1.8.4", date: "2026-05", notes: ["用實際渲染高度計算每頁字數", "不管字體大小都能正確切頁"] },
  { version: "v1.8.3", date: "2026-05", notes: ["根據螢幕高度和字體大小動態計算每頁字數", "翻頁內容更完整不斷行"] },
  { version: "v1.8.2", date: "2026-05", notes: ["改成按段落切頁，不再切斷內容", "段落完整顯示不會不連貫"] },
  { version: "v1.8.1", date: "2026-05", notes: ["修正閱讀器左右留白不對稱", "修正底部文字被切掉"] },
  { version: "v1.8.0", date: "2026-05", notes: ["修正左右留白不對稱", "修正最後一行被遮住", "新增7個主題顏色", "書庫和閱讀器同步套用主題"] },
  { version: "v1.7.4", date: "2026-05", notes: ["設定頁面可以滾動", "底部頁數固定高度不被遮住", "左右 padding 對稱修正"] },
  { version: "v1.7.3", date: "2026-05", notes: ["修正 S2T_MAP 重複 key 錯誤", "OpenCC CDN 載入", "底部留白修正", "版本資訊移入設定"] },
  { version: "v1.6.1", date: "2026-05", notes: ["關掉翻頁手勢提示", "底部留白修正", "詞彙層級簡繁對照表", "版本號顯示在書庫底部"] },
  { version: "v1.6.0", date: "2026-05", notes: ["閱讀器禁止滾動，純翻頁模式", "底部頁數顯示位置修正", "擴充簡繁轉換表"] },
  { version: "v1.5.0", date: "2026-05", notes: ["改良 Big5/GBK 自動辨識", "閱讀背景改為白色", "設定移至書庫頁面"] },
  { version: "v1.4.0", date: "2026-05", notes: ["修正繁體中文（Big5）亂碼", "長按書籍可重新命名或刪除"] },
  { version: "v1.0.0", date: "2026-05", notes: ["基本閱讀功能", "書籤、章節、語音朗讀"] },
];

const noZoomStyle = `
  html { touch-action: manipulation; }
  body { touch-action: manipulation; overflow: hidden; position: fixed; width: 100%; height: 100%; }
  * { -webkit-user-select: none; user-select: none; box-sizing: border-box; }
  input, textarea { -webkit-user-select: text; user-select: text; }
`;

const S2T_MAP = {"爱":"愛","罢":"罷","备":"備","贝":"貝","笔":"筆","毕":"畢","边":"邊","变":"變","标":"標","别":"別","补":"補","参":"參","产":"產","长":"長","场":"場","车":"車","称":"稱","齿":"齒","冲":"衝","虫":"蟲","处":"處","传":"傳","从":"從","错":"錯","达":"達","带":"帶","单":"單","导":"導","灯":"燈","点":"點","电":"電","东":"東","动":"動","断":"斷","队":"隊","对":"對","发":"發","飞":"飛","费":"費","风":"風","复":"復","盖":"蓋","干":"乾","刚":"剛","个":"個","给":"給","够":"夠","关":"關","观":"觀","广":"廣","过":"過","还":"還","汉":"漢","号":"號","后":"後","护":"護","话":"話","画":"畫","怀":"懷","换":"換","黄":"黃","会":"會","机":"機","极":"極","几":"幾","际":"際","继":"繼","价":"價","见":"見","将":"將","奖":"獎","节":"節","尽":"盡","经":"經","举":"舉","开":"開","块":"塊","来":"來","劳":"勞","乐":"樂","类":"類","离":"離","历":"歷","联":"聯","两":"兩","临":"臨","灵":"靈","龙":"龍","楼":"樓","乱":"亂","妈":"媽","买":"買","满":"滿","门":"門","灭":"滅","难":"難","内":"內","脑":"腦","鸟":"鳥","农":"農","强":"強","亲":"親","区":"區","热":"熱","认":"認","时":"時","实":"實","书":"書","树":"樹","说":"說","岁":"歲","台":"臺","态":"態","体":"體","听":"聽","头":"頭","团":"團","万":"萬","为":"為","问":"問","无":"無","务":"務","习":"習","现":"現","线":"線","乡":"鄉","响":"響","协":"協","写":"寫","寻":"尋","学":"學","选":"選","压":"壓","严":"嚴","样":"樣","业":"業","义":"義","应":"應","营":"營","拥":"擁","优":"優","鱼":"魚","语":"語","园":"園","远":"遠","运":"運","战":"戰","这":"這","证":"證","种":"種","众":"眾","转":"轉","装":"裝","状":"狀","资":"資","总":"總","组":"組","药":"藥","阵":"陣","气":"氣","级":"級","阶":"階","炼":"煉","晋":"晉","坠":"墜","术":"術","诀":"訣","枪":"槍","铠":"鎧","环":"環","矿":"礦","银":"銀","铜":"銅","铁":"鐵","钢":"鋼","锦":"錦","绸":"綢","纱":"紗","绢":"絹","纹":"紋","杀":"殺","斗":"鬥","击":"擊","胜":"勝","败":"敗","赢":"贏","输":"輸","伤":"傷","爷":"爺","师":"師","侠":"俠","剑":"劍","阁":"閣","宫":"宮","炼":"煉","魂":"魂","阴":"陰","阳":"陽","梦":"夢","恶":"惡","诸":"諸","们":"們","该":"該","让":"讓","则":"則","请":"請","进":"進","给":"給","变":"變","导":"導","断":"斷"};
function s2t(text) { return text.split("").map(c => S2T_MAP[c] || c).join(""); }

// OpenCC CDN
let _converter = null;
let _converterReady = false;
async function initOpenCC() {
  if (_converterReady) return;
  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/esm/cn2t.js");
    const OCC = mod.default || mod;
    if (OCC && OCC.Converter) {
      _converter = OCC.Converter({ from: "cn", to: "twp" });
    } else {
      _converter = null;
    }
  } catch(e) {
    _converter = null;
  }
  _converterReady = true;
}
function toTraditional(text) {
  try {
    if (_converter) return _converter(text);
    return s2t(text);
  } catch { return s2t(text); }
}

// 簡體偵測
const SIMP_ONLY = new Set("这们说时对没发还应该让则请进给变导断们该让则请进给变导断".split(""));
function detectEncoding(ab) {
  const u8 = new Uint8Array(ab);
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return { text: new TextDecoder("utf-8").decode(ab), enc: "utf8" };
  try {
    const t = new TextDecoder("utf-8", { fatal: true }).decode(ab);
    if (!t.includes("\uFFFD")) {
      const sample = t.slice(0, 3000);
      let simpCount = 0;
      for (const c of sample) { if (SIMP_ONLY.has(c)) simpCount++; }
      if (sample.length > 0 && simpCount / sample.length > 0.015) return { text: t, enc: "utf8-simp" };
      return { text: t, enc: "utf8" };
    }
  } catch {}
  let big5Text = "", gbkText = "";
  try { big5Text = new TextDecoder("big5").decode(ab); } catch {}
  try { gbkText = new TextDecoder("gbk").decode(ab); } catch {}
  const sample = gbkText.slice(0, 5000);
  let simpCount = 0;
  for (const c of sample) { if (SIMP_ONLY.has(c)) simpCount++; }
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
    if (result.enc === "gbk" || result.enc === "utf8-simp") text = toTraditional(text);
  }
  return text;
}

// IndexedDB
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

// ── 唯一分頁函數：用隱藏 div 實際測量每段落高度 ────────────────
async function buildPageBreaks(content, fontSize, contentH, contentW) {
  // contentH and contentW passed from actual ref measurements

  const lineH = fontSize * 1.95;
  const safeH = contentH - lineH; // 預留一行緩衝，避免最後一行被截斷

  const div = document.createElement("div");
  div.style.cssText = [
    "position:fixed",
    "top:-9999px",
    "left:-9999px",
    "width:" + contentW + "px",
    "padding:0",
    "margin:0",
    "font-size:" + fontSize + "px",
    "line-height:1.95",
    "font-family:Georgia,'Noto Serif TC',serif",
    "white-space:pre-wrap",
    "word-break:break-word",
    "visibility:hidden",
    "pointer-events:none",
    "box-sizing:border-box"
  ].join(";");
  document.body.appendChild(div);

  const paragraphs = content.split("\n");
  const breaks = [0];
  let usedH = 0;
  let pos = 0;

  for (const para of paragraphs) {
    div.textContent = para.length > 0 ? para : "​"; // 空行用零寬空格
    const paraH = para.length > 0
      ? div.getBoundingClientRect().height + lineH * 0.2  // 段落間距
      : lineH;                                             // 空行高度

    if (usedH > 0 && usedH + paraH > safeH) {
      breaks.push(pos);
      usedH = paraH;
    } else {
      usedH += paraH;
    }
    pos += para.length + 1;
  }

  document.body.removeChild(div);
  return breaks;
}

function getPageText(content, page, breaks) {
  if (!breaks || !breaks.length) return content;
  const start = breaks[page] || 0;
  const end = breaks[page + 1] || content.length;
  return content.slice(start, end).trim();
}

const SAMPLE = `第一章\n\n小時候，有一次我在一本描寫原始森林的書裡，看到了一幅精彩的插圖。那本書叫做《真實的故事》。那幅圖畫的是一條蟒蛇，正在吞食一頭猛獸。\n\n在書上說，蟒蛇把獵獲的動物不加咀嚼，整個地吞下去，然後就再也不能動彈了。\n\n第二章\n\n這樣，我只好選擇了另一個職業，學會了開飛機。世界各地差不多我都飛到過。\n\n第三章\n\n就這樣，我孤獨地生活著，直到六年前，在撒哈拉沙漠發生了飛機故障。`;
const SAMPLE_BOOK = { id: "sample1", title: "小王子（範例）", author: "聖-埃克蘇佩里", content: SAMPLE, progress: 0, page: 0, bookmarks: [], addedAt: Date.now() };

const FSZ = [14, 16, 18, 20, 22, 24, 28];
const CC = [["#5b8db8","#2d6a9f"],["#4a9b8e","#2d7a6e"],["#7b6eb0","#5a4d8f"],["#c4704a","#8b4a2e"],["#5a8a5a","#3a6a3a"]];

const THEMES = {
  blue:   { name:"🔵 海洋藍", ac:"#2e7fb8", bg:"#eef4f9", sf:"#ffffff", hd:"#daeaf8", bd:"#c8dfef", tc:"#1a3a50", mu:"#7aaac8", sf2:"#f0f7ff", dbg:"#0f1a24", dsf:"#162030", dhd:"#162030", dbd:"#243a50", dtc:"#d0e4f0", dmu:"#6a9ab8", dac:"#4a9fd4", dsf2:"#1a2a3a" },
  pink:   { name:"🌸 玫瑰粉", ac:"#c4607a", bg:"#fff0f3", sf:"#ffffff", hd:"#fde0e6", bd:"#f5c0cc", tc:"#4a1a24", mu:"#c48090", sf2:"#fff5f7", dbg:"#1a0f12", dsf:"#2a1520", dhd:"#2a1520", dbd:"#3a2030", dtc:"#f0d0d8", dmu:"#b87888", dac:"#e07090", dsf2:"#2a1828" },
  green:  { name:"🌿 森林綠", ac:"#3a8a5a", bg:"#f0f8f2", sf:"#ffffff", hd:"#d8f0e0", bd:"#b8dfc8", tc:"#1a3a28", mu:"#6aaa88", sf2:"#f0fff5", dbg:"#0f1a12", dsf:"#162018", dhd:"#162018", dbd:"#203a28", dtc:"#d0f0d8", dmu:"#68a880", dac:"#4ab870", dsf2:"#182a20" },
  purple: { name:"💜 淡紫色", ac:"#8a60c4", bg:"#f5f0ff", sf:"#ffffff", hd:"#ede0ff", bd:"#d8c8f5", tc:"#2a1a4a", mu:"#9a80c8", sf2:"#f8f5ff", dbg:"#150f1a", dsf:"#201528", dhd:"#201528", dbd:"#302040", dtc:"#e0d0f8", dmu:"#9878c0", dac:"#a878e8", dsf2:"#281a38" },
  orange: { name:"☀️ 暖陽橙", ac:"#c47030", bg:"#fff8f0", sf:"#ffffff", hd:"#ffe8d0", bd:"#f5d0a8", tc:"#3a2010", mu:"#c89060", sf2:"#fff5ee", dbg:"#1a1208", dsf:"#281a10", dhd:"#281a10", dbd:"#3a2818", dtc:"#f0d8c0", dmu:"#b88060", dac:"#e08840", dsf2:"#301e12" },
  white:  { name:"🤍 純淨白", ac:"#555555", bg:"#f8f8f8", sf:"#ffffff", hd:"#eeeeee", bd:"#dddddd", tc:"#222222", mu:"#888888", sf2:"#f5f5f5", dbg:"#111111", dsf:"#1a1a1a", dhd:"#141414", dbd:"#2a2a2a", dtc:"#e8e8e8", dmu:"#888888", dac:"#aaaaaa", dsf2:"#222222" },
  dark:   { name:"🖤 深色", ac:"#6a9ad4", bg:"#181818", sf:"#222222", hd:"#1a1a1a", bd:"#333333", tc:"#e0e0e0", mu:"#888888", sf2:"#282828", dbg:"#0a0a0a", dsf:"#141414", dhd:"#111111", dbd:"#252525", dtc:"#e8e8e8", dmu:"#888888", dac:"#6a9ad4", dsf2:"#1c1c1c" },
};

const DEFAULT_GESTURES = { nextPage: "tap_right", prevPage: "two_tap", brightness: "two_swipe" };

export default function App() {
  const [books, setBooks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [cur, setCur] = useState(null);
  const [view, setView] = useState("library");
  const [libMode, setLibMode] = useState("large");
  const [dark, setDark] = useState(false);
  const [themeKey, setThemeKey] = useState("blue");
  const [fs, setFs] = useState(18);
  // Rebuild page breaks when font size changes
  const setFsAndRebuild = async (newFs) => {
    setFs(newFs);
    if (cur) {
      setPageBreaks(null);
      setPage(0);
      setTimeout(async () => {
        const { h, w } = getContentDimensions();
        const breaks = await buildPageBreaks(cur.content, newFs, h, w);
        setPageBreaks(breaks);
      }, 50);
    }
  };
  const [bright, setBright] = useState(1);
  const [bms, setBms] = useState(false);
  const [chaps, setChaps] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [page, setPage] = useState(0);
  const [pageBreaks, setPageBreaks] = useState(null);
  const [tts, setTts] = useState(false);
  const [rate, setRate] = useState(1);
  const [brightFb, setBrightFb] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [gestures, setGestures] = useState(DEFAULT_GESTURES);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fir = useRef(null);
  const utt = useRef(null);
  const fbt = useRef(null);
  const lpTimer = useRef(null);
  const touchRef = useRef({ startX:0, startY:0, fingers:0, startB:1, twoStartY:0 });
  const contentAreaRef = useRef(null);

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

  const chapters = cur ? detectChapters(cur.content) : [];

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
    if (bms || chaps) return;
    if (fingers === 2 && absDx < 20 && absDy < 20) { if (gestures.prevPage === "two_tap") goPage(-1); return; }
    if (fingers !== 1) return;
    if (absDx > 40 && absDx > absDy) {
      if (dx < 0 && gestures.nextPage === "swipe_left") { goPage(1); return; }
      if (dx > 0 && gestures.prevPage === "swipe_right") { goPage(-1); return; }
    }
    if (absDy > 40 && absDy > absDx) {
      if (dy < 0 && gestures.nextPage === "swipe_up") { goPage(1); return; }
      if (dy > 0 && gestures.prevPage === "swipe_down") { goPage(-1); return; }
    }
    if (absDx < 15 && absDy < 15 && gestures.nextPage === "tap_right" && endX > W*0.6) goPage(1);
  }

  function startLP(book) { lpTimer.current = setTimeout(() => setCtxMenu({ book }), 600); }
  function cancelLP() { clearTimeout(lpTimer.current); }

  function goPageAbs(p) {
    setPage(Math.max(0, p));
  }
  function getContentDimensions() {
    if (contentAreaRef.current) {
      const rect = contentAreaRef.current.getBoundingClientRect();
      return { h: rect.height, w: rect.width };
    }
    // fallback
    return {
      h: window.innerHeight - 52 - 2 - 80 - 40,
      w: window.innerWidth - 40
    };
  }

  async function openBook(b) {
    setCur(b);
    setPage(b.page||0);
    setView("reader");
    setBms(false);
    setChaps(false);
    stopTTS();
    setPageBreaks(null);
    // Wait for reader DOM to render, then measure
    setTimeout(async () => {
      const { h, w } = getContentDimensions();
      const breaks = await buildPageBreaks(b.content, fs, h, w);
      setPageBreaks(breaks);
    }, 50);
  }
  function addBM() { if (!cur) return; const bm = {id:Date.now(), page, label:`第 ${page+1} 頁`}; const u = {...cur, bookmarks:[...cur.bookmarks, bm]}; setCur(u); setBooks(p => p.map(b => b.id===cur.id ? u : b)); dbPut(u); }
  function delBM(id) { const u = {...cur, bookmarks:cur.bookmarks.filter(x => x.id!==id)}; setCur(u); setBooks(p => p.map(b => b.id===cur.id ? u : b)); dbPut(u); }
  function jumpBM(bm) { goPageAbs(bm.page); setBms(false); }
  function jumpCh(ch) {
    if (!pageBreaks) return;
    // Find which page contains this char offset
    let targetPage = 0;
    for (let i = 0; i < pageBreaks.length; i++) {
      if (pageBreaks[i] <= ch.charOffset) targetPage = i;
      else break;
    }
    goPageAbs(targetPage);
    setChaps(false);
  }
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
    const u = new SpeechSynthesisUtterance(getPage(cur.content, page, pageBreaks));
    u.lang = "zh-TW"; u.rate = rate; u.onend = () => setTts(false);
    utt.current = u; window.speechSynthesis.speak(u); setTts(true);
  }
  function toggleTTS() { tts ? stopTTS() : startTTS(); }
  useEffect(() => () => stopTTS(), []);

  // 主題顏色
  const th = THEMES[themeKey] || THEMES.blue;
  const lbg = dark ? th.dbg : th.bg;
  const lsf = dark ? th.dsf : th.sf;
  const lsf2 = dark ? th.dsf2 : th.sf2;
  const ltc = dark ? th.dtc : th.tc;
  const lmu = dark ? th.dmu : th.mu;
  const lac = dark ? th.dac : th.ac;
  const lbd = dark ? th.dbd : th.bd;
  const lhd = dark ? th.dhd : th.hd;
  const rbg = dark ? "#1a1a1a" : "#ffffff";
  const rtc = dark ? "#e8e0d0" : "#1a1a1a";
  const rmu = dark ? "#888" : "#999";
  const rac = dark ? th.dac : th.ac;
  const rbd = dark ? "#333" : "#e8e8e8";
  const rhd = dark ? "#111" : th.hd;

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

  // 設定頁面
  if (view === "settings") return (
    <div style={{ height:"100vh", background:lbg, color:ltc, fontFamily:"Georgia,'Noto Serif TC',serif", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <style>{noZoomStyle}</style>
      <div style={{ padding:"20px 16px 12px", borderBottom:`1px solid ${lbd}`, display:"flex", alignItems:"center", gap:12, background:lhd, flexShrink:0 }}>
        <button style={ib(ltc)} onClick={() => setView("library")}>← 返回</button>
        <div style={{ fontSize:18, fontWeight:"bold" }}>設定</div>
      </div>
      <div style={{ padding:20, overflowY:"auto", flex:1 }}>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, color:lmu, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>主題</div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", background:lsf, borderRadius:12, border:`1px solid ${lbd}` }}>
            <span style={{ fontSize:15 }}>{dark?"🌙 夜間模式":"☀️ 白天模式"}</span>
            <Toggle on={dark} onToggle={() => setDark(d=>!d)} ac={lac} />
          </div>
        </div>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, color:lmu, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>閱讀字體大小</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {FSZ.map(s => <button key={s} style={{ padding:"9px 13px", borderRadius:10, border:`1px solid ${fs===s?lac:lbd}`, cursor:"pointer", fontSize:14, background:fs===s?lac:lsf, color:fs===s?"#fff":ltc, fontWeight:fs===s?"bold":"normal" }} onClick={() => setFsAndRebuild(s)}>{s}</button>)}
          </div>
        </div>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, color:lmu, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>亮度 {Math.round(bright*100)}%</div>
          <input type="range" min={20} max={100} value={Math.round(bright*100)} onChange={e => setBright(e.target.value/100)} style={{ width:"100%", accentColor:lac }} />
          <div style={{ fontSize:11, color:lmu, marginTop:6 }}>閱讀時也可用兩指上下滑動調整</div>
        </div>
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
        </div>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, color:lmu, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>介面主題</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {Object.entries(THEMES).map(([key, th]) => (
              <button key={key} style={{ padding:"8px 14px", borderRadius:10, border:`2px solid ${themeKey===key?lac:lbd}`, cursor:"pointer", fontSize:13, background:themeKey===key?lac:lsf, color:themeKey===key?"#fff":ltc, fontWeight:themeKey===key?"bold":"normal" }} onClick={() => setThemeKey(key)}>{th.name}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize:12, color:lmu, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>關於</div>
          <div style={{ padding:"14px 16px", background:lsf, borderRadius:12, border:`1px solid ${lbd}`, cursor:"pointer" }} onClick={() => setShowInfo(true)}>
            <div style={{ fontSize:15, color:ltc, fontWeight:"bold" }}>📖 小說閱讀器</div>
            <div style={{ fontSize:13, color:lac, marginTop:4, fontWeight:"bold" }}>{VERSION} — 查看更新紀錄 ›</div>
          </div>
        </div>
      </div>
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

  // 書庫
  if (view === "library") return (
    <div style={{ minHeight:"100vh", background:lbg, color:ltc, fontFamily:"Georgia,'Noto Serif TC',serif", paddingBottom:34 }}>
      <style>{noZoomStyle}</style>
      <input ref={fir} type="file" accept=".txt,.epub" style={{ display:"none" }} onChange={upload} />
      {uploading && <div style={{ position:"fixed", inset:0, background:"rgba(0,40,80,0.6)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ background:lsf, borderRadius:18, padding:"32px 40px", textAlign:"center", color:ltc }}>
          <div style={{ fontSize:40, marginBottom:12 }}>⏳</div>
          <div style={{ fontSize:16, fontWeight:"bold" }}>正在解析檔案...</div>
          <div style={{ fontSize:12, color:lmu, marginTop:8 }}>大檔案需要較長時間</div>
        </div>
      </div>}
      {ctxMenu && <Modal onClose={() => setCtxMenu(null)}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${lbd}`, fontWeight:"bold", fontSize:15, color:ltc, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>📖 {ctxMenu.book.title}</div>
        <div style={{ padding:"8px 0" }}>
          <div style={{ padding:"14px 20px", cursor:"pointer", fontSize:15, color:ltc }} onClick={() => { setRenameVal(ctxMenu.book.title); setRenameTarget(ctxMenu); setCtxMenu(null); }}>✏️ 重新命名</div>
          <div style={{ height:1, background:lbd, margin:"0 20px" }} />
          <div style={{ padding:"14px 20px", cursor:"pointer", fontSize:15, color:"#e05555" }} onClick={() => { setDeleteTarget(ctxMenu); setCtxMenu(null); }}>🗑️ 刪除書籍</div>
        </div>
        <div style={{ padding:"8px 20px 16px", display:"flex", justifyContent:"center" }}>
          <button style={{ background:"none", border:`1px solid ${lbd}`, borderRadius:10, padding:"8px 28px", cursor:"pointer", fontSize:14, color:lmu }} onClick={() => setCtxMenu(null)}>取消</button>
        </div>
      </Modal>}
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
      <div style={{ padding:"10px 16px 24px", textAlign:"center" }}>
        <div style={{ fontSize:12, color:lmu, marginBottom:4 }}>長按書籍可重新命名或刪除</div>
        <div style={{ fontSize:11, color:lmu, opacity:0.6 }}>小說閱讀器 {VERSION}</div>
      </div>
    </div>
  );

  // ── 閱讀器 ──────────────────────────────────────────────────
  // ── 唯一分頁顯示邏輯 ────────────────────────────────────────
  const totalPgs = pageBreaks ? Math.max(1, pageBreaks.length) : 1;
  const safePage = Math.min(page, totalPgs - 1);
  const pageText = cur && pageBreaks ? getPageText(cur.content, safePage, pageBreaks) : "";
  const progressPct = totalPgs > 1 ? Math.round((safePage / (totalPgs - 1)) * 100) : 100;

  function goPage(delta) {
    const np = Math.max(0, Math.min(totalPgs - 1, safePage + delta));
    setPage(np);
    if (cur) {
      const prog = np / Math.max(1, totalPgs - 1);
      const u = { ...cur, page: np, progress: prog };
      setCur(u);
      setBooks(prev => prev.map(b => b.id === cur.id ? u : b));
      dbPut(u);
    }
  }

  const anyP = bms || chaps;

  return (
    <div style={{ background: rbg, color: rtc, fontFamily: "Georgia,'Noto Serif TC',serif", display: "flex", flexDirection: "column", height: "100vh", width: "100vw", overflow: "hidden", filter: `brightness(${bright})` }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <style>{noZoomStyle}</style>

      {brightFb !== null && <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(0,0,0,0.75)", color: "#fff", borderRadius: 16, padding: "14px 24px", fontSize: 22, fontWeight: "bold", zIndex: 300, pointerEvents: "none" }}>☀️ {brightFb}%</div>}

      {/* Header */}
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${rbd}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: rhd, flexShrink: 0 }}>
        <button style={ib(rtc)} onClick={() => { setView("library"); setBms(false); setChaps(false); stopTTS(); }}>← 書庫</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 6px", color: rtc }}>{cur?.title}</div>
        <div style={{ display: "flex" }}>
          <button style={ib(rtc)} onClick={addBM}>🔖</button>
          <button style={{ ...ib(rtc), color: tts ? rac : rtc }} onClick={toggleTTS}>🔊</button>
          <button style={ib(rtc)} onClick={() => { setChaps(s => !s); setBms(false); }}>📋</button>
          <button style={ib(rtc)} onClick={() => { setBms(s => !s); setChaps(false); }}>📑</button>
        </div>
      </div>

      {tts && <div style={{ background: dark ? "#1a1a1a" : "#f8f8f8", borderBottom: `1px solid ${rbd}`, padding: "7px 16px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: rac, fontWeight: "bold" }}>🔊 朗讀中</span>
        {[0.75, 1, 1.25, 1.5, 2].map(r => <button key={r} style={{ background: rate === r ? rac : dark ? "#333" : "#eee", color: rate === r ? "#fff" : rtc, border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11 }} onClick={() => setRate(r)}>{r}x</button>)}
        <button style={{ marginLeft: "auto", background: "none", border: `1px solid ${rbd}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: rtc }} onClick={stopTTS}>停止</button>
      </div>}

      <div style={{ height: 2, background: rbd, flexShrink: 0 }}>
        <div style={{ height: "100%", background: rac, width: `${progressPct}%`, transition: "width 0.2s" }} />
      </div>

      {/* 內文 */}
      <div ref={contentAreaRef} style={{ flex: 1, overflow: "hidden", paddingTop: 20, paddingBottom: 0, paddingLeft: "max(20px, env(safe-area-inset-left))", paddingRight: "max(20px, env(safe-area-inset-right))", lineHeight: 1.95, fontSize: fs, color: rtc, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {!pageBreaks ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: rmu, fontSize: 14 }}>正在計算頁面...</div>
        ) : pageText}
      </div>

      {/* 底部 */}
      <div style={{ height: 44, paddingLeft: "max(20px, env(safe-area-inset-left))", paddingRight: "max(20px, env(safe-area-inset-right))", background: rbg, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: rmu, whiteSpace: "nowrap" }}>第 {safePage + 1} 頁，共 {totalPgs} 頁</span>
        <span style={{ fontSize: 12, color: rmu, whiteSpace: "nowrap" }}>{progressPct}%</span>
      </div>

      {anyP && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 99 }} onClick={() => { setBms(false); setChaps(false); }} />}

      {chaps && <div style={{ ...pn, background: dark ? "#1a1a1a" : "#fff", borderLeft: `1px solid ${rbd}` }}>
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${rbd}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: "bold", fontSize: 16, color: rtc }}>
          <span>章節（{chapters.length}）</span><button style={ib(rtc)} onClick={() => setChaps(false)}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {!chapters.length ? <div style={{ color: rmu, textAlign: "center", padding: "32px 0" }}>未偵測到章節</div> :
            chapters.map((ch, i) => <div key={i} style={{ padding: "11px 14px", borderRadius: 10, marginBottom: 6, background: dark ? "#2a2a2a" : "#f5f5f5", cursor: "pointer" }} onClick={() => jumpCh(ch)}>
              <div style={{ fontSize: 14, fontWeight: "bold", color: rtc }}>{ch.title}</div>
              <div style={{ fontSize: 11, color: rmu, marginTop: 2 }}>第 {i + 1} 章</div>
            </div>)}
        </div>
      </div>}

      {bms && <div style={{ ...pn, background: dark ? "#1a1a1a" : "#fff", borderLeft: `1px solid ${rbd}` }}>
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${rbd}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: "bold", fontSize: 16, color: rtc }}>
          <span>書籤（{cur?.bookmarks?.length || 0}）</span><button style={ib(rtc)} onClick={() => setBms(false)}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {!cur?.bookmarks?.length ?
            <div style={{ color: rmu, textAlign: "center", padding: "32px 0" }}><div style={{ fontSize: 32, marginBottom: 8 }}>🔖</div>尚無書籤</div> :
            cur.bookmarks.map(bm => <div key={bm.id} style={{ padding: "11px 14px", borderRadius: 10, marginBottom: 6, background: dark ? "#2a2a2a" : "#f5f5f5", display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1, cursor: "pointer" }} onClick={() => jumpBM(bm)}>
                <div style={{ fontSize: 14, fontWeight: "bold", color: rtc }}>{bm.label}</div>
                <div style={{ fontSize: 11, color: rmu }}>第 {bm.page + 1} 頁</div>
              </div>
              <button style={{ background: "none", border: "none", color: rmu, cursor: "pointer", fontSize: 16 }} onClick={() => delBM(bm.id)}>✕</button>
            </div>)}
        </div>
      </div>}
    </div>
  );
}
