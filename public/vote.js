const voterId = createVoterId();
const selectedByQuestion = JSON.parse(localStorage.getItem("aetheris-selected-votes") || "{}");
let currentState = null;
let pendingOption = null;

const statusPill = document.querySelector("#statusPill");
const questionNumber = document.querySelector("#questionNumber");
const questionTitle = document.querySelector("#questionTitle");
const helperText = document.querySelector("#helperText");
const options = document.querySelector("#options");
const toast = document.querySelector("#toast");

function selectedFor(questionId, question) {
  const stored = selectedByQuestion[questionId];
  if (!stored) return null;
  if (typeof stored === "string") {
    delete selectedByQuestion[questionId];
    persistSelection();
    return null;
  }
  if (stored.version !== question.voteVersion) {
    delete selectedByQuestion[questionId];
    persistSelection();
    return null;
  }
  return stored.option || null;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2200);
}

function persistSelection() {
  localStorage.setItem("aetheris-selected-votes", JSON.stringify(selectedByQuestion));
}

function renderVote(state) {
  currentState = state;
  const { currentQuestionId, status } = state.systemState;
  const question = state.questions[currentQuestionId];
  const questionIndex = QUESTION_IDS.indexOf(currentQuestionId) + 1;
  const selected = selectedFor(currentQuestionId, question);
  const isActive = status === "active";
  const isWaiting = status === "waiting";
  const isLocked = status === "locked";

  statusPill.textContent = statusLabel(status);
  statusPill.className = `pill ${statusTone(status)}`;
  questionNumber.textContent = `第 ${questionIndex} / 10 題`;
  questionTitle.textContent = isWaiting ? "等待主持人開放投票" : question.title;
  helperText.textContent = isWaiting
    ? "請稍候，題目開放後會自動更新。"
    : isLocked
      ? "投票已結束，請等待主持人切換下一題。"
      : selected
        ? "已收到你的選擇；再次點擊可取消，或改選其他選項。"
        : "點選一個選項完成投票。";

  options.innerHTML = "";
  for (const key of OPTION_KEYS) {
    const button = document.createElement("button");
    const isSelected = selected === key;
    button.className = `option-button ${isSelected ? "selected" : ""}`;
    button.disabled = !isActive || pendingOption !== null;
    button.type = "button";
    button.innerHTML = `
      <span class="option-letter">${optionLetter(key)}</span>
      <span class="option-label">${question.options[key]}</span>
      <span class="option-state">${pendingOption === key ? "送出中" : isSelected ? "已選" : ""}</span>
    `;
    button.addEventListener("click", () => submitVote(key));
    options.appendChild(button);
  }
}

async function submitVote(optionId) {
  if (!currentState || pendingOption) return;
  const { currentQuestionId } = currentState.systemState;
  pendingOption = optionId;
  renderVote(currentState);

  try {
    const result = await postJson("/api/vote", {
      voterId,
      questionId: currentQuestionId,
      optionId
    });
    if (result.selectedOption) {
      selectedByQuestion[currentQuestionId] = {
        option: result.selectedOption,
        version: result.voteVersion
      };
      showToast("投票已更新");
    } else {
      delete selectedByQuestion[currentQuestionId];
      showToast("已取消投票");
    }
    persistSelection();
  } catch (error) {
    showToast(error.message);
  } finally {
    pendingOption = null;
    if (currentState) renderVote(currentState);
  }
}

connectEvents(renderVote);
