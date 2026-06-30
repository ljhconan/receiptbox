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
  orange: "#F97316", hd: "#F96302", lowes: "#004990",
  black: "#111111", dark: "#1A1A1A", mid: "#6B7280",
  light: "#F8F8F6", white: "#FFFFFF", border: "#EBEBEB",
  red: "#DC2626", cardBg: "#FAFAF8", green: "#16A34A",
};

function loadData() {
  try { const r = localStorage.getItem("receiptbox_v1"); if (r) return JSON.parse(r); } catch {}
  return { receipts: [], clients: [] };
}
function saveData(r, c) {
  try { localStorage.setItem("receiptbox_v1", JSON.stringify({ receipts: r, clients: c })); } catch {}
}

// ── Receipt Icon SVG ──────────────────────────────────────────────────────────
function ReceiptIcon({ size = 20, color = "#fff" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1z"/>
      <line x1="8" y1="9" x2="16" y2="9"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="12" y2="17"/>
    </svg>
  );
}

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

  const tabs = [["scan","scan","扫描"],["receipts","list","账单"],["clients","people","客户"],["export","export","导出"]];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", maxWidth:480, margin:"0 auto",
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background:C.light, overflow:"hidden", position:"relative" }}>

      {/* Header */}
      <div style={{ background:C.dark, padding:"16px 20px 14px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <div style={{ width:36, height:36, background:C.orange, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <ReceiptIcon size={18} color="#fff" />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, fontSize:18, color:"#fff", letterSpacing:-0.3 }}>ReceiptBox</div>
          <div style={{ fontSize:11, color:"#888", marginTop:-1, letterSpacing:0.3 }}>CONTRACTOR RECEIPT MANAGER</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:"auto", position:"relative" }}>
        {loading && <Loader />}
        {lookup && <ItemLookupModal item={lookup.item} merchant={lookup.merchant} onClose={() => setLookup(null)} />}
        {reviewing ? (
          <ReviewScreen receipt={reviewing} clients={clients}
            onSave={saveReceipt} onAddClient={addClient}
            onCancel={() => setReviewing(null)} onChange={setReviewing} />
        ) : tab === "scan" ? (
          <ScanScreen onImage={handleImage} fileRef={fileRef} error={error} />
        ) : tab === "receipts" ? (
          <ReceiptsScreen receipts={receipts} clients={clients} onDelete={deleteReceipt} onLookup={setLookup} />
        ) : tab === "clients" ? (
          <ClientsScreen clients={clients} receipts={receipts} onAdd={addClient} />
        ) : (
          <ExportScreen receipts={receipts} clients={clients} />
        )}
      </div>

      {/* Bottom Nav */}
      {!reviewing && (
        <div style={{ background:C.white, borderTop:`1px solid ${C.border}`, display:"flex", flexShrink:0 }}>
          {[["scan","📷","扫描"],["receipts","🧾","账单"],["clients","👷","客户"],["export","📤","导出"]].map(([key, icon, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ flex:1, padding:"10px 0 8px", border:"none", background:"none", cursor:"pointer",
                display:"flex", flexDirection:"column", alignItems:"center", gap:2,
                color: tab === key ? C.orange : "#9CA3AF" }}>
              <span style={{ fontSize:22 }}>{icon}</span>
              <span style={{ fontSize:10, fontWeight: tab === key ? 700 : 400 }}>{label}</span>
            </button>
          ))}
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

  const categoryColors = {
    "Fasteners": "#7C3AED", "Lumber & Boards": "#92400E", "Electrical": "#B45309",
    "Plumbing": "#1D4ED8", "Paint & Supplies": "#BE185D", "Hand Tools": "#374151",
    "Power Tools": "#DC2626", "Hardware": "#6B7280", "Flooring": "#065F46",
    "Building Materials": "#1E40AF", "Garden": "#15803D", "Safety": "#B91C1C", "Other": "#6B7280"
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.55)" }} />
      <div style={{ position:"relative", background:C.white, borderRadius:"22px 22px 0 0", padding:"20px 20px 36px", maxHeight:"75vh", overflowY:"auto" }}>
        <div style={{ width:40, height:4, background:"#E5E7EB", borderRadius:2, margin:"0 auto 20px" }} />

        {/* Original name */}
        <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", letterSpacing:0.8, marginBottom:6, textTransform:"uppercase" }}>小票原文</div>
        <div style={{ fontFamily:"monospace", fontSize:15, fontWeight:700, color:C.dark, background:"#F4F4F2",
          padding:"10px 14px", borderRadius:10, marginBottom:20 }}>{item.name}</div>

        {loading && (
          <div style={{ textAlign:"center", padding:"32px 0", color:"#9CA3AF" }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ width:28, height:28, border:`2px solid #eee`, borderTop:`2px solid ${C.orange}`,
              borderRadius:"50%", animation:"spin 0.7s linear infinite", margin:"0 auto 12px" }} />
            <div style={{ fontSize:13 }}>正在识别商品...</div>
          </div>
        )}

        {err && <div style={{ color:C.red, fontSize:14, textAlign:"center", padding:16 }}>识别失败，请重试</div>}

        {info && !loading && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", letterSpacing:0.8, marginBottom:6, textTransform:"uppercase" }}>商品名称</div>
            <div style={{ fontSize:20, fontWeight:800, color:C.dark, marginBottom:10, lineHeight:1.3 }}>{info.fullName}</div>

            {info.category && (
              <div style={{ display:"inline-block", background: categoryColors[info.category] || "#6B7280",
                color:"#fff", fontSize:11, fontWeight:700, padding:"4px 12px", borderRadius:20, marginBottom:14 }}>
                {info.category}
              </div>
            )}

            <div style={{ fontSize:14, color:"#4B5563", lineHeight:1.7, marginBottom:24 }}>{info.description}</div>

            <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", letterSpacing:0.8, marginBottom:12, textTransform:"uppercase" }}>在线查看商品图片</div>
            <div style={{ display:"flex", gap:10 }}>
              <a href={hdUrl} target="_blank" rel="noopener noreferrer"
                style={{ flex:1, padding:"14px 10px", background:C.hd, color:"#fff", borderRadius:12,
                  fontWeight:700, fontSize:14, textDecoration:"none", textAlign:"center", display:"block" }}>
                Home Depot →
              </a>
              <a href={lowesUrl} target="_blank" rel="noopener noreferrer"
                style={{ flex:1, padding:"14px 10px", background:C.lowes, color:"#fff", borderRadius:12,
                  fontWeight:700, fontSize:14, textDecoration:"none", textAlign:"center", display:"block" }}>
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
    <div style={{ padding:"28px 20px 24px", display:"flex", flexDirection:"column", gap:20 }}>

      {/* Hero */}
      <div style={{ background:C.dark, borderRadius:20, padding:"28px 24px", color:"#fff", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", right:-20, top:-20, width:120, height:120, background:"rgba(249,115,22,0.12)", borderRadius:"50%" }} />
        <div style={{ position:"absolute", right:20, bottom:-30, width:80, height:80, background:"rgba(249,115,22,0.08)", borderRadius:"50%" }} />
        <div style={{ position:"relative" }}>
          <div style={{ fontSize:13, color:"#888", fontWeight:600, letterSpacing:0.5, marginBottom:8 }}>RECEIPT SCANNER</div>
          <div style={{ fontSize:26, fontWeight:800, lineHeight:1.2, marginBottom:6 }}>拍照即可<br/>自动记录账单</div>
          <div style={{ fontSize:13, color:"#aaa", marginTop:8 }}>AI 自动提取商品名称、价格、日期</div>
        </div>
      </div>

      {/* Supported Stores */}
      <div>
        <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", letterSpacing:0.8, marginBottom:10, textTransform:"uppercase" }}>支持的商店</div>
        <div style={{ display:"flex", gap:8 }}>
          <div style={{ flex:1, background:C.hd, borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", fontWeight:600 }}>HOME</div>
            <div style={{ fontSize:15, color:"#fff", fontWeight:800, marginTop:1 }}>DEPOT</div>
          </div>
          <div style={{ flex:1, background:C.lowes, borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", fontWeight:600 }}>LOWE'S</div>
            <div style={{ fontSize:15, color:"#fff", fontWeight:800, marginTop:1 }}>HOME IMPV.</div>
          </div>
          <div style={{ flex:1, background:"#374151", borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", fontWeight:600 }}>ANY</div>
            <div style={{ fontSize:15, color:"#fff", fontWeight:800, marginTop:1 }}>RECEIPT</div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <button onClick={() => pick(true)}
          style={{ width:"100%", padding:"18px", background:C.orange, color:"#fff", border:"none", borderRadius:14,
            fontSize:16, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10,
            boxShadow:"0 8px 24px rgba(249,115,22,0.35)" }}>
          <span style={{ fontSize:22 }}>📷</span> 拍照识别小票
        </button>
        <button onClick={() => pick(false)}
          style={{ width:"100%", padding:"16px", background:C.white, color:C.dark, border:`1.5px solid ${C.border}`,
            borderRadius:14, fontSize:15, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>🖼️</span> 从相册上传
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }}
        onChange={(e) => onImage(e.target.files?.[0])} />

      {error && (
        <div style={{ padding:14, background:"#FEF2F2", border:`1px solid #FECACA`, borderRadius:12, color:C.red, fontSize:13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Tips */}
      <div style={{ background:C.white, borderRadius:14, padding:16, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.mid, marginBottom:10, letterSpacing:0.4 }}>📌 拍照小贴士</div>
        {["光线充足，避免阴影遮住金额或商品名","小票放平，避免折叠遮住明细行","长小票可分段拍多张再分别上传"].map((t, i) => (
          <div key={i} style={{ display:"flex", gap:8, fontSize:13, color:"#374151", marginBottom: i < 2 ? 8 : 0, alignItems:"flex-start" }}>
            <span style={{ color:C.orange, fontWeight:700, flexShrink:0 }}>✓</span>{t}
          </div>
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
  const sec = { fontSize:11, fontWeight:700, color:C.mid, marginBottom:12, letterSpacing:0.6, textTransform:"uppercase" };
  const inp = { padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:10, fontSize:14, background:"#F9FAFB", color:C.dark, width:"100%", boxSizing:"border-box" };

  return (
    <div style={{ paddingBottom:100 }}>
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:"13px 16px",
        display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:10 }}>
        <button onClick={onCancel} style={{ border:"none", background:"none", color:C.mid, cursor:"pointer", fontSize:14, fontWeight:500 }}>← 取消</button>
        <div style={{ flex:1, fontWeight:700, fontSize:15 }}>确认识别结果</div>
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
        style={{ width:"100%", padding:"11px 14px", border:`1px solid ${C.border}`, borderRadius:12,
          fontSize:14, background:C.white, marginBottom:14, color:C.dark }}>
        <option value="">所有客户（{receipts.length} 张）</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}（{receipts.filter((r) => r.clientId === c.id).length} 张）</option>)}
      </select>

      {!list.length && (
        <div style={{ textAlign:"center", padding:"56px 0", color:"#9CA3AF" }}>
          <div style={{ fontSize:44, marginBottom:12 }}>🧾</div>
          <div style={{ fontSize:15, fontWeight:600 }}>暂无账单</div>
          <div style={{ fontSize:13, marginTop:4 }}>扫描第一张小票开始吧</div>
        </div>
      )}

      {list.map((r) => (
        <div key={r.id} style={{ background:C.white, borderRadius:16, marginBottom:10, border:`1px solid ${C.border}`, overflow:"hidden",
          boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
          <div onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            style={{ padding:"14px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:15, color:C.dark, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {r.merchant || "未知商家"}
              </div>
              <div style={{ fontSize:12, color:C.mid, marginTop:3 }}>
                {r.date} · <span style={{ color:C.orange, fontWeight:600 }}>{r.clientName}</span>
                {r.projectNote ? ` · ${r.projectNote}` : ""}
              </div>
            </div>
            <div style={{ textAlign:"right", flexShrink:0 }}>
              <div style={{ fontWeight:800, fontSize:17, color:C.dark, fontFamily:"monospace" }}>${Number(r.total || 0).toFixed(2)}</div>
              <div style={{ fontSize:11, color:"#9CA3AF", marginTop:1 }}>{(r.items || []).length} items</div>
            </div>
            <div style={{ color:"#D1D5DB", fontSize:11 }}>{expanded === r.id ? "▲" : "▼"}</div>
          </div>

          {expanded === r.id && (
            <div style={{ borderTop:`1px solid ${C.light}`, background:"#FAFAF8", padding:"10px 16px 14px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:8, letterSpacing:0.4 }}>
                点击商品名查看详情 🔍
              </div>
              {(r.items || []).map((item, i) => (
                <div key={i} onClick={() => onLookup({ item, merchant: r.merchant })}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                    fontSize:13, padding:"7px 0", borderBottom: i < r.items.length-1 ? `1px solid ${C.border}` : "none",
                    cursor:"pointer" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, minWidth:0 }}>
                    <span style={{ fontSize:13, color:C.orange, flexShrink:0 }}>🔍</span>
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
              <div style={{ marginTop:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:11, color:C.mid }}>税 ${Number(r.tax || 0).toFixed(2)} · {r.paymentMethod || "—"}</span>
                <button onClick={() => onDelete(r.id)}
                  style={{ border:"none", background:"none", color:C.red, cursor:"pointer", fontSize:12, fontWeight:600 }}>删除</button>
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
          <div style={{ fontSize:40, marginBottom:12 }}>👷</div>
          <div style={{ fontSize:15, fontWeight:600 }}>还没有客户</div>
          <div style={{ fontSize:13, marginTop:4 }}>在上方输入名称添加</div>
        </div>
      )}

      {clients.map((c) => {
        const recs = receipts.filter((r) => r.clientId === c.id);
        const total = recs.reduce((s, r) => s + Number(r.total || 0), 0);
        return (
          <div key={c.id} style={{ background:C.white, borderRadius:16, padding:"14px 16px", marginBottom:10,
            border:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12,
            boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ width:42, height:42, background:"#FFF7ED", borderRadius:12,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>👷</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:15, color:C.dark }}>{c.name}</div>
              <div style={{ fontSize:12, color:C.mid, marginTop:2 }}>{recs.length} 张小票 · 加入于 {c.createdAt}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontWeight:800, fontSize:16, color:C.orange, fontFamily:"monospace" }}>${total.toFixed(2)}</div>
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

  const inp = { padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:10,
    fontSize:14, background:C.white, boxSizing:"border-box", width:"100%" };

  return (
    <div style={{ padding:16 }}>
      <div style={{ background:C.white, borderRadius:16, padding:16, marginBottom:14, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.mid, marginBottom:12, letterSpacing:0.6, textTransform:"uppercase" }}>筛选条件</div>
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
        <div style={{ fontSize:11, color:"#888", marginBottom:6, letterSpacing:0.6 }}>EXPORT SUMMARY</div>
        <div style={{ fontSize:34, fontWeight:800, fontFamily:"monospace", letterSpacing:-1 }}>${total.toFixed(2)}</div>
        <div style={{ fontSize:12, color:"#888", marginTop:4 }}>{filtered.length} 张小票 · 含税 ${tax.toFixed(2)}</div>
      </div>

      <button onClick={download} disabled={!filtered.length}
        style={{ width:"100%", padding:"17px", background: filtered.length ? C.orange : "#D1D5DB", color:"#fff",
          border:"none", borderRadius:14, fontSize:16, fontWeight:700,
          cursor: filtered.length ? "pointer" : "not-allowed",
          display:"flex", alignItems:"center", justifyContent:"center", gap:10,
          boxShadow: filtered.length ? "0 8px 24px rgba(249,115,22,0.35)" : "none" }}>
        <span style={{ fontSize:22 }}>📥</span> 下载 CSV（{filtered.length} 张）
      </button>

      <div style={{ marginTop:14, fontSize:12, color:"#9CA3AF", textAlign:"center", lineHeight:1.7 }}>
        用 Excel 打开 · 支持年末报税、分客户报销<br/>UTF-8 编码，中文不乱码
      </div>
    </div>
  );
}
