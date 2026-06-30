import { useState, useEffect, useRef } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export interface ChatMessage {
  id: string;
  message: string;
  sender: "customer" | "admin";
  createdAt: { seconds: number; nanoseconds: number } | null;
}

interface ChatThreadProps {
  orderId: string;
  sender: "customer" | "admin";
  onNewCustomerMessage?: () => void;
}

function formatTime(ts: ChatMessage["createdAt"]) {
  if (!ts) return "";
  return new Date(ts.seconds * 1000).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatThread({ orderId, sender, onNewCustomerMessage }: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFirstSnapshot = useRef(true);
  const prevCount = useRef(0);
  const callbackRef = useRef(onNewCustomerMessage);

  useEffect(() => {
    callbackRef.current = onNewCustomerMessage;
  });

  useEffect(() => {
    const q = query(
      collection(db, "orders", orderId, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));

      if (!isFirstSnapshot.current) {
        const newMsgs = msgs.slice(prevCount.current);
        newMsgs.forEach((msg) => {
          if (msg.sender === "customer") {
            callbackRef.current?.();
          }
        });
      }
      isFirstSnapshot.current = false;
      prevCount.current = msgs.length;
      setMessages(msgs);
    });
    return unsub;
  }, [orderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    try {
      await addDoc(collection(db, "orders", orderId, "messages"), {
        message: text,
        sender,
        createdAt: serverTimestamp(),
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 320 }}>
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 min-h-0">
        {messages.length === 0 && (
          <p
            className="text-center text-xs py-10"
            style={{ color: "hsl(20,10%,60%)" }}
          >
            {sender === "customer"
              ? "💬 ส่งข้อความถึงร้านได้เลย — เราจะตอบกลับโดยเร็ว"
              : "ยังไม่มีข้อความจากลูกค้า"}
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender === sender;
          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className="max-w-[78%] px-3 py-2 text-sm leading-relaxed"
                style={{
                  background: isMe ? "hsl(22,90%,50%)" : "hsl(30,20%,93%)",
                  color: isMe ? "white" : "hsl(20,14%,20%)",
                  borderRadius: isMe
                    ? "18px 18px 4px 18px"
                    : "18px 18px 18px 4px",
                }}
              >
                {!isMe && (
                  <p
                    className="text-xs font-semibold mb-0.5"
                    style={{ color: isMe ? "rgba(255,255,255,0.75)" : "hsl(22,80%,45%)" }}
                  >
                    {msg.sender === "admin" ? "🍳 ร้าน" : "👤 ลูกค้า"}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                <p
                  className="text-xs mt-0.5"
                  style={{
                    color: isMe ? "rgba(255,255,255,0.65)" : "hsl(20,10%,55%)",
                    textAlign: isMe ? "right" : "left",
                  }}
                >
                  {formatTime(msg.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="flex gap-2 px-3 py-2 flex-shrink-0 border-t"
        style={{ borderColor: "hsl(30,20%,88%)" }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            sender === "customer" ? "ส่งข้อความถึงร้าน..." : "ตอบลูกค้า..."
          }
          className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
          style={{
            background: "hsl(36,30%,96%)",
            border: "1px solid hsl(30,20%,84%)",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="rounded-xl px-4 py-2 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40 flex-shrink-0"
          style={{ background: "hsl(22,90%,50%)" }}
        >
          ส่ง
        </button>
      </div>
    </div>
  );
}
