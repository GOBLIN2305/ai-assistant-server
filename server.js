import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "1mb" }));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const memory = new Map(); // device -> messages[]

function detectLang(text = "") {
  const azChars = /[əğıüşçö]/i;
  const azWords = /\b(salam|necə|necəsən|mən|sən|xahiş|zəhmət|var|yox|bəli|sağ ol|təşəkkür)\b/i;
  if (azChars.test(text) || azWords.test(text.toLowerCase())) return "az";
  return "ru";
}

function systemPrompt(lang) {
  if (lang === "az") {
    return `Sən "Şəbnurum" adlı səsli AI-assistentsən.
Həmişə istifadəçinin danışdığı dillə cavab ver (AZ/RU).
Qısa, konkret cavab ver.
Əgər istifadəçi telefonda əməl istəyirsə, reply ilə yanaşı action qaytar:
- open_app:youtube | open_app:telegram
- flashlight_on | flashlight_off
- wifi_on | wifi_off
- call:NAME (sadəcə ad qaytar, nömrə yox)
- message:NAME|TEXT (sadəcə format)
Heç bir action lazım deyilsə, action boş olsun.`;
  }
  return `Ты голосовой AI-ассистент "Şəbnurum".
Всегда отвечай на языке пользователя (RU/AZ).
Отвечай коротко и по делу.
Если пользователь просит действие на телефоне — верни action:
- open_app:youtube | open_app:telegram
- flashlight_on | flashlight_off
- wifi_on | wifi_off
- call:ИМЯ (только имя)
- message:ИМЯ|ТЕКСТ
Если действие не нужно — action пустая строка.`;
}

async function askAI({ q, device }) {
  const lang = detectLang(q);
  const prev = memory.get(device) || [];
  const messages = [
    { role: "system", content: systemPrompt(lang) },
    ...prev.slice(-10),
    { role: "user", content: q }
  ];

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const resp = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.4
  });

  const content = resp.choices?.[0]?.message?.content?.trim() || "";

  // сохраняем память
  const nextMem = [...prev, { role: "user", content: q }, { role: "assistant", content }];
  memory.set(device, nextMem.slice(-20));

  return { lang, content };
}

// Главная
app.get("/", (req, res) => {
  res.type("text").send("OK. Use /say?q=hello&device=phone1 or /action?q=...");
});

// Возвращает ТОЛЬКО текст (для Tasker проще всего)
app.get("/say", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const device = String(req.query.device || "default").trim();
    if (!q) return res.status(400).send("No query");

    const { content } = await askAI({ q, device });

    // только текст
    res.type("text").send(content);
  } catch (e) {
    res.status(500).type("text").send(`Server error: ${e?.message || "unknown"}`);
  }
});

// Возвращает JSON с action (для управления телефоном)
app.get("/action", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const device = String(req.query.device || "default").trim();
    if (!q) return res.status(400).json({ reply: "", action: "" });

    const { content, lang } = await askAI({ q, device });

    // Просим модель отдавать действие в 2 строках: reply=... \naction=...
    // Если модель вернула просто текст — action пустая.
    let reply = content;
    let action = "";

    const mReply = content.match(/reply\s*=\s*(.*)/i);
    const mAction = content.match(/action\s*=\s*(.*)/i);
    if (mReply && mAction) {
      reply = mReply[1]?.trim() || "";
      action = mAction[1]?.trim() || "";
    }

    res.json({ reply, action, lang });
  } catch (e) {
    res.status(500).json({ reply: "", action: "", error: e?.message || "unknown" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Listening on", port));
