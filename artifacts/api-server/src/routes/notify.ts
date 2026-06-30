import { Router, type IRouter } from "express";

const router: IRouter = Router();

interface OrderItem {
  name: string;
  qty: number;
  isSpecial: boolean;
  price: number;
  specialPrice?: number | null;
}

interface OrderAddon {
  id: string;
  name: string;
  price: number;
}

interface NotifyOrderBody {
  customerName: string;
  phone: string;
  address: string;
  payment: string;
  note?: string;
  items: OrderItem[];
  addons?: OrderAddon[];
  total: number;
}

router.post("/notify-order", async (req, res): Promise<void> => {
  const webhookUrl = process.env.DISCORD_WEBHOOK;
  if (!webhookUrl) {
    req.log.warn("DISCORD_WEBHOOK is not configured");
    res.status(503).json({ error: "Webhook not configured" });
    return;
  }

  const body = req.body as NotifyOrderBody;

  if (!body.customerName || !body.phone || !body.address || !Array.isArray(body.items)) {
    res.status(400).json({ error: "Missing required order fields" });
    return;
  }

  const paymentLabel = body.payment === "cash" ? "💵 เงินสด" : "🏦 โอนเงิน";
  const orderTime = new Date().toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
    timeStyle: "short",
  });

  const foodLines = body.items
    .map((item) => {
      const unitPrice = item.isSpecial ? (item.specialPrice ?? item.price) : item.price;
      const label = item.isSpecial ? `${item.name} (พิเศษ)` : item.name;
      return `• ${label} × ${item.qty} = ${unitPrice * item.qty}฿`;
    });

  const addonLines = (body.addons ?? []).map((a) => `• + ${a.name} = +${a.price}฿`);

  const itemLines = [...foodLines, ...addonLines].join("\n");

  const discordPayload = {
    username: "ตามสั่งซอยเขื่อน",
    avatar_url: "https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/1f373.png",
    embeds: [
      {
        title: "🛵 ออเดอร์ใหม่เข้ามาแล้ว!",
        color: 0xf97316,
        fields: [
          {
            name: "👤 ชื่อลูกค้า",
            value: body.customerName,
            inline: true,
          },
          {
            name: "📞 เบอร์โทร",
            value: body.phone,
            inline: true,
          },
          {
            name: "📍 ที่อยู่จัดส่ง",
            value: body.address,
            inline: false,
          },
          {
            name: "🍽️ รายการอาหาร",
            value: itemLines,
            inline: false,
          },
          {
            name: "💰 ยอดรวม",
            value: `**${body.total}฿** (ส่งฟรี)`,
            inline: true,
          },
          {
            name: "💳 ชำระเงิน",
            value: paymentLabel,
            inline: true,
          },
          ...(body.note
            ? [{ name: "📝 หมายเหตุ", value: body.note, inline: false }]
            : []),
          {
            name: "🕐 เวลา",
            value: orderTime,
            inline: false,
          },
        ],
        footer: { text: "ตามสั่งซอยเขื่อน — ระบบแจ้งเตือนออเดอร์" },
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload),
    });

    if (!response.ok) {
      const text = await response.text();
      req.log.error({ status: response.status, body: text }, "Discord webhook failed");
      res.status(502).json({ error: "Discord webhook failed" });
      return;
    }

    req.log.info({ customer: body.customerName }, "Discord notification sent");
    res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to send Discord notification");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
