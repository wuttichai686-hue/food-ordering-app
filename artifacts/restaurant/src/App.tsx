import { useState, useEffect, useRef } from "react";
import { collection, addDoc, serverTimestamp, onSnapshot, doc } from "firebase/firestore";
import { db } from "./firebase";
import MapPicker, { type PickedLocation } from "./MapPicker";
import ChatThread from "./ChatThread";

const CUSTOMER_STORAGE_KEY = "tamsang_customer_info";
type AddressLabel = "home" | "work" | "favorite";
const ADDRESS_LABELS: { value: AddressLabel; icon: string; label: string }[] = [
  { value: "home",     icon: "🏠", label: "บ้าน" },
  { value: "work",     icon: "💼", label: "ที่ทำงาน" },
  { value: "favorite", icon: "⭐", label: "สถานที่โปรด" },
];
interface SavedCustomerInfo {
  name: string;
  phone: string;
  address: string;
  addressLabel: AddressLabel;
  lat?: number;
  lng?: number;
  formattedAddress?: string;
}
function loadSavedInfo(): SavedCustomerInfo | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedCustomerInfo) : null;
  } catch { return null; }
}
function persistCustomerInfo(info: SavedCustomerInfo) {
  try { localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(info)); } catch {}
}
function removeSavedInfo() {
  try { localStorage.removeItem(CUSTOMER_STORAGE_KEY); } catch {}
}

interface Addon {
  id: string;
  emoji: string;
  name: string;
  price: number;
}

const ADDONS: Addon[] = [
  { id: "egg", emoji: "🍳", name: "ไข่ดาว", price: 10 },
];

interface MenuItem {
  id: number;
  name: string;
  price: number;
  specialPrice?: number;
  category: string;
  emoji: string;
}

interface CartItem extends MenuItem {
  qty: number;
  isSpecial: boolean;
}

const MENU: MenuItem[] = [
  { id: 1, name: "กะเพราหมูสับ", price: 50, specialPrice: 55, category: "กะเพรา", emoji: "🌶️" },
  { id: 2, name: "กะเพราเครื่องใน", price: 50, specialPrice: 55, category: "กะเพรา", emoji: "🌶️" },
  { id: 3, name: "กะเพราหมูกรอบ", price: 55, specialPrice: 60, category: "กะเพรา", emoji: "🌶️" },
  { id: 4, name: "กะเพราทะเล", price: 55, specialPrice: 60, category: "กะเพรา", emoji: "🦐" },
  { id: 5, name: "คะน้าหมูกรอบ", price: 55, specialPrice: 60, category: "คะน้า", emoji: "🥬" },
  { id: 6, name: "คะน้าหมูชิ้น", price: 50, specialPrice: 55, category: "คะน้า", emoji: "🥬" },
  { id: 7, name: "ข้าวผัดหมู", price: 50, specialPrice: 55, category: "ข้าวผัด", emoji: "🍳" },
  { id: 8, name: "ข้าวผัดทะเล", price: 55, specialPrice: 60, category: "ข้าวผัด", emoji: "🦐" },
  { id: 9, name: "หมูผัดพริกหยวก", price: 50, specialPrice: 55, category: "ผัด", emoji: "🫑" },
  { id: 10, name: "ราดหน้า", price: 50, category: "เส้น", emoji: "🍜" },
  { id: 11, name: "ผัดซีอิ๊ว", price: 50, category: "เส้น", emoji: "🍜" },
  { id: 12, name: "สุกี้", price: 50, category: "สุกี้", emoji: "🥘" },
];

const CATEGORIES = ["ทั้งหมด", "กะเพรา", "คะน้า", "ข้าวผัด", "ผัด", "เส้น", "สุกี้"];

type OrderStatus = "pending" | "accepted" | "preparing" | "ready" | "delivering" | "completed";
type CheckoutStep = "menu" | "cart" | "checkout" | "success";

const TRACK_STEPS: { status: OrderStatus; icon: string; label: string; sub: string }[] = [
  { status: "pending",    icon: "🟡", label: "รอร้านรับออเดอร์",        sub: "" },
  { status: "accepted",   icon: "✅", label: "ร้านรับออเดอร์แล้ว",      sub: "กำลังจัดเตรียมอาหาร" },
  { status: "preparing",  icon: "👨‍🍳", label: "กำลังทำอาหาร",           sub: "" },
  { status: "ready",      icon: "🍱", label: "อาหารพร้อมแล้ว",          sub: "รอไรเดอร์รับอาหาร" },
  { status: "delivering", icon: "🛵", label: "ไรเดอร์กำลังจัดส่ง",      sub: "" },
  { status: "completed",  icon: "🎉", label: "ส่งเรียบร้อยแล้ว",        sub: "" },
];

const STATUS_ORDER: OrderStatus[] = TRACK_STEPS.map((s) => s.status);

export default function App() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<CheckoutStep>("menu");
  const [activeCategory, setActiveCategory] = useState("ทั้งหมด");
  const [form, setForm] = useState({ name: "", phone: "", address: "", payment: "cash", note: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [orderId, setOrderId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<OrderStatus>("pending");
  const [showMap, setShowMap] = useState(false);
  const [mapPicked, setMapPicked] = useState<PickedLocation | null>(null);
  const [addressLabel, setAddressLabel] = useState<AddressLabel>("home");
  const [restoredFromSaved, setRestoredFromSaved] = useState(false);
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());

  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = loadSavedInfo();
    if (!saved) return;
    setForm((prev) => ({ ...prev, name: saved.name || "", phone: saved.phone || "", address: saved.address || "" }));
    setAddressLabel(saved.addressLabel || "home");
    if (saved.lat && saved.lng) {
      setMapPicked({ lat: saved.lat, lng: saved.lng, formattedAddress: saved.formattedAddress || "" });
    }
    setRestoredFromSaved(true);
  }, []);

  useEffect(() => {
    if (!orderId) return;
    const unsub = onSnapshot(doc(db, "orders", orderId), (snap) => {
      const data = snap.data();
      if (data?.status) setLiveStatus(data.status as OrderStatus);
    });
    return unsub;
  }, [orderId]);

  function applyRestoredInfo() {
    const saved = loadSavedInfo();
    if (saved) {
      setForm((prev) => ({ ...prev, name: saved.name || "", phone: saved.phone || "", address: saved.address || "" }));
      setAddressLabel(saved.addressLabel || "home");
      if (saved.lat && saved.lng) {
        setMapPicked({ lat: saved.lat, lng: saved.lng, formattedAddress: saved.formattedAddress || "" });
      }
      setRestoredFromSaved(true);
    } else {
      setForm({ name: "", phone: "", address: "", payment: "cash", note: "" });
      setMapPicked(null);
      setRestoredFromSaved(false);
    }
  }

  function clearSavedInfo() {
    removeSavedInfo();
    setForm({ name: "", phone: "", address: "", payment: "cash", note: "" });
    setMapPicked(null);
    setAddressLabel("home");
    setRestoredFromSaved(false);
  }

  const filteredMenu = activeCategory === "ทั้งหมด"
    ? MENU
    : MENU.filter((item) => item.category === activeCategory);

  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);
  const cartTotal = cart.reduce((sum, i) => sum + (i.isSpecial ? (i.specialPrice ?? i.price) : i.price) * i.qty, 0);
  const addonsTotal = ADDONS.filter((a) => selectedAddons.has(a.id)).reduce((sum, a) => sum + a.price, 0);
  const grandTotal = cartTotal + addonsTotal;

  function addToCart(item: MenuItem, isSpecial: boolean) {
    setCart((prev) => {
      const key = `${item.id}-${isSpecial}`;
      const existing = prev.find((c) => `${c.id}-${c.isSpecial}` === key);
      if (existing) {
        return prev.map((c) =>
          `${c.id}-${c.isSpecial}` === key ? { ...c, qty: c.qty + 1 } : c
        );
      }
      return [...prev, { ...item, qty: 1, isSpecial }];
    });
  }

  function removeOne(cartItem: CartItem) {
    setCart((prev) => {
      const key = `${cartItem.id}-${cartItem.isSpecial}`;
      return prev
        .map((c) => `${c.id}-${c.isSpecial}` === key ? { ...c, qty: c.qty - 1 } : c)
        .filter((c) => c.qty > 0);
    });
  }

  function removeItem(cartItem: CartItem) {
    setCart((prev) => prev.filter((c) => !(c.id === cartItem.id && c.isSpecial === cartItem.isSpecial)));
  }

  function validateForm() {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "กรุณากรอกชื่อ";
    if (!form.phone.trim()) errors.phone = "กรุณากรอกเบอร์โทร";
    else if (!/^[0-9]{9,10}$/.test(form.phone.replace(/[-\s]/g, ""))) errors.phone = "เบอร์โทรไม่ถูกต้อง";
    if (!form.address.trim()) errors.address = "กรุณากรอกที่อยู่จัดส่ง";
    return errors;
  }

  function validateAndFocus(): Record<string, string> {
    const errors = validateForm();
    if (errors.name) { nameRef.current?.focus(); }
    else if (errors.phone) { phoneRef.current?.focus(); }
    else if (errors.address) { addressRef.current?.focus(); }
    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateAndFocus();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    try {
      const orderItems = cart.map((item) => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
        isSpecial: item.isSpecial,
        price: item.price,
        specialPrice: item.specialPrice ?? null,
      }));

      const selectedAddonsList = ADDONS.filter((a) => selectedAddons.has(a.id)).map((a) => ({
        id: a.id,
        name: a.name,
        price: a.price,
      }));

      const docRef = await addDoc(collection(db, "orders"), {
        customerName: form.name,
        phone: form.phone,
        address: form.address,
        payment: form.payment,
        note: form.note,
        items: orderItems,
        addons: selectedAddonsList,
        total: grandTotal,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(mapPicked ? {
          latitude: mapPicked.lat,
          longitude: mapPicked.lng,
          formattedAddress: mapPicked.formattedAddress,
        } : {}),
      });

      persistCustomerInfo({
        name: form.name,
        phone: form.phone,
        address: form.address,
        addressLabel,
        ...(mapPicked ? { lat: mapPicked.lat, lng: mapPicked.lng, formattedAddress: mapPicked.formattedAddress } : {}),
      });

      setOrderId(docRef.id);
      setLiveStatus("pending");

      fetch("/api/notify-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.name,
          phone: form.phone,
          address: form.address,
          payment: form.payment,
          note: form.note,
          items: orderItems,
          addons: selectedAddonsList,
          total: grandTotal,
          ...(mapPicked ? {
            latitude: mapPicked.lat,
            longitude: mapPicked.lng,
            formattedAddress: mapPicked.formattedAddress,
          } : {}),
        }),
      }).catch(() => {});
    } catch (err) {
      console.error("Failed to save order:", err);
    }
    setStep("success");
  }

  return (
    <div className="min-h-screen" style={{ background: "hsl(36,33%,97%)" }}>
      {/* Header */}
      <header style={{ background: "hsl(22,90%,50%)" }} className="text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold leading-tight">ตามสั่งซอยเขื่อน</h1>
            <p className="text-xs opacity-80">เปิด 08:00–21:00 น.</p>
          </div>
          <div className="flex items-center gap-3">
            {step !== "success" && (
              <button
                onClick={() => setStep("cart")}
                className="relative flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition rounded-full px-3 py-1.5 text-sm font-medium"
              >
                <span>🛒</span>
                <span>ตะกร้า</span>
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-yellow-300 text-gray-800 text-xs font-bold flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pb-24">

        {/* ===== MENU STEP ===== */}
        {step === "menu" && (
          <>
            {/* Info banner */}
            <div className="mt-4 rounded-2xl p-4 text-sm flex flex-col gap-1" style={{ background: "hsl(36,60%,92%)", border: "1px solid hsl(30,20%,85%)" }}>
              <div className="flex items-center gap-2"><span>📞</span><span className="font-medium">085-518-0889 / 064-975-0991</span></div>
              <div className="flex items-center gap-2"><span>🛵</span><span>ส่งฟรี!</span></div>
            </div>

            {/* Category tabs */}
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className="flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition"
                  style={
                    activeCategory === cat
                      ? { background: "hsl(22,90%,50%)", color: "white" }
                      : { background: "hsl(0,0%,100%)", color: "hsl(20,14%,30%)", border: "1px solid hsl(30,20%,85%)" }
                  }
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Menu list */}
            <div className="mt-4 flex flex-col gap-3">
              {filteredMenu.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl px-4 py-3 shadow-sm"
                  style={{ border: "1px solid hsl(30,20%,90%)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl">{item.emoji}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-base">{item.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: "hsl(20,10%,55%)" }}>
                          {item.category}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="flex gap-2">
                        <button
                          onClick={() => addToCart(item, false)}
                          className="flex flex-col items-center rounded-xl px-3 py-1.5 text-xs font-medium transition active:scale-95"
                          style={{ background: "hsl(36,60%,92%)", color: "hsl(20,14%,25%)" }}
                        >
                          <span className="text-sm font-bold" style={{ color: "hsl(22,90%,45%)" }}>{item.price}฿</span>
                          <span className="text-xs opacity-70">ธรรมดา</span>
                        </button>
                        {item.specialPrice && (
                          <button
                            onClick={() => addToCart(item, true)}
                            className="flex flex-col items-center rounded-xl px-3 py-1.5 text-xs font-medium transition active:scale-95"
                            style={{ background: "hsl(22,90%,50%)", color: "white" }}
                          >
                            <span className="text-sm font-bold">{item.specialPrice}฿</span>
                            <span className="text-xs opacity-80">พิเศษ</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== CART STEP ===== */}
        {step === "cart" && (
          <>
            <div className="mt-4 flex items-center gap-2">
              <button onClick={() => setStep("menu")} className="text-sm flex items-center gap-1" style={{ color: "hsl(22,90%,50%)" }}>
                ← กลับเมนู
              </button>
            </div>
            <h2 className="text-xl font-bold mt-3 mb-3">ตะกร้าสินค้า</h2>

            {cart.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">🛒</p>
                <p className="text-lg font-medium" style={{ color: "hsl(20,10%,50%)" }}>ยังไม่มีสินค้าในตะกร้า</p>
                <button
                  onClick={() => setStep("menu")}
                  className="mt-4 rounded-full px-6 py-2 text-sm font-medium text-white"
                  style={{ background: "hsl(22,90%,50%)" }}
                >
                  เลือกเมนู
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  {cart.map((item) => (
                    <div
                      key={`${item.id}-${item.isSpecial}`}
                      className="bg-white rounded-2xl px-4 py-3 shadow-sm"
                      style={{ border: "1px solid hsl(30,20%,90%)" }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{item.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{item.name}</p>
                          <p className="text-xs mt-0.5" style={{ color: "hsl(22,90%,50%)" }}>
                            {item.isSpecial ? "พิเศษ" : "ธรรมดา"} — {item.isSpecial ? item.specialPrice : item.price}฿/จาน
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => removeOne(item)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-lg font-bold transition"
                            style={{ background: "hsl(36,60%,92%)" }}
                          >
                            −
                          </button>
                          <span className="w-6 text-center font-bold">{item.qty}</span>
                          <button
                            onClick={() => addToCart(item, item.isSpecial)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-lg font-bold text-white transition"
                            style={{ background: "hsl(22,90%,50%)" }}
                          >
                            +
                          </button>
                        </div>
                        <div className="w-14 text-right">
                          <p className="font-bold text-sm">{(item.isSpecial ? (item.specialPrice ?? item.price) : item.price) * item.qty}฿</p>
                        </div>
                        <button onClick={() => removeItem(item)} className="text-gray-300 hover:text-red-400 transition ml-1">✕</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="mt-4 bg-white rounded-2xl px-4 py-4 shadow-sm" style={{ border: "1px solid hsl(30,20%,90%)" }}>
                  <div className="flex justify-between text-sm mb-1">
                    <span style={{ color: "hsl(20,10%,50%)" }}>รวม {cartCount} จาน</span>
                    <span>{cartTotal}฿</span>
                  </div>
                  {addonsTotal > 0 && (
                    <div className="flex justify-between text-sm mb-1">
                      <span style={{ color: "hsl(20,10%,50%)" }}>ของเพิ่ม</span>
                      <span>+{addonsTotal}฿</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm mb-3">
                    <span style={{ color: "hsl(20,10%,50%)" }}>ค่าส่ง</span>
                    <span className="text-green-600 font-medium">ฟรี!</span>
                  </div>
                  <div className="border-t pt-3 flex justify-between font-bold text-lg">
                    <span>ยอดรวม</span>
                    <span style={{ color: "hsl(22,90%,50%)" }}>{grandTotal}฿</span>
                  </div>
                </div>

                <button
                  onClick={() => setStep("checkout")}
                  className="mt-4 w-full rounded-2xl py-4 text-white font-bold text-lg shadow-md transition active:scale-95"
                  style={{ background: "hsl(22,90%,50%)" }}
                >
                  สั่งอาหาร →
                </button>
              </>
            )}
          </>
        )}

        {/* ===== CHECKOUT STEP ===== */}
        {step === "checkout" && (
          <>
            <div className="mt-4 flex items-center gap-2">
              <button onClick={() => setStep("cart")} className="text-sm flex items-center gap-1" style={{ color: "hsl(22,90%,50%)" }}>
                ← กลับตะกร้า
              </button>
            </div>
            <h2 className="text-xl font-bold mt-3 mb-3">กรอกข้อมูลจัดส่ง</h2>

            {/* Order summary mini */}
            <div className="bg-white rounded-2xl px-4 py-3 mb-4 shadow-sm" style={{ border: "1px solid hsl(30,20%,90%)" }}>
              <p className="text-sm font-semibold mb-2" style={{ color: "hsl(20,10%,50%)" }}>สรุปออเดอร์</p>
              {cart.map((item) => (
                <div key={`${item.id}-${item.isSpecial}`} className="flex justify-between text-sm py-0.5">
                  <span>{item.name} {item.isSpecial ? "(พิเศษ)" : ""} × {item.qty}</span>
                  <span>{(item.isSpecial ? (item.specialPrice ?? item.price) : item.price) * item.qty}฿</span>
                </div>
              ))}
              {ADDONS.filter((a) => selectedAddons.has(a.id)).map((addon) => (
                <div key={addon.id} className="flex justify-between text-sm py-0.5">
                  <span style={{ color: "hsl(22,90%,45%)" }}>{addon.emoji} {addon.name}</span>
                  <span>+{addon.price}฿</span>
                </div>
              ))}
              <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                <span>รวม</span>
                <span style={{ color: "hsl(22,90%,50%)" }}>{grandTotal}฿ (ส่งฟรี)</span>
              </div>
            </div>

            {/* Restored info banner */}
            {restoredFromSaved && (() => {
              const lbl = ADDRESS_LABELS.find((l) => l.value === addressLabel);
              return (
                <div
                  className="mb-3 rounded-2xl px-4 py-3 flex items-start justify-between gap-3"
                  style={{ background: "hsl(200,80%,93%)", border: "1.5px solid hsl(200,50%,75%)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "hsl(200,80%,28%)" }}>
                      {lbl ? `${lbl.icon} ${lbl.label} — ` : ""}📍 ใช้ข้อมูลที่บันทึกไว้จากครั้งก่อน
                    </p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: "hsl(200,60%,38%)" }}>
                      {form.name} · {form.phone}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearSavedInfo}
                    className="flex-shrink-0 text-xs rounded-xl px-3 py-1.5 font-medium transition active:scale-95"
                    style={{ background: "hsl(0,70%,95%)", color: "hsl(0,70%,45%)", border: "1px solid hsl(0,60%,82%)" }}
                  >
                    🗑️ ล้างข้อมูล
                  </button>
                </div>
              );
            })()}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">ชื่อผู้สั่ง *</label>
                <input
                  ref={nameRef}
                  type="text"
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setFormErrors({ ...formErrors, name: "" }); }}
                  placeholder="ชื่อ-นามสกุล"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition"
                  style={{
                    background: "white",
                    border: formErrors.name ? "1.5px solid hsl(0,84%,60%)" : "1.5px solid hsl(30,20%,80%)",
                  }}
                />
                {formErrors.name && <p className="text-xs mt-1 text-red-500">{formErrors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">เบอร์โทรศัพท์ *</label>
                <input
                  ref={phoneRef}
                  type="tel"
                  value={form.phone}
                  onChange={(e) => { setForm({ ...form, phone: e.target.value }); setFormErrors({ ...formErrors, phone: "" }); }}
                  placeholder="0XX-XXX-XXXX"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition"
                  style={{
                    background: "white",
                    border: formErrors.phone ? "1.5px solid hsl(0,84%,60%)" : "1.5px solid hsl(30,20%,80%)",
                  }}
                />
                {formErrors.phone && <p className="text-xs mt-1 text-red-500">{formErrors.phone}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">ที่อยู่จัดส่ง *</label>
                <textarea
                  ref={addressRef}
                  value={form.address}
                  onChange={(e) => { setForm({ ...form, address: e.target.value }); setFormErrors({ ...formErrors, address: "" }); }}
                  placeholder="บ้านเลขที่, ซอย, ถนน, แขวง/ตำบล, เขต/อำเภอ, จังหวัด"
                  rows={3}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition resize-none"
                  style={{
                    background: "white",
                    border: formErrors.address ? "1.5px solid hsl(0,84%,60%)" : "1.5px solid hsl(30,20%,80%)",
                  }}
                />
                {formErrors.address && <p className="text-xs mt-1 text-red-500">{formErrors.address}</p>}

                {/* Address label selector */}
                <div className="mt-2">
                  <p className="text-xs font-medium mb-1.5" style={{ color: "hsl(20,10%,50%)" }}>บันทึกที่อยู่นี้เป็น:</p>
                  <div className="flex gap-2">
                    {ADDRESS_LABELS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAddressLabel(opt.value)}
                        className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition active:scale-95"
                        style={
                          addressLabel === opt.value
                            ? { background: "hsl(22,90%,50%)", color: "white", border: "1.5px solid hsl(22,90%,50%)" }
                            : { background: "white", color: "hsl(20,14%,35%)", border: "1.5px solid hsl(30,20%,80%)" }
                        }
                      >
                        <span>{opt.icon}</span>
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">วิธีชำระเงิน *</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "cash", label: "เงินสด", icon: "💵", desc: "ชำระเมื่อรับของ" },
                    { value: "transfer", label: "โอนเงิน", icon: "🏦", desc: "โอนก่อนจัดส่ง" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, payment: opt.value })}
                      className="flex flex-col items-center gap-1 rounded-xl py-3 px-2 text-sm font-medium transition"
                      style={
                        form.payment === opt.value
                          ? { background: "hsl(22,90%,50%)", color: "white", border: "2px solid hsl(22,90%,50%)" }
                          : { background: "white", color: "hsl(20,14%,25%)", border: "2px solid hsl(30,20%,80%)" }
                      }
                    >
                      <span className="text-2xl">{opt.icon}</span>
                      <span className="font-bold">{opt.label}</span>
                      <span className="text-xs opacity-70">{opt.desc}</span>
                    </button>
                  ))}
                </div>
                {form.payment === "transfer" && (
                  <div className="mt-3 rounded-xl px-4 py-3 text-sm" style={{ background: "hsl(36,60%,92%)", border: "1px solid hsl(30,20%,82%)" }}>
                    <p className="font-semibold mb-1">ข้อมูลบัญชี</p>
                    <p>ธนาคารกสิกรไทย</p>
                    <p>เลขบัญชี: <span className="font-bold">xxx-x-xxxxx-x</span></p>
                    <p>ชื่อบัญชี: ตามสั่งซอยเขื่อน</p>
                    <p className="mt-1 text-xs" style={{ color: "hsl(20,10%,50%)" }}>กรุณาส่งสลิปให้ทางร้านทาง Line หรือโทรยืนยัน</p>
                  </div>
                )}
              </div>

              {/* Add-ons */}
              {ADDONS.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">ของเพิ่ม (ไม่บังคับ)</label>
                  <div
                    className="rounded-xl px-4 py-3 flex flex-col gap-2"
                    style={{ background: "white", border: "1.5px solid hsl(30,20%,80%)" }}
                  >
                    {ADDONS.map((addon) => {
                      const checked = selectedAddons.has(addon.id);
                      return (
                        <label
                          key={addon.id}
                          className="flex items-center gap-3 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedAddons((prev) => {
                                const next = new Set(prev);
                                if (next.has(addon.id)) next.delete(addon.id);
                                else next.add(addon.id);
                                return next;
                              });
                            }}
                            className="w-4 h-4 rounded accent-orange-500 cursor-pointer flex-shrink-0"
                          />
                          <span className="text-base leading-none">{addon.emoji}</span>
                          <span className="flex-1 text-sm font-medium">{addon.name}</span>
                          <span
                            className="text-sm font-semibold"
                            style={{ color: "hsl(22,90%,50%)" }}
                          >
                            +{addon.price}฿
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">หมายเหตุ (ไม่บังคับ)</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="เช่น ไม่ใส่ผัก, เผ็ดน้อย, ข้าวเพิ่ม..."
                  rows={2}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition resize-none"
                  style={{ background: "white", border: "1.5px solid hsl(30,20%,80%)" }}
                />
              </div>

              {/* Map location picker */}
              <div>
                <label className="block text-sm font-medium mb-1">ตำแหน่งจัดส่ง (ไม่บังคับ)</label>
                <button
                  type="button"
                  onClick={() => setShowMap(true)}
                  className="w-full rounded-xl py-3 text-sm font-medium transition active:scale-95"
                  style={{
                    background: mapPicked ? "hsl(140,50%,92%)" : "hsl(200,80%,93%)",
                    color: mapPicked ? "hsl(140,50%,30%)" : "hsl(200,80%,30%)",
                    border: `1.5px solid ${mapPicked ? "hsl(140,40%,72%)" : "hsl(200,50%,75%)"}`,
                  }}
                >
                  {mapPicked ? "📍 เปลี่ยนตำแหน่งบนแผนที่" : "📍 เลือกตำแหน่งบนแผนที่"}
                </button>
                {mapPicked && (
                  <div
                    className="mt-2 rounded-xl px-3 py-2 text-xs"
                    style={{ background: "hsl(140,50%,95%)", border: "1px solid hsl(140,40%,80%)" }}
                  >
                    <p className="font-semibold text-sm mb-0.5" style={{ color: "hsl(140,50%,30%)" }}>✅ เลือกตำแหน่งแล้ว</p>
                    <p className="leading-relaxed" style={{ color: "hsl(20,10%,40%)" }}>{mapPicked.formattedAddress}</p>
                    <p className="mt-1 opacity-60">{mapPicked.lat.toFixed(6)}, {mapPicked.lng.toFixed(6)}</p>
                    <button
                      type="button"
                      onClick={() => setMapPicked(null)}
                      className="mt-1 text-xs underline"
                      style={{ color: "hsl(0,70%,55%)" }}
                    >
                      ลบตำแหน่ง
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl py-4 text-white font-bold text-lg shadow-md transition active:scale-95"
                style={{ background: "hsl(22,90%,50%)" }}
              >
                ✅ ยืนยันการสั่งอาหาร
              </button>
            </form>
          </>
        )}

        {/* ===== SUCCESS / TRACKING STEP ===== */}
        {step === "success" && (() => {
          const currentIdx = STATUS_ORDER.indexOf(liveStatus);
          const currentStep = TRACK_STEPS[currentIdx];
          const isCompleted = liveStatus === "completed";

          return (
            <div className="pb-8">
              {/* Status hero */}
              <div
                className="mt-4 rounded-2xl px-5 py-5 text-center transition-all"
                style={{
                  background: isCompleted ? "hsl(140,50%,92%)" : "hsl(22,90%,96%)",
                  border: `1.5px solid ${isCompleted ? "hsl(140,40%,78%)" : "hsl(22,60%,88%)"}`,
                }}
              >
                <p className="text-5xl mb-2">{currentStep?.icon ?? "🟡"}</p>
                <h2 className="text-xl font-bold">{currentStep?.label}</h2>
                {currentStep?.sub && (
                  <p className="text-sm mt-1" style={{ color: "hsl(20,10%,55%)" }}>{currentStep.sub}</p>
                )}
                {!isCompleted && (
                  <p className="text-xs mt-2 animate-pulse" style={{ color: "hsl(22,70%,55%)" }}>
                    อัปเดตอัตโนมัติ · กรุณารอสักครู่
                  </p>
                )}
              </div>

              {/* Progress tracker */}
              <div className="mt-4 bg-white rounded-2xl px-5 py-4 shadow-sm" style={{ border: "1px solid hsl(30,20%,90%)" }}>
                <p className="text-xs font-semibold mb-4" style={{ color: "hsl(20,10%,50%)" }}>ติดตามออเดอร์</p>
                <div className="flex flex-col gap-0">
                  {TRACK_STEPS.map((s, i) => {
                    const done = i < currentIdx;
                    const active = i === currentIdx;
                    const upcoming = i > currentIdx;
                    return (
                      <div key={s.status} className="flex items-start gap-3">
                        {/* Spine */}
                        <div className="flex flex-col items-center" style={{ width: 24, flexShrink: 0 }}>
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all"
                            style={
                              active
                                ? { background: "hsl(22,90%,50%)", color: "white", boxShadow: "0 0 0 4px hsl(22,90%,88%)" }
                                : done
                                ? { background: "hsl(140,50%,45%)", color: "white" }
                                : { background: "hsl(30,20%,88%)", color: "hsl(20,10%,60%)" }
                            }
                          >
                            {done ? "✓" : i + 1}
                          </div>
                          {i < TRACK_STEPS.length - 1 && (
                            <div
                              className="w-0.5 my-1 transition-all"
                              style={{
                                height: 28,
                                background: done ? "hsl(140,50%,45%)" : "hsl(30,20%,85%)",
                              }}
                            />
                          )}
                        </div>
                        {/* Label */}
                        <div className="pb-1" style={{ paddingTop: 2 }}>
                          <p
                            className="text-sm font-medium leading-tight"
                            style={{
                              color: active
                                ? "hsl(22,90%,45%)"
                                : done
                                ? "hsl(140,50%,35%)"
                                : "hsl(20,10%,65%)",
                              fontWeight: active ? 700 : done ? 600 : 400,
                            }}
                          >
                            {s.icon} {s.label}
                          </p>
                          {s.sub && !upcoming && (
                            <p className="text-xs mt-0.5" style={{ color: "hsl(20,10%,60%)" }}>{s.sub}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Order summary */}
              <div className="mt-3 bg-white rounded-2xl px-4 py-3 shadow-sm" style={{ border: "1px solid hsl(30,20%,90%)" }}>
                <p className="text-xs font-semibold mb-2" style={{ color: "hsl(20,10%,50%)" }}>รายการอาหาร</p>
                {cart.map((item) => (
                  <div key={`${item.id}-${item.isSpecial}`} className="flex justify-between text-sm py-0.5">
                    <span>{item.name}{item.isSpecial ? " (พิเศษ)" : ""} × {item.qty}</span>
                    <span>{(item.isSpecial ? (item.specialPrice ?? item.price) : item.price) * item.qty}฿</span>
                  </div>
                ))}
                {ADDONS.filter((a) => selectedAddons.has(a.id)).map((addon) => (
                  <div key={addon.id} className="flex justify-between text-sm py-0.5">
                    <span style={{ color: "hsl(22,90%,45%)" }}>{addon.emoji} {addon.name}</span>
                    <span>+{addon.price}฿</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-sm border-t mt-2 pt-2">
                  <span>ยอดรวม</span>
                  <span style={{ color: "hsl(22,90%,50%)" }}>{grandTotal}฿ <span className="font-normal text-green-600">(ส่งฟรี)</span></span>
                </div>
                <div className="mt-2 pt-2 border-t text-xs" style={{ color: "hsl(20,10%,55%)" }}>
                  <p>📞 สอบถาม: 085-518-0889 / 064-975-0991</p>
                </div>
              </div>

              {/* Chat with restaurant */}
              {orderId && (
                <div className="mt-3 bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: "1px solid hsl(30,20%,90%)" }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: "hsl(30,20%,90%)", background: "hsl(36,30%,97%)" }}>
                    <p className="text-sm font-semibold">💬 แชทกับร้าน</p>
                    <p className="text-xs mt-0.5" style={{ color: "hsl(20,10%,55%)" }}>ส่งข้อความสอบถามหรือแจ้งเพิ่มเติมได้เลย</p>
                  </div>
                  <ChatThread orderId={orderId} sender="customer" />
                </div>
              )}

              <button
                onClick={() => {
                  setCart([]);
                  setOrderId(null);
                  setLiveStatus("pending");
                  setSelectedAddons(new Set());
                  applyRestoredInfo();
                  setStep("menu");
                }}
                className="mt-4 w-full rounded-2xl py-3 text-sm font-medium text-white transition active:scale-95"
                style={{ background: "hsl(22,90%,50%)" }}
              >
                สั่งอาหารอีกครั้ง
              </button>
            </div>
          );
        })()}
      </div>

      {/* Map modal */}
      {showMap && (
        <MapPicker
          onConfirm={(loc) => {
            setMapPicked(loc);
            setShowMap(false);
          }}
          onClose={() => setShowMap(false)}
        />
      )}

      {/* Floating cart bar */}
      {step === "menu" && cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 px-4 pb-4 z-50">
          <button
            onClick={() => setStep("cart")}
            className="w-full max-w-2xl mx-auto flex items-center justify-between rounded-2xl px-5 py-4 text-white font-bold shadow-xl transition active:scale-95"
            style={{ background: "hsl(22,90%,50%)", display: "flex" }}
          >
            <span className="bg-white/20 rounded-full px-2 py-0.5 text-sm">{cartCount} จาน</span>
            <span>ดูตะกร้า</span>
            <span>{cartTotal}฿</span>
          </button>
        </div>
      )}
    </div>
  );
}
