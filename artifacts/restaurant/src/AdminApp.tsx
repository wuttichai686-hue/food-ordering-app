import { useState, useEffect, useRef, useCallback } from "react";
import ChatThread from "./ChatThread";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";

interface OrderItem {
  id: number;
  name: string;
  qty: number;
  isSpecial: boolean;
  price: number;
  specialPrice?: number;
}

interface OrderAddon {
  id: string;
  name: string;
  price: number;
}

interface Order {
  id: string;
  customerName: string;
  phone: string;
  address: string;
  payment: string;
  note: string;
  items: OrderItem[];
  addons?: OrderAddon[];
  total: number;
  status: "pending" | "accepted" | "preparing" | "ready" | "delivering" | "completed";
  createdAt: { seconds: number; nanoseconds: number } | null;
  updatedAt: { seconds: number; nanoseconds: number } | null;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
}

const STATUS_FLOW: Order["status"][] = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "delivering",
  "completed",
];

const STATUS_LABELS: Record<Order["status"], string> = {
  pending: "รอยืนยัน",
  accepted: "รับออเดอร์แล้ว",
  preparing: "กำลังทำอาหาร",
  ready: "อาหารพร้อม",
  delivering: "กำลังส่ง",
  completed: "สำเร็จ",
};

const STATUS_COLORS: Record<Order["status"], { bg: string; text: string; border: string }> = {
  pending:   { bg: "hsl(45,90%,93%)",  text: "hsl(40,70%,35%)",  border: "hsl(40,60%,78%)" },
  accepted:  { bg: "hsl(200,80%,93%)", text: "hsl(200,80%,30%)", border: "hsl(200,50%,75%)" },
  preparing: { bg: "hsl(280,60%,93%)", text: "hsl(280,60%,35%)", border: "hsl(280,40%,75%)" },
  ready:     { bg: "hsl(170,60%,92%)", text: "hsl(170,60%,28%)", border: "hsl(170,40%,72%)" },
  delivering:{ bg: "hsl(35,90%,92%)",  text: "hsl(30,80%,35%)",  border: "hsl(35,60%,75%)" },
  completed: { bg: "hsl(140,50%,92%)", text: "hsl(140,50%,30%)", border: "hsl(140,40%,70%)" },
};

const NEXT_ACTION: Partial<Record<Order["status"], { label: string; next: Order["status"] }>> = {
  pending:   { label: "✅ ยืนยันออเดอร์",      next: "accepted" },
  accepted:  { label: "👨‍🍳 เริ่มทำอาหาร",       next: "preparing" },
  preparing: { label: "🍱 อาหารพร้อมแล้ว",    next: "ready" },
  ready:     { label: "🛵 ส่งให้ไรเดอร์แล้ว", next: "delivering" },
  delivering:{ label: "🎉 จัดส่งสำเร็จ",       next: "completed" },
};

function formatTime(ts: Order["createdAt"]) {
  if (!ts) return "—";
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) +
    " " + d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function LoginPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      onLogin(cred.user);
    } catch {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "hsl(36,33%,97%)" }}
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl shadow-lg p-8"
        style={{ border: "1px solid hsl(30,20%,88%)" }}
      >
        <div className="text-center mb-8">
          <p className="text-3xl mb-2">🍳</p>
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: "hsl(20,10%,55%)" }}>
            ตามสั่งซอยเขื่อน
          </p>
        </div>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ border: "1.5px solid hsl(30,20%,80%)" }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ border: "1.5px solid hsl(30,20%,80%)" }}
            />
          </div>
          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl py-3 text-white font-bold text-base transition active:scale-95 disabled:opacity-60"
            style={{ background: "hsl(22,90%,50%)" }}
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  onAdvance,
  chatOpen,
  onChatToggle,
  unreadCount,
  onNewCustomerMessage,
}: {
  order: Order;
  onAdvance: (id: string, next: Order["status"]) => void;
  chatOpen: boolean;
  onChatToggle: () => void;
  unreadCount: number;
  onNewCustomerMessage: () => void;
}) {
  const statusStyle = STATUS_COLORS[order.status];
  const action = NEXT_ACTION[order.status];
  const statusIdx = STATUS_FLOW.indexOf(order.status);

  return (
    <div
      className="bg-white rounded-2xl shadow-sm overflow-hidden"
      style={{ border: "1px solid hsl(30,20%,90%)" }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ background: statusStyle.bg, borderBottom: `1px solid ${statusStyle.border}` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: statusStyle.border, color: statusStyle.text }}
          >
            {STATUS_LABELS[order.status]}
          </span>
          <span className="text-xs" style={{ color: "hsl(20,10%,55%)" }}>
            {formatTime(order.createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Chat toggle button with unread badge */}
          <button
            onClick={onChatToggle}
            className="relative flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition active:scale-95"
            style={
              chatOpen
                ? { background: "hsl(22,90%,50%)", color: "white" }
                : { background: "rgba(0,0,0,0.08)", color: "hsl(20,14%,30%)" }
            }
          >
            💬
            {!chatOpen && unreadCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                style={{ background: "hsl(0,84%,60%)", color: "white" }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <span className="font-bold text-sm" style={{ color: "hsl(22,90%,45%)" }}>
            {order.total}฿
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex flex-col gap-2">
        {/* Customer info */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div>
            <span className="text-xs font-medium" style={{ color: "hsl(20,10%,50%)" }}>ชื่อ</span>
            <p className="font-semibold">{order.customerName}</p>
          </div>
          <div>
            <span className="text-xs font-medium" style={{ color: "hsl(20,10%,50%)" }}>เบอร์</span>
            <p className="font-semibold">
              <a href={`tel:${order.phone}`} style={{ color: "hsl(22,90%,45%)" }}>
                {order.phone}
              </a>
            </p>
          </div>
          <div className="col-span-2">
            <span className="text-xs font-medium" style={{ color: "hsl(20,10%,50%)" }}>ที่อยู่</span>
            <p>{order.address}</p>
          </div>
          <div>
            <span className="text-xs font-medium" style={{ color: "hsl(20,10%,50%)" }}>ชำระ</span>
            <p>{order.payment === "cash" ? "💵 เงินสด" : "🏦 โอนเงิน"}</p>
          </div>
          {order.note && (
            <div>
              <span className="text-xs font-medium" style={{ color: "hsl(20,10%,50%)" }}>หมายเหตุ</span>
              <p className="text-sm">{order.note}</p>
            </div>
          )}
        </div>

        {/* Items */}
        <div
          className="rounded-xl px-3 py-2 mt-1 text-sm"
          style={{ background: "hsl(36,30%,96%)", border: "1px solid hsl(30,20%,88%)" }}
        >
          {order.items.map((item) => (
            <div key={`${item.id}-${item.isSpecial}`} className="flex justify-between py-0.5">
              <span>
                {item.name}
                {item.isSpecial ? " (พิเศษ)" : ""} × {item.qty}
              </span>
              <span className="font-medium">
                {(item.isSpecial ? (item.specialPrice ?? item.price) : item.price) * item.qty}฿
              </span>
            </div>
          ))}
          {order.addons && order.addons.length > 0 && (
            <>
              <div className="border-t mt-1.5 pt-1.5" style={{ borderColor: "hsl(30,20%,84%)" }} />
              {order.addons.map((addon) => (
                <div key={addon.id} className="flex justify-between py-0.5">
                  <span style={{ color: "hsl(22,80%,45%)" }}>+ {addon.name}</span>
                  <span className="font-medium">+{addon.price}฿</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Location */}
        {(order.latitude && order.longitude) && (
          <div
            className="rounded-xl px-3 py-2 mt-1 text-xs flex items-start justify-between gap-2"
            style={{ background: "hsl(200,80%,96%)", border: "1px solid hsl(200,50%,82%)" }}
          >
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm mb-0.5" style={{ color: "hsl(200,80%,30%)" }}>📍 ตำแหน่งจัดส่ง</p>
              {order.formattedAddress && (
                <p className="leading-relaxed" style={{ color: "hsl(20,10%,40%)" }}>{order.formattedAddress}</p>
              )}
              <p className="mt-0.5 opacity-60">{order.latitude.toFixed(6)}, {order.longitude.toFixed(6)}</p>
            </div>
            <a
              href={`https://www.google.com/maps?q=${order.latitude},${order.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 rounded-xl px-3 py-2 text-xs font-bold text-white transition active:scale-95"
              style={{ background: "hsl(200,80%,45%)" }}
            >
              🧭 นำทาง
            </a>
          </div>
        )}

        {/* Status progress */}
        <div className="flex gap-1 mt-2">
          {STATUS_FLOW.map((s, i) => (
            <div
              key={s}
              className="flex-1 h-1.5 rounded-full"
              style={{
                background: i <= statusIdx ? "hsl(22,90%,50%)" : "hsl(30,20%,88%)",
              }}
            />
          ))}
        </div>

        {/* Action button */}
        {action && (
          <button
            onClick={() => onAdvance(order.id, action.next)}
            className="mt-2 w-full rounded-xl py-2.5 font-bold text-sm text-white transition active:scale-95"
            style={{ background: "hsl(22,90%,50%)" }}
          >
            {action.label}
          </button>
        )}
        {order.status === "completed" && (
          <div
            className="mt-2 text-center text-sm font-medium py-2 rounded-xl"
            style={{ background: "hsl(140,50%,92%)", color: "hsl(140,50%,30%)" }}
          >
            ✅ จัดส่งสำเร็จแล้ว
          </div>
        )}

        {/* Chat panel */}
        {chatOpen && (
          <div
            className="mt-2 rounded-xl overflow-hidden"
            style={{ border: "1px solid hsl(30,20%,88%)" }}
          >
            <div
              className="px-3 py-2 flex items-center gap-2"
              style={{ background: "hsl(36,30%,97%)", borderBottom: "1px solid hsl(30,20%,88%)" }}
            >
              <p className="text-xs font-semibold flex-1">💬 แชทกับลูกค้า</p>
            </div>
            <ChatThread
              orderId={order.id}
              sender="admin"
              onNewCustomerMessage={onNewCustomerMessage}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const SEEN_STORAGE_KEY = "admin_seen_order_ids";
const SOUND_ENABLED_KEY = "admin_sound_enabled";

function playChime() {
  try {
    const ctx = new AudioContext();
    const notes = [880, 1100, 1320];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1.0, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch {
    /* AudioContext not available */
  }
}

interface Toast {
  id: number;
  message: string;
}

export default function AdminApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<Order["status"] | "all">("all");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem(SOUND_ENABLED_KEY);
    return stored === null ? true : stored === "true";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [chatUnread, setChatUnread] = useState<Record<string, number>>({});
  const seenIds = useRef<Set<string>>(new Set(JSON.parse(localStorage.getItem(SEEN_STORAGE_KEY) ?? "[]")));
  const isFirstSnapshot = useRef(true);
  const toastCounter = useRef(0);
  const openChatIdRef = useRef<string | null>(null);

  const addToast = useCallback((message: string) => {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const toggleSound = useCallback((enabled: boolean) => {
    setSoundEnabled(enabled);
    localStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const incoming = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));

      if (isFirstSnapshot.current) {
        isFirstSnapshot.current = false;
        incoming.forEach((o) => seenIds.current.add(o.id));
        localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...seenIds.current]));
      } else {
        const newOrders = incoming.filter(
          (o) => !seenIds.current.has(o.id) && o.status === "pending"
        );
        if (newOrders.length > 0) {
          newOrders.forEach((o) => seenIds.current.add(o.id));
          localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...seenIds.current]));
          const soundOn = localStorage.getItem(SOUND_ENABLED_KEY);
          if (soundOn === null || soundOn === "true") playChime();
          newOrders.forEach(() => addToast("📦 มีออเดอร์ใหม่"));
        }
      }

      setOrders(incoming);
    });
    return unsub;
  }, [user, addToast]);

  const toggleChat = useCallback((orderId: string) => {
    setOpenChatId((prev) => {
      const next = prev === orderId ? null : orderId;
      openChatIdRef.current = next;
      if (next === orderId) {
        setChatUnread((u) => ({ ...u, [orderId]: 0 }));
      }
      return next;
    });
  }, []);

  const makeChatHandler = useCallback(
    (orderId: string) => () => {
      if (openChatIdRef.current !== orderId) {
        setChatUnread((u) => ({ ...u, [orderId]: (u[orderId] || 0) + 1 }));
      }
      const soundOn = localStorage.getItem(SOUND_ENABLED_KEY);
      if (soundOn === null || soundOn === "true") playChime();
      addToast("💬 ข้อความใหม่จากลูกค้า");
    },
    [addToast]
  );

  async function handleAdvance(id: string, next: Order["status"]) {
    await updateDoc(doc(db, "orders", id), {
      status: next,
      updatedAt: serverTimestamp(),
    });
  }

  async function handleLogout() {
    await signOut(auth);
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">กำลังโหลด...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  const filtered =
    filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const counts = STATUS_FLOW.reduce(
    (acc, s) => ({ ...acc, [s]: orders.filter((o) => o.status === s).length }),
    {} as Record<Order["status"], number>
  );

  return (
    <div className="min-h-screen" style={{ background: "hsl(36,33%,97%)" }}>
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-2xl px-5 py-3 text-sm font-bold shadow-xl animate-bounce"
            style={{
              background: "hsl(22,90%,50%)",
              color: "white",
              minWidth: 180,
              textAlign: "center",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <header
        className="sticky top-0 z-50 shadow-md text-white"
        style={{ background: "hsl(22,90%,50%)" }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold leading-tight">🍳 Admin Dashboard</h1>
            <p className="text-xs opacity-80">ตามสั่งซอยเขื่อน</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-80 hidden sm:block">{user.email}</span>
            {/* Sound settings toggle */}
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="text-xs bg-white/20 hover:bg-white/30 rounded-full px-3 py-1.5 transition"
              title="ตั้งค่าเสียงแจ้งเตือน"
            >
              {soundEnabled ? "🔔" : "🔕"}
            </button>
            <button
              onClick={handleLogout}
              className="text-xs bg-white/20 hover:bg-white/30 rounded-full px-3 py-1.5 transition"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
        {/* Settings panel */}
        {showSettings && (
          <div
            className="border-t px-4 py-3"
            style={{ borderColor: "rgba(255,255,255,0.2)", background: "hsl(22,85%,44%)" }}
          >
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">เสียงแจ้งเตือนออเดอร์ใหม่</p>
                <p className="text-xs opacity-75 mt-0.5">เล่นเสียงเมื่อมีออเดอร์ใหม่เข้ามา</p>
              </div>
              <button
                onClick={() => toggleSound(!soundEnabled)}
                className="relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200"
                style={{ background: soundEnabled ? "hsl(140,60%,50%)" : "rgba(255,255,255,0.3)" }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                  style={{ transform: soundEnabled ? "translateX(24px)" : "translateX(0)" }}
                />
              </button>
            </div>
            <div className="max-w-3xl mx-auto mt-3">
              <button
                onClick={() => { if (soundEnabled) playChime(); }}
                disabled={!soundEnabled}
                className="text-xs bg-white/20 hover:bg-white/30 disabled:opacity-40 rounded-full px-3 py-1.5 transition"
              >
                🎵 ทดสอบเสียง
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="max-w-3xl mx-auto px-4 py-4">
        {/* Summary badges */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
          {STATUS_FLOW.map((s) => {
            const style = STATUS_COLORS[s];
            return (
              <button
                key={s}
                onClick={() => setFilter(filter === s ? "all" : s)}
                className="rounded-xl px-2 py-2 text-center text-xs font-medium transition"
                style={
                  filter === s
                    ? { background: "hsl(22,90%,50%)", color: "white", border: "2px solid hsl(22,90%,50%)" }
                    : { background: style.bg, color: style.text, border: `1.5px solid ${style.border}` }
                }
              >
                <p className="text-lg font-bold">{counts[s]}</p>
                <p>{STATUS_LABELS[s]}</p>
              </button>
            );
          })}
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-base">
            ออเดอร์{filter !== "all" ? ` — ${STATUS_LABELS[filter as Order["status"]]}` : "ทั้งหมด"}
            <span className="ml-2 text-sm font-normal" style={{ color: "hsl(20,10%,55%)" }}>
              ({filtered.length} รายการ)
            </span>
          </h2>
          {filter !== "all" && (
            <button
              onClick={() => setFilter("all")}
              className="text-xs"
              style={{ color: "hsl(22,90%,50%)" }}
            >
              ดูทั้งหมด
            </button>
          )}
        </div>

        {/* Orders */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📋</p>
            <p style={{ color: "hsl(20,10%,55%)" }}>ยังไม่มีออเดอร์</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onAdvance={handleAdvance}
                chatOpen={openChatId === order.id}
                onChatToggle={() => toggleChat(order.id)}
                unreadCount={chatUnread[order.id] || 0}
                onNewCustomerMessage={makeChatHandler(order.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
