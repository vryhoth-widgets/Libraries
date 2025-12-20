(function (global) {
  const VERSION = "1.2";
  const LIB = "[SEventLib.js " + VERSION + "]";
  let DEBUG = true;

  const state = {
    lastEvents: new Map(),
    communityLocks: new Set(),
    lastChannelPointUser: null,
    lastChannelPointMsg: null,
    lastChannelPointTs: 0,

    commandPerms: {},
    fieldData: null,
    settings: {},
    triggers: {},
    queue: {
      chain: Promise.resolve(),
      running: false
    },

    initOpts: {
      commandPrefix: "!",
      hideCommands: "no",
      ignoredUsers: [],
      botNames: [],
      dedupeWindowMs: 1500
    }
  };

  function now() { return Date.now(); }

  function log(data) { if (DEBUG) console.log(LIB, data); }

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); }

  function clean(s) { return String(s ?? "").trim(); }

  function lower(s) { return clean(s).toLowerCase(); }

  function parseYes(v, def) {
    if (v === true) return true;
    if (v === false) return false;
    const x = lower(v);
    if (!x) return def;
    if (x === "yes" || x === "true" || x === "1" || x === "on" || x === "enabled") return true;
    if (x === "no" || x === "false" || x === "0" || x === "off" || x === "disabled") return false;
    return def;
  }

  function parseNum(v, def) {
    if (v === null || v === undefined || v === "") return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  function parseStrList(v) {
    if (Array.isArray(v)) return v.map(x => clean(x)).filter(Boolean);
    const s = clean(v);
    if (!s) return [];
    return s.split(",").map(x => clean(x)).filter(Boolean);
  }

  function parseNumList(v) {
    const a = parseStrList(v);
    const out = [];
    for (const x of a) {
      const n = Number(x);
      if (Number.isFinite(n)) out.push(n);
    }
    return out;
  }

  function parseJSON(v, def) {
    if (v === null || v === undefined || v === "") return def;
    if (typeof v === "object") return v;
    try { return JSON.parse(String(v)); } catch (_) { return def; }
  }

  function dedupe(key, windowMs) {
    const t = now();
    const last = state.lastEvents.get(key);
    if (last && t - last < windowMs) return true;
    state.lastEvents.set(key, t);
    return false;
  }

  function cooldown(key, ms) {
    const t = now();
    const last = state.lastEvents.get(key);
    if (last && t - last < ms) return false;
    state.lastEvents.set(key, t);
    return true;
  }

  function parseCommand(text, prefix) {
    if (!text || !text.startsWith(prefix)) return null;
    const raw = text.slice(prefix.length).trim();
    if (!raw) return null;
    const parts = raw.split(/\s+/);
    return { prefix, name: parts.shift(), args: parts };
  }

  function getRoleFromMessage(d, botNames) {
    const badges = d?.tags?.badges || "";
    return botNames.includes(d.nick) ? "bot" :
      badges.includes("broadcaster") ? "streamer" :
      badges.includes("mod") ? "mod" :
      badges.includes("vip") ? "vip" :
      (badges.includes("subscriber") || badges.includes("founder")) ? "sub" :
      Number(d.tags?.["first-msg"]) === 1 ? "first" :
      "viewer";
  }

  function findCommandPerm(cmdName) {
    const perms = state.commandPerms || {};
    for (const cat in perms) {
      const cfg = perms[cat];
      if (cfg?.commands && Array.isArray(cfg.commands) && cfg.commands.includes(cmdName)) {
        return { category: cat, permissions: Array.isArray(cfg.permissions) ? cfg.permissions : null };
      }
    }
    return { category: null, permissions: null };
  }

  function init(options) {
    DEBUG = options?.debug !== false;

    if (!options) return;

    if (hasOwn(options, "commandPrefix")) state.initOpts.commandPrefix = options.commandPrefix;
    if (hasOwn(options, "hideCommands")) state.initOpts.hideCommands = options.hideCommands;
    if (hasOwn(options, "ignoredUsers")) state.initOpts.ignoredUsers = Array.isArray(options.ignoredUsers) ? options.ignoredUsers : [];
    if (hasOwn(options, "botNames")) state.initOpts.botNames = Array.isArray(options.botNames) ? options.botNames : [];
    if (hasOwn(options, "dedupeWindowMs")) state.initOpts.dedupeWindowMs = options.dedupeWindowMs;

    if (hasOwn(options, "commandPermissions")) state.commandPerms = options.commandPermissions || {};
    if (hasOwn(options, "settings")) state.settings = Object.assign({}, state.settings, options.settings || {});
    if (hasOwn(options, "triggers")) state.triggers = Object.assign({}, state.triggers, options.triggers || {});
  }

  function loadFields(fieldData) {
    if (!fieldData || typeof fieldData !== "object") return;
    state.fieldData = fieldData;

    const s = state.settings || (state.settings = {});
    const t = state.triggers || (state.triggers = {});

    if (hasOwn(fieldData, "debugMode")) DEBUG = parseYes(fieldData.debugMode, DEBUG);

    if (hasOwn(fieldData, "commandPrefix")) state.initOpts.commandPrefix = clean(fieldData.commandPrefix) || state.initOpts.commandPrefix;
    if (hasOwn(fieldData, "hideCommands")) state.initOpts.hideCommands = parseYes(fieldData.hideCommands, state.initOpts.hideCommands === "yes") ? "yes" : "no";
    if (hasOwn(fieldData, "dedupeWindowMs")) state.initOpts.dedupeWindowMs = parseNum(fieldData.dedupeWindowMs, state.initOpts.dedupeWindowMs);

    if (hasOwn(fieldData, "ignoredUsers")) state.initOpts.ignoredUsers = parseStrList(fieldData.ignoredUsers);
    if (hasOwn(fieldData, "botNames")) state.initOpts.botNames = parseStrList(fieldData.botNames);

    if (hasOwn(fieldData, "commandPermissionsJson")) {
      const parsed = parseJSON(fieldData.commandPermissionsJson, null);
      if (parsed && typeof parsed === "object") state.commandPerms = parsed;
    }

    if (hasOwn(fieldData, "queueEnabled")) s.queueEnabled = parseYes(fieldData.queueEnabled, s.queueEnabled ?? true);
    if (hasOwn(fieldData, "queueMaxMs")) s.queueMaxMs = parseNum(fieldData.queueMaxMs, s.queueMaxMs ?? 90000);

    if (hasOwn(fieldData, "triggersEnabled")) s.triggersEnabled = parseYes(fieldData.triggersEnabled, s.triggersEnabled ?? true);

    if (hasOwn(fieldData, "enableCheers")) {
      t.cheer = t.cheer || {};
      t.cheer.enabled = parseYes(fieldData.enableCheers, t.cheer.enabled ?? true);
    }
    if (hasOwn(fieldData, "cheerExact")) {
      t.cheer = t.cheer || {};
      t.cheer.exact = parseNumList(fieldData.cheerExact);
    }
    if (hasOwn(fieldData, "cheerMin")) {
      t.cheer = t.cheer || {};
      t.cheer.minimum = parseNumList(fieldData.cheerMin);
    }

    if (hasOwn(fieldData, "enableTips")) {
      t.tip = t.tip || {};
      t.tip.enabled = parseYes(fieldData.enableTips, t.tip.enabled ?? true);
    }
    if (hasOwn(fieldData, "tipExact")) {
      t.tip = t.tip || {};
      t.tip.exact = parseNumList(fieldData.tipExact);
    }
    if (hasOwn(fieldData, "tipMin")) {
      t.tip = t.tip || {};
      t.tip.minimum = parseNumList(fieldData.tipMin);
    }

    if (hasOwn(fieldData, "enableSubs")) {
      t.sub = t.sub || {};
      t.sub.enabled = parseYes(fieldData.enableSubs, t.sub.enabled ?? true);
    }
    if (hasOwn(fieldData, "subExact")) {
      t.sub = t.sub || {};
      t.sub.exact = parseNumList(fieldData.subExact);
    }
    if (hasOwn(fieldData, "subMin")) {
      t.sub = t.sub || {};
      t.sub.minimum = parseNumList(fieldData.subMin);
    }

    if (hasOwn(fieldData, "enableFollows")) {
      t.follow = t.follow || {};
      t.follow.enabled = parseYes(fieldData.enableFollows, t.follow.enabled ?? true);
    }
    if (hasOwn(fieldData, "followExact")) {
      t.follow = t.follow || {};
      t.follow.exact = parseNumList(fieldData.followExact);
    }
    if (hasOwn(fieldData, "followMin")) {
      t.follow = t.follow || {};
      t.follow.minimum = parseNumList(fieldData.followMin);
    }

    if (hasOwn(fieldData, "enableRaids")) {
      t.raid = t.raid || {};
      t.raid.enabled = parseYes(fieldData.enableRaids, t.raid.enabled ?? true);
    }
    if (hasOwn(fieldData, "raidExact")) {
      t.raid = t.raid || {};
      t.raid.exact = parseNumList(fieldData.raidExact);
    }
    if (hasOwn(fieldData, "raidMin")) {
      t.raid = t.raid || {};
      t.raid.minimum = parseNumList(fieldData.raidMin);
    }
  }

  function normalize(detail, opts) {
    const merged = Object.assign({}, state.initOpts, opts || {});
    const commandPrefix = merged.commandPrefix ?? "!";
    const hideCommands = merged.hideCommands ?? "no";
    const ignoredUsers = Array.isArray(merged.ignoredUsers) ? merged.ignoredUsers : [];
    const botNames = Array.isArray(merged.botNames) ? merged.botNames : [];
    const dedupeWindowMs = merged.dedupeWindowMs ?? 1500;

    if (!detail || !detail.listener) return null;

    const listener = detail.listener;
    const ev = detail.event || {};
    const ts = now();

    if (listener && listener.startsWith("event") && ev.listener === "widget-button") {
      const k = "widget-button-" + (ev.field || "") + "-" + (ev.value || "");
      if (dedupe(k, dedupeWindowMs)) return null;

      const out = {
        type: "button",
        source: "widget",
        listener: "widget-button",
        timestamp: ts,
        field: ev.field || "",
        value: ev.value || "",
        raw: detail
      };

      log(out);
      return out;
    }

    if (listener === "event" && ev.type === "channelPointsRedemption") {
      const u = (ev.data?.username || "").toString();
      const m = (ev.data?.message || "").toString();

      state.lastChannelPointUser = u ? u.toLowerCase() : null;
      state.lastChannelPointMsg = m || null;
      state.lastChannelPointTs = ts;

      const out = {
        type: "points",
        source: "alert",
        listener,
        origin: "event",
        timestamp: ts,
        amount: ev.data?.amount || 0,
        message: m,
        user: { username: ev.data?.username, displayName: ev.data?.username },
        meta: ev.meta || {},
        raw: detail
      };

      log(out);
      return out;
    }

    if (listener === "message") {
      const d = ev.data;
      if (!d) return null;

      const dn = (d.nick || d.displayName || "").toString().toLowerCase();
      const cpU = state.lastChannelPointUser;
      const cpM = state.lastChannelPointMsg;
      const dt = ts - state.lastChannelPointTs;

      if (cpU && dn && dn === cpU && dt < 1500 && cpM && (d.text || "") === cpM) return null;
      if (ignoredUsers.includes(d.nick)) return null;

      const cmd = parseCommand(d.text, commandPrefix);
      if (cmd && hideCommands === "yes") return null;

      const role = getRoleFromMessage(d, botNames);

      let permission = null;
      if (cmd) {
        const found = findCommandPerm(cmd.name);
        const hasPerms = found.permissions ? found.permissions.includes(role) : true;
        permission = { category: found.category, hasPerms };
      }

      const out = {
        type: "message",
        source: "chat",
        listener,
        timestamp: ts,
        user: {
          username: d.nick,
          displayName: d.displayName,
          userId: d.userId,
          color: d.tags?.color || ""
        },
        role,
        message: {
          text: d.text,
          renderedText: ev.renderedText,
          isAction: d.isAction,
          isHighlight: d.tags?.["msg-id"] === "highlighted-message",
          isFirst: Number(d.tags?.["first-msg"]) === 1
        },
        command: cmd,
        permission,
        raw: detail
      };

      log(out);
      return out;
    }

    if (listener === "event") {
      if (ev.isCommunityGift) {
        const gid = ev.activityId || ev.meta?.activityId || ev.createdAt;
        if (state.communityLocks.has(gid)) return null;
        state.communityLocks.add(gid);

        const out = {
          type: "sub-community",
          source: "alert",
          listener,
          origin: "event",
          timestamp: ts,
          amount: ev.amount || ev.bulkGifted || 0,
          activityId: gid,
          activityGroup: ev.activityGroup || "",
          user: { username: ev.sender, displayName: ev.sender, sender: ev.sender },
          meta: ev.meta || {},
          raw: detail
        };

        log(out);
        return out;
      }

      if (ev.name) {
        const out = {
          type: "follow",
          source: "alert",
          listener,
          origin: "event",
          timestamp: ts,
          amount: null,
          user: { username: ev.name, displayName: ev.name },
          meta: ev.meta || {},
          raw: detail
        };

        log(out);
        return out;
      }
    }

    if (listener === "subscriber-latest") {
      const meta = ev;
      const amt = meta.amount || 1;

      if (meta.bulkGifted === true && amt > 1) {
        const key = "sub-community-" + meta.sender + "-" + amt;
        if (dedupe(key, dedupeWindowMs)) return null;

        const out = {
          type: "sub-community",
          source: "alert",
          listener,
          origin: "latest",
          timestamp: ts,
          amount: amt,
          user: { username: meta.sender, displayName: meta.sender, sender: meta.sender },
          meta,
          raw: detail
        };

        log(out);
        return out;
      }

      if (meta.gifted === true) {
        if (meta.isCommunityGift) return null;

        const out = {
          type: "sub-gift",
          source: "alert",
          listener,
          origin: "latest",
          timestamp: ts,
          amount: 1,
          user: { username: meta.name, displayName: meta.name, sender: meta.sender },
          meta,
          raw: detail
        };

        log(out);
        return out;
      }

      const out = {
        type: amt > 1 ? "sub-re" : "sub-new",
        source: "alert",
        listener,
        origin: "latest",
        timestamp: ts,
        amount: amt,
        message: meta.message || "",
        user: { username: meta.name, displayName: meta.name },
        meta,
        raw: detail
      };

      log(out);
      return out;
    }

    if (listener === "cheer-latest") {
      const out = {
        type: "cheer",
        source: "alert",
        listener,
        timestamp: ts,
        amount: ev.amount || 0,
        message: ev.message || "",
        user: { username: ev.name, displayName: ev.name },
        raw: detail
      };

      log(out);
      return out;
    }

    if (listener === "tip-latest") {
      const out = {
        type: "tip",
        source: "alert",
        listener,
        timestamp: ts,
        amount: ev.amount || 0,
        message: ev.message || "",
        user: { username: ev.name, displayName: ev.name },
        raw: detail
      };

      log(out);
      return out;
    }

    if (listener === "raid-latest") {
      const out = {
        type: "raid",
        source: "alert",
        listener,
        timestamp: ts,
        amount: ev.amount || 0,
        user: { username: ev.name, displayName: ev.name },
        raw: detail
      };

      log(out);
      return out;
    }

    if (listener === "follower-latest") {
      if (dedupe("follow-" + ev.name, dedupeWindowMs)) return null;

      const out = {
        type: "follow",
        source: "alert",
        listener,
        timestamp: ts,
        user: { username: ev.name, displayName: ev.name },
        raw: detail
      };

      log(out);
      return out;
    }

    return null;
  }

  function matchCommand(ev, names) {
    if (!ev || ev.type !== "message" || !ev.command) return null;
    const n = ev.command.name;
    const okName = Array.isArray(names) ? names.includes(n) : (names ? n === names : true);
    if (!okName) return null;
    if (ev.permission && ev.permission.hasPerms === false) return null;
    return {
      name: n,
      args: ev.command.args || [],
      user: ev.user,
      role: ev.role,
      category: ev.permission?.category || null
    };
  }

  function commandRouter(ev, routes) {
    if (!ev || ev.type !== "message" || !ev.command) return false;
    const fn = routes ? routes[ev.command.name] : null;
    if (typeof fn !== "function") return false;
    if (ev.permission && ev.permission.hasPerms === false) return true;
    fn(ev);
    return true;
  }

  function queue(fn, durationMs) {
    const enabled = state.settings?.queueEnabled ?? true;
    if (!enabled) {
      try { fn(); } catch (e) { if (DEBUG) console.error(e); }
      return;
    }

    const maxMs = Number.isFinite(state.settings?.queueMaxMs) ? state.settings.queueMaxMs : 90000;
    const dur = Number.isFinite(durationMs) ? Math.max(0, durationMs) : null;

    const task = () => {
      state.queue.running = true;
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        state.queue.running = false;
      };

      const watchdog = setTimeout(() => finish(), maxMs);

      try {
        const r = fn();
        if (r && typeof r.then === "function") {
          return r.then(() => {
            clearTimeout(watchdog);
            finish();
          }).catch(err => {
            clearTimeout(watchdog);
            finish();
            if (DEBUG) console.error(err);
          });
        }

        if (dur !== null) {
          return new Promise(res => setTimeout(res, dur)).then(() => {
            clearTimeout(watchdog);
            finish();
          });
        }

        clearTimeout(watchdog);
        finish();
      } catch (err) {
        clearTimeout(watchdog);
        finish();
        if (DEBUG) console.error(err);
      }
    };

    state.queue.chain = state.queue.chain.then(task);
  }

  function triggerMatchOne(ev, trig, typeKey) {
    if (!trig) return null;
    if (trig.enabled === false) return null;

    const amount = Number.isFinite(ev?.amount) ? ev.amount : 0;

    const exact = Array.isArray(trig.exact) ? trig.exact : [];
    for (const v of exact) {
      if (amount === v) return { type: typeKey, amount, mode: "exact", value: v };
    }

    const mins = Array.isArray(trig.minimum) ? trig.minimum : [];
    let bestMin = null;
    for (const v of mins) {
      if (amount >= v && (bestMin === null || v > bestMin)) bestMin = v;
    }
    if (bestMin !== null) return { type: typeKey, amount, mode: "minimum", value: bestMin };

    return null;
  }

  function pickBestTrigger(matches) {
    if (!Array.isArray(matches) || !matches.length) return null;
    let best = matches[0];
    for (let i = 1; i < matches.length; i++) {
      const m = matches[i];
      if (m.value > best.value) best = m;
      else if (m.value === best.value && m.mode === "exact" && best.mode !== "exact") best = m;
    }
    return best;
  }

  function processTriggers(ev, triggersOrHandler, maybeHandler) {
    const handler = typeof triggersOrHandler === "function" ? triggersOrHandler : maybeHandler;
    if (typeof handler !== "function") return null;

    const enabled = state.settings?.triggersEnabled ?? true;
    if (!enabled) return null;

    const trg = (typeof triggersOrHandler === "object" && triggersOrHandler) ? triggersOrHandler : state.triggers;
    if (!trg || typeof trg !== "object") return null;

    const typeKey =
      ev?.type === "cheer" ? "cheer" :
      ev?.type === "tip" ? "tip" :
      (ev?.type === "sub-new" || ev?.type === "sub-re" || ev?.type === "sub-gift" || ev?.type === "sub-community") ? "sub" :
      ev?.type === "follow" ? "follow" :
      ev?.type === "raid" ? "raid" :
      null;

    if (!typeKey) return null;

    const m = triggerMatchOne(ev, trg[typeKey], typeKey);
    if (!m) return null;

    handler(m, ev);
    return m;
  }

  function eventGate(ev, gates) {
    if (!ev) return false;
    const k =
      ev.type === "cheer" ? "cheer" :
      ev.type === "tip" ? "tip" :
      (ev.type === "sub-new" || ev.type === "sub-re" || ev.type === "sub-gift" || ev.type === "sub-community") ? "sub" :
      ev.type === "follow" ? "follow" :
      ev.type === "raid" ? "raid" :
      ev.type === "points" ? "points" :
      ev.type === "message" ? "message" :
      ev.type === "button" ? "button" :
      null;

    if (!k) return true;
    if (!gates || typeof gates !== "object") return true;
    if (!hasOwn(gates, k)) return true;
    return !!gates[k];
  }

  function getConfig() {
    return {
      version: VERSION,
      debug: DEBUG,
      initOpts: Object.assign({}, state.initOpts),
      settings: Object.assign({}, state.settings),
      triggers: JSON.parse(JSON.stringify(state.triggers || {})),
      commandPermissions: JSON.parse(JSON.stringify(state.commandPerms || {})),
      hasFieldData: !!state.fieldData
    };
  }

  global.SEventLib = {
    init,
    loadFields,
    normalize,

    matchCommand,
    commandRouter,

    cooldown,

    queue,
    processTriggers,
    pickBestTrigger,
    eventGate,

    get fieldData() { return state.fieldData; },
    get settings() { return state.settings; },
    get triggers() { return state.triggers; },
    get commandPermissions() { return state.commandPerms; },

    getConfig,
    version: VERSION
  };
})(window);
