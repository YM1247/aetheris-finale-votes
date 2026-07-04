const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "state.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const IMAGE_DIR = path.join(__dirname, "img");

const optionKeys = ["optA", "optB", "optC", "optD"];
const questionIds = Array.from({ length: 10 }, (_, index) => `q${index + 1}`);

const defaultState = {
  systemState: {
    currentQuestionId: "q1",
    status: "waiting"
  },
  questions: Object.fromEntries(
    questionIds.map((id, index) => [
      id,
      {
        title: `第 ${index + 1} 題：請輸入題目`,
        options: {
          optA: "選項 A",
          optB: "選項 B",
          optC: "選項 C",
          optD: "選項 D"
        },
        voteVersion: 0,
        voteCounts: {
          optA: 0,
          optB: 0,
          optC: 0,
          optD: 0
        }
      }
    ])
  ),
  userVotes: {}
};

let state = loadState();
const clients = new Set();

function loadState() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(nextState) {
  const merged = structuredClone(defaultState);
  merged.systemState = {
    ...merged.systemState,
    ...(nextState.systemState || {})
  };
  for (const questionId of questionIds) {
    merged.questions[questionId] = {
      ...merged.questions[questionId],
      ...(nextState.questions?.[questionId] || {}),
      options: {
        ...merged.questions[questionId].options,
        ...(nextState.questions?.[questionId]?.options || {})
      },
      voteVersion: Number(nextState.questions?.[questionId]?.voteVersion || 0),
      voteCounts: {
        ...merged.questions[questionId].voteCounts,
        ...(nextState.questions?.[questionId]?.voteCounts || {})
      }
    };
  }
  merged.userVotes = nextState.userVotes || {};
  return merged;
}

function saveState() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

function publicSnapshot() {
  return {
    systemState: state.systemState,
    questions: state.questions,
    totals: Object.fromEntries(
      questionIds.map((questionId) => [
        questionId,
        optionKeys.reduce((sum, key) => sum + Number(state.questions[questionId].voteCounts[key] || 0), 0)
      ])
    )
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function broadcast() {
  const payload = `data: ${JSON.stringify(publicSnapshot())}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

function requireAdmin(req, res) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || token !== ADMIN_PASSWORD) {
    sendJson(res, 401, { error: "未授權，請先輸入後台密碼。" });
    return false;
  }
  return true;
}

function clampText(value, fallback, max = 80) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.slice(0, max) || fallback;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".jfif": "image/jpeg",
    ".png": "image/png"
  }[ext] || "application/octet-stream";
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/img/")) {
    serveFile(res, IMAGE_DIR, url.pathname.replace(/^\/img\/+/, ""));
    return;
  }

  const routes = {
    "/": "vote.html",
    "/vote": "vote.html",
    "/admin": "admin.html"
  };
  const requestedPath = routes[url.pathname] || url.pathname.replace(/^\/+/, "");
  serveFile(res, PUBLIC_DIR, requestedPath);
}

function serveFile(res, rootDir, requestedPath) {
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, publicSnapshot());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.write(`data: ${JSON.stringify(publicSnapshot())}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await parseBody(req);
    if (body.password === ADMIN_PASSWORD) {
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 401, { error: "密碼錯誤" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/vote") {
    const body = await parseBody(req);
    const voterId = clampText(body.voterId, "", 120);
    const questionId = clampText(body.questionId, "", 10);
    const optionId = body.optionId === null ? null : clampText(body.optionId, "", 10);

    if (!voterId || !questionIds.includes(questionId) || (optionId !== null && !optionKeys.includes(optionId))) {
      sendJson(res, 400, { error: "投票資料格式錯誤。" });
      return;
    }
    if (state.systemState.status !== "active" || state.systemState.currentQuestionId !== questionId) {
      sendJson(res, 409, { error: "目前未開放這一題投票。" });
      return;
    }

    const currentVote = state.userVotes[voterId]?.[questionId] || null;
    const nextVote = currentVote === optionId ? null : optionId;

    if (currentVote && optionKeys.includes(currentVote)) {
      state.questions[questionId].voteCounts[currentVote] = Math.max(0, state.questions[questionId].voteCounts[currentVote] - 1);
    }
    if (nextVote) {
      state.questions[questionId].voteCounts[nextVote] += 1;
    }

    state.userVotes[voterId] = state.userVotes[voterId] || {};
    if (nextVote) {
      state.userVotes[voterId][questionId] = nextVote;
    } else {
      delete state.userVotes[voterId][questionId];
    }

    saveState();
    broadcast();
    sendJson(res, 200, { ok: true, selectedOption: nextVote, voteVersion: state.questions[questionId].voteVersion });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/control") {
    if (!requireAdmin(req, res)) return;
    const body = await parseBody(req);
    const action = body.action;
    const currentIndex = questionIds.indexOf(state.systemState.currentQuestionId);

    if (action === "start") {
      state.systemState.status = "active";
    } else if (action === "lock") {
      state.systemState.status = "locked";
    } else if (action === "waiting") {
      state.systemState.status = "waiting";
    } else if (action === "next") {
      state.systemState.currentQuestionId = questionIds[Math.min(questionIds.length - 1, currentIndex + 1)];
      state.systemState.status = "waiting";
    } else if (action === "prev") {
      state.systemState.currentQuestionId = questionIds[Math.max(0, currentIndex - 1)];
      state.systemState.status = "waiting";
    } else if (action === "goto" && questionIds.includes(body.questionId)) {
      state.systemState.currentQuestionId = body.questionId;
      state.systemState.status = "waiting";
    } else if (action === "reset") {
      const questionId = state.systemState.currentQuestionId;
      for (const key of optionKeys) {
        state.questions[questionId].voteCounts[key] = 0;
      }
      state.questions[questionId].voteVersion += 1;
      for (const voterId of Object.keys(state.userVotes)) {
        delete state.userVotes[voterId][questionId];
        if (Object.keys(state.userVotes[voterId]).length === 0) {
          delete state.userVotes[voterId];
        }
      }
    } else if (action === "resetAll") {
      for (const questionId of questionIds) {
        for (const key of optionKeys) {
          state.questions[questionId].voteCounts[key] = 0;
        }
        state.questions[questionId].voteVersion += 1;
      }
      state.userVotes = {};
      state.systemState.status = "waiting";
      state.systemState.currentQuestionId = "q1";
    } else {
      sendJson(res, 400, { error: "未知的控制指令。" });
      return;
    }

    saveState();
    broadcast();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/question") {
    if (!requireAdmin(req, res)) return;
    const body = await parseBody(req);
    const questionId = clampText(body.questionId, "", 10);
    if (!questionIds.includes(questionId)) {
      sendJson(res, 400, { error: "題號不存在。" });
      return;
    }
    state.questions[questionId].title = clampText(body.title, state.questions[questionId].title, 120);
    for (const key of optionKeys) {
      state.questions[questionId].options[key] = clampText(body.options?.[key], state.questions[questionId].options[key], 60);
    }
    saveState();
    broadcast();
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "API not found" });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch((error) => {
      const id = crypto.randomUUID();
      console.error(`[${id}]`, error);
      sendJson(res, 500, { error: `伺服器發生錯誤：${id}` });
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Voting system running at http://localhost:${PORT}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
});
