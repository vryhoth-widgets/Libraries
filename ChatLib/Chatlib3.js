(function (global) {
  function isFn(v) { return typeof v === "function"; }
  function isObj(v) { return v && typeof v === "object"; }
  function now() { return Date.now(); }
  function clampInt(n, d) { n = parseInt(n, 10); return Number.isFinite(n) ? n : d; }
  function safeLower(s) { return (s == null ? "" : String(s)).toLowerCase(); }
  function htmlEncode(s) { return String(s == null ? "" : s).replace(/[<>"^]/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function tryJsonParse(v) { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch (e) { return v; } }
  function uniqId(prefix) { return (prefix || "id") + "-" + Math.random().toString(36).slice(2) + "-" + now().toString(36); }
  function pick(obj, path, fallback) {
    if (!obj) return fallback;
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (!cur) return fallback;
      cur = cur[parts[i]];
    }
    return cur == null ? fallback : cur;
  }
  function isTruthy(v) { return v === true || v === "true" || v === 1 || v === "1" || v === "yes" || v === "on"; }
  function isFalsy(v) { return v === false || v === "false" || v === 0 || v === "0" || v === "no" || v === "off"; }

  function EventBus() {
    this._h = {};
  }
  EventBus.prototype.on = function (t, fn) {
    if (!this._h[t]) this._h[t] = [];
    this._h[t].push(fn);
    return function () {
      var arr = this._h[t] || [];
      var idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    }.bind(this);
  };
  EventBus.prototype.emit = function (t, payload) {
    var arr = this._h[t] || [];
    for (var i = 0; i < arr.length; i++) {
      try { arr[i](payload); } catch (e) {}
    }
  };

  function SoundService(getEnabled, getUrl) {
    this._getEnabled = getEnabled;
    this._getUrl = getUrl;
    this._last = {};
    this._cooldownMs = 250;
  }
  SoundService.prototype.play = function (key) {
    if (!this._getEnabled()) return;
    var url = this._getUrl(key);
    if (!url) return;
    var t = now();
    if (this._last[key] && (t - this._last[key]) < this._cooldownMs) return;
    this._last[key] = t;
    try { new Audio(url).play(); } catch (e) {}
  };

  function PronounsService() {
    this._base = "https://pronouns.alejo.io/api";
    this._pronouns = {};
    this._cache = {};
    this._loaded = false;
  }
  PronounsService.prototype._get = function (url) {
    return fetch(url).then(function (res) { if (!res.ok) return null; return res.json(); }).catch(function () { return null; });
  };
  PronounsService.prototype.load = function () {
    var self = this;
    if (this._loaded) return Promise.resolve(true);
    return this._get(this._base + "/pronouns").then(function (res) {
      if (res && Array.isArray(res)) {
        for (var i = 0; i < res.length; i++) {
          var p = res[i];
          if (p && p.name) self._pronouns[p.name] = p.display;
        }
      }
      self._loaded = true;
      return true;
    });
  };
  PronounsService.prototype.getUserPronoun = function (username) {
    var self = this;
    var u = safeLower(username);
    var cached = self._cache[u];
    if (cached && cached.expire > now()) {
      var pid = cached.pronoun_id;
      return Promise.resolve(pid ? (self._pronouns[pid] || null) : null);
    }
    return self._get(self._base + "/users/" + encodeURIComponent(u)).then(function (res) {
      var arr = Array.isArray(res) ? res : [];
      var first = arr[0] || {};
      self._cache[u] = Object.assign({}, first, { expire: now() + 1000 * 60 * 5 });
      var pid = self._cache[u].pronoun_id;
      return pid ? (self._pronouns[pid] || null) : null;
    });
  };

  function EmotesService() {
    this._external = null;
    this._externalUrl = "https://raw.githubusercontent.com/Jocando21/Lottie-Repo/refs/heads/main/emotes.json";
  }
  EmotesService.prototype._loadExternal = function () {
    var self = this;
    if (self._external) return Promise.resolve(self._external);
    return fetch(self._externalUrl).then(function (r) { return r.json(); }).then(function (json) {
      var flat = [];
      var arr = Array.isArray(json) ? json : [];
      for (var i = 0; i < arr.length; i++) {
        var e = arr[i];
        if (!e || !e.shortcuts || !e.image || !e.image.thumbnails || !e.image.thumbnails[0] || !e.image.thumbnails[0].url) continue;
        var url = e.image.thumbnails[0].url;
        for (var j = 0; j < e.shortcuts.length; j++) {
          var sc = e.shortcuts[j];
          if (!sc) continue;
          var key = String(sc).replace(/^:/, "").replace(/:$/, "").toLowerCase();
          flat.push({ key: key, image: url });
        }
      }
      self._external = flat;
      return flat;
    }).catch(function () {
      self._external = [];
      return self._external;
    });
  };
  EmotesService.prototype._isRemainingTextEmpty = function (data) {
    var text = String((data && data.text) || "");
    var emotes = (data && data.emotes) || [];
    if (emotes && emotes.length) {
      for (var i = 0; i < emotes.length; i++) {
        var n = emotes[i] && emotes[i].name;
        if (n) text = text.replace(String(n), "");
      }
    }
    return text;
  };
  EmotesService.prototype._emoteClass = function (messageType, emoteCount, emotesMode) {
    var cls = "emote-1";
    if (messageType === "solo_emote") {
      if (emoteCount >= 1 && emoteCount <= 4) cls = "emote-2";
      else if (emoteCount >= 5 && emoteCount <= 8) cls = "emote-3";
      else if (emoteCount > 8) cls = "emote-4";
    }
    if (emotesMode === "hidden") cls = "emote-1";
    return cls;
  };
  EmotesService.prototype.attachTwitch = function (msg, renderedText, mode, provider) {
    var text = htmlEncode(msg.text || "");
    var data = msg.emotes || [];
    var emoteCount = data.length;
    var rendertext = renderedText && renderedText.renderedText;
    var remaining = this._isRemainingTextEmpty(msg);
    if (msg.attachment && msg.attachment.media && msg.attachment.media.image && msg.attachment.media.image.src) {
      text = String(msg.text || "") + '<img src="' + String(msg.attachment.media.image.src) + '">';
    }
    var messageType = (rendertext === undefined || String(remaining || "").trim() === "") ? "solo_emote" : "msg_emote";
    var emoteClass = this._emoteClass(messageType, emoteCount, mode);

    var self = this;
    return text.replace(/([^\s]*)/gi, function (m, key) {
      var found = null;
      for (var i = 0; i < data.length; i++) {
        var e = data[i];
        if (!e || !e.name) continue;
        if (htmlEncode(e.name) === key) { found = e; break; }
      }
      if (!found) return key;
      var url = found.urls && (found.urls[4] || found.urls["4"] || found.urls[2] || found.urls["2"] || found.urls[1] || found.urls["1"]);
      if (!url) return key;
      if (safeLower(provider) === "twitch") {
        return '<img class="' + emoteClass + '" src="' + url + '"/>';
      }
      var coords = found.coords || { x: 0, y: 0 };
      var x = parseInt(coords.x || 0, 10);
      var y = parseInt(coords.y || 0, 10);
      return '<div class="' + emoteClass + '" style="display:inline-block;background-image:url(' + url + ');background-position:-' + x + "px -" + y + 'px;"></div>';
    });
  };
  EmotesService.prototype.attachYoutube = function (msg, renderedText, mode, emotedata) {
    var self = this;
    var text = htmlEncode(msg.text || "");
    var rendertext = renderedText && renderedText.renderedText;
    var remaining = this._isRemainingTextEmpty(msg);
    if (msg.attachment && msg.attachment.media && msg.attachment.media.image && msg.attachment.media.image.src) {
      text = String(msg.text || "") + '<img src="' + String(msg.attachment.media.image.src) + '">';
    }

    emotedata = tryJsonParse(emotedata);
    if (typeof emotedata === "string") return Promise.resolve(text);

    var local = [];
    var data = isObj(emotedata) ? emotedata : {};
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = data[k];
      if (!v || !Array.isArray(v.shortcuts) || typeof v.image !== "string") continue;
      for (var j = 0; j < v.shortcuts.length; j++) {
        var sc = v.shortcuts[j];
        if (!sc) continue;
        var clean = String(sc).replace(/^:/, "").replace(/:$/, "").toLowerCase();
        local.push({ key: clean, image: v.image });
      }
    }

    return self._loadExternal().then(function (external) {
      var matched = [];
      var tokens = text.split(/\s+/);
      for (var i2 = 0; i2 < tokens.length; i2++) {
        var tok = tokens[i2];
        var cleanTok = tok.replace(/^:/, "").replace(/:$/, "").toLowerCase();
        var foundLocal = null;
        for (var a = 0; a < local.length; a++) { if (local[a].key === cleanTok) { foundLocal = local[a]; break; } }
        if (foundLocal) matched.push(foundLocal.key);
        else if (tok.startsWith(":") && tok.endsWith(":")) {
          var foundExt = null;
          for (var b = 0; b < external.length; b++) { if (external[b].key === cleanTok) { foundExt = external[b]; break; } }
          if (foundExt) matched.push(foundExt.key);
        }
      }

      var messageType = (rendertext === undefined || String(remaining || "").trim() === "") ? "solo_emote" : "msg_emote";
      var emoteClass = self._emoteClass(messageType, matched.length, mode);

      var final = text.replace(/(:[a-zA-Z0-9_\-]+:|[a-zA-Z0-9_\-]+)/g, function (match) {
        var cleanKey = match.replace(/^:/, "").replace(/:$/, "").toLowerCase();
        var isWrapped = match.startsWith(":") && match.endsWith(":");

        var lm = null;
        for (var a2 = 0; a2 < local.length; a2++) { if (local[a2].key === cleanKey) { lm = local[a2]; break; } }
        if (lm) return '<img class="' + emoteClass + '" src="' + lm.image + '" alt="' + match + '" />';

        if (isWrapped) {
          var em = null;
          for (var b2 = 0; b2 < external.length; b2++) { if (external[b2].key === cleanKey) { em = external[b2]; break; } }
          if (em) return '<img class="' + emoteClass + '" src="' + em.image + '" alt="' + match + '" />';
        }
        return match;
      });

      return final;
    });
  };

  function Renderer(state) {
    this._s = state;
  }
  Renderer.prototype._container = function () {
    var sel = this._s.container;
    if (!sel) return null;
    if (typeof sel === "string") return document.querySelector(sel);
    if (sel && sel.nodeType === 1) return sel;
    return null;
  };
  Renderer.prototype._ensureOrientationClasses = function (container) {
    var side = this._s.settings.orientation || "bottom";
    container.classList.remove("left", "right", "top", "bottom", "side");
    if (side === "left" || side === "right") container.classList.add("side");
    container.classList.add(side);
    var wrapper = this._s.wrapperSelector ? document.querySelector(this._s.wrapperSelector) : document.querySelector(".chat-wrapper");
    if (wrapper) {
      if (side === "left") wrapper.style.transform = "scaleX(-1)";
      else wrapper.style.transform = "";
    }
  };
  Renderer.prototype._animatePush = function (container, el) {
    var side = this._s.settings.orientation || "bottom";
    this._ensureOrientationClasses(container);

    var rect = el.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;

    container.classList.remove("main-container-transition");

    if (side === "right") {
      container.style.marginLeft = (w) + "px";
      setTimeout(function () {
        container.style.marginLeft = "0px";
        container.style.marginRight = "0px";
        container.classList.add("main-container-transition");
      }, 15);
    } else if (side === "left") {
      container.style.marginLeft = (w) + "px";
      setTimeout(function () {
        container.style.marginLeft = "0px";
        container.style.marginRight = "0px";
        container.classList.add("main-container-transition");
      }, 15);
    } else if (side === "top") {
      container.style.marginBottom = (h) + "px";
      setTimeout(function () {
        container.style.marginBottom = "0px";
        container.style.marginTop = "0px";
        container.classList.add("main-container-transition");
      }, 15);
    } else {
      container.style.marginTop = (h) + "px";
      setTimeout(function () {
        container.style.marginTop = "0px";
        container.style.marginBottom = "0px";
        container.classList.add("main-container-transition");
      }, 15);
    }
  };
  Renderer.prototype._applyTimedHide = function (el) {
    var hideAfter = this._s.settings.hideAfter;
    var aniIn = this._s.settings.animationIn || "fadeIn";
    var aniOut = this._s.settings.animationOut || "fadeOut";
    if (hideAfter === 999) return;
    var ms = clampInt(hideAfter, 60) * 1000;
    setTimeout(function () {
      el.classList.remove(aniIn);
      el.classList.add(aniOut);
      setTimeout(function () {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }, 1000);
    }, ms);
  };
  Renderer.prototype._trim = function (container) {
    var max = clampInt(this._s.settings.messagesLimit, 0);
    if (!max || max <= 0) return;
    while (container.children.length > max) {
      var toRemove = container.children[0];
      if (this._s.settings.hideAfter !== 999) {
        if (toRemove && toRemove.parentNode) toRemove.parentNode.removeChild(toRemove);
      } else {
        toRemove.classList.add("fadeOut");
        (function (node) {
          setTimeout(function () { if (node && node.parentNode) node.parentNode.removeChild(node); }, 500);
        })(toRemove);
      }
    }
  };
  Renderer.prototype.removeByMsgId = function (msgId) {
    var container = this._container();
    if (!container) return;
    var el = container.querySelector('[data-msgid="' + CSS.escape(String(msgId)) + '"]');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };
  Renderer.prototype.removeBySender = function (senderId) {
    var container = this._container();
    if (!container) return;
    var nodes = container.querySelectorAll('[data-sender="' + CSS.escape(String(senderId)) + '"]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
  };
  Renderer.prototype.insertHTML = function (html, meta) {
    var container = this._container();
    if (!container) return null;
    var tmp = document.createElement("div");
    tmp.innerHTML = html.trim();
    var el = tmp.firstElementChild;
    if (!el) return null;
    container.appendChild(el);
    this._applyTimedHide(el);
    this._animatePush(container, el);
    this._trim(container);
    return el;
  };

  function Templates() {}
  Templates.prototype._asFn = function (v) {
    if (isFn(v)) return v;
    if (typeof v === "string") return function () { return v; };
    return null;
  };
  Templates.prototype.resolve = function (group, key, templates) {
    var g = templates && templates[group];
    if (!g) return null;
    if (g[key]) return this._asFn(g[key]) || null;
    if (g["default"]) return this._asFn(g["default"]) || null;
    return null;
  };

  function StreamChatWidget() {
    this._bus = new EventBus();
    this._templates = new Templates();
    this._pronouns = new PronounsService();
    this._emotes = new EmotesService();

    this._state = {
      inited: false,
      container: ".main-container",
      wrapperSelector: ".chat-wrapper",
      settings: {
        totalMessages: 0,
        messagesLimit: 0,
        hideAfter: 60,
        hideCommands: "no",
        ignoredUsers: [],
        botNames: [],
        displayBadge: "visible",
        diplayPronouns: "visible",
        orientation: "bottom",
        emotes: "visible",
        emotedata: "",
        channelName: "",
        provider: "auto",
        platform: "auto",
        animationIn: "fadeIn",
        animationOut: "fadeOut",
        badgesSVG: {},
        alerticons: {},
        sounds: {}
      },
      features: {
        emotes: true,
        pronouns: true,
        sounds: true,
        alerts: true
      },
      templates: null,
      alerts: {
        enabled: {
          sub: true,
          gifted_sub: true,
          gift_subs: true,
          cheer: true,
          raid: true,
          tip: true,
          follow: true,
          points: true,
          superchat: true,
          sponsor: true
        },
        messages: {}
      },
      cheerFilter: null
    };

    this._renderer = new Renderer(this._state);
    this._sound = new SoundService(
      function () { return !!this._state.features.sounds; }.bind(this),
      function (key) { return (this._state.settings.sounds && this._state.settings.sounds[key]) || null; }.bind(this)
    );

    this._registerCoreHandlers();
  }

  StreamChatWidget.prototype.on = function (eventName, fn) {
    return this._bus.on(eventName, fn);
  };

  StreamChatWidget.prototype.init = function (opts) {
    opts = opts || {};
    if (opts.container) this._state.container = opts.container;
    if (opts.wrapperSelector) this._state.wrapperSelector = opts.wrapperSelector;

    if (opts.features) this._state.features = Object.assign({}, this._state.features, opts.features);
    if (opts.templates) this._state.templates = opts.templates;
    if (opts.cheerFilter) this._state.cheerFilter = opts.cheerFilter;

    if (opts.settings) this._state.settings = Object.assign({}, this._state.settings, opts.settings);
    if (opts.alerts && opts.alerts.messages) this._state.alerts.messages = Object.assign({}, this._state.alerts.messages, opts.alerts.messages);
    if (opts.alerts && opts.alerts.enabled) this._state.alerts.enabled = Object.assign({}, this._state.alerts.enabled, opts.alerts.enabled);

    this._state.inited = true;
    return this;
  };

  StreamChatWidget.prototype.handleInit = function (detail) {
    if (!this._state.inited) this.init({});
    detail = detail || {};
    var fieldData = pick(detail, "fieldData", {}) || {};
    var channel = pick(detail, "channel", {}) || {};

    this._state.settings.hideAfter = clampInt(fieldData.hideAfter, this._state.settings.hideAfter);
    this._state.settings.messagesLimit = clampInt(fieldData.messagesLimit, this._state.settings.messagesLimit);
    this._state.settings.hideCommands = fieldData.hideCommands != null ? fieldData.hideCommands : this._state.settings.hideCommands;

    this._state.settings.channelName = channel.username || this._state.settings.channelName;
    this._state.settings.displayBadge = fieldData.badgeDisplay != null ? fieldData.badgeDisplay : this._state.settings.displayBadge;
    this._state.settings.diplayPronouns = fieldData.pronounsMode != null ? fieldData.pronounsMode : this._state.settings.diplayPronouns;
    this._state.settings.orientation = fieldData.orientation != null ? fieldData.orientation : this._state.settings.orientation;
    this._state.settings.emotes = fieldData.bigEmotes != null ? fieldData.bigEmotes : this._state.settings.emotes;
    if (fieldData.emotedata != null) this._state.settings.emotedata = fieldData.emotedata;

    var iu = fieldData.ignoredUsers;
    if (iu != null && iu !== "") {
      var list = String(iu).toLowerCase().replace(/\s+/g, "");
      this._state.settings.ignoredUsers = list ? list.split(",").filter(Boolean) : [];
    }
    var bn = fieldData.botNames;
    if (bn != null && bn !== "") {
      var list2 = String(bn).toLowerCase().replace(/\s+/g, "");
      this._state.settings.botNames = list2 ? list2.split(",").filter(Boolean) : [];
    }

    var smap = {
      gift_subs: fieldData.giftSubsSound,
      sub: fieldData.subSound,
      cheer: fieldData.cheersSound,
      raid: fieldData.raidSound,
      tip: fieldData.tipSound,
      follow: fieldData.followSound,
      points: fieldData.pointSound,
      superchat: fieldData.superchatSound,
      giftsound: fieldData.giftsound,
      gifted_subs: fieldData.giftedSubsSound
    };
    var s = Object.assign({}, this._state.settings.sounds || {});
    var keys = Object.keys(smap);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (smap[k]) s[k] = smap[k];
    }
    this._state.settings.sounds = s;

    this._state.alerts.messages = Object.assign({}, this._state.alerts.messages, {
      follow: fieldData.FollowAlertMessage,
      points: fieldData.PointsAlertMessage,
      gifted_sub: fieldData.GiftedSubAlertMessage,
      sub: fieldData.SubAlertMessage,
      gift_subs: fieldData.GiftSubAlertMessage || fieldData.GiftAlertMessage,
      raid: fieldData.RaidAlertMessage,
      cheer: fieldData.CheerAlertMessage,
      tip: fieldData.TipAlertMessage,
      superchat: fieldData.SuperchatAlertMessage
    });

    this._state.alerts.enabled = Object.assign({}, this._state.alerts.enabled, {
      sub: fieldData.ShowSubAlert != null ? isTruthy(fieldData.ShowSubAlert) : this._state.alerts.enabled.sub,
      gifted_sub: fieldData.ShowGiftedSubAlert != null ? isTruthy(fieldData.ShowGiftedSubAlert) : this._state.alerts.enabled.gifted_sub,
      gift_subs: (fieldData.ShowGiftSubAlert != null ? isTruthy(fieldData.ShowGiftSubAlert) : (fieldData.ShowGiftAlert != null ? isTruthy(fieldData.ShowGiftAlert) : this._state.alerts.enabled.gift_subs)),
      cheer: fieldData.ShowCheerAlert != null ? isTruthy(fieldData.ShowCheerAlert) : this._state.alerts.enabled.cheer,
      raid: fieldData.ShowRaidAlert != null ? isTruthy(fieldData.ShowRaidAlert) : this._state.alerts.enabled.raid,
      tip: fieldData.ShowTipAlert != null ? isTruthy(fieldData.ShowTipAlert) : this._state.alerts.enabled.tip,
      follow: fieldData.ShowFollowAlert != null ? isTruthy(fieldData.ShowFollowAlert) : this._state.alerts.enabled.follow,
      points: fieldData.ShowPointsAlert != null ? isTruthy(fieldData.ShowPointsAlert) : this._state.alerts.enabled.points,
      superchat: fieldData.ShowSuperchatAlert != null ? isTruthy(fieldData.ShowSuperchatAlert) : this._state.alerts.enabled.superchat
    });

    this._bus.emit("lifecycle:init", { detail: detail });

    if (this._state.features.pronouns && this._state.settings.diplayPronouns !== "hidden") {
      return this._pronouns.load().then(function () {
        this._bus.emit("feature:pronouns:ready", {});
        return true;
      }.bind(this));
    }
    return Promise.resolve(true);
  };

  StreamChatWidget.prototype.handleEvent = function (detail) {
    if (!this._state.inited) this.init({});
    detail = detail || {};
    var listener = detail.listener || pick(detail, "event.listener", null) || pick(detail, "event", {}).listener || null;
    var evt = detail.event || pick(detail, "event", null) || null;

    if (listener === "widget-button" || (evt && evt.listener === "widget-button")) {
      var field = pick(detail, "event.field", null) || pick(detail, "event", {}).field || null;
      this._bus.emit("widget:button", { detail: detail, field: field });
      return;
    }

    if (listener === "delete-message") {
      var mid = pick(detail, "event.msgId", null) || pick(detail, "event", {}).msgId || pick(detail, "event", {}).msgid;
      if (mid != null) this._renderer.removeByMsgId(mid);
      this._bus.emit("chat:delete-message", { id: mid, detail: detail });
      return;
    }
    if (listener === "delete-messages") {
      var sid = pick(detail, "event.userId", null) || pick(detail, "event", {}).userId;
      if (sid != null) this._renderer.removeBySender(sid);
      this._bus.emit("chat:delete-messages", { senderId: sid, detail: detail });
      return;
    }

    if (listener === "message") {
      this._handleMessage(detail);
      return;
    }

    this._handleAlert(listener, evt, detail);
  };

  StreamChatWidget.prototype._registerCoreHandlers = function () {
    var self = this;

    self.on("widget:button", function (p) {
      var field = p.field;
      if (!field) return;
      if (field === "testMessage") self.emitTestMessage();
      if (field === "demoMessages") self.emitDemoMessages(7, 3);
      if (field === "testFirstChatter") self.emitTestRoleMessage("first");
      if (field === "testUser") self.emitTestRoleMessage("viewer");
      if (field === "testVip") self.emitTestRoleMessage("vip");
      if (field === "testMod") self.emitTestRoleMessage("mod");
      if (field === "testSub") self.emitTestRoleMessage("subscriber");
      if (field === "testBroadcaster") self.emitTestRoleMessage("broadcaster");
    });
  };

  StreamChatWidget.prototype._detectPlatform = function (detail, evt) {
    var platform = this._state.settings.platform || "auto";
    if (platform !== "auto") return platform;
    var svc = pick(detail, "event.service", null) || pick(evt, "service", null) || pick(detail, "event.event.service", null) || null;
    if (svc) {
      svc = safeLower(svc);
      if (svc.includes("twitch")) return "twitch";
      if (svc.includes("youtube")) return "youtube";
    }
    var data = pick(detail, "event.data", null) || pick(evt, "data", null);
    if (data && data.authorDetails) return "youtube";
    if (data && data.tags && data.tags.badges != null) return "twitch";
    return "twitch";
  };

  StreamChatWidget.prototype._isBot = function (nick) {
    var bots = this._state.settings.botNames || [];
    return bots.indexOf(safeLower(nick)) !== -1;
  };

  StreamChatWidget.prototype._ignoreUser = function (nick) {
    var ig = this._state.settings.ignoredUsers || [];
    return ig.indexOf(safeLower(nick)) !== -1;
  };

  StreamChatWidget.prototype._resolveRoleTwitch = function (data) {
    var nick = data.nick || data.displayName || "";
    if (this._isBot(nick)) return "bot";

    var badgesArr = Array.isArray(data.badges) ? data.badges : [];
    var badgeTypes = {};
    for (var i = 0; i < badgesArr.length; i++) {
      var b = badgesArr[i];
      if (b && b.type) badgeTypes[b.type] = true;
    }
    if (badgeTypes["broadcaster"]) return "broadcaster";
    if (badgeTypes["lead_moderator"]) return "lead_moderator";
    if (badgeTypes["mod"]) return "mod";
    if (badgeTypes["vip"]) return "vip";
    if (badgeTypes["artist-badge"] || badgeTypes["artist"]) return "artist";
    if (badgeTypes["subscriber"] || badgeTypes["founder"]) return "subscriber";
    if (badgeTypes["premium"]) return "prime";

    var tagsBadges = (data.tags && data.tags.badges) ? String(data.tags.badges) : "";
    if (tagsBadges.includes("broadcaster")) return "broadcaster";
    if (tagsBadges.includes("lead_moderator")) return "lead_moderator";
    if (tagsBadges.includes("mod")) return "mod";
    if (tagsBadges.includes("vip")) return "vip";
    if (tagsBadges.includes("artist-badge")) return "artist";
    if (tagsBadges.includes("subscriber") || tagsBadges.includes("founder")) return "subscriber";
    if (tagsBadges.includes("premium")) return "prime";

    var firstMsg = data.tags ? data.tags["first-msg"] : data["first-msg"];
    if (Number(firstMsg) === 1) return "first";

    return "viewer";
  };

  StreamChatWidget.prototype._resolveRoleYoutube = function (data) {
    var nick = data.nick || data.displayName || "";
    if (this._isBot(nick)) return "bot";
    var ad = data.authorDetails || {};
    if (ad.isChatOwner) return "broadcaster";
    if (ad.isChatModerator) return "mod";
    if (ad.isChatSponsor) return "subscriber";
    return "viewer";
  };

  StreamChatWidget.prototype._badgesHTML = function (data, platform) {
    if (this._state.settings.displayBadge !== "visible") return "";
    var badges = Array.isArray(data.badges) ? data.badges : [];
    var out = "";
    for (var i = 0; i < badges.length; i++) {
      var b = badges[i];
      if (!b || !b.url) continue;
      out += '<img alt="" src="' + String(b.url) + '" class="badge"> ';
    }
    return out;
  };

  StreamChatWidget.prototype._templateCtxFromMessage = function (msgDTO) {
    var s = this._state.settings;
    var role = msgDTO.user.role;
    var isHighlight = !!msgDTO.meta.isHighlight;
    var highlightClass = isHighlight ? "highlight" : "";
    var side = s.orientation || "bottom";
    var badgeIcon = (s.displayBadge === "visible" && s.badgesSVG && s.badgesSVG[role]) ? s.badgesSVG[role] : "";
    return {
      id: msgDTO.id,
      platform: msgDTO.platform,
      role: role,
      username: msgDTO.user.displayName || msgDTO.user.name,
      userId: msgDTO.user.id,
      msgId: msgDTO.id,
      badgesHTML: msgDTO.user.badgesHTML,
      messageText: msgDTO.content.text,
      messageHTML: msgDTO.content.html,
      isAction: msgDTO.meta.isAction,
      isHighlight: isHighlight,
      highlightClass: highlightClass,
      side: side,
      pronouns: msgDTO.user.pronouns || null,
      displayPronounsMode: s.diplayPronouns || "visible",
      roleIcon: badgeIcon,
      alerticons: s.alerticons || {},
      sounds: s.sounds || {},
      raw: msgDTO.raw
    };
  };

  StreamChatWidget.prototype._templateCtxFromAlert = function (alertDTO) {
    var s = this._state.settings;
    var side = s.orientation || "bottom";
    return {
      id: alertDTO.id,
      platform: alertDTO.platform,
      type: alertDTO.type,
      user: alertDTO.user,
      amount: alertDTO.amount,
      message: alertDTO.message,
      msgId: alertDTO.id,
      side: side,
      alerticons: s.alerticons || {},
      sounds: s.sounds || {},
      raw: alertDTO.raw
    };
  };

  StreamChatWidget.prototype._defaultMessageTemplate = function (ctx) {
    var renderPronoun = ctx.pronouns ? String(ctx.pronouns) : "";
    if (ctx.displayPronounsMode === "hidden") renderPronoun = "";
    var pronSpan = renderPronoun ? '<span class="pronoun">' + renderPronoun + "</span>" : '<span class="pronoun"></span>';
    return (
      '<div data-sender="' + htmlEncode(ctx.userId) + '" data-msgid="' + htmlEncode(ctx.msgId) + '" class="message-row ' + ctx.highlightClass + " " + ctx.side + " " + ctx.role + '" id="msg-' + htmlEncode(ctx.id) + '">' +
        '<div class="message-container animated ' + htmlEncode(this._state.settings.animationIn || "fadeIn") + '">' +
          '<div class="user-box">' +
            '<span class="nick">' + htmlEncode(ctx.username) + "</span>" +
            pronSpan +
            '<span class="role-icon">' + (ctx.roleIcon || "") + "</span>" +
          "</div>" +
          '<div class="message-bubble"><div class="user-message">' + String(ctx.messageHTML) + "</div></div>" +
        "</div>" +
      "</div>"
    );
  };

  StreamChatWidget.prototype._defaultAlertTemplate = function (ctx) {
    var msg = String(ctx.message || "");
    return (
      '<div data-sender="' + htmlEncode(ctx.user || "") + '" data-msgid="' + htmlEncode(ctx.msgId) + '" class="message-row alert ' + htmlEncode(ctx.side) + " " + htmlEncode(ctx.type) + '" id="msg-' + htmlEncode(ctx.id) + '">' +
        '<div class="alert-container animated ' + htmlEncode(this._state.settings.animationIn || "fadeIn") + '">' +
          '<div class="alert-bubble"><span class="alert-message">' + msg + "</span></div>" +
        "</div>" +
      "</div>"
    );
  };

  StreamChatWidget.prototype._renderMessage = function (msgDTO) {
    var templates = this._state.templates || {};
    var ctx = this._templateCtxFromMessage(msgDTO);
    var fn = this._templates.resolve("message", ctx.role, templates);
    if (!fn) fn = this._defaultMessageTemplate.bind(this);
    var html = fn(ctx);
    this._renderer.insertHTML(html, { kind: "message", role: ctx.role, id: ctx.id });
  };

  StreamChatWidget.prototype._renderAlert = function (alertDTO) {
    var templates = this._state.templates || {};
    var ctx = this._templateCtxFromAlert(alertDTO);
    var fn = this._templates.resolve("alert", ctx.type, templates);
    if (!fn) fn = this._defaultAlertTemplate.bind(this);
    var html = fn(ctx);
    this._renderer.insertHTML(html, { kind: "alert", type: ctx.type, id: ctx.id });
  };

  StreamChatWidget.prototype._handleMessage = function (detail) {
    var evt = detail.event || {};
    var data = evt.data || {};
    var platform = this._detectPlatform(detail, evt);

    var text = data.text || "";
    if (String(text).startsWith("!") && this._state.settings.hideCommands === "yes") return;
    if (this._ignoreUser(data.nick || data.displayName || "")) return;

    var role = platform === "youtube" ? this._resolveRoleYoutube(data) : this._resolveRoleTwitch(data);
    var isHighlight = (data.tags && data.tags["msg-id"] === "highlighted-message") ? true : false;

    var badgesHTML = this._badgesHTML(data, platform);

    var provider = this._state.settings.provider || "auto";
    var renderedText = evt;
    var emotesMode = this._state.settings.emotes || "visible";

    var build = function (htmlMsg, pronoun) {
      var msgId = data.msgId || data.id || uniqId("msg");
      var userId = data.userId || pick(data, "authorDetails.channelId", "") || pick(data, "snippet.authorChannelId", "") || uniqId("user");
      var displayName = data.displayName || pick(data, "authorDetails.displayName", "") || (data.nick || "");
      var nick = data.nick || displayName || "";

      var msgDTO = {
        id: String(msgId),
        platform: platform,
        user: {
          id: String(userId),
          name: String(nick),
          displayName: String(displayName),
          role: role,
          badges: Array.isArray(data.badges) ? data.badges : [],
          badgesHTML: badgesHTML,
          isBot: role === "bot",
          pronouns: pronoun || null
        },
        content: {
          text: String(text),
          html: String(htmlMsg)
        },
        meta: {
          isAction: !!data.isAction,
          isHighlight: !!isHighlight,
          isFirstMessage: role === "first"
        },
        raw: { detail: detail }
      };

      this._state.settings.totalMessages = (this._state.settings.totalMessages || 0) + 1;
      this._bus.emit("chat:message", msgDTO);
      this._renderMessage(msgDTO);
    }.bind(this);

    var pronounsPromise = Promise.resolve(null);
    if (this._state.features.pronouns && platform === "twitch" && this._state.settings.diplayPronouns !== "hidden") {
      var uname = data.displayName || data.nick || "";
      if (uname) pronounsPromise = this._pronouns.getUserPronoun(uname);
    }

    if (this._state.features.emotes) {
      if (platform === "youtube") {
        return this._emotes.attachYoutube(data, renderedText, emotesMode, this._state.settings.emotedata).then(function (htmlMsg) {
          return pronounsPromise.then(function (p) { build(htmlMsg, p); });
        });
      } else {
        var htmlMsgT = this._emotes.attachTwitch(data, renderedText, emotesMode, provider);
        return pronounsPromise.then(function (p) { build(htmlMsgT, p); });
      }
    } else {
      return pronounsPromise.then(function (p) { build(htmlEncode(text), p); });
    }
  };

  StreamChatWidget.prototype._formatAlertMessage = function (template, user, amount, fallbackMsg) {
    var msg = template != null ? String(template) : String(fallbackMsg || "");
    msg = msg.replace("$User", String(user || ""));
    msg = msg.replace("$Amount", amount == null ? "" : String(amount));
    return msg;
  };

  StreamChatWidget.prototype._emitAlert = function (type, user, amount, message, platform, raw) {
    if (!this._state.features.alerts) return;

    var alertDTO = {
      id: uniqId("alert"),
      type: type,
      user: user || "",
      amount: amount,
      message: message || "",
      platform: platform,
      raw: raw
    };

    this._bus.emit("alert:" + type, alertDTO);
    this._renderAlert(alertDTO);

    var soundKey = null;
    if (type === "gift_subs") soundKey = "gift_subs";
    else if (type === "sub") soundKey = "sub";
    else if (type === "cheer") soundKey = "cheer";
    else if (type === "raid") soundKey = "raid";
    else if (type === "tip") soundKey = "tip";
    else if (type === "follow") soundKey = "follow";
    else if (type === "points") soundKey = "points";
    else if (type === "superchat") soundKey = "superchat";

    if (soundKey) this._sound.play(soundKey);
  };

  StreamChatWidget.prototype._handleAlert = function (listener, evt, detail) {
    if (!this._state.features.alerts) return;
    evt = evt || {};
    var platform = this._detectPlatform(detail, evt);

    var enabled = this._state.alerts.enabled;
    var msgs = this._state.alerts.messages;

    var name = evt.name || evt.sender || pick(evt, "data.username", "") || "";
    var amount = evt.amount;
    var msg = evt.message != null ? evt.message : "";
    var msgId = evt.msgId || evt.msgid || "0";

    if (listener === "subscriber-latest") {
      var gift = evt.bulkGifted;
      var gifted = evt.gifted;
      var isCommunityGift = evt.isCommunityGift;

      if (gift === true && enabled.gift_subs) {
        var m1 = this._formatAlertMessage(msgs.gift_subs, name, amount, "");
        this._emitAlert("gift_subs", name, amount, m1, platform, { listener: listener, evt: evt, detail: detail, msgId: msgId });
        return;
      }

      if (gift === undefined && gifted === undefined && enabled.sub) {
        var m2 = this._formatAlertMessage(msgs.sub, name, amount, msg || "");
        this._emitAlert("sub", name, amount, m2, platform, { listener: listener, evt: evt, detail: detail, msgId: msgId });
        return;
      }

      if (gift === undefined && gifted === true && enabled.sub && isCommunityGift === undefined) {
        var sender = evt.sender || name;
        var m3 = this._formatAlertMessage(msgs.gifted_sub || msgs.sub, sender, amount, "");
        this._emitAlert("sub", sender, amount, m3, platform, { listener: listener, evt: evt, detail: detail, msgId: msgId });
        return;
      }
    }

    if (listener === "cheer-latest" && enabled.cheer) {
      var self = this;
      var baseMsg = this._formatAlertMessage(msgs.cheer, name, amount, msg || "");
      var cheerFilter = this._state.cheerFilter || (global.SE_API && global.SE_API.cheerFilter ? global.SE_API.cheerFilter.bind(global.SE_API) : null);
      if (cheerFilter && isFn(cheerFilter)) {
        try {
          return Promise.resolve(cheerFilter(msg || "")).then(function (filtered) {
            var cleaned = (filtered == null ? "" : String(filtered)).trim();
            var finalMsg = self._formatAlertMessage(msgs.cheer, name, amount, cleaned || "");
            self._emitAlert("cheer", name, amount, finalMsg, platform, { listener: listener, evt: evt, detail: detail, msgId: msgId });
          }).catch(function () {
            self._emitAlert("cheer", name, amount, baseMsg, platform, { listener: listener, evt: evt, detail: detail, msgId: msgId });
          });
        } catch (e) {
          this._emitAlert("cheer", name, amount, baseMsg, platform, { listener: listener, evt: evt, detail: detail, msgId: msgId });
          return;
        }
      } else {
        this._emitAlert("cheer", name, amount, baseMsg, platform, { listener: listener, evt: evt, detail: detail, msgId: msgId });
        return;
      }
    }

    if (listener === "raid-latest" && enabled.raid) {
      var m4 = this._formatAlertMessage(msgs.raid, name, amount, "");
      this._emitAlert("raid", name, amount, m4, platform, { listener: listener, evt: evt, detail: detail, msgId: msgId });
      return;
    }

    if (listener === "tip-latest" && enabled.tip) {
      var m5 = this._formatAlertMessage(msgs.tip, name, amount, msg || "");
      this._emitAlert("tip", name, amount, m5, platform, { listener: listener, evt: evt, detail: detail, msgId: msgId });
      return;
    }

    if (listener === "follower-latest" && enabled.follow) {
      var m6 = this._formatAlertMessage(msgs.follow, name, "", "");
      this._emitAlert("follow", name, "", m6, platform, { listener: listener, evt: evt, detail: detail, msgId: msgId });
      return;
    }

    if (listener === "event" && evt.type === "channelPointsRedemption" && enabled.points) {
      var uname = pick(evt, "data.username", "") || name;
      var amt2 = pick(evt, "data.amount", 0);
      var msg2 = pick(evt, "data.message", "") || "";
      var m7 = this._formatAlertMessage(msgs.points, uname, amt2, msg2);
      this._emitAlert("points", uname, amt2, m7, platform, { listener: listener, evt: evt, detail: detail, msgId: msgId });
      return;
    }

    if (listener === "sponsor-latest") {
      var g = evt.bulkGifted;
      var gifted2 = evt.gifted;
      if (g === true && enabled.gift_subs) {
        var m8 = this._formatAlertMessage(msgs.gift_subs, name, amount, msg || "");
        this._emitAlert("gift_subs", name, amount, m8, "youtube", { listener: listener, evt: evt, detail: detail, msgId: msgId });
        return;
      }
      if (g === undefined && gifted2 === undefined && enabled.sub) {
        var m9 = this._formatAlertMessage(msgs.sub, name, "", "");
        this._emitAlert("sub", name, "", m9, "youtube", { listener: listener, evt: evt, detail: detail, msgId: msgId });
        return;
      }
      if (g === undefined && gifted2 === false && enabled.sub) {
        var m10 = this._formatAlertMessage(msgs.sub, name, "", msg || "");
        this._emitAlert("sub", name, "", m10, "youtube", { listener: listener, evt: evt, detail: detail, msgId: msgId });
        return;
      }
    }

    if (listener === "superchat-latest" && enabled.superchat) {
      var m11 = this._formatAlertMessage(msgs.superchat, name, amount, msg || "");
      this._emitAlert("superchat", name, amount, m11, "youtube", { listener: listener, evt: evt, detail: detail, msgId: msgId });
      return;
    }

    if (listener === "subscriber-latest" && enabled.follow) {
      var m12 = this._formatAlertMessage(msgs.follow, name, "", "");
      this._emitAlert("follow", name, "", m12, "youtube", { listener: listener, evt: evt, detail: detail, msgId: msgId });
      return;
    }
  };

  StreamChatWidget.prototype.emitTestRoleMessage = function (role) {
    var platform = this._state.settings.platform && this._state.settings.platform !== "auto" ? this._state.settings.platform : "twitch";
    var nameMap = {
      first: "FirstChatter",
      viewer: "RegularUser",
      vip: "VipUser",
      mod: "ModeratorUser",
      subscriber: "SubscriberUser",
      broadcaster: "BroadcasterUser",
      lead_moderator: "LeadModeratorUser",
      artist: "ArtistUser"
    };
    var username = nameMap[role] || "User";
    var data = {
      nick: username,
      displayName: username,
      userId: "10",
      msgId: uniqId("test"),
      text: "Test " + role,
      isAction: false,
      badges: [],
      tags: {}
    };

    if (platform === "twitch") {
      var badgeType = role === "lead_moderator" ? "lead_moderator" : (role === "artist" ? "artist-badge" : role);
      if (badgeType && badgeType !== "viewer" && badgeType !== "bot" && badgeType !== "first" && badgeType !== "prime") {
        data.badges = [{ type: badgeType, version: "1", url: "", description: badgeType }];
        data.tags.badges = badgeType + "/1";
      }
      if (role === "first") data.tags["first-msg"] = 1;
      if (role === "bot") this._state.settings.botNames = Array.from(new Set((this._state.settings.botNames || []).concat([safeLower(username)])));
    } else {
      data.authorDetails = { isChatOwner: role === "broadcaster", isChatModerator: role === "mod", isChatSponsor: role === "subscriber" };
      if (role === "bot") this._state.settings.botNames = Array.from(new Set((this._state.settings.botNames || []).concat([safeLower(username)])));
    }

    this._handleMessage({ listener: "message", event: { service: platform, data: data, renderedText: undefined } });
  };

  StreamChatWidget.prototype.emitTestMessage = function () {
    var platform = this._state.settings.platform && this._state.settings.platform !== "auto" ? this._state.settings.platform : "twitch";
    if (platform === "youtube") {
      var fakeMessage = "hey streamer, how are you?";
      var fakeUsername = "User";
      var data = {
        kind: "youtube#liveChatMessage",
        id: "LCC.example",
        snippet: { type: "textMessageEvent", publishedAt: new Date().toISOString(), displayMessage: fakeMessage, textMessageDetails: { messageText: fakeMessage } },
        authorDetails: { displayName: fakeUsername, isChatOwner: false, isChatSponsor: false, isChatModerator: false },
        msgId: "LCC.example",
        userId: "UCexample123",
        nick: fakeUsername,
        badges: [],
        displayName: fakeUsername,
        isAction: false,
        time: now(),
        tags: [],
        displayColor: null,
        channel: "UCexample123",
        text: fakeMessage,
        emotes: [],
        avatar: ""
      };
      this._handleMessage({ listener: "message", event: { service: "youtube", data: data, renderedText: undefined } });
      return;
    }

    var s = this._state.settings;
    s._textVar = (s._textVar || 0) + 1;
    if (s._textVar > 7) s._textVar = 1;

    var fakeMessageT = "Hey, this is a simple message.";
    var fakeBadges = "";
    var fakeUsernameT = "vryhoth";
    var fakeRender = undefined;
    var fakeBadgesB = [{ type: "", version: "1", url: "https://static-cdn.jtvnw.net/badges/v1/b817aba4-fad8-49e2-b88a-7cc744dfa6ec/3", description: "" }];

    if (s._textVar === 1) {
      fakeMessageT = "Wow, now it's a new message, but this time I'm the streamer!";
      fakeBadges = "broadcaster/1";
      fakeUsernameT = "vryhoth";
      fakeBadgesB = [{ type: "broadcaster", version: "1", url: "https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/3", description: "broadcaster" }];
    } else if (s._textVar === 2) {
      fakeMessageT = "Now I'm VIP! I'm starting to feel special, so now I'm going to write a much bigger message than the rest, just because I can!";
      fakeBadges = "vip/1";
      fakeUsernameT = "vryhoth";
      fakeBadgesB = [{ type: "vip", version: "1", url: "https://static-cdn.jtvnw.net/badges/v1/b817aba4-fad8-49e2-b88a-7cc744dfa6ec/3", description: "vip" }];
    } else if (s._textVar === 3) {
      fakeMessageT = "Hey I can send emotes!!! Kappa";
      fakeBadges = "subscriber/1";
      fakeUsernameT = "vryhoth";
      fakeBadgesB = [{ type: "subscriber", version: "1", url: "https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2ff4adfae661/3", description: "subscriber" }];
    } else if (s._textVar === 4) {
      fakeMessageT = "FeelsAmazingMan";
      fakeRender = '<img src="https://cdn.betterttv.net/emote/5733ff12e72c3c0814233e20/1x" srcset="https://cdn.betterttv.net/emote/5733ff12e72c3c0814233e20/1x 1x, https://cdn.betterttv.net/emote/5733ff12e72c3c0814233e20/2x 2x, https://cdn.betterttv.net/emote/5733ff12e72c3c0814233e20/3x 4x" title="FeelsAmazingMan" class="emote">';
      fakeBadges = "turbo/1";
      fakeUsernameT = "JocandoVT";
      fakeBadgesB = [{ type: "turbo", version: "1", url: "https://static-cdn.jtvnw.net/badges/v1/bd444ec6-8f34-4bf9-91f4-af1e3428d80f/3", description: "turbo" }];
    } else if (s._textVar === 5) {
      fakeMessageT = "I love this emote! FeelsAmazingMan";
      fakeBadges = "artist-badge/1";
      fakeUsernameT = "JocandoVT";
      fakeBadgesB = [{ type: "artist-badge", version: "1", url: "https://static-cdn.jtvnw.net/badges/v1/4300a897-03dc-4e83-8c0e-c332fee7057f/3", description: "Artist" }];
    } else if (s._textVar === 6) {
      fakeMessageT = "Please follow the chat rules!";
      fakeBadges = "lead_moderator/1";
      fakeUsernameT = "LeadModUser";
      fakeBadgesB = [{ type: "lead_moderator", version: "1", url: "https://static-cdn.jtvnw.net/badges/v1/0822047b-65e0-46f2-94a9-d1091d685d33/3", description: "Lead Moderator" }];
    } else if (s._textVar === 7) {
      fakeMessageT = "Please follow the chat rules!";
      fakeBadges = "mod/1";
      fakeUsernameT = "JocandoVT";
      fakeBadgesB = [{ type: "mod", version: "1", url: "https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/3", description: "Mod" }];
    }

    var dataT = {
      time: now(),
      tags: {
        badges: fakeBadges,
        "display-name": fakeUsernameT,
        "first-msg": s._textVar === 1 ? 1 : 0
      },
      nick: fakeUsernameT,
      userId: "100135110",
      displayName: fakeUsernameT,
      displayColor: "#5B99FF",
      badges: fakeBadgesB,
      channel: "vryhoth",
      text: fakeMessageT,
      isAction: false,
      emotes: [
        { type: "twitch", name: "Kappa", id: "356", gif: false, urls: { 1: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/light/1.0", 2: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/light/2.0", 4: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/light/3.0" }, start: 0, end: 4 },
        { type: "bttv", name: "FeelsAmazingMan", id: "557546", gif: false, urls: { 1: "https://cdn.betterttv.net/emote/5733ff12e72c3c0814233e20/1x", 2: "https://cdn.betterttv.net/emote/5733ff12e72c3c0814233e20/2x", 4: "https://cdn.betterttv.net/emote/5733ff12e72c3c0814233e20/3x" }, start: 46, end: 50 }
      ],
      msgId: uniqId("twitch")
    };

    this._handleMessage({ listener: "message", event: { service: "twitch", data: dataT, renderedText: fakeRender } });
  };

  StreamChatWidget.prototype.emitDemoMessages = function (count, intervalSeconds) {
    count = clampInt(count, 7);
    intervalSeconds = clampInt(intervalSeconds, 3);
    var self = this;
    var c = 0;
    var run = function () {
      self.emitTestMessage();
      c++;
      if (c >= count) clearInterval(id);
    };
    run();
    var id = setInterval(run, intervalSeconds * 1000);
  };

  StreamChatWidget.prototype.bridge = function () {
    var self = this;
    window.addEventListener("onEventReceived", function (e) { self.handleEvent(e.detail); });
    window.addEventListener("onWidgetLoad", function (e) { self.handleInit(e.detail); });
    return this;
  };

  global.StreamChatWidget = new StreamChatWidget();
})(typeof window !== "undefined" ? window : this);
