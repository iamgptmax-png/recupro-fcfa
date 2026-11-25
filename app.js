/* ReçuPro FCFA — Application PWA 100% hors-ligne */
const CONFIG = {
  // Remplacez cette URL par votre lien de paiement Chariow, Maketou, FedaPay, CinetPay ou Wave Business
  PRO_PAYMENT_URL: "https://wa.me/?text=" + encodeURIComponent("Bonjour, je souhaite activer ReçuPro PRO (5 000 FCFA) par Mobile Money."),
  PUBLIC_URL: "iamgptmax-png.github.io/recupro-fcfa",
  STORAGE_KEY: "recupro_fcfa_state_v1"
};

const defaultState = {
  isPro: false,
  licenseKey: "",
  counter: 1,
  shop: {
    name: "Ma Boutique",
    phone: "",
    address: "",
    currency: "FCFA",
    momo: "",
    logoDataUrl: ""
  },
  receipts: []
};

let state = loadState();
let currentItems = [{ desc: "Article / Prestation", qty: 1, price: 5000 }];
let currentMethod = "Wave";
let currentStatus = "PAYÉ";
let currentFilter = "ALL";
let logoImageObj = null;

function loadState() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      shop: { ...defaultState.shop, ...(parsed.shop || {}) },
      receipts: Array.isArray(parsed.receipts) ? parsed.receipts : []
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
}

function formatMoney(val) {
  const n = Math.round(Number(val) || 0);
  const formatted = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${formatted} ${state.shop.currency}`;
}

function getReceiptNumber() {
  const year = new Date().getFullYear();
  return `REC-${year}-${String(state.counter).padStart(4, "0")}`;
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add("hidden"), 2600);
}

/* Validation simple de clé Pro (algorithme checksum documenté dans README.md) */
function isValidProKey(rawKey) {
  const key = (rawKey || "").trim().toUpperCase();
  if (key === "RECUPRO-PRO-2026") return true;
  const match = /^RECUPRO-([A-Z0-9]{4})-([0-9]{2})$/.exec(key);
  if (!match) return false;
  const code = match[1];
  const check = parseInt(match[2], 10);
  let sum = 0;
  for (let i = 0; i < code.length; i++) sum += code.charCodeAt(i) * (i + 3);
  return (sum % 97) === check;
}

function preloadLogo(cb) {
  if (state.isPro && state.shop.logoDataUrl) {
    const img = new Image();
    img.onload = () => { logoImageObj = img; if (cb) cb(); };
    img.onerror = () => { logoImageObj = null; if (cb) cb(); };
    img.src = state.shop.logoDataUrl;
  } else {
    logoImageObj = null;
    if (cb) cb();
  }
}

function renderItems() {
  const container = document.getElementById("itemsList");
  container.innerHTML = "";
  currentItems.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <input type="text" placeholder="Article" value="${escapeAttr(item.desc)}" data-idx="${idx}" data-field="desc" />
      <input type="number" min="1" placeholder="Qté" value="${item.qty}" data-idx="${idx}" data-field="qty" />
      <input type="number" min="0" step="100" placeholder="Prix" value="${item.price}" data-idx="${idx}" data-field="price" />
      <button type="button" class="btn-remove-item" data-remove="${idx}" title="Supprimer">×</button>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.idx);
      const field = e.target.dataset.field;
      currentItems[i][field] = field === "desc" ? e.target.value : Number(e.target.value) || 0;
      updateLiveTotalsAndCanvas();
    });
  });

  container.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const i = Number(e.target.dataset.remove);
      if (currentItems.length > 1) {
        currentItems.splice(i, 1);
        renderItems();
        updateLiveTotalsAndCanvas();
      }
    });
  });
}

function escapeAttr(str) {
  return String(str || "").replace(/"/g, "&quot;");
}

function computeReceiptData() {
  const subtotal = currentItems.reduce((acc, it) => acc + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const delivery = Math.max(0, Number(document.getElementById("deliveryFee").value) || 0);
  const discount = Math.max(0, Number(document.getElementById("discountFee").value) || 0);
  const total = Math.max(0, subtotal + delivery - discount);

  let paid = total;
  if (currentStatus === "CRÉDIT") paid = 0;
  else if (currentStatus === "ACOMPTE") {
    paid = Math.min(total, Math.max(0, Number(document.getElementById("amountPaid").value) || 0));
  }
  const remaining = Math.max(0, total - paid);

  return {
    id: Date.now().toString(36),
    number: getReceiptNumber(),
    date: new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }),
    clientName: document.getElementById("clientName").value.trim() || "Client comptoir",
    clientPhone: document.getElementById("clientPhone").value.trim(),
    items: currentItems.map((x) => ({ ...x })),
    subtotal,
    delivery,
    discount,
    total,
    paid,
    remaining,
    method: currentMethod,
    status: remaining === 0 ? "PAYÉ" : currentStatus,
    note: document.getElementById("receiptNote").value.trim()
  };
}

function updateLiveTotalsAndCanvas() {
  const data = computeReceiptData();
  document.getElementById("displayReceiptNum").textContent = data.number;
  document.getElementById("liveTotal").textContent = formatMoney(data.total);
  document.getElementById("remainingDisplay").textContent = formatMoney(data.remaining);
  drawReceiptCanvas(data);
}

function drawReceiptCanvas(data) {
  const canvas = document.getElementById("receiptCanvas");
  const ctx = canvas.getContext("2d");
  const W = 900;
  const itemHeight = 54;
  const extraItemsHeight = Math.max(0, data.items.length - 3) * itemHeight;
  const H = 1140 + extraItemsHeight;
  canvas.width = W;
  canvas.height = H;

  // Fond blanc propre
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // Bandeau supérieur
  ctx.fillStyle = "#0F766E";
  ctx.fillRect(0, 0, W, 190);

  let textStartX = 56;
  if (logoImageObj && state.isPro) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(52, 42, 106, 106, 18);
    ctx.clip();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(52, 42, 106, 106);
    ctx.drawImage(logoImageObj, 52, 42, 106, 106);
    ctx.restore();
    textStartX = 180;
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 40px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.fillText((state.shop.name || "Ma Boutique").slice(0, 26), textStartX, 92);

  ctx.fillStyle = "#CCFBF1";
  ctx.font = "24px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  const subLine = [state.shop.phone, state.shop.address].filter(Boolean).join(" • ") || "Reçu officiel de paiement";
  ctx.fillText(subLine.slice(0, 52), textStartX, 134);

  // Badge numéro reçu à droite
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.roundRect(W - 290, 48, 238, 92, 14);
  ctx.fill();
  ctx.fillStyle = "#CCFBF1";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("REÇU N°", W - 266, 82);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 24px monospace";
  ctx.fillText(data.number, W - 266, 118);

  // Infos Client & Date
  let y = 248;
  ctx.fillStyle = "#64748B";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("CLIENT", 56, y);
  ctx.fillText("DATE & PAIEMENT", 500, y);

  y += 36;
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(data.clientName.slice(0, 24), 56, y);
  ctx.font = "24px sans-serif";
  ctx.fillText(data.date, 500, y);

  y += 32;
  ctx.fillStyle = "#475569";
  ctx.font = "22px sans-serif";
  if (data.clientPhone) ctx.fillText(`WhatsApp : ${data.clientPhone}`, 56, y);
  ctx.fillText(`Mode : ${data.method}`, 500, y);

  // Ligne séparatrice
  y += 36;
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(56, y);
  ctx.lineTo(W - 56, y);
  ctx.stroke();

  // En-tête tableau articles
  y += 42;
  ctx.fillStyle = "#F1F5F9";
  ctx.beginPath();
  ctx.roundRect(56, y - 30, W - 112, 46, 10);
  ctx.fill();

  ctx.fillStyle = "#475569";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("DÉSIGNATION", 76, y);
  ctx.fillText("QTÉ", 530, y);
  ctx.textAlign = "right";
  ctx.fillText("MONTANT", W - 76, y);
  ctx.textAlign = "left";

  // Lignes articles
  y += 46;
  data.items.forEach((it) => {
    const lineTotal = (Number(it.qty) || 0) * (Number(it.price) || 0);
    ctx.fillStyle = "#0F172A";
    ctx.font = "24px sans-serif";
    ctx.fillText((it.desc || "Article").slice(0, 32), 76, y);
    ctx.fillStyle = "#475569";
    ctx.fillText(String(it.qty || 1), 542, y);
    ctx.textAlign = "right";
    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText(formatMoney(lineTotal), W - 76, y);
    ctx.textAlign = "left";

    y += 18;
    ctx.strokeStyle = "#F1F5F9";
    ctx.beginPath();
    ctx.moveTo(56, y);
    ctx.lineTo(W - 56, y);
    ctx.stroke();
    y += 36;
  });

  // Sous-totaux / Livraison / Remise
  y += 12;
  ctx.font = "22px sans-serif";
  if (data.delivery > 0) {
    ctx.fillStyle = "#475569";
    ctx.fillText("Frais de livraison", 450, y);
    ctx.textAlign = "right";
    ctx.fillStyle = "#0F172A";
    ctx.fillText(`+ ${formatMoney(data.delivery)}`, W - 76, y);
    ctx.textAlign = "left";
    y += 34;
  }
  if (data.discount > 0) {
    ctx.fillStyle = "#475569";
    ctx.fillText("Remise", 450, y);
    ctx.textAlign = "right";
    ctx.fillStyle = "#16A34A";
    ctx.fillText(`- ${formatMoney(data.discount)}`, W - 76, y);
    ctx.textAlign = "left";
    y += 34;
  }

  // Boîte Total
  y += 14;
  ctx.fillStyle = "#F0FDFA";
  ctx.strokeStyle = "#99F6E4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(56, y, W - 112, 92, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#115E59";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText("TOTAL NET", 84, y + 55);
  ctx.textAlign = "right";
  ctx.font = "bold 38px sans-serif";
  ctx.fillText(formatMoney(data.total), W - 84, y + 58);
  ctx.textAlign = "left";

  y += 126;

  // Statut & Tampon visuel
  const isPaid = data.remaining === 0;
  const stampBg = isPaid ? "#DCFCE7" : "#FEF3C7";
  const stampBorder = isPaid ? "#16A34A" : "#D97706";
  const stampColor = isPaid ? "#166534" : "#92400E";
  const stampLabel = isPaid
    ? `PAYÉ • ${data.method.toUpperCase()}`
    : `${data.status} • RESTE : ${formatMoney(data.remaining)}`;

  ctx.fillStyle = stampBg;
  ctx.strokeStyle = stampBorder;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(56, y, W - 112, 74, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = stampColor;
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(stampLabel, W / 2, y + 47);
  ctx.textAlign = "left";

  y += 108;

  if (!isPaid && data.paid > 0) {
    ctx.fillStyle = "#475569";
    ctx.font = "22px sans-serif";
    ctx.fillText(`Montant déjà versé : ${formatMoney(data.paid)}`, 56, y);
    y += 34;
  }

  if (data.note) {
    ctx.fillStyle = "#475569";
    ctx.font = "italic 22px sans-serif";
    ctx.fillText(`Note : ${data.note.slice(0, 62)}`, 56, y);
    y += 36;
  }

  // Pied de page (viral en version gratuite, propre en version Pro)
  const footerY = H - 46;
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(56, footerY - 36);
  ctx.lineTo(W - 56, footerY - 36);
  ctx.stroke();

  ctx.textAlign = "center";
  if (state.isPro) {
    ctx.fillStyle = "#64748B";
    ctx.font = "20px sans-serif";
    ctx.fillText(`Merci pour votre confiance — ${state.shop.name}`, W / 2, footerY);
  } else {
    ctx.fillStyle = "#0F766E";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(`Créé gratuitement avec ReçuPro FCFA • ${CONFIG.PUBLIC_URL}`, W / 2, footerY);
  }
  ctx.textAlign = "left";
}

function saveCurrentReceipt() {
  const data = computeReceiptData();
  state.receipts.unshift(data);
  state.counter += 1;
  saveState();
  renderLedger();
  updateLiveTotalsAndCanvas();
  showToast(`Reçu ${data.number} enregistré`);
  return data;
}

function downloadReceiptPng(data) {
  const canvas = document.getElementById("receiptCanvas");
  const link = document.createElement("a");
  link.download = `${data.number}_${data.clientName.replace(/\s+/g, "_")}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function shareOnWhatsApp() {
  const data = saveCurrentReceipt();
  drawReceiptCanvas(data);
  const canvas = document.getElementById("receiptCanvas");

  const lines = [
    `*REÇU ${data.number}* — ${state.shop.name}`,
    `Client : ${data.clientName}`,
    `Total : *${formatMoney(data.total)}* (${data.method})`,
    data.remaining === 0
      ? `Statut : PAYÉ`
      : `Statut : ${data.status} — Reste à payer : *${formatMoney(data.remaining)}*`
  ];
  if (data.note) lines.push(`Note : ${data.note}`);
  if (!state.isPro) lines.push(`\nCréé avec ReçuPro FCFA : https://${CONFIG.PUBLIC_URL}`);
  const summaryText = lines.join("\n");

  // Partage natif avec l'image PNG sur mobile si supporté
  try {
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    const file = new File([blob], `${data.number}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: `Reçu ${data.number}`,
        text: summaryText,
        files: [file]
      });
      return;
    }
  } catch (err) {
    if (err && err.name === "AbortError") return;
  }

  // Fallback universel : téléchargement PNG + ouverture WhatsApp
  downloadReceiptPng(data);
  const cleanPhone = (data.clientPhone || "").replace(/[^0-9]/g, "");
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(summaryText)}`
    : `https://wa.me/?text=${encodeURIComponent(summaryText)}`;
  window.open(waUrl, "_blank", "noopener");
}

function renderLedger() {
  const query = (document.getElementById("searchLedger").value || "").trim().toLowerCase();
  let collected = 0;
  let pending = 0;
  let creditCount = 0;

  state.receipts.forEach((r) => {
    collected += Number(r.paid) || 0;
    pending += Number(r.remaining) || 0;
    if ((Number(r.remaining) || 0) > 0) creditCount++;
  });

  document.getElementById("kpiCollected").textContent = formatMoney(collected);
  document.getElementById("kpiPending").textContent = formatMoney(pending);
  document.getElementById("kpiCount").textContent = String(state.receipts.length);

  const badge = document.getElementById("creditNavBadge");
  if (creditCount > 0) {
    badge.textContent = String(creditCount);
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }

  const filtered = state.receipts.filter((r) => {
    if (currentFilter === "CREDIT" && !(r.remaining > 0)) return false;
    if (currentFilter === "PAID" && r.remaining > 0) return false;
    if (query) {
      const hay = `${r.clientName} ${r.number} ${r.clientPhone}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  const list = document.getElementById("ledgerList");
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">Aucun reçu enregistré pour ce filtre.</div>`;
    return;
  }

  list.innerHTML = filtered.map((r) => {
    const isCredit = r.remaining > 0;
    return `
      <div class="ledger-item">
        <div class="ledger-top">
          <div>
            <div class="ledger-client">${escapeHtml(r.clientName)}</div>
            <div class="ledger-meta">${escapeHtml(r.number)} • ${escapeHtml(r.date)} • ${escapeHtml(r.method)}</div>
          </div>
          <span class="status-pill ${isCredit ? "pill-credit" : "pill-paid"}">
            ${isCredit ? `Reste ${formatMoney(r.remaining)}` : "PAYÉ"}
          </span>
        </div>
        <div class="ledger-amounts">
          <span>Total : <strong>${formatMoney(r.total)}</strong></span>
          <span>Versé : <strong>${formatMoney(r.paid)}</strong></span>
        </div>
        <div class="ledger-actions">
          ${isCredit ? `<button type="button" class="btn-xs btn-wa" data-remind="${r.id}">Relancer WhatsApp</button>` : ""}
          ${isCredit ? `<button type="button" class="btn-xs btn-mark-paid" data-settle="${r.id}">Marquer payé</button>` : ""}
          <button type="button" class="btn-xs btn-del" data-del="${r.id}">Supprimer</button>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-remind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = state.receipts.find((x) => x.id === btn.dataset.remind);
      if (!r) return;
      const momoInfo = state.shop.momo ? `\nVous pouvez régler via ${state.shop.momo}.` : "";
      const msg = `Bonjour ${r.clientName}, petit rappel amical de ${state.shop.name} concernant le solde de ${formatMoney(r.remaining)} sur votre reçu ${r.number} (total ${formatMoney(r.total)}).${momoInfo}\nMerci beaucoup !`;
      const phone = (r.clientPhone || "").replace(/[^0-9]/g, "");
      const url = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank", "noopener");
    });
  });

  list.querySelectorAll("[data-settle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = state.receipts.find((x) => x.id === btn.dataset.settle);
      if (!r) return;
      r.paid = r.total;
      r.remaining = 0;
      r.status = "PAYÉ";
      saveState();
      renderLedger();
      showToast(`Reçu ${r.number} marqué comme payé`);
    });
  });

  list.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.receipts = state.receipts.filter((x) => x.id !== btn.dataset.del);
      saveState();
      renderLedger();
      showToast("Reçu supprimé");
    });
  });
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function syncSettingsUI() {
  document.getElementById("shopName").value = state.shop.name;
  document.getElementById("shopPhone").value = state.shop.phone;
  document.getElementById("shopAddress").value = state.shop.address;
  document.getElementById("shopCurrency").value = state.shop.currency;
  document.getElementById("shopMomo").value = state.shop.momo;
  document.getElementById("headerCurrency").textContent = state.shop.currency;
  document.getElementById("headerShopName").textContent = state.shop.name || "Reçus WhatsApp & Carnet de Crédit";
  document.querySelectorAll(".currency-unit").forEach((el) => (el.textContent = state.shop.currency));
  document.getElementById("btnBuyPro").href = CONFIG.PRO_PAYMENT_URL;

  const proBtn = document.getElementById("btnHeaderPro");
  const wmTag = document.getElementById("watermarkTag");
  const proStatus = document.getElementById("proStatusText");
  const unlockBlock = document.getElementById("proUnlockBlock");
  const logoHint = document.getElementById("logoHint");

  if (state.isPro) {
    proBtn.textContent = "✓ PRO actif";
    proBtn.classList.add("active-pro");
    wmTag.textContent = "PRO • Sans filigrane";
    proStatus.textContent = "Votre licence ReçuPro PRO est active. Tous vos reçus sont générés sans filigrane avec votre logo.";
    unlockBlock.classList.add("hidden");
    logoHint.textContent = state.shop.logoDataUrl ? "Logo enregistré et actif sur vos reçus." : "Choisissez une image carrée (PNG/JPG).";
  } else {
    proBtn.textContent = "★ Pro";
    proBtn.classList.remove("active-pro");
    wmTag.textContent = "Version gratuite";
    unlockBlock.classList.remove("hidden");
    logoHint.textContent = "Activez la version Pro pour afficher votre logo sur les reçus.";
  }
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === tabId));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
  if (tabId === "tab-ledger") renderLedger();
}

function initEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("btnHeaderPro").addEventListener("click", () => switchTab("tab-settings"));

  document.getElementById("btnAddItem").addEventListener("click", () => {
    currentItems.push({ desc: "", qty: 1, price: 0 });
    renderItems();
    updateLiveTotalsAndCanvas();
  });

  ["clientName", "clientPhone", "deliveryFee", "discountFee", "amountPaid", "receiptNote"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateLiveTotalsAndCanvas);
  });

  document.querySelectorAll("#paymentMethodGroup .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#paymentMethodGroup .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentMethod = chip.dataset.val;
      updateLiveTotalsAndCanvas();
    });
  });

  document.querySelectorAll("#paymentStatusGroup .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#paymentStatusGroup .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentStatus = btn.dataset.status;
      document.getElementById("amountPaidWrapper").classList.toggle("hidden", currentStatus !== "ACOMPTE");
      updateLiveTotalsAndCanvas();
    });
  });

  document.getElementById("btnShareWhatsApp").addEventListener("click", shareOnWhatsApp);
  document.getElementById("btnDownloadPng").addEventListener("click", () => {
    const data = saveCurrentReceipt();
    drawReceiptCanvas(data);
    downloadReceiptPng(data);
  });
  document.getElementById("btnSaveOnly").addEventListener("click", () => saveCurrentReceipt());
  document.getElementById("btnPrintPdf").addEventListener("click", () => window.print());

  document.getElementById("searchLedger").addEventListener("input", renderLedger);
  document.querySelectorAll("#ledgerFilterGroup .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#ledgerFilterGroup .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.filter;
      renderLedger();
    });
  });

  document.getElementById("btnSaveSettings").addEventListener("click", () => {
    state.shop.name = document.getElementById("shopName").value.trim() || "Ma Boutique";
    state.shop.phone = document.getElementById("shopPhone").value.trim();
    state.shop.address = document.getElementById("shopAddress").value.trim();
    state.shop.currency = document.getElementById("shopCurrency").value;
    state.shop.momo = document.getElementById("shopMomo").value.trim();
    saveState();
    syncSettingsUI();
    updateLiveTotalsAndCanvas();
    renderLedger();
    showToast("Paramètres de la boutique enregistrés");
  });

  document.getElementById("shopLogoInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!state.isPro) {
      showToast("Fonction réservée à la version Pro");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.shop.logoDataUrl = reader.result;
      saveState();
      preloadLogo(() => {
        syncSettingsUI();
        updateLiveTotalsAndCanvas();
        showToast("Logo ajouté à vos reçus");
      });
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("btnActivateLicense").addEventListener("click", () => {
    const input = document.getElementById("licenseKeyInput").value;
    if (isValidProKey(input)) {
      state.isPro = true;
      state.licenseKey = input.trim().toUpperCase();
      saveState();
      syncSettingsUI();
      updateLiveTotalsAndCanvas();
      showToast("Version Pro activée !");
    } else {
      showToast("Code invalide. Vérifiez votre clé Pro.");
    }
  });

  document.getElementById("btnExportJson").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `recupro_sauvegarde_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast("Sauvegarde exportée");
  });

  document.getElementById("btnImportJson").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        state = {
          ...structuredClone(defaultState),
          ...imported,
          shop: { ...defaultState.shop, ...(imported.shop || {}) },
          receipts: Array.isArray(imported.receipts) ? imported.receipts : []
        };
        saveState();
        preloadLogo(() => {
          syncSettingsUI();
          updateLiveTotalsAndCanvas();
          renderLedger();
          showToast("Sauvegarde restaurée");
        });
      } catch {
        showToast("Fichier JSON invalide");
      }
    };
    reader.readAsText(file);
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

initEvents();
renderItems();
syncSettingsUI();
preloadLogo(() => {
  updateLiveTotalsAndCanvas();
  renderLedger();
});
