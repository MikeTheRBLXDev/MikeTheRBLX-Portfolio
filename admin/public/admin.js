"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    session: null, sha: null, metadata: {}, original: {},
    projects: { ui: [], scripting: [] }, category: "ui",
    busy: false, adding: false, addType: "image", generation: 0
  };
  const categories = ["ui", "scripting"];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const isDirty = () => JSON.stringify(state.metadata) !== JSON.stringify(state.original);
  const plainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

  class ApiError extends Error {
    constructor(message, status = 0) { super(message); this.name = "ApiError"; this.status = status; }
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 45000);
    const headers = new Headers(options.headers || {});
    try {
      if (options.method && options.method !== "GET") {
        if (!state.session?.csrf) throw new ApiError("Your session needs to be refreshed before making changes.", 401);
        headers.set("X-CSRF-Token", state.session.csrf);
        headers.set("Content-Type", "application/json");
      }
      const response = await fetch(path, {
        ...options, headers, credentials: "same-origin", cache: "no-store", signal: controller.signal
      });
      if (response.status === 204) return {};
      let data;
      try { data = await response.json(); }
      catch { throw new ApiError("The server returned an unexpected response. Please try again.", response.status); }
      if (!response.ok) {
        const message = typeof data.error === "string" ? data.error : data.error?.message || data.message;
        throw new ApiError(message || "That change could not be completed. Please try again.", response.status);
      }
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error.name === "AbortError") throw new ApiError("The request timed out. Reload the repository to check whether the change was saved before trying again.");
      throw new ApiError("Could not reach your studio. Check your connection and try again.");
    } finally { window.clearTimeout(timer); }
  }

  function showStatus(message = "", kind = "") {
    $("status").replaceChildren();
    $("status").className = `status${kind ? ` ${kind}` : ""}`;
    $("status").textContent = message;
  }

  function showLogin(session, message) {
    $("workspace").hidden = true;
    $("login-panel").hidden = false;
    $("logout").hidden = true;
    $("login-link").hidden = !session?.configured;
    $("setup-link").hidden = Boolean(session?.configured);
    $("access-title").textContent = session?.configured ? "Sign in to your studio" : "Finish your account setup";
    $("access-message").textContent = message || session?.message || (session?.configured
      ? "Use your approved GitHub account. Only the portfolio owner can open this workspace."
      : "The private dashboard is ready. Connect your GitHub account and configure the secure admin service to enable sign-in.");
  }

  function expired(error) {
    if (error.status !== 401) return false;
    state.generation += 1;
    const configured = state.session?.configured;
    state.session = { configured, authenticated: false };
    state.metadata = {};
    state.original = {};
    state.projects = { ui: [], scripting: [] };
    state.sha = null;
    $("project-list").replaceChildren();
    $("add-dialog").close();
    showLogin(state.session);
    showStatus("Your session ended. Sign in again to keep managing your work.", "error");
    return true;
  }

  function updateControls() {
    const dirty = isDirty();
    $("workspace").classList.toggle("busy", state.busy);
    $("save-state").textContent = state.busy ? "Working…" : dirty ? "Unsaved changes" : "All changes saved";
    $("save-state").classList.toggle("unsaved", dirty && !state.busy);
    $("save").disabled = state.busy || !dirty;
    $("discard").disabled = state.busy || !dirty;
    $("reload").disabled = state.busy;
    $("logout").disabled = state.busy;
    $("add-project").disabled = state.busy || dirty;
    $("empty-add").disabled = state.busy || dirty;
    $("add-project").title = dirty ? "Save or discard your changes before adding another project." : "";
    document.querySelectorAll(".category-button").forEach((button) => { button.disabled = state.busy; });
    $("project-list").querySelectorAll("input,textarea,button").forEach((control) => {
      control.disabled = state.busy || control.dataset.boundary === "true";
    });
    $("add-form").querySelectorAll("input,select,button").forEach((control) => { control.disabled = state.adding; });
  }

  function setBusy(value) { state.busy = value; updateControls(); }

  function projectKey(project, category) {
    return `${category}:${project.type === "youtube" ? `youtube:${project.id}` : `media:${project.path}`}`;
  }

  function details(project, category) {
    const entry = state.metadata[projectKey(project, category)];
    return { ...project, ...(plainObject(entry) ? entry : {}) };
  }

  function edit(project, field, value) {
    const key = projectKey(project, state.category);
    if (!plainObject(state.metadata[key])) state.metadata[key] = {};
    state.metadata[key][field] = value;
    updateControls();
  }

  function setFeatured(project, value) {
    for (const item of state.projects[state.category]) {
      const key = projectKey(item, state.category);
      if (!plainObject(state.metadata[key])) state.metadata[key] = {};
      state.metadata[key].featured = item === project && value;
    }
  }

  function sortedProjects(category = state.category) {
    return [...state.projects[category]].sort((left, right) => {
      const a = details(left, category).order;
      const b = details(right, category).order;
      return (Number.isFinite(a) ? a : 1000000) - (Number.isFinite(b) ? b : 1000000);
    });
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function safePreview(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && ["raw.githubusercontent.com", "i.ytimg.com"].includes(parsed.hostname)
        && !parsed.username && !parsed.password ? parsed.href : null;
    } catch { return null; }
  }

  function publicProjectURL(project) {
    if (project.type === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(project.id)) {
      return `https://www.youtube.com/watch?v=${project.id}`;
    }
    return safePreview(project.previewUrl);
  }

  function fieldLabel(text, id, extraClass = "") {
    const label = element("label", `field-label${extraClass ? ` ${extraClass}` : ""}`, text);
    label.htmlFor = id;
    return label;
  }

  function renderProject(project, index, count) {
    const data = details(project, state.category);
    const card = element("article", "project-card");
    const visual = element("div", "project-visual");
    const preview = safePreview(project.previewUrl);
    const fallback = element("div", "preview-fallback", "Preview unavailable");
    if (preview) {
      const image = element("img", "project-preview");
      image.src = preview;
      image.alt = String(data.title || "Project preview");
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => { image.replaceWith(fallback); }, { once: true });
      visual.append(image);
    } else visual.append(fallback);
    const caption = element("div", "project-caption");
    caption.append(element("span", "project-type", project.type === "youtube" ? "YouTube video" : "Image"));
    const projectURL = publicProjectURL(project);
    if (projectURL) {
      const link = element("a", "project-link", project.type === "youtube" ? "Watch video ↗" : "View original ↗");
      link.href = projectURL; link.target = "_blank"; link.rel = "noopener noreferrer";
      caption.append(link);
    }
    visual.append(caption, element("p", "project-file", project.type === "youtube" ? `Video · ${project.id}` : String(project.path || "").split("/").pop()));
    const fields = element("div", "project-fields");
    const titleId = `project-title-${state.category}-${index}`;
    const title = element("input");
    title.id = titleId; title.type = "text"; title.maxLength = 200; title.required = true;
    title.value = String(data.title || "");
    title.addEventListener("input", () => { title.setCustomValidity(""); edit(project, "title", title.value); });
    const descriptionId = `project-description-${state.category}-${index}`;
    const description = element("textarea");
    description.id = descriptionId; description.maxLength = 5000; description.rows = 3;
    description.placeholder = "What did you design, what problem did it solve, and what made it work?";
    description.value = String(data.description || "");
    const descriptionCount = element("span", "character-count", `${description.value.length} / 5,000`);
    description.addEventListener("input", () => {
      edit(project, "description", description.value);
      descriptionCount.textContent = `${description.value.length} / 5,000`;
    });
    const fieldMeta = element("div", "field-meta");
    fieldMeta.append(element("p", "field-help", "Help clients understand the value behind this project."), descriptionCount);
    fields.append(fieldLabel("Project title", titleId), title, fieldLabel("Description", descriptionId, "description-label"), description, fieldMeta);
    const controls = element("div", "project-controls");
    const switches = element("div", "project-switches");
    for (const [name, text] of [["featured", "Featured project"], ["hidden", "Hidden from site"]]) {
      const label = element("label", "check-label");
      const checkbox = element("input");
      checkbox.type = "checkbox"; checkbox.checked = Boolean(data[name]);
      checkbox.id = `project-${name}-${state.category}-${index}`;
      checkbox.addEventListener("change", () => {
        if (name === "featured") {
          setFeatured(project, checkbox.checked);
          renderProjects();
          document.getElementById(checkbox.id)?.focus();
        } else edit(project, name, checkbox.checked);
      });
      label.append(checkbox, element("span", "", text)); switches.append(label);
    }
    const order = element("div", "order-controls");
    order.append(element("span", "order-number", `Position ${index + 1}`));
    for (const [direction, text, accessible] of [[-1, "↑", "Move up"], [1, "↓", "Move down"]]) {
      const button = element("button", "icon-button", text);
      button.type = "button";
      button.setAttribute("aria-label", `${accessible}: ${data.title || "project"}`);
      button.dataset.boundary = String(index + direction < 0 || index + direction >= count);
      button.addEventListener("click", () => {
        const ordered = sortedProjects();
        const target = index + direction;
        if (target < 0 || target >= ordered.length) return;
        [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
        ordered.forEach((item, position) => {
          const key = projectKey(item, state.category);
          if (!plainObject(state.metadata[key])) state.metadata[key] = {};
          state.metadata[key].order = position;
        });
        renderProjects();
        $("project-list").children[target]?.querySelector("input[type=text]")?.focus();
        showStatus(`Moved “${data.title || "project"}” to position ${target + 1}. Save changes to update your site.`);
      });
      order.append(button);
    }
    controls.append(switches, order); fields.append(controls); card.append(visual, fields);
    return card;
  }

  function renderProjects() {
    const ordered = sortedProjects();
    const fragment = document.createDocumentFragment();
    ordered.forEach((project, index) => fragment.append(renderProject(project, index, ordered.length)));
    $("project-list").replaceChildren(fragment);
    $("empty-state").hidden = Boolean(ordered.length);
    for (const category of categories) $(`${category}-count`).textContent = state.projects[category].length;
    document.querySelectorAll(".category-button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.category === state.category));
    });
    updateControls();
  }

  async function loadContent() {
    const generation = state.generation;
    const data = await api("/api/content");
    if (generation !== state.generation) return;
    if (!plainObject(data.metadata) || !plainObject(data.projects)
        || !categories.every((category) => Array.isArray(data.projects[category]))) {
      throw new ApiError("The repository content could not be read. Please reload or check your admin configuration.");
    }
    state.sha = data.sha ?? null;
    state.metadata = clone(data.metadata);
    state.original = clone(data.metadata);
    state.projects = {
      ui: data.projects.ui.filter(validProject),
      scripting: data.projects.scripting.filter(validProject)
    };
    renderProjects();
  }

  function validProject(project) {
    return plainObject(project) && ((project.type === "media" && typeof project.path === "string")
      || (project.type === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(project.id)));
  }

  async function start() {
    if (state.busy) return;
    setBusy(true);
    try {
      state.session = await api("/api/session");
      if (!state.session.authenticated) { showLogin(state.session); showStatus(); return; }
      $("login-panel").hidden = true;
      $("workspace").hidden = false;
      $("logout").hidden = false;
      const owner = state.session.user?.login;
      $("owner-label").textContent = owner ? `${owner}’s studio` : "Your studio";
      showStatus("Loading your projects…");
      await loadContent();
      showStatus();
    } catch (error) {
      if (!expired(error)) {
        if (!state.session?.authenticated) {
          showLogin({ configured: false }, "We could not check your session. Retry when your connection is ready.");
          $("setup-link").hidden = true;
        }
        showStatus(error.message, "error");
        const retry = element("button", "text-button", "Retry");
        retry.addEventListener("click", () => { start(); });
        $("status").append(document.createTextNode(" "), retry);
      }
    } finally { setBusy(false); }
  }

  function downloadDraft() {
    const blob = new Blob([`${JSON.stringify(state.metadata, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = element("a");
    link.href = url; link.download = "project-details.draft.json";
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function save() {
    if (state.busy || !isDirty()) return;
    for (const category of categories) {
      for (const project of state.projects[category]) {
        const data = details(project, category);
        if (!String(data.title || "").trim() || String(data.title).length > 200 || String(data.description || "").length > 5000) {
          state.category = category; renderProjects();
          const index = sortedProjects().indexOf(project);
          const input = document.getElementById(`project-title-${category}-${index}`);
          showStatus("Give every project a title (up to 200 characters) and keep descriptions within 5,000 characters.", "error");
          input?.focus(); return;
        }
      }
    }
    setBusy(true); showStatus("Saving your changes…");
    try {
      const data = await api("/api/metadata", { method: "PUT", body: JSON.stringify({ sha: state.sha, metadata: state.metadata }) });
      state.sha = data.sha ?? null;
      if (plainObject(data.metadata)) state.metadata = clone(data.metadata);
      state.original = clone(state.metadata);
      renderProjects();
      showStatus("Saved. Your portfolio update is queued; publishing can take a few minutes.", "success");
    } catch (error) {
      if (!expired(error)) {
        if (error.status === 409) {
          showStatus("The repository changed while you were editing. Your unsaved edits are still here. Download a copy, then reload from the repository before editing again.", "error");
          const download = element("button", "text-button", "Download your edits");
          download.addEventListener("click", downloadDraft);
          $("status").append(document.createTextNode(" "), download);
        } else showStatus(error.message, "error");
      }
    } finally { setBusy(false); }
  }

  function openAdd() {
    if (state.busy || isDirty()) return;
    $("add-form").reset(); $("add-category").value = state.category;
    $("add-error").hidden = true; $("add-error").textContent = "";
    $("add-progress").textContent = "You can edit its description after adding it.";
    setAddType("image");
    $("add-dialog").showModal();
  }

  function setAddType(type) {
    if (state.adding) return;
    state.addType = type;
    $("image-fields").hidden = type !== "image";
    $("video-fields").hidden = type !== "video";
    $("add-submit").replaceChildren(document.createTextNode(type === "image" ? "Add image " : "Add video "), element("span", "", "↗"));
    $("add-submit").lastChild.setAttribute("aria-hidden", "true");
    document.querySelectorAll(".type-button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.addType === type));
    });
    $("add-error").hidden = true;
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const base64 = String(reader.result).split(",")[1];
        base64 ? resolve(base64) : reject(new ApiError("This file could not be read. Please choose it again."));
      }, { once: true });
      reader.addEventListener("error", () => reject(new ApiError("This file could not be read. Please choose it again.")), { once: true });
      reader.addEventListener("abort", () => reject(new ApiError("The image upload was cancelled.")), { once: true });
      reader.readAsDataURL(file);
    });
  }

  function validYouTubeURL(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"].includes(parsed.hostname)
        && !parsed.username && !parsed.password;
    } catch { return false; }
  }

  async function addProject(event) {
    event.preventDefault();
    if (state.busy || isDirty()) return;
    const category = $("add-category").value;
    let payload;
    let path;
    try {
      if (!categories.includes(category)) throw new ApiError("Choose a valid collection.");
      if (state.addType === "image") {
        const file = $("add-file").files[0];
        if (!file) { $("add-file").focus(); throw new ApiError("Choose an image to upload."); }
        if (file.size === 0 || file.size > 8 * 1024 * 1024) throw new ApiError("Choose a nonempty image no larger than 8 MB.");
        if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*\.(png|jpe?g|webp|gif|avif)$/i.test(file.name)) {
          throw new ApiError("Use a PNG, JPG, WebP, GIF or AVIF filename with letters, numbers, spaces, dots, underscores or dashes. Start it with a letter or number.");
        }
        payload = { category, filename: file.name }; path = "/api/upload";
      } else {
        const url = $("add-url").value.trim();
        if (!validYouTubeURL(url)) { $("add-url").focus(); throw new ApiError("Paste a full HTTPS YouTube video link."); }
        payload = { category, url, title: $("add-title").value.trim(), featured: $("add-featured").checked };
        path = "/api/video";
      }
    } catch (error) {
      $("add-error").textContent = error.message; $("add-error").hidden = false; return;
    }
    state.adding = true; setBusy(true);
    $("add-error").hidden = true; $("add-progress").textContent = "Adding your project…";
    let mutationComplete = false;
    try {
      if (path === "/api/upload") payload.base64 = await readFile($("add-file").files[0]);
      const added = await api(path, { method: "POST", body: JSON.stringify(payload) });
      mutationComplete = true;
      state.category = category;
      await loadContent();
      if (path === "/api/video" && payload.featured) {
        const project = state.projects[category].find((item) => item.type === "youtube" && item.id === added.id);
        if (project) { setFeatured(project, true); renderProjects(); }
      }
      $("add-dialog").close();
      showStatus(payload.featured
        ? "Project added. Save your description and featured selection when you’re ready."
        : "Project added. Edit its description below, then save your changes. The site updates automatically.", "success");
    } catch (error) {
      if (!expired(error)) {
        if (mutationComplete) {
          $("add-dialog").close();
          showStatus("Your project was added, but its preview could not refresh. Reload from the repository to see it.", "error");
        } else { $("add-error").textContent = error.message; $("add-error").hidden = false; }
      }
    } finally {
      state.adding = false; setBusy(false);
      $("add-progress").textContent = "You can edit its description after adding it.";
    }
  }

  document.querySelectorAll(".category-button").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.busy) return;
      state.category = button.dataset.category; renderProjects();
    });
  });
  document.querySelectorAll(".type-button").forEach((button) => {
    button.addEventListener("click", () => setAddType(button.dataset.addType));
  });
  $("save").addEventListener("click", save);
  $("discard").addEventListener("click", () => {
    if (state.busy || !isDirty() || !window.confirm("Discard your unsaved changes?")) return;
    state.metadata = clone(state.original); renderProjects(); showStatus("Unsaved changes discarded.");
  });
  $("reload").addEventListener("click", async () => {
    if (state.busy || (isDirty() && !window.confirm("Reloading will discard your unsaved changes. Continue?"))) return;
    setBusy(true); showStatus("Reloading your projects…");
    try { await loadContent(); showStatus("Projects refreshed from your repository.", "success"); }
    catch (error) { if (!expired(error)) showStatus(error.message, "error"); }
    finally { setBusy(false); }
  });
  $("logout").addEventListener("click", async () => {
    if (state.busy || (isDirty() && !window.confirm("Sign out and discard your unsaved changes?"))) return;
    setBusy(true);
    try {
      const data = await api("/auth/logout", { method: "POST", body: "{}" });
      state.generation += 1; state.metadata = {}; state.original = {};
      state.projects = { ui: [], scripting: [] }; state.sha = null;
      state.session = { configured: true, authenticated: false };
      $("project-list").replaceChildren(); showLogin(state.session);
      showStatus(data.message || "You have signed out.");
    } catch (error) { if (!expired(error)) showStatus(error.message, "error"); }
    finally { setBusy(false); }
  });
  $("add-project").addEventListener("click", openAdd);
  $("empty-add").addEventListener("click", openAdd);
  $("close-dialog").addEventListener("click", () => { if (!state.adding) $("add-dialog").close(); });
  $("add-dialog").addEventListener("cancel", (event) => { if (state.adding) event.preventDefault(); });
  $("add-form").addEventListener("submit", addProject);
  window.addEventListener("beforeunload", (event) => {
    if (!isDirty() && !state.adding) return;
    event.preventDefault(); event.returnValue = "";
  });
  start();
})();
