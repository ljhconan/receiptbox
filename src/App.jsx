import { useState, useEffect, useRef } from "react";

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const todayStr = () => new Date().toISOString().slice(0, 10);

async function callClaude(b64, mimeType) {
  const res = await fetch("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: b64, mimeType }),
  });
  if (!res.ok) throw new Error("API error");
  return res.json();
}

function buildCsv(receipts) {
  const H = ["Date","Merchant","Client","Project","Item","Qty","Unit Price","Item Total","Tax","Receipt Total","Payment Method"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = receipts.flatMap((r) =>
    (r.items?.length ? r.items : [{ name: "(no items)" }]).map((item, i) => [
      r.date || "", r.merchant || "", r.clientName || "", r.projectNote || "",
      item.name || "", item.qty || "", item.unitPrice || "", item.total || "",
      i === 0 ? r.tax || "" : "",
      i === 0 ? r.total || "" : "",
      i === 0 ? r.paymentMethod || "" : "",
    ])
  );
  return [H, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

const C = {
  orange: "#F97316", black: "#111111", dark: "#1C1C1E", mid: "#6B7280",
  light: "#F4F3F0", white: "#FFFFFF", border: "#E5E7EB",
  red: "#DC2626", cardBg: "#FAFAF8",
};

const btn = (color = C.orange, text = C.white, extra = {}) => ({
  background: color, color: text, border: "none", borderRadius: 10,
  fontWeight: 700, cursor: "pointer", ...extra,
});

function loadData() {
  try {
    const raw = localStorage.getItem("receiptbox_v1");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { receipts: [], clients: [] };
}

function saveData(receipts, clients) {
  try { localStorage.setItem("receiptbox_v1", JSON.stringify({ receipts, clients })); } catch {}
}

export default function App() {
  const [tab, setTab] = useState("scan");
  const [receipts, setReceipts] = useState([]);
  const [clients, setClients] = useState([]);
  const [reviewing, setReviewing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
    setClients(updated);
    persist(receipts, updated);
    return c;
  };

  const saveReceipt = (receipt) => {
    const updated = [{ ...receipt, savedAt: new Date().toISOString() }, ...receipts];
    setReceipts(updated);
    persist(updated, clients);
    setReviewing(null);
    setTab("receipts");
  };

  const deleteReceipt = (id) => {
    if (!confirm("确认删除这张小票吗？")) return;
    const updated = receipts.filter((r) => r.id !== id);
    setReceipts(updated);
    persist(updated, clients);
  };

  const handleImage = async (file) => {
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      const b64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const extracted = await callClaude(b64, file.type || "image/jpeg");
      setReviewing({ ...extracted, id: uid(), clientId: "", clientName: "", projectNote: "" });
    } catch {
      setError("识别失败，请重试。建议光线充足、小票放平拍摄。");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const tabs = [["scan","📷","扫描"],["receipts","🧾","账单"],["clients","👷","客户"],["export","📤","导出"]];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", maxWidth:480, margin:"0 auto",
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background:C.light, position:"relative", overflow:"hidden" }}>
      <div style={{ background:C.dark, color:C.white, padding:"14px 18px 12px", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <div style={{ width:32, height:32, background:C.orange, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>🧾</div>
        <div>
          <div style={{ fontWeight:800, fontSize:16 }}>ReceiptBox</div>
          <div style={{ fontSize:10, color:"#999" }}>Contractor Receipt Manager</div>
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", position:"relative" }}>
        {loading && <Loader />}
        {reviewing ? (
          <ReviewScreen receipt={reviewing} clients={clients}
            onSave={saveReceipt} onAddClient={addClient}
            onCancel={() => setReviewing(null)} onChange={setReviewing} />
        ) : tab === "scan" ? (
          <ScanScreen onImage={handleImage} fileRef={fileRef} error={error} />
        ) : tab === "receipts" ? (
          <ReceiptsScreen receipts={receipts} clients={clients} onDelete={deleteReceipt} />
        ) : tab === "clients" ? (
          <ClientsScreen clients={clients} receipts={receipts} onAdd={addClient} />
        ) : (
          <ExportScreen receipts={receipts} clients={clients} />
        )}
      </div>

      {!reviewing && (
        <div style={{ background:C.white, borderTop:`1px solid ${C.border}`, display:"flex", flexShrink:0 }}>
          {tabs.map(([key, icon, label]) => (
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

function Loader() {
  const msgs = ["正在识别小票...","分析商品明细...","提取价格信息..."];
  const [mi, setMi] = useState(0);
  useEffect(() => { const t = setInterval(() => setMi((m) => (m+1) % msgs.length), 1200); return () => clearInterval(t); }, []);
  return (
    <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.75)", zIndex:100,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:44, height:44, border:`4px solid #333`, borderTop:`4px solid ${C.orange}`,
        borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <div style={{ color:"#fff", fontSize:14 }}>{msgs[mi]}</div>
    </div>
  );
}

function ScanScreen({ onImage, fileRef, error }) {
  const pick = (camera) => {
    if (!fileRef.current) return;
    fileRef.current.accept = "image/*";
    if (camera) fileRef.current.setAttribute("capture", "environment");
    else fileRef.current.removeAttribute("capture");
    fileRef.current.click();
  };
  return (
    <div style={{ padding:24, display:"flex", flexDirection:"column", alignItems:"center", gap:18, paddingTop:36 }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:52, marginBottom:8 }}>🧾</div>
        <div style={{ fontSize:22, fontWeight:800, color:C.black }}>扫描小票</div>
        <div style={{ fontSize:13, color:C.mid, marginTop:4 }}>Home Depot · Lowes · 五金材料店</div>
      </div>
      <button onClick={() => pick(true)}
        style={{ ...btn(C.orange, C.white, { width:"100%", maxWidth:320, padding:"20px", fontSize:16, borderRadius:14,
          display:"flex", alignItems:"center", justifyContent:"center", gap:10,
          boxShadow:"0 6px 20px rgba(249,115,22,0.4)" }) }}>
        <span style={{ fontSize:26 }}>📷</span> 拍照识别
      </button>
      <button onClick={() => pick(false)}
        style={{ ...btn(C.white, C.black, { width:"100%", maxWidth:320, padding:"16px", fontSize:15,
          borderRadius:14, border:`2px solid ${C.border}`,
          display:"flex", alignItems:"center", justifyContent:"center", gap:10 }) }}>
        <span style={{ fontSize:22 }}>🖼️</span> 从相册选取
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }}
        onChange={(e) => onImage(e.target.files?.[0])} />
      {error && (
        <div style={{ width:"100%", maxWidth:320, padding:14, background:"#FEF2F2",
          border:`1px solid #FECACA`, borderRadius:10, color:C.red, fontSize:13 }}>⚠️ {error}</div>
      )}
      <div style={{ width:"100%", maxWidth:320, background:C.white, borderRadius:14, padding:16, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.mid, marginBottom:10 }}>拍照小贴士</div>
        {["光线充足，避免阴影遮住金额","小票放平，避免折叠遮住明细","长小票可分段拍多张"].map((t, i) => (
          <div key={i} style={{ display:"flex", gap:8, fontSize:13, color:"#374151", marginBottom:7 }}>
            <span style={{ color:C.orange, fontWeight:700 }}>✓</span>{t}
          </div>
        ))}
      </div>
    </div>
  );
}

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

  const card = { background:C.white, borderRadius:14, padding:16, marginBottom:12, border:`1px solid ${C.border}` };
  const sec = { fontSize:11, fontWeight:700, color:C.mid, marginBottom:12, letterSpacing:0.6, textTransform:"uppercase" };
  const inp = { padding:"9px 11px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, background:"#F9FAFB", color:C.black, width:"100%", boxSizing:"border-box" };

  return (
    <div style={{ paddingBottom:100 }}>
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:"12px 16px",
        display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:10 }}>
        <button onClick={onCancel} style={{ border:"none", background:"none", color:C.mid, cursor:"pointer", fontSize:14 }}>← 取消</button>
        <div style={{ flex:1, fontWeight:700, fontSize:15 }}>确认识别结果</div>
        <button onClick={() => { if (!receipt.clientId) { alert("请选择客户"); return; } onSave(receipt); }}
          style={{ ...btn(C.orange, C.white, { padding:"8px 18px", fontSize:14, borderRadius:8 }) }}>保存 ✓</button>
      </div>
      <div style={{ padding:16 }}>
        <div style={card}>
          <div style={sec}>基本信息</div>
          {[["merchant","商家"],["date","日期"],["paymentMethod","支付"]].map(([k, lbl]) => (
            <div key={k} style={{ display:"flex", alignItems:"center", marginBottom:10, gap:10 }}>
              <div style={{ width:36, fontSize:12, color:C.mid, flexShrink:0, textAlign:"right" }}>{lbl}</div>
              <input value={receipt[k] || ""} onChange={(e) => up(k, e.target.value)}
                type={k === "date" ? "date" : "text"} placeholder={lbl}
                style={{ flex:1, padding:"9px 11px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, background:"#F9FAFB" }} />
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
                placeholder="输入客户名" style={{ ...inp, flex:1 }} />
              <button onClick={handleAddClient}
                style={{ ...btn(C.orange, C.white, { padding:"0 16px", fontSize:14, borderRadius:8 }) }}>添加</button>
            </div>
          )}
          <input value={receipt.projectNote || ""} onChange={(e) => up("projectNote", e.target.value)}
            placeholder="项目备注（可选，如：厨房改造）" style={inp} />
        </div>

        <div style={card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={sec}>商品明细（{(receipt.items || []).length} 项）</div>
            <button onClick={addItem} style={{ ...btn(C.orange, C.white, { padding:"4px 12px", fontSize:12, borderRadius:6 }) }}>＋ 添加</button>
          </div>
          {!(receipt.items || []).length && (
            <div style={{ textAlign:"center", color:"#9CA3AF", fontSize:13, padding:"14px 0" }}>未识别到商品，请手动添加</div>
          )}
          {(receipt.items || []).map((item, i) => (
            <div key={i} style={{ borderTop: i > 0 ? `1px solid ${C.light}` : "none", paddingTop: i > 0 ? 12 : 0, marginTop: i > 0 ? 12 : 0 }}>
              <div style={{ display:"flex", gap:6 }}>
                <input value={item.name || ""} onChange={(e) => upItem(i, "name", e.target.value)}
                  placeholder="商品名称" style={{ ...inp, flex:1, fontSize:13 }} />
                <button onClick={() => removeItem(i)} style={{ border:"none", background:"none", color:"#9CA3AF", cursor:"pointer", fontSize:18, padding:"0 4px" }}>×</button>
              </div>
              <div style={{ display:"flex", gap:6, marginTop:6 }}>
                {[["qty","数量",60],["unitPrice","单价",null],["total","总价",null]].map(([k, lbl, w]) => (
                  <div key={k} style={{ flex: w ? `0 0 ${w}px` : 1 }}>
                    <div style={{ fontSize:10, color:"#9CA3AF", marginBottom:3 }}>{lbl}</div>
                    <input value={item[k] || ""} onChange={(e) => upItem(i, k, e.target.value)}
                      type="number" step={k === "qty" ? 1 : 0.01} min={0}
                      style={{ ...inp, fontSize:13, padding:"7px 8px", textAlign: k === "qty" ? "center" : "right" }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ marginTop:14, paddingTop:12, borderTop:"1px dashed #E5E7EB" }}>
            {[["subtotal","小计",false],["tax","税",false],["total","合计",true]].map(([k, lbl, bold]) => (
              <div key={k} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:13, color: bold ? C.black : C.mid, fontWeight: bold ? 700 : 400 }}>{lbl}</span>
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

function ReceiptsScreen({ receipts, clients, onDelete }) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState(null);
  const list = [...(filter ? receipts.filter((r) => r.clientId === filter) : receipts)]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div style={{ padding:16 }}>
      <select value={filter} onChange={(e) => setFilter(e.target.value)}
        style={{ width:"100%", padding:"11px 14px", border:`1px solid ${C.border}`, borderRadius:10, fontSize:14, background:C.white, marginBottom:14 }}>
        <option value="">所有客户（{receipts.length} 张）</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}（{receipts.filter((r) => r.clientId === c.id).length} 张）</option>)}
      </select>
      {!list.length && (
        <div style={{ textAlign:"center", padding:"48px 0", color:"#9CA3AF" }}>
          <div style={{ fontSize:44, marginBottom:10 }}>🧾</div>
          <div style={{ fontSize:14, fontWeight:600 }}>暂无账单</div>
        </div>
      )}
      {list.map((r) => (
        <div key={r.id} style={{ background:C.white, borderRadius:14, marginBottom:10, border:`1px solid ${C.border}`, overflow:"hidden" }}>
          <div onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            style={{ padding:"13px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:15, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.merchant || "未知商家"}</div>
              <div style={{ fontSize:11, color:C.mid, marginTop:2 }}>{r.date} · <span style={{ color:C.orange }}>{r.clientName}</span>{r.projectNote ? ` · ${r.projectNote}` : ""}</div>
            </div>
            <div style={{ textAlign:"right", flexShrink:0 }}>
              <div style={{ fontWeight:800, fontSize:16, fontFamily:"monospace" }}>${Number(r.total || 0).toFixed(2)}</div>
              <div style={{ fontSize:10, color:"#9CA3AF" }}>{(r.items || []).length} items</div>
            </div>
            <div style={{ color:"#D1D5DB", fontSize:12 }}>{expanded === r.id ? "▲" : "▼"}</div>
          </div>
          {expanded === r.id && (
            <div style={{ borderTop:`1px solid ${C.light}`, background:C.cardBg, padding:"10px 16px 14px" }}>
              {(r.items || []).map((item, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"4px 0" }}>
                  <span>{item.name}{item.qty > 1 ? ` ×${item.qty}` : ""}</span>
                  <span style={{ fontFamily:"monospace", fontWeight:600 }}>${Number(item.total || 0).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ borderTop:`1px dashed ${C.border}`, marginTop:8, paddingTop:8, display:"flex", justifyContent:"space-between" }}>
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

function ClientsScreen({ clients, receipts, onAdd }) {
  const [name, setName] = useState("");
  const handle = () => { if (name.trim()) { onAdd(name.trim()); setName(""); } };
  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        <input value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handle()}
          placeholder="新建客户名称..."
          style={{ flex:1, padding:"12px 14px", border:`1px solid ${C.border}`, borderRadius:10, fontSize:14, background:C.white }} />
        <button onClick={handle} style={{ ...btn(C.orange, C.white, { padding:"0 18px", fontSize:14, borderRadius:10 }) }}>添加</button>
      </div>
      {!clients.length && (
        <div style={{ textAlign:"center", padding:"48px 0", color:"#9CA3AF" }}>
          <div style={{ fontSize:40, marginBottom:10 }}>👷</div>
          <div style={{ fontSize:14, fontWeight:600 }}>还没有客户</div>
        </div>
      )}
      {clients.map((c) => {
        const recs = receipts.filter((r) => r.clientId === c.id);
        const total = recs.reduce((s, r) => s + Number(r.total || 0), 0);
        return (
          <div key={c.id} style={{ background:C.white, borderRadius:14, padding:"14px 16px", marginBottom:10,
            border:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40, height:40, background:"#FFF7ED", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>👷</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:15 }}>{c.name}</div>
              <div style={{ fontSize:11, color:C.mid }}>{recs.length} 张小票</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontWeight:800, fontSize:15, color:C.orange, fontFamily:"monospace" }}>${total.toFixed(2)}</div>
              <div style={{ fontSize:10, color:"#9CA3AF" }}>累计支出</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  const inp = { padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, background:C.white, boxSizing:"border-box", width:"100%" };
  return (
    <div style={{ padding:16 }}>
      <div style={{ background:C.white, borderRadius:14, padding:16, marginBottom:14, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.mid, marginBottom:12 }}>筛选</div>
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
      <div style={{ background:C.dark, borderRadius:14, padding:"20px", marginBottom:16, color:C.white }}>
        <div style={{ fontSize:11, color:"#888", marginBottom:6 }}>SUMMARY</div>
        <div style={{ fontSize:32, fontWeight:800, fontFamily:"monospace" }}>${total.toFixed(2)}</div>
        <div style={{ fontSize:12, color:"#888", marginTop:3 }}>{filtered.length} 张小票 · 含税 ${tax.toFixed(2)}</div>
      </div>
      <button onClick={download} disabled={!filtered.length}
        style={{ ...btn(!filtered.length ? "#D1D5DB" : C.orange, C.white, {
          width:"100%", padding:"17px", fontSize:16, borderRadius:14,
          display:"flex", alignItems:"center", justifyContent:"center", gap:10,
          cursor: !filtered.length ? "not-allowed" : "pointer" }) }}>
        <span style={{ fontSize:22 }}>📥</span> 下载 CSV（{filtered.length} 张）
      </button>
    </div>
  );
}
