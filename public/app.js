const OPTION_KEYS = ["optA", "optB", "optC", "optD"];
const QUESTION_IDS = Array.from({ length: 10 }, (_, index) => `q${index + 1}`);

const firebaseConfig = {
  apiKey: "AIzaSyDtaxfc6KQ7Z5G4lugzOscGlcXC-Q5ECuc",
  authDomain: "aetheris-finale-votes.firebaseapp.com",
  databaseURL: "https://aetheris-finale-votes-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "aetheris-finale-votes",
  storageBucket: "aetheris-finale-votes.firebasestorage.app",
  messagingSenderId: "410310178027",
  appId: "1:410310178027:web:7679e7b517ade7caf4faae",
  measurementId: "G-QNX0LH4W13"
};

firebase.initializeApp(firebaseConfig);
if (firebase.analytics && location.hostname !== "localhost") {
  firebase.analytics();
}

const auth = firebase.auth();
const db = firebase.database();
const cloudFunctions = firebase.app().functions("asia-southeast1");

function defaultQuestion(index) {
  return {
    title: `第 ${index + 1} 題：請輸入題目`,
    options: {
      optA: "選項 A",
      optB: "選項 B",
      optC: "選項 C",
      optD: "選項 D"
    },
    voteVersion: 0
  };
}

function defaultQuestions() {
  return Object.fromEntries(QUESTION_IDS.map((id, index) => [id, defaultQuestion(index)]));
}

function normalizeState(snapshot) {
  const value = snapshot || {};
  const questions = defaultQuestions();
  for (const id of QUESTION_IDS) {
    questions[id] = {
      ...questions[id],
      ...(value.questions?.[id] || {}),
      options: {
        ...questions[id].options,
        ...(value.questions?.[id]?.options || {})
      },
      voteVersion: Number(value.questions?.[id]?.voteVersion || 0)
    };
  }
  return {
    systemState: {
      currentQuestionId: value.systemState?.currentQuestionId || "q1",
      status: value.systemState?.status || "waiting"
    },
    questions,
    userVotes: value.userVotes || {}
  };
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

function clampText(value, fallback, max = 80) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.slice(0, max) || fallback;
}

function countVotesForQuestion(userVotes, questionId) {
  const counts = { optA: 0, optB: 0, optC: 0, optD: 0 };
  for (const votes of Object.values(userVotes || {})) {
    const optionId = votes?.[questionId];
    if (OPTION_KEYS.includes(optionId)) {
      counts[optionId] += 1;
    }
  }
  return counts;
}

function connectVoterEvents(uid, onState) {
  let systemState = null;
  let questions = null;
  let ownVotes = null;

  function emit() {
    onState(normalizeState({
      systemState,
      questions,
      userVotes: {
        [uid]: ownVotes || {}
      }
    }));
  }

  const systemRef = db.ref("systemState");
  const questionsRef = db.ref("questions");
  const ownVotesRef = db.ref(`userVotes/${uid}`);
  const onError = () => document.body.classList.add("is-reconnecting");

  systemRef.on("value", (snapshot) => {
    document.body.classList.remove("is-reconnecting");
    systemState = snapshot.val();
    emit();
  }, onError);
  questionsRef.on("value", (snapshot) => {
    document.body.classList.remove("is-reconnecting");
    questions = snapshot.val();
    emit();
  }, onError);
  ownVotesRef.on("value", (snapshot) => {
    document.body.classList.remove("is-reconnecting");
    ownVotes = snapshot.val();
    emit();
  }, onError);

  return () => {
    systemRef.off();
    questionsRef.off();
    ownVotesRef.off();
  };
}

function connectAdminEvents(onState) {
  let systemState = null;
  let questions = null;
  let userVotes = null;

  function emit() {
    onState(normalizeState({
      systemState,
      questions,
      userVotes
    }));
  }

  const systemRef = db.ref("systemState");
  const questionsRef = db.ref("questions");
  const votesRef = db.ref("userVotes");
  const onError = () => document.body.classList.add("is-reconnecting");

  systemRef.on("value", (snapshot) => {
    document.body.classList.remove("is-reconnecting");
    systemState = snapshot.val();
    emit();
  }, onError);
  questionsRef.on("value", (snapshot) => {
    document.body.classList.remove("is-reconnecting");
    questions = snapshot.val();
    emit();
  }, onError);
  votesRef.on("value", (snapshot) => {
    document.body.classList.remove("is-reconnecting");
    userVotes = snapshot.val();
    emit();
  }, onError);

  return () => {
    systemRef.off();
    questionsRef.off();
    votesRef.off();
  };
}

function waitForAuth() {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function ensureAnonymousUser() {
  const existing = await waitForAuth();
  if (existing) return existing;
  const credential = await auth.signInAnonymously();
  return credential.user;
}

async function submitFirebaseVote(questionId, optionId) {
  const user = await ensureAnonymousUser();
  const voteRef = db.ref(`userVotes/${user.uid}/${questionId}`);
  const result = await voteRef.transaction((currentValue) => {
    if (currentValue === optionId) return null;
    return optionId;
  });
  return {
    selectedOption: result.snapshot.val() || null
  };
}

async function signInAdmin(username, password) {
  const email = clampText(username, "", 120);
  const nextPassword = clampText(password, "", 120);
  if (!email || !nextPassword) {
    throw new Error("請輸入管理員 Email 與密碼。");
  }
  const credential = await auth.signInWithEmailAndPassword(email, nextPassword);
  const adminSnapshot = await db.ref(`admins/${credential.user.uid}`).get();
  if (adminSnapshot.val() !== true) {
    await auth.signOut();
    throw new Error("此帳號尚未被加入管理員名單。");
  }
  return credential.user;
}

function signOutAdmin() {
  return auth.signOut();
}

async function updateQuestion(questionId, title, options) {
  const updateQuestionFunction = cloudFunctions.httpsCallable("updateQuestion");
  await updateQuestionFunction({
    questionId,
    title: clampText(title, `第 ${QUESTION_IDS.indexOf(questionId) + 1} 題：請輸入題目`, 120),
    options: {
      optA: clampText(options.optA, "選項 A", 60),
      optB: clampText(options.optB, "選項 B", 60),
      optC: clampText(options.optC, "選項 C", 60),
      optD: clampText(options.optD, "選項 D", 60)
    }
  });
}

async function controlFirebase(action, extra = {}, state) {
  const controlVoting = cloudFunctions.httpsCallable("controlVoting");
  await controlVoting({
    action,
    ...extra,
    currentQuestionId: state.systemState.currentQuestionId
  });
}
