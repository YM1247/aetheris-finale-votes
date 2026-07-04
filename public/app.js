const OPTION_KEYS = ["optA", "optB", "optC", "optD"];
const QUESTION_IDS = Array.from({ length: 10 }, (_, index) => `q${index + 1}`);

function createVoterId() {
  const existing = localStorage.getItem("aetheris-voter-id");
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem("aetheris-voter-id", next);
  return next;
}

function statusLabel(status) {
  return {
    waiting: "等待開放",
    active: "投票中",
    locked: "已鎖定"
  }[status] || status;
}

function statusTone(status) {
  return {
    waiting: "neutral",
    active: "live",
    locked: "locked"
  }[status] || "neutral";
}

function optionLetter(key) {
  return {
    optA: "A",
    optB: "B",
    optC: "C",
    optD: "D"
  }[key];
}

function postJson(url, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "請求失敗");
    return payload;
  });
}

function connectEvents(onState) {
  fetch("/api/state")
    .then((response) => response.json())
    .then(onState)
    .catch(() => {});

  const events = new EventSource("/api/events");
  events.onmessage = (event) => onState(JSON.parse(event.data));
  events.onerror = () => {
    document.body.classList.add("is-reconnecting");
  };
  events.onopen = () => {
    document.body.classList.remove("is-reconnecting");
  };
  return events;
}
