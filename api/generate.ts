import type { VercelRequest, VercelResponse } from '@vercel/node';

type MiniMaxMessage = {
  role: "system" | "user";
  content: string;
};

function stringifyContents(contents: unknown): string {
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) {
    return contents.map((item) => stringifyContents(item)).join("\n");
  }
  if (contents && typeof contents === "object") {
    return JSON.stringify(contents);
  }
  return String(contents ?? "");
}

function cleanModelText(text: string): string {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fencedJson = withoutThinking.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fencedJson?.[1] ?? withoutThinking).trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.MINIMAX_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "MINIMAX_API_KEY is not configured."
    });
  }

  const { model, contents, config } = req.body ?? {};

  if (typeof model !== "string" || contents === undefined) {
    return res.status(400).json({ error: "model and contents are required." });
  }

  try {
    const systemParts = [];
    if (config?.systemInstruction) {
      systemParts.push(String(config.systemInstruction));
    }
    if (config?.responseMimeType === "application/json") {
      systemParts.push("Return only valid JSON. Do not wrap the JSON in Markdown fences. Do not include any explanation outside the JSON.");
    }

    const messages: MiniMaxMessage[] = [];
    if (systemParts.length > 0) {
      messages.push({ role: "system", content: systemParts.join("\n\n") });
    }
    messages.push({ role: "user", content: stringifyContents(contents) });

    const apiBaseUrl = process.env.MINIMAX_API_BASE_URL || "https://api.minimaxi.com";
    const minimaxResponse = await fetch(`${apiBaseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.startsWith("MiniMax-") ? model : process.env.MINIMAX_MODEL || "MiniMax-M2.7",
        messages,
        temperature: 1,
        n: 1,
        reasoning_split: true,
      }),
    });

    const data = await minimaxResponse.json().catch(() => null);

    if (!minimaxResponse.ok) {
      console.error("MiniMax API error:", data ?? await minimaxResponse.text().catch(() => ""));
      return res.status(502).json({ error: "MiniMax request failed." });
    }

    const text = cleanModelText(data?.choices?.[0]?.message?.content ?? "");
    return res.status(200).json({ text });
  } catch (error) {
    console.error("MiniMax API error:", error);
    return res.status(502).json({ error: "MiniMax request failed." });
  }
}