import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { resume, jobDesc } = req.body;
    if (!resume || !jobDesc) {
      res.status(400).json({ error: "Missing resume or job description" });
      return;
    }

    const prompt = `
Compare the following resume against the job description.
Identify strong matches, gaps, and provide 3–5 bullet points summarizing alignment.

Resume:
${resume}

Job Description:
${jobDesc}
`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });

    const analysis = response.choices[0].message.content;
    res.status(200).json({ analysis });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Analysis failed", detail: err.message });
  }
}