export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { image, mimeType, itemName, merchant } = req.body;
  let messages;

  if (itemName) {
    const prompt = `A store receipt shows this abbreviated item name: "${itemName}"${merchant ? ` from ${merchant}` : ""}.
Decode it and return ONLY a JSON object (no markdown):
{
  "fullName": "full descriptive product name in plain English",
  "description": "1-2 sentences: what this product is and what it is used for",
  "category": "one of: Fasteners / Lumber & Boards / Electrical / Plumbing / Paint & Supplies / Hand Tools / Power Tools / Hardware / Flooring / Building Materials / Garden / Safety / Other",
  "searchQuery": "best search query to find this exact product on Home Depot or Lowes"
}`;
    messages = [{ role: "user", content: prompt }];
  } else if (image) {
    const prompt = `Analyze this store receipt image carefully. Return ONLY a JSON object, no markdown, no explanation:
{"merchant":"store name","date":"YYYY-MM-DD","items":[{"name":"item name as printed","qty":1,"unitPrice":0.00,"total":0.00}],"subtotal":0.00,"tax":0.00,"total":0.00,"paymentMethod":"Visa 1234 or Cash or null"}
Rules: amounts are numbers only; card payment = card type + last 4 digits e.g. Visa 1234; null if unreadable; qty=1 if unclear.`;
    messages = [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mimeType || "image/jpeg", data: image } },
        { type: "text", text: prompt },
      ],
    }];
  } else {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages }),
    });
    const data = await response.json();
    const text = (data.content || []).find((b) => b.type === "text")?.text || "";
    res.status(200).json(JSON.parse(text.replace(/```json|```/g, "").trim()));
  } catch (e) {
    res.status(500).json({ error: "Parse failed" });
  }
}
