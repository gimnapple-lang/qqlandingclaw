import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { config as loadEnv } from "dotenv";

loadEnv();
loadEnv({ path: ".env.local", override: true });

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

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  app.use(express.json({ limit: "1mb" }));

  // Real-time multi-user state
  const users: Record<string, { id: string, name: string, x: number, y: number, avatar: string }> = {};
  let lastActivity = Date.now();
  const IDLE_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours in ms
  let topicCards: any[] = [];

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (userData) => {
      users[socket.id] = {
        id: socket.id,
        name: userData.name || "匿名客官",
        x: Math.random() * 300 + 50,
        y: Math.random() * 200 + 50,
        avatar: userData.avatar || "🦞"
      };
      io.emit("users-update", Object.values(users));
    });

    socket.on("move", (pos) => {
      if (users[socket.id]) {
        users[socket.id].x = pos.x;
        users[socket.id].y = pos.y;
        socket.broadcast.emit("user-moved", users[socket.id]);
      }
    });

    socket.on("chat-message", (msg) => {
      lastActivity = Date.now();
      io.emit("new-chat-message", {
        userId: socket.id,
        userName: users[socket.id]?.name,
        text: msg,
        timestamp: Date.now()
      });
    });

    socket.on("ai-topic-announcement", (topic) => {
      io.emit("new-chat-message", {
        userId: "ai-helper",
        userName: "🦞 龙虾助手",
        text: `【全群播报】${topic}`,
        timestamp: Date.now(),
        isAi: true
      });
    });

    socket.on("disconnect", () => {
      delete users[socket.id];
      io.emit("user-left", socket.id);
    });
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/generate", async (req, res) => {
    const apiKey = process.env.MINIMAX_API_KEY;

    if (!apiKey) {
      res.status(500).json({
        error: "MINIMAX_API_KEY is not configured. Create .env.local and restart the dev server."
      });
      return;
    }

    const { model, contents, config } = req.body ?? {};

    if (typeof model !== "string" || contents === undefined) {
      res.status(400).json({ error: "model and contents are required." });
      return;
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
        res.status(502).json({ error: "MiniMax request failed. Check the server logs for details." });
        return;
      }

      const text = cleanModelText(data?.choices?.[0]?.message?.content ?? "");
      res.json({ text });
    } catch (error) {
      console.error("MiniMax API error:", error);
      res.status(502).json({ error: "MiniMax request failed. Check the server logs for details." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
