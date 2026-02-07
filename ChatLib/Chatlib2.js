(function (root, factory) {
  if (typeof define === "function" && define.amd) define([], factory);
  else if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ChatSDK = factory();
})(this, function () {
  const SDK = {};

  const state = {
    config: {},
    container: null,
    total: 0,
    emoteCache: null,
    pronounCache: new Map(),
    debug: false,
    users: [],
    messages: [],
    listenersBound: false
  };

  const defaults = {
    container: ".main-container",
    orientation: "bottom",
    limit: 20,
    hideAfter: 60,
    hideCommands: false,
    ignoredUsers: [],
    botNames: [],
    displayBadge: true,
    emotes: true,
    emotedata: {},
    pronouns: false,
    sounds: {},
    templates: { messages: [], alerts: [] }
  };

  const escapeHTML = s =>
    String(s || "").replace(/[<>"^]/g, m => "&#" + m.charCodeAt(0) + ";");

  const fetchJSON = async url => {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  };

  const detectProvider = raw => {
    if (raw?.service === "youtube") return "youtube";
    if (raw?.service === "twitch") return "twitch";
    if (raw?.data?.authorDetails) return "youtube";
    return "twitch";
  };

  const buildRoles = (provider, d) => {
    const roles = {
      viewer: true,
      mod: false,
      sub: false,
      member: false,
      broadcaster: false,
      vip: false,
      lead: false,
      artist: false,
      firstChatter: false
    };

    if (provider === "youtube") {
      if (d.authorDetails?.isChatOwner) roles.broadcaster = true;
      if (d.authorDetails?.isChatModerator) roles.mod = true;
      if (d.authorDetails?.isChatSponsor) roles.member = true;
    } else {
      const badges = d.badges || [];
      badges.forEach(b => {
        if (b?.type === "moderator") roles.mod = true;
        if (b?.type === "subscriber") roles.sub = true;
        if (b?.type === "broadcaster") roles.broadcaster = true;
        if (b?.type === "vip") roles.vip = true;
        if (b?.type === "lead_moderator") roles.lead = true;
        if (b?.type === "artist-badge") roles.artist = true;
      });
      if (d.tags?.["first-msg"] === "1") roles.firstChatter = true;
    }

    return roles;
  };

  const getPronouns = async name => {
    if (!state.config.pronouns) return "";
    if (!name) return "";
    if (state.pronounCache.has(name)) return state.pronounCache.get(name);
    const data = await fetchJSON(
      `https://pronouns.alejo.io/api/users/${encodeURIComponent(name)}`
    );
    const p = data?.[0]?.pronoun_id || "";
    state.pronounCache.set(name, p);
    return p;
  };

  const parseLocalEmotes = () => {
    const data = state.config.emotedata || {};
    const out = [];
    Object.values(data).forEach(v => {
      if (!v || !Array.isArray(v.shortcuts)) return;
      v.shortcuts.forEach(s =>
        out.push({
          key: String(s || "").replace(/:/g, "").toLowerCase(),
          url: v.image
        })
      );
    });
    return out;
  };

  const ensureExternalEmotes = async () => {
    if (state.emoteCache) return;
    const data = await fetchJSON(
      "https://raw.githubusercontent.com/Jocando21/Lottie-Repo/refs/heads/main/emotes.json"
    );
    state.emoteCache =
      data?.flatMap(e =>
        (e.shortcuts || []).map(s => ({
          key: String(s || "").replace(/:/g, "").toLowerCase(),
          url: e.image?.thumbnails?.[0]?.url
        }))
      ) || [];
  };

  const parseEmotes = async text => {
    const raw = String(text || "");
    if (!state.config.emotes) return escapeHTML(raw);

    const locals = parseLocalEmotes();
    await ensureExternalEmotes();
    const externals = state.emoteCache || [];

    const tokens = raw.split(/\s+/).filter(Boolean);
    const matched = [];

    for (const t of tokens) {
      const k = t.replace(/:/g, "").toLowerCase();
      const found =
        locals.find(e => e.key === k) || externals.find(e => e.key === k);
      if (found) matched.push(found);
    }

    const count = matched.length;
    let cls = "emote-1";
    if (count >= 1 && count <= 4) cls = "emote-2";
    else if (count <= 8) cls = "emote-3";
    else if (count > 8) cls = "emote-4";

    return escapeHTML(raw).replace(/(:[a-zA-Z0-9_\-]+:)/g, m => {
      const k = m.replace(/:/g, "").toLowerCase();
      const found =
        locals.find(e => e.key === k) || externals.find(e => e.key === k);
      return found
        ? `<img class="${cls}" src="${found.url}" alt="${m}">`
        : m;
    });
  };

  const normalize = async raw => {
    const provider = detectProvider(raw);
    const d = raw?.data || raw || {};

    const name = d.displayName || d.nick || "User";
    const text = d.text || d.displayMessage || "";
    const roles = buildRoles(provider, d) || { viewer: true };

    const pronouns = await getPronouns(name);
    const message = await parseEmotes(text);

    return {
      provider,
      type: "message",
      user: {
        id: d.userId || d.channelId || d.authorDetails?.channelId || "",
        name,
        avatar: d.avatar || d.authorDetails?.profileImageUrl || "",
        pronouns
      },
      roles,
      message,
      raw
    };
  };

  const matchTemplate = (list, payload) => {
    const roles = (payload && payload.roles) || {};
    const arr = Array.isArray(list) ? list : [];

    for (const t of arr) {
      if (!t) continue;
      if (t.type && t.type !== payload.type) continue;

      const tr = t.roles;
      if (!tr || !Array.isArray(tr) || tr.length === 0) return t.html || "";

      for (const r of tr) {
        if (roles && roles[r]) return t.html || "";
      }
    }

    return arr[0]?.html || "";
  };

  const renderHTML = (tpl, p) =>
    String(tpl || "")
      .replace(/\{\{name\}\}/g, p?.user?.name || "")
      .replace(/\{\{message\}\}/g, p?.message || "")
      .replace(/\{\{pronouns\}\}/g, p?.user?.pronouns || "")
      .replace(/\{\{avatar\}\}/g, p?.user?.avatar || "");

  const slideIn = el => {
    const o = state.config.orientation;
    el.classList.add("animated");
    if (o === "left") el.style.transform = "translateX(-100%)";
    if (o === "right") el.style.transform = "translateX(100%)";
    if (o === "top") el.style.transform = "translateY(-100%)";
    if (o === "bottom") el.style.transform = "translateY(100%)";
    requestAnimationFrame(() => (el.style.transform = "translate(0,0)"));
  };

  const prune = () => {
    if (!state.container) return;
    const children = state.container.children;
    while (children.length > state.config.limit) children[0].remove();
  };

  const insert = html => {
    if (!state.container) return;

    const div = document.createElement("div");
    div.innerHTML = html;
    const el = div.firstElementChild;
    if (!el) return;

    state.container.appendChild(el);
    slideIn(el);
    state.total++;

    if (state.config.hideAfter !== 999) {
      setTimeout(() => el.remove(), state.config.hideAfter * 1000);
    }
    prune();
  };

  const handleEvent = async e => {
    const obj = e?.detail;
    if (!obj) return;

    if (obj.listener === "delete-message") {
      const id = obj?.event?.msgId;
      if (!id || !state.container) return;
      const el = state.container.querySelector(`[data-msgid="${id}"]`);
      if (el) el.remove();
      return;
    }

    if (obj.listener !== "message") return;

    const payload = await normalize(obj.event);

    if (state.config.hideCommands) {
      const plain = String(payload?.raw?.data?.text || payload?.raw?.data?.displayMessage || payload?.raw?.text || payload?.raw?.displayMessage || "");
      if (plain.startsWith("!")) return;
    }

    if (state.config.ignoredUsers?.length) {
      const uname = String(payload?.user?.name || "").toLowerCase();
      if (state.config.ignoredUsers.includes(uname)) return;
    }

    const tpl = matchTemplate(state.config.templates.messages, payload);
    if (!tpl) return;

    const html = renderHTML(tpl, payload);
    insert(html);
  };

  SDK.init = cfg => {
    state.config = { ...defaults, ...(cfg || {}) };
    state.container = document.querySelector(state.config.container);

    if (!state.listenersBound) {
      window.addEventListener("onEventReceived", handleEvent);
      state.listenersBound = true;
    }

    if (state.config.debug) SDK.Debug.enable();
  };

  SDK.normalize = normalize;

  SDK.Debug = {
    enable() {
      state.debug = true;
      state.users = [
        { name: "User", roles: { viewer: true } },
        { name: "Mod", roles: { viewer: true, mod: true } },
        { name: "Sub", roles: { viewer: true, sub: true } },
        { name: "Broadcaster", roles: { viewer: true, broadcaster: true } }
      ];
      state.messages = ["hello chat", "pog", ":emote1:", "this overlay looks clean"];
    },

    sendFakeMessage(data = {}) {
      const fallbackUser = state.users[Math.floor(Math.random() * (state.users.length || 1))] || {
        name: "User",
        roles: { viewer: true }
      };

      const baseUser = data.user || fallbackUser;
      const roles = baseUser.roles || { viewer: true };

      const text =
        data.text ||
        state.messages[Math.floor(Math.random() * (state.messages.length || 1))] ||
        "hello";

      const payload = {
        provider: "debug",
        type: "message",
        user: { name: baseUser.name || "User", pronouns: "" },
        roles,
        message: escapeHTML(text)
      };

      const tpl = matchTemplate(state.config.templates.messages, payload);
      if (!tpl) return;

      insert(renderHTML(tpl, payload));
    },

    demo(count = 5, interval = 1) {
      let i = 0;
      const id = setInterval(() => {
        this.sendFakeMessage();
        i++;
        if (i >= count) clearInterval(id);
      }, interval * 1000);
    }
  };

  return SDK;
});
