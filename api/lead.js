export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { email, ts, ua } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    // For now we just log. In a future lesson we’ll store to Sheets/Airtable/DB.
    console.log("[lead]", { email, ts: ts || Date.now(), ua: ua || "" });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Lead capture failed", detail: String(err?.message || err) });
  }
}