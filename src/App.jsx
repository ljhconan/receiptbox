import { useState, useEffect, useRef } from "react";

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const todayStr = () => new Date().toISOString().slice(0, 10);

async function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.75);
    };
    img.src = url;
  });
}

async function callClaude(b64, mimeType) {
  const res = await fetch("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: b64, mimeType }),
  });
  if (!res.ok) throw new Error("API error");
  return res.json();
}

async function lookupItem(itemName, merchant) {
  const res = await fetch("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemName, merchant }),
  });
  if (!res.ok) throw new Error("Lookup failed");
  return res.json();
}

function buildCsv(receipts) {
  const H = ["Date","Merchant","Client","Project","Item","Qty","Unit Price","Item Total","Tax","Receipt Total","Payment Method"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = receipts.flatMap((r) =>
    (r.items?.length ? r.items : [{ name: "(no items)" }]).map((item, i) => [
      r.date||"", r.merchant||"", r.clientName||"", r.projectNote||"",
      item.name||"", item.qty||"", item.unitPrice||"", item.total||"",
      i===0 ? r.tax||"" : "",
      i===0 ? r.total||"" : "",
      i===0 ? r.paymentMethod||"" : "",
    ])
  );
  return [H, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

const C = {
  orange: "#F97316", black: "#111111", dark: "#1A1A1A", mid: "#6B7280",
  light: "#F8F7F5", white: "#FFFFFF", border: "#E8E8E6",
  red: "#DC2626", cardBg: "#FAFAF8",
};

function loadData() {
  try { const r = localStorage.getItem("receiptbox_v1"); if (r) return JSON.parse(r); } catch {}
  return { receipts: [], clients: [] };
}
function saveData(r, c) {
  try { localStorage.setItem("receiptbox_v1", JSON.stringify({ receipts: r, clients: c })); } catch {}
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
function IconCamera({ size = 24, color = "currentColor", strokeWidth = 1.5 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}
function IconReceipt({ size = 24, color = "currentColor", strokeWidth = 1.5 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1z"/>
      <line x1="8" y1="9" x2="16" y2="9"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="12" y2="17"/>
    </svg>
  );
}
function IconUsers({ size = 24, color = "currentColor", strokeWidth = 1.5 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconDownload({ size = 24, color = "currentColor", strokeWidth = 1.5 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}
function IconPhoto({ size = 24, color = "currentColor", strokeWidth = 1.5 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}

const NAV_TABS = [
  { key: "scan",     label: "扫描",  Icon: IconCamera },
  { key: "receipts", label: "账单",  Icon: IconReceipt },
  { key: "clients",  label: "客户",  Icon: IconUsers },
  { key: "export",   label: "导出",  Icon: IconDownload },
];

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("scan");
  const [receipts, setReceipts] = useState([]);
  const [clients, setClients] = useState([]);
  const [reviewing, setReviewing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lookup, setLookup] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    const d = loadData();
    setReceipts(d.receipts || []);
    setClients(d.clients || []);
  }, []);

  const persist = (r, c) => saveData(r, c);

  const addClient = (name) => {
    const c = { id: uid(), name, createdAt: todayStr() };
    const updated = [...clients, c];
    setClients(updated); persist(receipts, updated); return c;
  };

  const saveReceipt = (receipt) => {
    const updated = [{ ...receipt, savedAt: new Date().toISOString() }, ...receipts];
    setReceipts(updated); persist(updated, clients);
    setReviewing(null); setTab("receipts");
  };

  const deleteReceipt = (id) => {
    if (!confirm("确认删除这张小票吗？")) return;
    const updated = receipts.filter((r) => r.id !== id);
    setReceipts(updated); persist(updated, clients);
  };

  const handleImage = async (file) => {
    if (!file) return;
    setError(""); setLoading(true);
    try {
      const compressed = await compressImage(file);
      const b64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(compressed);
      });
      const extracted = await callClaude(b64, "image/jpeg");
      setReviewing({ ...extracted, id: uid(), clientId: "", clientName: "", projectNote: "" });
    } catch {
      setError("识别失败，请重试。建议光线充足、小票放平拍摄。");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", maxWidth:480, margin:"0 auto",
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background:C.light, overflow:"hidden" }}>

      {/* Minimal top bar */}
      {!reviewing && (
        <div style={{ padding:"16px 20px 0", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:8, height:8, background:C.orange, borderRadius:"50%" }} />
            <span style={{ fontSize:14, fontWeight:600, color:C.black }}>ReceiptBox</span>
          </div>
          <span style={{ fontSize:11, color:C.mid }}>材料账单管理</span>
        </div>
      )}

      {/* Content — fills remaining space */}
      <div style={{ flex:1, overflow:"hidden", position:"relative", display:"flex", flexDirection:"column" }}>
        {loading && <Loader />}
        {lookup && <ItemLookupModal item={lookup.item} merchant={lookup.merchant} onClose={() => setLookup(null)} />}
        {reviewing ? (
          <div style={{ flex:1, overflowY:"auto" }}>
            <ReviewScreen receipt={reviewing} clients={clients}
              onSave={saveReceipt} onAddClient={addClient}
              onCancel={() => setReviewing(null)} onChange={setReviewing} />
          </div>
        ) : tab === "scan" ? (
          <ScanScreen onImage={handleImage} fileRef={fileRef} error={error} />
        ) : (
          <div style={{ flex:1, overflowY:"auto" }}>
            {tab === "receipts" && <ReceiptsScreen receipts={receipts} clients={clients} onDelete={deleteReceipt} onLookup={setLookup} />}
            {tab === "clients" && <ClientsScreen clients={clients} receipts={receipts} onAdd={addClient} />}
            {tab === "export" && <ExportScreen receipts={receipts} clients={clients} />}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      {!reviewing && (
        <div style={{ background:C.white, borderTop:`1px solid ${C.border}`, display:"flex", flexShrink:0,
          paddingBottom:"env(safe-area-inset-bottom, 0px)" }}>
          {NAV_TABS.map(({ key, label, Icon }) => {
            const active = tab === key;
            return (
              <button key={key} onClick={() => setTab(key)}
                style={{ flex:1, padding:"10px 0 10px", border:"none", background:"none", cursor:"pointer",
                  display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                  color: active ? C.orange : "#9CA3AF" }}>
                <Icon size={22} color={active ? C.orange : "#9CA3AF"} strokeWidth={active ? 2 : 1.5} />
                <span style={{ fontSize:10, fontWeight: active ? 600 : 400 }}>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Loader ────────────────────────────────────────────────────────────────────
function Loader() {
  const msgs = ["正在识别小票...","分析商品明细...","提取价格信息..."];
  const [mi, setMi] = useState(0);
  useEffect(() => { const t = setInterval(() => setMi((m) => (m+1) % msgs.length), 1200); return () => clearInterval(t); }, []);
  return (
    <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.78)", zIndex:100,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:44, height:44, border:`3px solid rgba(255,255,255,0.15)`, borderTop:`3px solid ${C.orange}`,
        borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <div style={{ color:"#fff", fontSize:14, fontWeight:500 }}>{msgs[mi]}</div>
    </div>
  );
}

// ── Item Lookup Modal ─────────────────────────────────────────────────────────
function ItemLookupModal({ item, merchant, onClose }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    lookupItem(item.name, merchant)
      .then(setInfo).catch(() => setErr(true)).finally(() => setLoading(false));
  }, []);

  const q = info?.searchQuery || item.name;
  const hdUrl = `https://www.homedepot.com/s/${encodeURIComponent(q)}`;
  const lowesUrl = `https://www.lowes.com/search?searchTerm=${encodeURIComponent(q)}`;

  return (
    <div style={{ position:"absolute", inset:0, zIndex:200, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.5)" }} />
      <div style={{ position:"relative", background:C.white, borderRadius:"22px 22px 0 0", padding:"20px 20px 40px", maxHeight:"75vh", overflowY:"auto" }}>
        <div style={{ width:40, height:4, background:"#E5E7EB", borderRadius:2, margin:"0 auto 20px" }} />
        <div style={{ fontSize:11, fontWeight:600, color:C.mid, letterSpacing:0.6, marginBottom:6, textTransform:"uppercase" }}>小票原文</div>
        <div style={{ fontFamily:"monospace", fontSize:14, fontWeight:600, color:C.dark, background:"#F4F4F2", padding:"10px 14px", borderRadius:10, marginBottom:20 }}>{item.name}</div>
        {loading && (
          <div style={{ textAlign:"center", padding:"32px 0", color:C.mid }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ width:28, height:28, border:`2px solid #eee`, borderTop:`2px solid ${C.orange}`, borderRadius:"50%", animation:"spin 0.7s linear infinite", margin:"0 auto 12px" }} />
            <div style={{ fontSize:13 }}>正在识别商品...</div>
          </div>
        )}
        {err && <div style={{ color:C.red, fontSize:14, textAlign:"center", padding:16 }}>识别失败，请重试</div>}
        {info && !loading && (
          <>
            <div style={{ fontSize:11, fontWeight:600, color:C.mid, letterSpacing:0.6, marginBottom:6, textTransform:"uppercase" }}>商品名称</div>
            <div style={{ fontSize:20, fontWeight:700, color:C.dark, marginBottom:8, lineHeight:1.3 }}>{info.fullName}</div>
            {info.category && (
              <div style={{ display:"inline-block", background:"#FFF7ED", color:"#C2410C", fontSize:11, fontWeight:600, padding:"4px 12px", borderRadius:20, marginBottom:14 }}>{info.category}</div>
            )}
            <div style={{ fontSize:14, color:"#4B5563", lineHeight:1.7, marginBottom:24 }}>{info.description}</div>
            <div style={{ fontSize:11, fontWeight:600, color:C.mid, letterSpacing:0.6, marginBottom:12, textTransform:"uppercase" }}>查看商品图片</div>
            <div style={{ display:"flex", gap:10 }}>
              <a href={hdUrl} target="_blank" rel="noopener noreferrer"
                style={{ flex:1, padding:"14px", background:"#F96302", color:"#fff", borderRadius:12, fontWeight:700, fontSize:14, textDecoration:"none", textAlign:"center", display:"block" }}>
                Home Depot →
              </a>
              <a href={lowesUrl} target="_blank" rel="noopener noreferrer"
                style={{ flex:1, padding:"14px", background:"#004990", color:"#fff", borderRadius:12, fontWeight:700, fontSize:14, textDecoration:"none", textAlign:"center", display:"block" }}>
                Lowe's →
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Scan Screen ───────────────────────────────────────────────────────────────
function ScanScreen({ onImage, fileRef, error }) {
  const pick = (camera) => {
    if (!fileRef.current) return;
    fileRef.current.accept = "image/*";
    if (camera) fileRef.current.setAttribute("capture", "environment");
    else fileRef.current.removeAttribute("capture");
    fileRef.current.click();
  };

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", padding:"16px 20px 20px", gap:12, overflow:"hidden" }}>
      <div style={{ fontSize:22, fontWeight:700, color:C.black, flexShrink:0 }}>扫一张，存一张</div>

      {/* Camera viewfinder — grows to fill space */}
      <div onClick={() => pick(true)}
        style={{ flex:1, background:C.dark, borderRadius:18, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", gap:14, cursor:"pointer", position:"relative",
          overflow:"hidden", minHeight:200 }}>
        {/* Corner brackets */}
        {[[{top:14,left:14},["Top","Left"]],[{top:14,right:14},["Top","Right"]],
          [{bottom:14,left:14},["Bottom","Left"]],[{bottom:14,right:14},["Bottom","Right"]]
        ].map(([pos, sides], i) => (
          <div key={i} style={{ position:"absolute", width:20, height:20,
            [`border${sides[0]}`]: `2px solid rgba(255,255,255,0.4)`,
            [`border${sides[1]}`]: `2px solid rgba(255,255,255,0.4)`,
            borderRadius: i===0?"3px 0 0 0":i===1?"0 3px 0 0":i===2?"0 0 0 3px":"0 0 3px 0",
            ...pos }} />
        ))}
        {/* Camera icon — clean outline circle */}
        <div style={{ width:64, height:64, borderRadius:"50%",
          border:`1.5px solid rgba(255,255,255,0.25)`,
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <IconCamera size={28} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:15, color:"rgba(255,255,255,0.9)", fontWeight:500 }}>点击拍照识别</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:4 }}>对准小票，保持平整</div>
        </div>
      </div>

      {/* From gallery */}
      <div onClick={() => pick(false)}
        style={{ flexShrink:0, background:C.white, borderRadius:14, padding:"13px 18px",
          display:"flex", alignItems:"center", gap:12, cursor:"pointer", border:`1px solid ${C.border}` }}>
        <IconPhoto size={20} color={C.mid} />
        <span style={{ fontSize:14, color:C.dark, fontWeight:500 }}>从相册上传</span>
      </div>

      <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }}
        onChange={(e) => onImage(e.target.files?.[0])} />

      {error && (
        <div style={{ flexShrink:0, padding:14, background:"#FEF2F2", border:`1px solid #FECACA`, borderRadius:12, color:C.red, fontSize:13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Stores — compact */}
      <div style={{ flexShrink:0, display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:11, color:C.mid }}>适用：</span>
        {["Home Depot", "Lowe's", "五金建材店"].map((s) => (
          <span key={s} style={{ fontSize:11, color:"#374151", background:C.white,
            border:`1px solid ${C.border}`, padding:"3px 10px", borderRadius:20 }}>{s}</span>
        ))}
      </div>
    </div>
  );
}

// ── Review Screen ─────────────────────────────────────────────────────────────
function ReviewScreen({ receipt, clients, onSave, onAddClient, onCancel, onChange }) {
  const [newClientName, setNewClientName] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const up = (k, v) => onChange({ ...receipt, [k]: v });
  const upItem = (i, k, v) => {
    const items = [...(receipt.items || [])];
    items[i] = { ...items[i], [k]: v };
    onChange({ ...receipt, items });
  };
  const removeItem = (i) => onChange({ ...receipt, items: receipt.items.filter((_, j) => j !== i) });
  const addItem = () => onChange({ ...receipt, items: [...(receipt.items || []), { name: "", qty: 1, unitPrice: "", total: "" }] });

  const handleClientSelect = (e) => {
    const v = e.target.value;
    if (v === "__new__") { setShowAdd(true); return; }
    const c = clients.find((c) => c.id === v);
    onChange({ ...receipt, clientId: v, clientName: c?.name || "" });
    setShowAdd(false);
  };

  const handleAddClient = () => {
    if (!newClientName.trim()) return;
    const c = onAddClient(newClientName.trim());
    onChange({ ...receipt, clientId: c.id, clientName: c.name });
    setNewClientName(""); setShowAdd(false);
  };

  const card = { background:C.white, borderRadius:16, padding:16, marginBottom:12, border:`1px solid ${C.border}` };
  const sec = { fontSize:11, fontWeight:600, color:C.mid, marginBottom:12, letterSpacing:0.5, textTransform:"uppercase" };
  const inp = { padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:10, fontSize:14, background:"#F9FAFB", color:C.dark, width:"100%", boxSizing:"border-box" };

  return (
    <div style={{ paddingBottom:100 }}>
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:"13px 16px",
        display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:10 }}>
        <button onClick={onCancel} style={{ border:"none", background:"none", color:C.mid, cursor:"pointer", fontSize:14 }}>← 取消</button>
        <div style={{ flex:1, fontWeight:600, fontSize:15, color:C.black }}>确认识别结果</div>
        <button onClick={() => { if (!receipt.clientId) { alert("请选择客户"); return; } onSave(receipt); }}
          style={{ background:C.orange, color:"#fff", border:"none", borderRadius:10, padding:"9px 20px", fontWeight:700, fontSize:14, cursor:"pointer" }}>
          保存 ✓
        </button>
      </div>
      <div style={{ padding:16 }}>
        <div style={card}>
          <div style={sec}>基本信息</div>
          {[["merchant","商家"],["date","日期"],["paymentMethod","支付方式"]].map(([k, lbl]) => (
            <div key={k} style={{ display:"flex", alignItems:"center", marginBottom:10, gap:10 }}>
              <div style={{ width:52, fontSize:12, color:C.mid, flexShrink:0 }}>{lbl}</div>
              <input value={receipt[k] || ""} onChange={(e) => up(k, e.target.value)}
                type={k === "date" ? "date" : "text"} placeholder={lbl}
                style={{ flex:1, ...inp }} />
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={sec}>归属客户 <span style={{ color:C.orange }}>*</span></div>
          <select value={receipt.clientId || ""} onChange={handleClientSelect} style={{ ...inp, marginBottom:8 }}>
            <option value="">选择客户...</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new__">＋ 新建客户</option>
          </select>
          {showAdd && (
            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
              <input value={newClientName} onChange={(e) => setNewClientName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddClient()}
                placeholder="输入客户名称" style={{ ...inp, flex:1 }} />
              <button onClick={handleAddClient}
                style={{ background:C.orange, color:"#fff", border:"none", borderRadius:10, padding:"0 16px", fontWeight:700, fontSize:14, cursor:"pointer" }}>添加</button>
            </div>
          )}
          <input value={receipt.projectNote || ""} onChange={(e) => up("projectNote", e.target.value)}
            placeholder="项目备注（可选，如：厨房改造）" style={inp} />
        </div>

        <div style={card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={sec}>商品明细（{(receipt.items || []).length} 项）</div>
            <button onClick={addItem}
              style={{ background:C.orange, color:"#fff", border:"none", borderRadius:8, padding:"5px 12px", fontSize:12, fontWeight:700, cursor:"pointer" }}>＋ 添加</button>
          </div>
          {!(receipt.items || []).length && (
            <div style={{ textAlign:"center", color:"#9CA3AF", fontSize:13, padding:"14px 0" }}>未识别到商品，请手动添加</div>
          )}
          {(receipt.items || []).map((item, i) => (
            <div key={i} style={{ borderTop: i > 0 ? `1px solid ${C.light}` : "none", paddingTop: i > 0 ? 12 : 0, marginTop: i > 0 ? 12 : 0 }}>
              <div style={{ display:"flex", gap:6 }}>
                <input value={item.name || ""} onChange={(e) => upItem(i, "name", e.target.value)}
                  placeholder="商品名称" style={{ ...inp, flex:1, fontSize:13 }} />
                <button onClick={() => removeItem(i)}
                  style={{ border:"none", background:"none", color:"#9CA3AF", cursor:"pointer", fontSize:18, padding:"0 4px" }}>×</button>
              </div>
              <div style={{ display:"flex", gap:6, marginTop:6 }}>
                {[["qty","数量",60],["unitPrice","单价",null],["total","总价",null]].map(([k, lbl, w]) => (
                  <div key={k} style={{ flex: w ? `0 0 ${w}px` : 1 }}>
                    <div style={{ fontSize:10, color:"#9CA3AF", marginBottom:3 }}>{lbl}</div>
                    <input value={item[k] || ""} onChange={(e) => upItem(i, k, e.target.value)}
                      type="number" step={k === "qty" ? 1 : 0.01} min={0}
                      style={{ ...inp, fontSize:13, padding:"7px 8px", textAlign: k !== "qty" ? "right" : "center" }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ marginTop:14, paddingTop:12, borderTop:"1px dashed #E5E7EB" }}>
            {[["subtotal","小计",false],["tax","税",false],["total","合计",true]].map(([k, lbl, bold]) => (
              <div key={k} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:13, color: bold ? C.dark : C.mid, fontWeight: bold ? 700 : 400 }}>{lbl}</span>
                <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                  <span style={{ fontSize:13, color:C.mid }}>$</span>
                  <input value={receipt[k] || ""} onChange={(e) => up(k, e.target.value)} type="number" step="0.01"
                    style={{ width:80, padding:"4px 8px", border:`1px solid ${C.border}`, borderRadius:6,
                      fontSize:14, fontWeight: bold ? 700 : 400, textAlign:"right", fontFamily:"monospace", background:"#F9FAFB" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Receipts Screen ───────────────────────────────────────────────────────────
function ReceiptsScreen({ receipts, clients, onDelete, onLookup }) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState(null);
  const list = [...(filter ? receipts.filter((r) => r.clientId === filter) : receipts)]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div style={{ padding:16 }}>
      <select value={filter} onChange={(e) => setFilter(e.target.value)}
        style={{ width:"100%", padding:"11px 14px", border:`1px solid ${C.border}`, borderRadius:12, fontSize:14, background:C.white, marginBottom:14, color:C.dark }}>
        <option value="">所有客户（{receipts.length} 张）</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}（{receipts.filter((r) => r.clientId === c.id).length} 张）</option>)}
      </select>
      {!list.length && (
        <div style={{ textAlign:"center", padding:"56px 0", color:"#9CA3AF" }}>
          <IconReceipt size={44} color="#D1D5DB" strokeWidth={1} />
          <div style={{ fontSize:15, fontWeight:600, marginTop:12 }}>暂无账单</div>
          <div style={{ fontSize:13, marginTop:4 }}>扫描第一张小票开始吧</div>
        </div>
      )}
      {list.map((r) => (
        <div key={r.id} style={{ background:C.white, borderRadius:16, marginBottom:10, border:`1px solid ${C.border}`, overflow:"hidden" }}>
          <div onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            style={{ padding:"14px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:600, fontSize:15, color:C.dark, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.merchant || "未知商家"}</div>
              <div style={{ fontSize:12, color:C.mid, marginTop:3 }}>
                {r.date} · <span style={{ color:C.orange, fontWeight:600 }}>{r.clientName}</span>{r.projectNote ? ` · ${r.projectNote}` : ""}
              </div>
            </div>
            <div style={{ textAlign:"right", flexShrink:0 }}>
              <div style={{ fontWeight:700, fontSize:16, color:C.dark, fontFamily:"monospace" }}>${Number(r.total || 0).toFixed(2)}</div>
              <div style={{ fontSize:11, color:"#9CA3AF", marginTop:1 }}>{(r.items || []).length} items</div>
            </div>
            <div style={{ color:"#D1D5DB", fontSize:11 }}>{expanded === r.id ? "▲" : "▼"}</div>
          </div>
          {expanded === r.id && (
            <div style={{ borderTop:`1px solid ${C.light}`, background:C.cardBg, padding:"10px 16px 14px" }}>
              <div style={{ fontSize:11, color:C.mid, marginBottom:8 }}>点击商品名查看详情 🔍</div>
              {(r.items || []).map((item, i) => (
                <div key={i} onClick={() => onLookup({ item, merchant: r.merchant })}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                    fontSize:13, padding:"7px 0", borderBottom: i < (r.items||[]).length-1 ? `1px solid ${C.border}` : "none", cursor:"pointer" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, minWidth:0 }}>
                    <span style={{ fontSize:12, color:C.orange }}>🔍</span>
                    <span style={{ color:"#1D4ED8", textDecoration:"underline", fontFamily:"monospace",
                      fontSize:12, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {item.name}{item.qty > 1 ? ` ×${item.qty}` : ""}
                    </span>
                  </div>
                  <span style={{ fontFamily:"monospace", fontWeight:600, color:C.dark, flexShrink:0, marginLeft:8 }}>
                    ${Number(item.total || 0).toFixed(2)}
                  </span>
                </div>
              ))}
              <div style={{ marginTop:10, display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:11, color:C.mid }}>税 ${Number(r.tax || 0).toFixed(2)} · {r.paymentMethod || "—"}</span>
                <button onClick={() => onDelete(r.id)} style={{ border:"none", background:"none", color:C.red, cursor:"pointer", fontSize:12, fontWeight:600 }}>删除</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Clients Screen ────────────────────────────────────────────────────────────
function ClientsScreen({ clients, receipts, onAdd }) {
  const [name, setName] = useState("");
  const handle = () => { if (name.trim()) { onAdd(name.trim()); setName(""); } };
  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        <input value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handle()}
          placeholder="新建客户名称..."
          style={{ flex:1, padding:"12px 14px", border:`1px solid ${C.border}`, borderRadius:12, fontSize:14, background:C.white }} />
        <button onClick={handle}
          style={{ background:C.orange, color:"#fff", border:"none", borderRadius:12, padding:"0 20px", fontWeight:700, fontSize:14, cursor:"pointer" }}>添加</button>
      </div>
      {!clients.length && (
        <div style={{ textAlign:"center", padding:"56px 0", color:"#9CA3AF" }}>
          <IconUsers size={44} color="#D1D5DB" strokeWidth={1} />
          <div style={{ fontSize:15, fontWeight:600, marginTop:12 }}>还没有客户</div>
          <div style={{ fontSize:13, marginTop:4 }}>在上方输入名称添加</div>
        </div>
      )}
      {clients.map((c) => {
        const recs = receipts.filter((r) => r.clientId === c.id);
        const total = recs.reduce((s, r) => s + Number(r.total || 0), 0);
        return (
          <div key={c.id} style={{ background:C.white, borderRadius:16, padding:"14px 16px", marginBottom:10,
            border:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:42, height:42, background:"#FFF7ED", borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <IconUsers size={20} color={C.orange} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:15, color:C.dark }}>{c.name}</div>
              <div style={{ fontSize:12, color:C.mid, marginTop:2 }}>{recs.length} 张小票 · {c.createdAt}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontWeight:700, fontSize:16, color:C.orange, fontFamily:"monospace" }}>${total.toFixed(2)}</div>
              <div style={{ fontSize:10, color:"#9CA3AF", marginTop:1 }}>累计支出</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Export Screen ─────────────────────────────────────────────────────────────
function ExportScreen({ receipts, clients }) {
  const [filterClient, setFilterClient] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = receipts.filter((r) => {
    if (filterClient && r.clientId !== filterClient) return false;
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    return true;
  });
  const total = filtered.reduce((s, r) => s + Number(r.total || 0), 0);
  const tax = filtered.reduce((s, r) => s + Number(r.tax || 0), 0);
  const download = () => {
    const blob = new Blob(["\uFEFF" + buildCsv(filtered)], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `receipts_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };
  const inp = { padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:10, fontSize:14, background:C.white, boxSizing:"border-box", width:"100%" };
  return (
    <div style={{ padding:16 }}>
      <div style={{ background:C.white, borderRadius:16, padding:16, marginBottom:14, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:11, fontWeight:600, color:C.mid, marginBottom:12, letterSpacing:0.5, textTransform:"uppercase" }}>筛选条件</div>
        <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} style={{ ...inp, marginBottom:10 }}>
          <option value="">所有客户</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ display:"flex", gap:8 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:C.mid, marginBottom:4 }}>开始日期</div>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:C.mid, marginBottom:4 }}>结束日期</div>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} />
          </div>
        </div>
      </div>
      <div style={{ background:C.dark, borderRadius:16, padding:"22px 20px", marginBottom:16, color:"#fff" }}>
        <div style={{ fontSize:11, color:"#888", marginBottom:6, letterSpacing:0.5 }}>导出汇总</div>
        <div style={{ fontSize:34, fontWeight:700, fontFamily:"monospace", letterSpacing:-1 }}>${total.toFixed(2)}</div>
        <div style={{ fontSize:12, color:"#888", marginTop:4 }}>{filtered.length} 张小票 · 含税 ${tax.toFixed(2)}</div>
      </div>
      <button onClick={download} disabled={!filtered.length}
        style={{ width:"100%", padding:"17px", background: filtered.length ? C.orange : "#D1D5DB",
          color:"#fff", border:"none", borderRadius:14, fontSize:16, fontWeight:700,
          cursor: filtered.length ? "pointer" : "not-allowed",
          display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
        <IconDownload size={22} color="#fff" />
        下载 CSV（{filtered.length} 张）
      </button>
      <div style={{ marginTop:14, fontSize:12, color:"#9CA3AF", textAlign:"center", lineHeight:1.7 }}>
        用 Excel 打开 · 支持年末报税、分客户报销
      </div>
    </div>
  );
}
