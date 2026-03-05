import express from "express";

const app = express();

const OPENAI_KEY = process.env.OPENAI_KEY;

app.get("/chat", async (req, res) => {

  const q = req.query.q;

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: q
    })
  });

  const data = await r.json();

  res.send(data.output_text);

});

app.listen(3000, () => {
  console.log("AI server started");
});
app.get("/", (req, res) => {
  res.send("OK. Use /chat?q=hello");
});
