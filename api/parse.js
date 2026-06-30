export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { image, mimeType } = req.body;
  if (!image) return res.status(400).json({ error: "No image" });

  const prompt = `Analyze this store receipt image carefully. Return ONLY a JSON object, no markdown, no explanation:
{"merchant":"store name","date":"YYYY-MM-DD","items":[{"name":"item name","qty":1,"unitPrice":0.00,"total":0.00}],"subtotal":0.00,"tax":0.00,"total":0.00,"paymentMethod":"Visa 1234 or Cash or null"}
Rules: amounts are numbers only; card payment = type + last 4 digits e.g. Visa 1234; null if unreadable; qty=1 if unclear.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType || "image/jpeg", data: image } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    const data = await response.json();
    const text = (data.content || []).find((b) => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: "Parse failed" });
  }
}
