
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
  b.addEventListener("click", () => setStatus(`${label} ${emoji}`, emoji, label));
  grid.appendChild(b);
});

async function setStatus(value, emoji = null, label = null) {
  myStatus = value;
  localStorage.setItem("all4u_my_status", value);
  $("#myStatusLabel").textContent = value;
  $("#myStatusCard").textContent = value;
  if (dialog.open) dialog.close();
  showToast(`Durumun güncellendi: ${value}`);
  await syncMyStatus(value, emoji, label);
}

$("#openStatus").addEventListener("click", () => dialog.showModal());
$("#closeStatus").addEventListener("click", () => dialog.close());
$("#saveCustom").addEventListener("click", () => {
  const v = $("#customStatus").value.trim();
  if (!v) return showToast("Önce bir durum yaz ♡");
  setStatus(v + " ♡", "💜", v);
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


function resetPairUI() {
  const pairTitle = document.querySelector("#pairTitle");
  const pairInfo = document.querySelector("#pairInfo");
  const codeBox = document.querySelector("#codeBox");
  const pairActions = document.querySelector(".pair-actions");
  const joinCode = document.querySelector("#joinCode");

  if (pairTitle) pairTitle.textContent = "Partnerinle eşleş";
  if (pairInfo) pairInfo.textContent = "Bir çift oluştur veya partnerinin ALL4U kodunu gir.";
  if (codeBox) codeBox.hidden = true;
  if (pairActions) pairActions.style.display = "";
  if (joinCode) joinCode.value = "";
}

function clearCoupleLocalState() {
  currentCoupleId = null;
  currentCoupleCode = null;
  localStorage.removeItem("all4u_couple_id");
  localStorage.removeItem("all4u_couple_code");
  localStorage.removeItem("all4u_last_interaction");
  resetPairUI();
}

async function bootCloud() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) return showToast("Bağlantı hatası: " + error.message);
    currentUser = data.user;
  } else currentUser = session.user;

  if (currentCoupleId) {
    const { data: membership, error: membershipError } = await sb
      .from("couple_members")
      .select("couple_id")
      .eq("user_id", currentUser.id)
      .eq("couple_id", currentCoupleId)
      .maybeSingle();

    if (membershipError || !membership) {
      clearCoupleLocalState();
    } else {
      showPaired(currentCoupleCode);
      await subscribeRealtime();
      await loadPartnerStatus();
    }
  } else {
    resetPairUI();
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

async function syncMyStatus(value, explicitEmoji = null, explicitLabel = null) {
  if (!currentUser || !currentCoupleId) return;

  let text = explicitLabel;
  let emoji = explicitEmoji;

  if (!text || !emoji) {
    const predefined = [
      ["🟢","Müsaitim"], ["💼","Meşgulüm"], ["😴","Uyuyorum"], ["🎮","Oyun oynuyorum"],
      ["🚗","Yoldayım"], ["🏠","Evdeyim"], ["❤️","Seni düşünüyorum"], ["🥺","Sana ihtiyacım var"]
    ];
    const found = predefined.find(([e, t]) => value.includes(t));
    if (found) {
      emoji = found[0]; text = found[1];
    } else {
      emoji = "💜";
      text = value.replace(/\s*[♡♥❤💜]+$/u, "").trim() || value;
    }
  }

  const { error } = await sb.from("statuses").upsert({
    user_id: currentUser.id,
    couple_id: currentCoupleId,
    status_text: text,
    status_emoji: emoji,
    updated_at: new Date().toISOString()
  }, { onConflict:"user_id" });

  if (error) {
    console.warn("status sync error", error);
    showToast("Durum gönderilemedi: " + error.message);
  }
}

async function sendInteraction(type) {
  if (!currentUser || !currentCoupleId) return showToast("Önce partnerinle eşleş ♡");

  const { error } = await sb.from("interactions").insert({
    couple_id: currentCoupleId, sender_id: currentUser.id, type
  });

  if (error) {
    console.warn("interaction insert error", error);
    return showToast("Etkileşim gönderilemedi: " + error.message);
  }

  // Send a true background push notification to the partner through the
  // Supabase Edge Function. The OneSignal API key remains server-side.
  try {
    const { data, error: pushError } = await sb.functions.invoke("send-all4u-push", {
      body: { type }
    });

    if (pushError) {
      console.warn("ALL4U push invoke error", pushError);
      showToast("Etkileşim gitti, push gönderilemedi");
      return;
    }

    if (data && data.ok === false) {
      console.warn("ALL4U push response", data);
      showToast("Etkileşim gitti, push gönderilemedi");
    }
  } catch (e) {
    console.warn("ALL4U push error", e);
    showToast("Etkileşim gitti, push gönderilemedi");
  }
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
// bootCloud is started after v7 integrations are registered.

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


let lastInteractionSeen = localStorage.getItem("all4u_last_interaction") || null;
let fallbackTimer = null;

async function pollPartnerState() {
  if (!currentUser || !currentCoupleId) return;

  const { data: s, error: se } = await sb.from("statuses")
    .select("*")
    .eq("couple_id", currentCoupleId)
    .neq("user_id", currentUser.id)
    .order("updated_at", {ascending:false})
    .limit(1);
  if (!se && s?.[0]) renderPartnerStatus(s[0]);

  let q = sb.from("interactions")
    .select("*")
    .eq("couple_id", currentCoupleId)
    .neq("sender_id", currentUser.id)
    .order("created_at", {ascending:true})
    .limit(20);

  if (lastInteractionSeen) q = q.gt("created_at", lastInteractionSeen);

  const { data: interactions, error: ie } = await q;
  if (!ie && interactions?.length) {
    for (const item of interactions) {
      const map = {
        heart:["❤️","Partnerin sana bir kalp gönderdi"],
        kiss:["💋","Partnerin sana bir öpücük gönderdi"],
        hug:["🫂","Partnerin sana sarılma gönderdi"]
      };
      const d = map[item.type] || ["💜","Partnerinden bir etkileşim geldi"];
      animateBurst(d[0]);
      showToast(d[1]);
      tryNotification("ALL4U", d[1]);
      lastInteractionSeen = item.created_at;
      localStorage.setItem("all4u_last_interaction", lastInteractionSeen);
    }
  }
}

function startFallbackPolling() {
  if (fallbackTimer) clearInterval(fallbackTimer);
  fallbackTimer = setInterval(pollPartnerState, 2000);
  pollPartnerState();
}

const oldSubscribeRealtime = subscribeRealtime;
subscribeRealtime = async function() {
  await oldSubscribeRealtime();
  startFallbackPolling();
};



// ---- ALL4U Names + Settings ----
let myName = localStorage.getItem("all4u_my_name") || "Tavşan";
let partnerName = localStorage.getItem("all4u_partner_name") || "Mirket";

function initialOf(name, fallback="♡") {
  const clean = (name || "").trim();
  return clean ? clean.charAt(0).toLocaleUpperCase("tr-TR") : fallback;
}

function renderNames() {
  const myTop = document.querySelector("#myNameTop");
  const partner = document.querySelector("#partnerName");
  const myAvatar = document.querySelector("#myAvatar");
  const partnerAvatar = document.querySelector("#partnerAvatar");
  if (myTop) myTop.textContent = myName;
  if (partner) partner.textContent = partnerName;
  if (myAvatar) myAvatar.textContent = initialOf(myName, "T");
  if (partnerAvatar) partnerAvatar.textContent = initialOf(partnerName, "M");
}

function openSettings() {
  const dlg = document.querySelector("#settingsDialog");
  document.querySelector("#myNameInput").value = myName;
  document.querySelector("#partnerNameInput").value = partnerName;
  document.querySelector("#settingsCoupleCode").textContent =
    currentCoupleCode || "Henüz eşleşme yok";
  if (!dlg.open) dlg.showModal();
}

document.querySelector("#settingsBtn")?.addEventListener("click", openSettings);
document.querySelector("#bottomSettingsBtn")?.addEventListener("click", openSettings);
document.querySelector("#closeSettings")?.addEventListener("click", () => {
  document.querySelector("#settingsDialog")?.close();
});

document.querySelector("#saveNames")?.addEventListener("click", () => {
  const nextMine = document.querySelector("#myNameInput").value.trim();
  const nextPartner = document.querySelector("#partnerNameInput").value.trim();
  myName = nextMine || "Tavşan";
  partnerName = nextPartner || "Mirket";
  localStorage.setItem("all4u_my_name", myName);
  localStorage.setItem("all4u_partner_name", partnerName);
  renderNames();
  document.querySelector("#settingsDialog")?.close();
  showToast(`${myName} ♡ ${partnerName}`);
});

document.querySelector("#notificationSettings")?.addEventListener("click", async () => {
  if (!("Notification" in window)) {
    return showToast("Bu tarayıcı bildirimleri desteklemiyor");
  }
  if (Notification.permission === "default") {
    const p = await Notification.requestPermission();
    showToast(p === "granted" ? "Bildirimler açıldı ♡" : "Bildirim izni verilmedi");
  } else {
    showToast(Notification.permission === "granted" ? "Bildirimler açık ♡" : "Bildirimler kapalı");
  }
});

renderNames();


// ---- v6: Disconnect this device from the couple ----
document.querySelector("#disconnectCouple")?.addEventListener("click", async () => {
  if (!currentUser || !currentCoupleId) {
    return showToast("Bu telefon bir çifte bağlı değil");
  }

  const ok = confirm("Bu telefonun çift bağlantısı kesilsin mi? Partnerinin bağlantısı silinmeyecek.");
  if (!ok) return;

  const { error } = await sb.rpc("leave_current_couple");
  if (error) return showToast("Bağlantı kesilemedi: " + error.message);

  if (realtimeChannel) {
    try { await sb.removeChannel(realtimeChannel); } catch {}
    realtimeChannel = null;
  }
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }

  clearCoupleLocalState();

  document.querySelector("#settingsDialog")?.close();
  showToast("Bağlantı kesildi");
  setTimeout(() => {
    const base = location.pathname;
    location.replace(base + "?v=61&t=" + Date.now());
  }, 500);
});


// ---- v9: OneSignal Web Push subscription fix ----
const ONESIGNAL_APP_ID = "6e017bd4-a499-4060-aa85-3914d37ee8d8";
let oneSignalReady = false;
let oneSignalInstance = null;

function getPushSnapshot(OneSignal) {
  return {
    permission: !!OneSignal.Notifications.permission,
    optedIn: !!OneSignal.User.PushSubscription.optedIn,
    id: OneSignal.User.PushSubscription.id || null,
    token: OneSignal.User.PushSubscription.token || null,
    externalId: OneSignal.User.externalId || null
  };
}

function pushIsActuallyReady(state) {
  return !!(state.permission && state.optedIn && state.id && state.token);
}

async function waitForPushReady(OneSignal, timeoutMs = 12000) {
  const first = getPushSnapshot(OneSignal);
  if (pushIsActuallyReady(first)) return first;

  return await new Promise((resolve) => {
    let finished = false;
    let timer = null;

    const finish = (state) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      try {
        OneSignal.User.PushSubscription.removeEventListener("change", onChange);
      } catch {}
      resolve(state);
    };

    const onChange = (event) => {
      console.log("OneSignal push subscription changed", event);
      const state = getPushSnapshot(OneSignal);
      if (pushIsActuallyReady(state)) finish(state);
    };

    try {
      OneSignal.User.PushSubscription.addEventListener("change", onChange);
    } catch (e) {
      console.warn("OneSignal subscription listener error", e);
    }

    const started = Date.now();
    const poll = () => {
      const state = getPushSnapshot(OneSignal);
      if (pushIsActuallyReady(state)) return finish(state);
      if (Date.now() - started >= timeoutMs) return finish(state);
      timer = setTimeout(poll, 500);
    };
    poll();
  });
}

window.OneSignalDeferred = window.OneSignalDeferred || [];
window.OneSignalDeferred.push(async function(OneSignal) {
  try {
    oneSignalInstance = OneSignal;
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      serviceWorkerPath: "ALL4U/sw.js",
      serviceWorkerParam: { scope: "/ALL4U/" },
      notifyButton: { enable: false },
      welcomeNotification: { disable: true },
      autoResubscribe: true
    });

    oneSignalReady = true;

    OneSignal.User.PushSubscription.addEventListener("change", (event) => {
      console.log("ALL4U OneSignal subscription", event);
    });

    if (currentUser?.id) {
      try {
        await OneSignal.login(currentUser.id);
      } catch (e) {
        console.warn("OneSignal login", e);
      }
    }

    console.log("OneSignal initialized", getPushSnapshot(OneSignal));
  } catch (e) {
    console.warn("OneSignal init error", e);
    try { showToast("Push başlatılamadı: " + (e.message || e)); } catch {}
  }
});

async function enableRealPush() {
  showToast("Bildirim aboneliği hazırlanıyor…");

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      oneSignalInstance = OneSignal;

      const supported = await OneSignal.Notifications.isPushSupported();
      if (!supported) {
        return showToast("Bu cihaz web push desteklemiyor");
      }

      if (currentUser?.id) {
        await OneSignal.login(currentUser.id);
      }

      if (!OneSignal.Notifications.permission) {
        await OneSignal.Notifications.requestPermission();
      }

      if (!OneSignal.Notifications.permission) {
        return showToast("Bildirim izni verilmedi");
      }

      // Permission alone is not enough. optIn() ensures that OneSignal creates
      // or re-enables the actual push subscription and requests a push token.
      await OneSignal.User.PushSubscription.optIn();

      // Re-apply the External ID after the subscription exists so this exact
      // iPhone subscription is linked to the current Supabase anonymous user.
      if (currentUser?.id) {
        await OneSignal.login(currentUser.id);
      }

      const state = await waitForPushReady(OneSignal, 12000);
      console.log("ALL4U final push state", state);

      if (pushIsActuallyReady(state)) {
        showToast("Gerçek bildirimler hazır ✓");
      } else if (!state.token) {
        showToast("Push token alınamadı — tekrar dene");
      } else if (!state.id) {
        showToast("OneSignal aboneliği oluşmadı — tekrar dene");
      } else if (!state.optedIn) {
        showToast("Bildirim aboneliği etkinleşmedi");
      } else {
        showToast("Bildirim kurulumu tamamlanamadı");
      }
    } catch (e) {
      console.warn("ALL4U enable push error", e);
      showToast("Bildirim açılamadı: " + (e?.message || "Bilinmeyen hata"));
    }
  });
}

// Replace the older notification settings action with OneSignal permission + opt-in.
const oldNotifBtn = document.querySelector("#notificationSettings");
if (oldNotifBtn) {
  const freshNotifBtn = oldNotifBtn.cloneNode(true);
  oldNotifBtn.replaceWith(freshNotifBtn);
  freshNotifBtn.textContent = "Gerçek Bildirimleri Aç";
  freshNotifBtn.addEventListener("click", enableRealPush);
}

// Ensure OneSignal gets the Supabase user ID after auth is ready.
const oldBootCloudV9 = bootCloud;
bootCloud = async function() {
  await oldBootCloudV9();
  if (currentUser?.id) {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
      try {
        await OneSignal.login(currentUser.id);
        console.log("OneSignal user linked", {
          externalId: OneSignal.User.externalId,
          subscriptionId: OneSignal.User.PushSubscription.id,
          token: OneSignal.User.PushSubscription.token,
          optedIn: OneSignal.User.PushSubscription.optedIn
        });
      } catch (e) {
        console.warn("OneSignal login", e);
      }
    });
  }
};

bootCloud();
