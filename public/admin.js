let currentState = null;
let syncingEditor = false;
let disconnectEvents = null;
let isLoggingIn = false;
const ADMIN_SESSION_KEY = "aetheris-admin-session-active";

const loginPanel = document.querySelector("#loginPanel");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#loginForm");
const adminEmail = document.querySelector("#adminEmail");
const password = document.querySelector("#password");
const loginError = document.querySelector("#loginError");
const adminStatus = document.querySelector("#adminStatus");
const questionTabs = document.querySelector("#questionTabs");
const adminQuestionNumber = document.querySelector("#adminQuestionNumber");
const adminQuestionTitle = document.querySelector("#adminQuestionTitle");
const totalVotes = document.querySelector("#totalVotes");
const bars = document.querySelector("#bars");
const voteUrl = document.querySelector("#voteUrl");
const voteLink = document.querySelector("#voteLink");
const qrImage = document.querySelector("#qrImage");
const questionForm = document.querySelector("#questionForm");
const resetAll = document.querySelector("#resetAll");
const logoutButton = document.querySelector("#logoutButton");
const adminToast = document.querySelector("#adminToast");

const editFields = {
  title: document.querySelector("#editTitle"),
  optA: document.querySelector("#editOptA"),
  optB: document.querySelector("#editOptB"),
  optC: document.querySelector("#editOptC"),
  optD: document.querySelector("#editOptD")
};

function showAdminToast(message) {
  adminToast.textContent = message;
  adminToast.classList.add("visible");
  window.clearTimeout(showAdminToast.timer);
  showAdminToast.timer = window.setTimeout(() => adminToast.classList.remove("visible"), 2200);
}

function revealDashboard() {
  sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
  loginPanel.classList.add("hidden");
  dashboard.classList.remove("hidden");
}

function revealLogin() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  dashboard.classList.add("hidden");
  loginPanel.classList.remove("hidden");
  if (disconnectEvents) {
    disconnectEvents();
    disconnectEvents = null;
  }
}

function hasActiveAdminSession() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
}

function renderTabs(currentQuestionId) {
  questionTabs.innerHTML = "";
  for (const id of QUESTION_IDS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = id.replace("q", "");
    button.className = id === currentQuestionId ? "active" : "";
    button.addEventListener("click", () => control("goto", { questionId: id }));
    questionTabs.appendChild(button);
  }
}

function syncEditor(question) {
  if (document.activeElement && questionForm.contains(document.activeElement)) return;
  syncingEditor = true;
  editFields.title.value = question.title;
  editFields.optA.value = question.options.optA;
  editFields.optB.value = question.options.optB;
  editFields.optC.value = question.options.optC;
  editFields.optD.value = question.options.optD;
  syncingEditor = false;
}

function renderAdmin(state) {
  currentState = state;
  const { currentQuestionId, status } = state.systemState;
  const question = state.questions[currentQuestionId];
  const questionIndex = QUESTION_IDS.indexOf(currentQuestionId) + 1;
  const counts = countVotesForQuestion(state.userVotes, currentQuestionId);
  const total = OPTION_KEYS.reduce((sum, key) => sum + Number(counts[key] || 0), 0);

  adminStatus.textContent = statusLabel(status);
  adminStatus.className = `pill ${statusTone(status)}`;
  adminQuestionNumber.textContent = `第 ${questionIndex} / 10 題`;
  adminQuestionTitle.textContent = question.title;
  totalVotes.textContent = `${total} 票`;
  renderTabs(currentQuestionId);
  syncEditor(question);

  bars.innerHTML = "";
  for (const key of OPTION_KEYS) {
    const count = counts[key] || 0;
    const percent = total === 0 ? 0 : Math.round((count / total) * 100);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-meta">
        <span><b>${optionLetter(key)}</b> ${question.options[key]}</span>
        <strong>${count} 票 · ${percent}%</strong>
      </div>
      <div class="bar-track"><span style="width: ${percent}%"></span></div>
    `;
    bars.appendChild(row);
  }
}

async function control(action, extra = {}) {
  if (!currentState) return;
  try {
    await controlFirebase(action, extra, currentState);
    showAdminToast("控制已更新");
  } catch (error) {
    showAdminToast(error.message || "控制失敗");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  isLoggingIn = true;
  try {
    await signInAdmin(adminEmail.value, password.value);
    revealDashboard();
    if (!disconnectEvents) {
      disconnectEvents = connectAdminEvents(renderAdmin);
    }
  } catch (error) {
    loginError.textContent = error.message || "登入失敗";
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } finally {
    isLoggingIn = false;
  }
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "reset" && !confirm("確定重置本題票數？")) return;
    control(action);
  });
});

questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentState || syncingEditor) return;
  const questionId = currentState.systemState.currentQuestionId;
  try {
    await updateQuestion(questionId, editFields.title.value, {
      optA: editFields.optA.value,
      optB: editFields.optB.value,
      optC: editFields.optC.value,
      optD: editFields.optD.value
    });
    showAdminToast("題目已儲存");
  } catch (error) {
    showAdminToast(error.message || "儲存失敗");
  }
});

resetAll.addEventListener("click", () => {
  if (confirm("確定清空全部題目的投票資料？")) {
    control("resetAll");
  }
});

logoutButton.addEventListener("click", async () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  await signOutAdmin();
  revealLogin();
});

const publicVoteUrl = `${location.origin}/vote`;
voteUrl.textContent = publicVoteUrl;
voteLink.href = publicVoteUrl;
qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(publicVoteUrl)}`;

auth.onAuthStateChanged(async (user) => {
  if (isLoggingIn) return;

  if (!user || !hasActiveAdminSession()) {
    if (user) {
      await signOutAdmin().catch(() => {});
    }
    revealLogin();
    return;
  }

  try {
    const adminSnapshot = await db.ref(`admins/${user.uid}`).get();
    if (adminSnapshot.val() !== true) {
      throw new Error("此帳號尚未被加入管理員名單。");
    }
    revealDashboard();
    if (!disconnectEvents) {
      disconnectEvents = connectAdminEvents(renderAdmin);
    }
  } catch {
    revealLogin();
  }
});
