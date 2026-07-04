const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.database();
const region = "asia-southeast1";
const optionKeys = ["optA", "optB", "optC", "optD"];
const questionIds = Array.from({ length: 10 }, (_, index) => `q${index + 1}`);

function requireAdmin(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入後台。");
  }
  return db.ref(`admins/${uid}`).get().then((snapshot) => {
    if (snapshot.val() !== true) {
      throw new HttpsError("permission-denied", "此帳號沒有管理員權限。");
    }
    return uid;
  });
}

function assertQuestionId(questionId) {
  if (!questionIds.includes(questionId)) {
    throw new HttpsError("invalid-argument", "題號不存在。");
  }
}

function clampText(value, fallback, max) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.slice(0, max) || fallback;
}

exports.updateQuestion = onCall({ region }, async (request) => {
  await requireAdmin(request);

  const questionId = request.data?.questionId;
  assertQuestionId(questionId);

  const questionIndex = questionIds.indexOf(questionId);
  const options = request.data?.options || {};
  const update = {
    title: clampText(request.data?.title, `第 ${questionIndex + 1} 題：請輸入題目`, 120),
    options: {
      optA: clampText(options.optA, "選項 A", 60),
      optB: clampText(options.optB, "選項 B", 60),
      optC: clampText(options.optC, "選項 C", 60),
      optD: clampText(options.optD, "選項 D", 60)
    }
  };

  await db.ref(`questions/${questionId}`).update(update);
  return { ok: true };
});

exports.controlVoting = onCall({ region }, async (request) => {
  await requireAdmin(request);

  const action = request.data?.action;
  const stateSnapshot = await db.ref().get();
  const state = stateSnapshot.val() || {};
  const currentQuestionId = state.systemState?.currentQuestionId || "q1";
  const currentIndex = questionIds.indexOf(currentQuestionId);
  const updates = {};

  if (action === "start") {
    updates["systemState/status"] = "active";
  } else if (action === "lock") {
    updates["systemState/status"] = "locked";
  } else if (action === "waiting") {
    updates["systemState/status"] = "waiting";
  } else if (action === "next") {
    updates["systemState/currentQuestionId"] = questionIds[Math.min(questionIds.length - 1, currentIndex + 1)];
    updates["systemState/status"] = "waiting";
  } else if (action === "prev") {
    updates["systemState/currentQuestionId"] = questionIds[Math.max(0, currentIndex - 1)];
    updates["systemState/status"] = "waiting";
  } else if (action === "goto") {
    const questionId = request.data?.questionId;
    assertQuestionId(questionId);
    updates["systemState/currentQuestionId"] = questionId;
    updates["systemState/status"] = "waiting";
  } else if (action === "reset") {
    const voteUsers = state.userVotes || {};
    for (const uid of Object.keys(voteUsers)) {
      updates[`userVotes/${uid}/${currentQuestionId}`] = null;
    }
    updates[`questions/${currentQuestionId}/voteVersion`] = Number(state.questions?.[currentQuestionId]?.voteVersion || 0) + 1;
  } else if (action === "resetAll") {
    updates.userVotes = null;
    updates.systemState = {
      currentQuestionId: "q1",
      status: "waiting"
    };
    for (const questionId of questionIds) {
      updates[`questions/${questionId}/voteVersion`] = Number(state.questions?.[questionId]?.voteVersion || 0) + 1;
    }
  } else {
    throw new HttpsError("invalid-argument", "未知的控制指令。");
  }

  await db.ref().update(updates);
  return { ok: true };
});
