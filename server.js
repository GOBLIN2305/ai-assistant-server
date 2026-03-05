import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "1mb" }));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Простая память по устройству (в RAM). Для Render ок, но после перезапуска очистится.
const memory = new Map(); // device -> messages[]

function detectLang(text = "") {
  const t = text.toLowerCase();

  // Азербайджанские буквы/частые слова
  const azChars = /[əğıüşçö]/i;
  const azWords = /\b(salam|necə|necəsən|mən|sən|xahiş|zəhmət|var|yox|bəli|sağ ol|təşəkkür)\b/i;

  if (azChars.test(text) || azWords.test(t)) return "az";
  return "ru";
}

function systemPrompt(lang) {
  if (lang === "az") {
    return `Sən "Şəbnurum" adlı səsli AI-assistentsən.
Həmişə istifadəçinin danışdığı dillə cavab ver: istifadəçi azərbaycanca danışırsa AZ, rusca danışırsa RU.
Qısa, konkret, dostyana yaz. Lazım olsa addım-addım izah et.
İstifadəçi telefonda hərəkət istəyirsə, "action" üçün qısa komanda təklifi ver (məs: open_app, call, message).`;
  }
  return `Ты голосовой AI-ассистент "Şəbnurum".
Всегда отвечай на том же языке, что и пользователь (RU/AZ).
Пиши коротко, по делу, дружелюбно. Если нужна инструкция — пошагово.
Если пользователь просит действие на телефоне, предложи короткую команду для "action" (например: open_app, call, message).`;
}

// Главная страница, чтобы не было Cannot GET /
app.get("/", (req, res) => {
  res.type("text").send("OK: Şəbnurum server is running. Use /chat");
});

// /chat?q=...&device=phone1
app.get("/chat", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const device = String(req.query.device || "default").trim();

    if (!q) return res.status(400).json({ error: "Missing q" });

    const lang = detectLang(q);

    const prev = memory.get(device) || [];
    const messages = [
      { role: "system", content: systemPrompt(lang) },
      ...prev.slice(-10), // последние 10 сообщений
      { role: "user", content: q },
    ];

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      temperature: 0.4,
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || "";

    // сохраняем память
    const nextMem = [...prev, { role: "user", content: q }, { role: "assistant", content: reply }];
    memory.set(device, nextMem.slice(-20));

    // можно расширить: action (пока пусто)
    res.json({ reply, lang, action: "" });
  } catch (e) {
    const msg = e?.message || "Unknown error";
    res.status(500).json({ error: msg });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server listening on", port));
