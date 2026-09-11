
const statuses = [
  ["🟢","Müsaitim"],
  ["💼","Meşgulüm"],
  ["😴","Uyuyorum"],
  ["🎮","Oyun oynuyorum"],
  ["🚗","Yoldayım"],
  ["🏠","Evdeyim"],
  ["❤️","Seni düşünüyorum"],
  ["🥺","Sana ihtiyacım var"]
];

const $ = (s) => document.querySelector(s);
const dialog = $("#statusDialog");
const grid = $("#statusGrid");
const toast = $("#toast");
const burst = $("#burst");

let myStatus = localStorage.getItem("all4u_my_status") || "Oyun oynuyorum 🎮";
$("#myStatusLabel").textContent = myStatus;
$("#myStatusCard").textContent = myStatus;

statuses.forEach(([emoji,label]) => {
  const b = document.createElement("button");
  b.className = "status-option";
  b.innerHTML = `<span>${emoji}</span><b>${label}</b>`;
  b.addEventListener("click", () => setStatus(`${label} ${emoji}`));
  grid.appendChild(b);
});

async function setStatus(value) {
  myStatus = value;
  localStorage.setItem("all4u_my_status", value);
  $("#myStatusLabel").textContent = value;
  $("#myStatusCard").textContent = value;
  dialog.close();
  showToast(`Durumun güncellendi: ${value}`);
  await syncMyStatus(value);
}

$("#openStatus").addEventListener("click", () => dialog.showModal());
$("#closeStatus").addEventListener("click", () => dialog.close());
$("#saveCustom").addEventListener("click", () => {
  const v = $("#customStatus").value.trim();
  if (!v) return showToast("Önce bir durum yaz ♡");
  setStatus(v + " ♡");
  $("#customStatus").value = "";
});

document.querySelectorAll(".action-card").forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.action;
    const data = {
      heart: ["❤️", "Partnerine bir kalp gönderdin"],
      kiss: ["💋", "Partnerine bir öpücük gönderdin"],
      hug: ["🫂", "Partnerine sarılma gönderdin"]
    }[type];
    animateBurst(data[0]);
    showToast(data[1] + " ♡");
    tryNotification("ALL4U", data[1]);
    sendInteraction(type);
  });
});

function animateBurst(emoji) {
  const x = innerWidth / 2;
  const y = innerHeight * .66;
  for (let i=0; i<10; i++) {
    const e = document.createElement("span");
    e.className = "floaty";
    e.textContent = emoji;
    e.style.left = (x + (Math.random()*150-75)) + "px";
    e.style.top = (y + (Math.random()*30-15)) + "px";
    e.style.animationDelay = (Math.random()*.15) + "s";
    burst.appendChild(e);
    setTimeout(()=>e.remove(), 1600);
  }
  if (navigator.vibrate) navigator.vibrate([30,30,45]);
}

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toast.classList.remove("show"), 2200);
}

async function tryNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) reg.showNotification(title, {body, icon:"assets/icon-192.png", badge:"assets/icon-192.png"});
  }
}

$("#settingsBtn").addEventListener("click", async () => {
  if (!("Notification" in window)) return showToast("Bu tarayıcı bildirimleri desteklemiyor");
  if (Notification.permission === "default") {
    const p = await Notification.requestPermission();
    showToast(p === "granted" ? "Bildirimler açıldı ♡" : "Bildirim izni verilmedi");
  } else {
    showToast(Notification.permission === "granted" ? "Bildirimler açık ♡" : "Bildirimler kapalı");
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}


// ---- ALL4U Supabase Realtime ----
const SUPABASE_URL = "https://zcdhrfdxxwrvgnufnfem.supabase.co";
const SUPABASE_KEY = "sb_publishable_hCvtLzkWSSzfOawlZrDr4A__IRz5Of0";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentCoupleId = localStorage.getItem("all4u_couple_id");
let currentCoupleCode = localStorage.getItem("all4u_couple_code");
let realtimeChannel = null;

async function bootCloud() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) return showToast("Bağlantı hatası: " + error.message);
    currentUser = data.user;
  } else currentUser = session.user;

  if (currentCoupleId) {
    showPaired(currentCoupleCode);
    await subscribeRealtime();
    await loadPartnerStatus();
  }
}

function generateCode() {
  return "4U-" + Math.floor(1000 + Math.random()*9000);
}

async function createCouple() {
  if (!currentUser) return;
  const code = generateCode();
  const { data: couple, error } = await sb.from("couples")
    .insert({ couple_code: code, created_by: currentUser.id })
    .select().single();
  if (error) return showToast(error.message.includes("duplicate") ? "Tekrar dene ♡" : error.message);

  const { error: memberErr } = await sb.from("couple_members")
    .insert({ couple_id: couple.id, user_id: currentUser.id, display_name: "Sen" });
  if (memberErr) return showToast(memberErr.message);

  currentCoupleId = couple.id; currentCoupleCode = code;
  localStorage.setItem("all4u_couple_id", couple.id);
  localStorage.setItem("all4u_couple_code", code);
  showPaired(code);
  await subscribeRealtime();
  await syncMyStatus(myStatus);
  showToast("Çift kodunuz hazır ♡");
}

async function joinCouple() {
  if (!currentUser) return;
  const code = $("#joinCode").value.trim().toUpperCase();
  if (!/^4U-\d{4}$/.test(code)) return showToast("Kod 4U-1234 biçiminde olmalı");

  // This lookup requires a secure join path in RLS. We use an RPC created in the setup SQL below.
  const { data, error } = await sb.rpc("join_couple_by_code", { p_code: code });
  if (error) return showToast("Katılma hatası: " + error.message);
  const cid = Array.isArray(data) ? data[0] : data;
  if (!cid) return showToast("Bu kod bulunamadı");

  currentCoupleId = cid; currentCoupleCode = code;
  localStorage.setItem("all4u_couple_id", cid);
  localStorage.setItem("all4u_couple_code", code);
  showPaired(code);
  await subscribeRealtime();
  await syncMyStatus(myStatus);
  await loadPartnerStatus();
  showToast("Partnerinle eşleştin 💜");
}

function showPaired(code) {
  $("#pairTitle").textContent = "Eşleştiniz 💜";
  $("#pairInfo").textContent = "Bu kodu yalnızca partnerinle paylaş.";
  $("#codeBox").hidden = false;
  $("#coupleCode").textContent = code || "—";
  $(".pair-actions").style.display = "none";
}

async function syncMyStatus(value) {
  if (!currentUser || !currentCoupleId) return;
  const m = value.match(/^(.*?)(?:\s([\p{Extended_Pictographic}\uFE0F]+))?$/u);
  const text = (m?.[1] || value).trim();
  const emoji = (m?.[2] || "💜").trim();
  const { error } = await sb.from("statuses").upsert({
    user_id: currentUser.id, couple_id: currentCoupleId,
    status_text: text, status_emoji: emoji, updated_at: new Date().toISOString()
  }, { onConflict:"user_id" });
  if (error) console.warn(error.message);
}

async function sendInteraction(type) {
  if (!currentUser || !currentCoupleId) return showToast("Önce partnerinle eşleş ♡");
  const { error } = await sb.from("interactions").insert({
    couple_id: currentCoupleId, sender_id: currentUser.id, type
  });
  if (error) console.warn(error.message);
}

async function loadPartnerStatus() {
  if (!currentUser || !currentCoupleId) return;
  const { data } = await sb.from("statuses")
    .select("*").eq("couple_id", currentCoupleId).neq("user_id", currentUser.id)
    .order("updated_at", {ascending:false}).limit(1);
  if (data?.[0]) renderPartnerStatus(data[0]);
}

function renderPartnerStatus(s) {
  $("#partnerStatusEmoji").textContent = s.status_emoji || "💜";
  $("#partnerStatusText").textContent = s.status_text || "ALL4U";
  $("#partnerQuote").textContent = "“" + (s.status_text || "Seni düşünüyor") + " ♡”";
  $("#updatedText").textContent = "Az önce güncellendi";
}

async function subscribeRealtime() {
  if (!currentCoupleId || !currentUser) return;
  if (realtimeChannel) await sb.removeChannel(realtimeChannel);
  realtimeChannel = sb.channel("all4u-" + currentCoupleId)
    .on("postgres_changes", {event:"*", schema:"public", table:"statuses", filter:"couple_id=eq."+currentCoupleId}, payload => {
      if (payload.new && payload.new.user_id !== currentUser.id) {
        renderPartnerStatus(payload.new);
        showToast("Partnerinin durumu değişti 💜");
      }
    })
    .on("postgres_changes", {event:"INSERT", schema:"public", table:"interactions", filter:"couple_id=eq."+currentCoupleId}, payload => {
      if (payload.new.sender_id === currentUser.id) return;
      const map = {heart:["❤️","Partnerin sana bir kalp gönderdi"],kiss:["💋","Partnerin sana bir öpücük gönderdi"],hug:["🫂","Partnerin sana sarılma gönderdi"]};
      const d = map[payload.new.type] || ["💜","Partnerinden bir etkileşim geldi"];
      animateBurst(d[0]); showToast(d[1]); tryNotification("ALL4U", d[1]);
    }).subscribe();
}

$("#createCouple").addEventListener("click", createCouple);
$("#joinCouple").addEventListener("click", joinCouple);
bootCloud();

window.addEventListener("error", (e) => {
  console.error("ALL4U JS error:", e.error || e.message);
  try { showToast("Uygulama hatası: " + (e.message || "Bilinmeyen hata")); } catch {}
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("ALL4U async error:", e.reason);
  try {
    const msg = e.reason?.message || String(e.reason || "Bilinmeyen hata");
    showToast("Bağlantı hatası: " + msg);
  } catch {}
});
