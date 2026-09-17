const state = { category: "scripting", manifest: {} };

const grid = document.getElementById("portfolio-grid");
const empty = document.getElementById("portfolio-empty");
const tabs = [...document.querySelectorAll(".portfolio-tab")];
const modal = document.getElementById("media-modal");
const modalContent = document.getElementById("modal-content");
const modalClose = document.getElementById("modal-close");
const backdrop = document.getElementById("modal-backdrop");

const imageExt = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const videoExt = /\.(mp4|webm|ogg|mov|m4v)$/i;

function fileName(path) {
  return decodeURIComponent(path.split("/").pop()).replace(/\.[^.]+$/, "");
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "portfolio-card";
  card.tabIndex = 0;

  let media;
  if (videoExt.test(item.path)) {
    media = document.createElement("video");
    media.className = "portfolio-media portfolio-video";
    media.src = item.path;
    media.muted = true;
    media.loop = true;
    media.playsInline = true;
    media.preload = "metadata";
    card.addEventListener("mouseenter", () => media.play().catch(() => {}));
    card.addEventListener("mouseleave", () => { media.pause(); media.currentTime = 0; });
  } else if (imageExt.test(item.path)) {
    media = document.createElement("img");
    media.className = "portfolio-media";
    media.src = item.path;
    media.loading = "lazy";
    media.decoding = "async";
    media.alt = fileName(item.path);
  } else {
    return null;
  }

  const meta = document.createElement("div");
  meta.className = "portfolio-meta";
  const title = document.createElement("span");
  title.textContent = fileName(item.path);
  const type = document.createElement("span");
  type.textContent = videoExt.test(item.path) ? "VIDEO" : "IMAGE";
  meta.append(title, type);
  card.append(media, meta);

  const open = () => openModal(item.path);
  card.addEventListener("click", open);
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  return card;
}

function render() {
  grid.replaceChildren();
  const items = state.manifest[state.category] || [];
  empty.hidden = items.length > 0;
  items.forEach(item => {
    const card = createCard(item);
    if (card) grid.appendChild(card);
  });
}

function openModal(path) {
  modalContent.replaceChildren();
  let media;
  if (videoExt.test(path)) {
    media = document.createElement("video");
    media.controls = true;
    media.autoplay = true;
    media.playsInline = true;
  } else {
    media = document.createElement("img");
    media.alt = fileName(path);
  }
  media.src = path;
  modalContent.appendChild(media);
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  modalContent.replaceChildren();
  document.body.style.overflow = "";
}

modalClose.addEventListener("click", closeModal);
backdrop.addEventListener("click", closeModal);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

tabs.forEach(tab => tab.addEventListener("click", () => {
  tabs.forEach(t => t.classList.remove("active"));
  tab.classList.add("active");
  state.category = tab.dataset.category;
  history.replaceState(null, "", `#${state.category}`);
  render();
}));

async function loadManifest() {
  try {
    const response = await fetch(`portfolio.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Manifest not found");
    state.manifest = await response.json();
  } catch {
    state.manifest = { scripting: [], modeling: [], ui: [], building: [] };
  }
  render();
}

document.getElementById("year").textContent = new Date().getFullYear();
loadManifest();
