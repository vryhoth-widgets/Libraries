(function (root, factory) {
  if (typeof define === "function" && define.amd) define([], factory);
  else if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ChatWidgetLib = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var PRONOUNS_API_BASE = "https://pronouns.alejo.io/api";
  var PRONOUNS_API = {
    user: function (username) { return PRONOUNS_API_BASE + "/users/" + username; },
    pronouns: PRONOUNS_API_BASE + "/pronouns"
  };

  function isObject(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function clampNum(n, d) { n = Number(n); return isFinite(n) ? n : d; }
  function safeStr(x, d) { return typeof x === "string" ? x : (x == null ? (d || "") : String(x)); }
  function html_encode(s) {
    s = safeStr(s, "");
    return s.replace(/[<>"^]/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; });
  }
  function normalizeListCSV(v) {
    if (v == null) return [];
    var s = safeStr(v, "").trim();
    if (!s) return [];
    return s.toLowerCase().replace(/\s+/g, "").split(",").filter(Boolean);
  }
  function shallowMerge(a, b) {
    var o = {};
    if (a) for (var k in a) o[k] = a[k];
    if (b) for (var k2 in b) o[k2] = b[k2];
    return o;
  }
  function deepMerge(base, extra) {
    var out = Array.isArray(base) ? base.slice() : shallowMerge(base || {}, {});
    if (!isObject(extra)) return out;
    for (var k in extra) {
      var v = extra[k];
      if (isObject(v) && isObject(out[k])) out[k] = deepMerge(out[k], v);
      else out[k] = v;
    }
    return out;
  }
  function now() { return Date.now ? Date.now() : new Date().getTime(); }

  function safeJSONParseMaybe(v) {
    if (typeof v !== "string") return v;
    var s = v.trim();
    if (!s) return v;
    if (s[0] !== "{" && s[0] !== "[") return v;
    try { return JSON.parse(s); } catch (e) { return v; }
  }

  function fetchJSON(url) {
    if (typeof fetch !== "function") return Promise.resolve(null);
    return fetch(url).then(function (res) {
      if (!res || !res.ok) return null;
      return res.json().catch(function () { return null; });
    }).catch(function () { return null; });
  }

  function playSound(url) {
    try {
      if (!url) return;
      var a = new Audio(url);
      a.play();
    } catch (e) {}
  }

  function getBadgeStringFromTags(tags) {
    if (!tags) return "";
    var b = tags["badges"];
    if (typeof b === "string") return b;
    return "";
  }

  function badgesContain(tags, needle) {
    var b = getBadgeStringFromTags(tags);
    if (!b) return false;
    return b.indexOf(needle) !== -1;
  }

  function badgesArrayHasType(badgesArr, type) {
    if (!Array.isArray(badgesArr)) return false;
    for (var i = 0; i < badgesArr.length; i++) {
      var t = badgesArr[i] && (badgesArr[i].type || badgesArr[i].id || badgesArr[i].name);
      if (t === type) return true;
      if (typeof t === "string" && t.toLowerCase() === type.toLowerCase()) return true;
    }
    return false;
  }

  function isRemainingTextEmptyFromEmotes(data) {
    if (!data) return "";
    var text = safeStr(data.text, "");
    var emotes = data.emotes;
    if (Array.isArray(emotes) && emotes.length) {
      for (var i = 0; i < emotes.length; i++) {
        var nm = emotes[i] && emotes[i].name;
        if (!nm) continue;
        text = text.split(nm).join("");
      }
    }
    return text;
  }

  function attachEmotesTwitch(state, message, renderedText, messagedata) {
    var text = html_encode(safeStr(message.text, ""));
    var data = Array.isArray(message.emotes) ? message.emotes : [];
    var emoteCount = data.length;
    var rendertext = renderedText && renderedText.renderedText;
    var result = isRemainingTextEmptyFromEmotes(messagedata);
    if (message.attachment && message.attachment.media && message.attachment.media.image && message.attachment.media.image.src) {
      text = safeStr(message.text, "") + '<img src="' + message.attachment.media.image.src + '">';
    }
    var messageType = (rendertext === undefined || safeStr(result, "").trim() === "") ? "solo emote" : "msg-emote";
    var emoteClass = "emote-1";
    if (messageType === "solo emote") {
      if (emoteCount >= 1 && emoteCount <= 4) emoteClass = "emote-2";
      else if (emoteCount >= 5 && emoteCount <= 8) emoteClass = "emote-3";
      else if (emoteCount > 8) emoteClass = "emote-4";
    }
    if (state.Config.emotes === "hidden") emoteClass = "emote-1";

    return text.replace(/([^\s]*)/gi, function (m, key) {
      var found = null;
      for (var i = 0; i < data.length; i++) {
        if (html_encode(safeStr(data[i].name, "")) === key) { found = data[i]; break; }
      }
      if (!found) return key;
      var urls = found.urls || {};
      var url = urls[4] || urls["4"] || urls[2] || urls["2"] || urls[1] || urls["1"] || "";
      if (!url) return key;
      if (state.Config.provider === "twitch" || state.Config.provider === "Twitch") {
        return '<img class="' + emoteClass + '" src="' + url + '"/>';
      } else {
        if (typeof found.coords === "undefined") found.coords = { x: 0, y: 0 };
        var x = parseInt(found.coords.x, 10); if (!isFinite(x)) x = 0;
        var y = parseInt(found.coords.y, 10); if (!isFinite(y)) y = 0;
        return '<div class="' + emoteClass + '" style="display: inline-block; background-image: url(' + url + "); background-position: -" + x + "px -" + y + 'px;"></div>';
      }
    });
  }

  var cachedExternalEmotes = null;
  var cachedExternalEmotesPromise = null;

  function loadExternalEmotesOnce(url) {
    if (cachedExternalEmotes) return Promise.resolve(cachedExternalEmotes);
    if (cachedExternalEmotesPromise) return cachedExternalEmotesPromise;
    cachedExternalEmotesPromise = fetchJSON(url).then(function (externalData) {
      var arr = Array.isArray(externalData) ? externalData : [];
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var e = arr[i] || {};
        var shortcuts = Array.isArray(e.shortcuts) ? e.shortcuts : [];
        var thumb = e.image && e.image.thumbnails && e.image.thumbnails[0] && e.image.thumbnails[0].url;
        if (!thumb || !shortcuts.length) continue;
        for (var j = 0; j < shortcuts.length; j++) {
          var sc = safeStr(shortcuts[j], "");
          if (!sc) continue;
          out.push({
            key: sc.replace(/^:/, "").replace(/:$/, "").toLowerCase(),
            image: thumb
          });
        }
      }
      cachedExternalEmotes = out;
      return cachedExternalEmotes;
    }).catch(function () {
      cachedExternalEmotes = [];
      return cachedExternalEmotes;
    });
    return cachedExternalEmotesPromise;
  }

  function buildLocalEmotesFromConfig(emotedata) {
    var out = [];
    var data = emotedata || {};
    for (var key in data) {
      var value = data[key];
      if (!value || typeof value.image !== "string") continue;
      var shortcuts = Array.isArray(value.shortcuts) ? value.shortcuts : [];
      for (var i = 0; i < shortcuts.length; i++) {
        var sc = safeStr(shortcuts[i], "");
        if (!sc) continue;
        var cleanKey = sc.replace(/^:/, "").replace(/:$/, "").toLowerCase();
        out.push({ key: cleanKey, image: value.image });
      }
    }
    return out;
  }

  function attachEmotesYouTube(state, message, renderedText, messagedata) {
    var text = html_encode(safeStr(message.text, ""));
    var rendertext = renderedText && renderedText.renderedText;
    var result = isRemainingTextEmptyFromEmotes(messagedata);

    if (message.attachment && message.attachment.media && message.attachment.media.image && message.attachment.media.image.src) {
      text = safeStr(message.text, "") + '<img src="' + message.attachment.media.image.src + '">';
    }

    state.Config.emotedata = safeJSONParseMaybe(state.Config.emotedata);
    if (typeof state.Config.emotedata === "string") {
      return Promise.resolve(text);
    }

    var localEmotes = buildLocalEmotesFromConfig(state.Config.emotedata);

    var externalURL = safeStr(state.Config.externalEmotesUrl, "https://raw.githubusercontent.com/Jocando21/Lottie-Repo/refs/heads/main/emotes.json");
    return loadExternalEmotesOnce(externalURL).then(function (externalEmotes) {
      var tokens = text.split(/\s+/);
      var matched = [];
      for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];
        var clean = token.replace(/^:/, "").replace(/:$/, "").toLowerCase();
        var foundLocal = null;
        for (var j = 0; j < localEmotes.length; j++) {
          if (localEmotes[j].key === clean) { foundLocal = localEmotes[j]; break; }
        }
        if (foundLocal) matched.push(clean);
        else if (token.startsWith(":") && token.endsWith(":")) {
          var foundExt = null;
          for (var k = 0; k < externalEmotes.length; k++) {
            if (externalEmotes[k].key === clean) { foundExt = externalEmotes[k]; break; }
          }
          if (foundExt) matched.push(clean);
        }
      }

      var emoteCount = matched.length;
      var messageType = (rendertext === undefined || safeStr(result, "").trim() === "") ? "solo emote" : "msg-emote";
      var emoteClass = "emote-1";
      if (messageType === "solo emote") {
        if (emoteCount >= 1 && emoteCount <= 4) emoteClass = "emote-2";
        else if (emoteCount >= 5 && emoteCount <= 8) emoteClass = "emote-3";
        else if (emoteCount > 8) emoteClass = "emote-4";
      }
      if (state.Config.emotes === "hidden") emoteClass = "emote-1";

      var re = /(:[a-zA-Z0-9_\-]+:|[a-zA-Z0-9_\-]+)/g;
      var final = text.replace(re, function (match) {
        var cleanKey = match.replace(/^:/, "").replace(/:$/, "").toLowerCase();
        var isWrapped = match.startsWith(":") && match.endsWith(":");

        var localMatch = null;
        for (var i = 0; i < localEmotes.length; i++) {
          if (localEmotes[i].key === cleanKey) { localMatch = localEmotes[i]; break; }
        }
        if (localMatch) return '<img class="' + emoteClass + '" src="' + localMatch.image + '" alt="' + match + '" />';

        if (isWrapped) {
          var externalMatch = null;
          for (var j = 0; j < externalEmotes.length; j++) {
            if (externalEmotes[j].key === cleanKey) { externalMatch = externalEmotes[j]; break; }
          }
          if (externalMatch) return '<img class="' + emoteClass + '" src="' + externalMatch.image + '" alt="' + match + '" />';
        }
        return match;
      });

      return final;
    }).catch(function () {
      return text;
    });
  }

  function resolveProviderFromPayload(obj) {
    var d = obj && obj.detail;
    var e = d && d.event;
    var svc = e && e.service;
    if (svc === "twitch") return "twitch";
    if (svc === "youtube") return "youtube";
    return null;
  }

  function buildBadgesHTML(state, data) {
    if (state.Config.displayBadge !== "visible") return "";
    var badges = data && data.badges;
    if (!Array.isArray(badges)) return "";
    var out = "";
    for (var i = 0; i < badges.length; i++) {
      var b = badges[i] || {};
      var url = b.url;
      if (!url) continue;
      out += '<img alt="" src="' + url + '" class="badge"> ';
    }
    return out;
  }

  function detectRoleTwitch(state, data) {
    var nick = safeStr(data && (data.nick || data.displayName), "").toLowerCase();
    if (state.Config.botNames.indexOf(nick) !== -1) return "bot";

    var tags = (data && data.tags) || {};
    var badgesStr = getBadgeStringFromTags(tags);
    var badgesArr = Array.isArray(data && data.badges) ? data.badges : [];

    if (badgesContain(tags, "broadcaster") || badgesArrayHasType(badgesArr, "broadcaster")) return "broadcaster";
    if (badgesContain(tags, "lead_moderator") || badgesArrayHasType(badgesArr, "lead_moderator")) return "lead_mod";
    if (badgesContain(tags, "mod") || badgesArrayHasType(badgesArr, "moderator") || badgesArrayHasType(badgesArr, "mod")) return "mod";
    if (badgesContain(tags, "vip") || badgesArrayHasType(badgesArr, "vip")) return "vip";
    if (badgesContain(tags, "artist-badge") || badgesArrayHasType(badgesArr, "artist-badge") || badgesArrayHasType(badgesArr, "artist")) return "artist";
    if (badgesContain(tags, "subscriber") || badgesContain(tags, "founder") || badgesArrayHasType(badgesArr, "subscriber") || badgesArrayHasType(badgesArr, "founder")) return "subscriber";
    if (badgesContain(tags, "premium") || badgesArrayHasType(badgesArr, "premium")) return "prime";
    if (Number(tags["first-msg"]) === 1) return "first";
    if (badgesStr && badgesStr.indexOf("first") !== -1) return "first";
    return "viewer";
  }

  function detectRoleYouTube(state, data) {
    var nick = safeStr(data && (data.nick || data.displayName), "").toLowerCase();
    if (state.Config.botNames.indexOf(nick) !== -1) return "bot";

    var author = data && data.authorDetails;
    if (author && author.isChatOwner) return "broadcaster";
    if (author && author.isChatModerator) return "mod";
    if (author && author.isChatSponsor) return "member";
    return "viewer";
  }

  function shouldIgnoreMessage(state, data) {
    var text = safeStr(data && data.text, "");
    if (text && text.charAt(0) === "!" && state.Config.hideCommands === "yes") return true;
    var nick = safeStr(data && data.nick, "");
    if (nick && state.Config.ignoredUsers.indexOf(nick.toLowerCase()) !== -1) return true;
    return false;
  }

  function defaultTemplates() {
    return {
      message: [
        {
          roles: ["*"],
          render: function (ctx) {
            return (
              '<div data-sender="' + ctx.uid + '" data-msgid="' + ctx.msgId + '" class="message-row ' + (ctx.highlightClass || "") + " " + ctx.side + " " + ctx.role + '" id="msg-' + ctx.messageId + '">' +
                '<div class="message-container animated">' +
                  '<div class="user-box">' +
                    '<span class="nick">' + ctx.username + "</span>" +
                    (ctx.pronouns ? '<span class="pronoun">' + ctx.pronouns + "</span>" : "") +
                    (ctx.icon ? '<span class="role-icon">' + ctx.icon + "</span>" : "") +
                  "</div>" +
                  '<div class="message-bubble"><div class="user-message">' + ctx.messageHTML + "</div></div>" +
                "</div>" +
              "</div>"
            );
          }
        }
      ],
      alert: {
        "*": function (ctx) {
          return (
            '<div data-sender="' + ctx.uid + '" data-msgid="' + ctx.msgId + '" class="message-row ' + (ctx.highlightClass || "") + " alert " + ctx.side + " " + ctx.role + '" id="msg-' + ctx.messageId + '">' +
              '<div class="alert-container animated"><div class="alert-bubble">' +
                (ctx.icon ? ctx.icon : "") +
                '<span class="alert-message">' + ctx.alertHTML + "</span>" +
                (ctx.eicon ? '<span class="icon2">' + ctx.eicon + "</span>" : "") +
              "</div></div>" +
            "</div>"
          );
        }
      }
    };
  }

  function normalizeTemplates(tpl) {
    var base = defaultTemplates();
    var merged = deepMerge(base, tpl || {});
    if (!Array.isArray(merged.message)) {
      if (typeof merged.message === "function") merged.message = [{ roles: ["*"], render: merged.message }];
      else merged.message = base.message;
    } else {
      for (var i = 0; i < merged.message.length; i++) {
        var it = merged.message[i];
        if (typeof it === "function") merged.message[i] = { roles: ["*"], render: it };
        else {
          if (!it.roles || !Array.isArray(it.roles)) it.roles = ["*"];
          if (typeof it.render !== "function" && typeof it.template === "function") it.render = it.template;
        }
      }
    }
    if (!merged.alert || typeof merged.alert !== "object") merged.alert = base.alert;
    return merged;
  }

  function resolveMessageTemplate(state, role) {
    var arr = state.templates.message;
    for (var i = 0; i < arr.length; i++) {
      var t = arr[i];
      if (!t || typeof t.render !== "function") continue;
      var roles = t.roles || ["*"];
      if (roles.indexOf(role) !== -1 || roles.indexOf("*") !== -1) return t.render;
    }
    return arr[0] && arr[0].render ? arr[0].render : function () { return ""; };
  }

  function resolveAlertTemplate(state, eventKey) {
    var a = state.templates.alert || {};
    var fn = a[eventKey];
    if (typeof fn === "function") return fn;
    var star = a["*"];
    if (typeof star === "function") return star;
    return function () { return ""; };
  }

  function buildIconForRole(state, role) {
    if (state.Config.displayBadge !== "visible") return "";
    var map = state.Config.badgesSVG || {};
    return map[role] || "";
  }

  function computeSide(state) {
    return safeStr(state.Config.orientation, "bottom");
  }

  function computeHighlightClass(data) {
    var tags = data && data.tags;
    if (!tags) return "";
    return tags["msg-id"] === "highlighted-message" ? "highlight" : "";
  }

  function ensureProvider(state) {
    if (state.provider) return state.provider;
    state.provider = state.Config.provider ? safeStr(state.Config.provider, "").toLowerCase() : null;
    if (state.provider === "youtube") return "youtube";
    if (state.provider === "twitch") return "twitch";
    return state.provider;
  }

  function maybeLoadProviderFromSEChannel(state, channelId) {
    if (!channelId || typeof fetch !== "function") return Promise.resolve(null);
    var url = "https://api.streamelements.com/kappa/v2/channels/" + channelId + "/";
    return fetchJSON(url).then(function (profile) {
      if (profile && profile.provider) {
        state.Config.provider = profile.provider;
        state.provider = safeStr(profile.provider, "").toLowerCase();
      }
      return profile;
    });
  }

  function makeCtxBase(state, data, role, messageHTML, badgesHTML, extra) {
    state.Config.totalMessages += 1;
    var ctx = {
      provider: state.provider || ensureProvider(state) || "unknown",
      uid: safeStr(data && (data.userId || data.authorDetails && data.authorDetails.channelId), ""),
      msgId: safeStr(data && (data.msgId || data.id), ""),
      messageId: state.Config.totalMessages,
      username: safeStr(data && (data.displayName || data.nick || (data.authorDetails && data.authorDetails.displayName)), ""),
      role: role,
      side: computeSide(state),
      highlightClass: computeHighlightClass(data),
      badgesHTML: badgesHTML || "",
      icon: buildIconForRole(state, role),
      eicon: "",
      pronouns: "",
      messageHTML: messageHTML || "",
      amount: "",
      alertHTML: ""
    };
    if (extra) for (var k in extra) ctx[k] = extra[k];
    return ctx;
  }

  function initPronounsIfNeeded(state) {
    if (state.pronounsLoaded) return Promise.resolve(true);
    return fetchJSON(PRONOUNS_API.pronouns).then(function (res) {
      state.Widget.pronouns = {};
      if (Array.isArray(res)) {
        for (var i = 0; i < res.length; i++) {
          var p = res[i];
          if (p && p.name && p.display) state.Widget.pronouns[p.name] = p.display;
        }
      }
      state.pronounsLoaded = true;
      return true;
    }).catch(function () {
      state.pronounsLoaded = true;
      return false;
    });
  }

  function getUserPronoun(state, username) {
    var u = safeStr(username, "").toLowerCase();
    if (!u) return Promise.resolve(null);
    var cached = state.Widget.pronounsCache[u];
    if (cached && cached.expire && cached.expire >= now()) {
      if (!cached.pronoun_id) return Promise.resolve(null);
      return Promise.resolve(state.Widget.pronouns[cached.pronoun_id] || null);
    }
    return fetchJSON(PRONOUNS_API.user(u)).then(function (res) {
      var arr = Array.isArray(res) ? res : [];
      var newPronouns = arr[0] || {};
      state.Widget.pronounsCache[u] = shallowMerge(newPronouns, { expire: now() + 1000 * 60 * 5 });
      var pr = state.Widget.pronounsCache[u];
      if (!pr.pronoun_id) return null;
      return state.Widget.pronouns[pr.pronoun_id] || null;
    }).catch(function () {
      return null;
    });
  }

  function buildAlertIconsAndSounds(state, roleKey) {
    var ai = state.Config.alerticons || {};
    var s = state.Config.sounds || {};
    var out = { icon1: "", icon2: "", sound: "" };

    if (roleKey === "gift-subs") { out.icon1 = ai.Strawberry || ""; out.icon2 = ai.Strawberry || ""; out.sound = s.giftSubsSound || ""; }
    else if (roleKey === "sub") { out.icon1 = ai.Strawberry || ""; out.icon2 = ai.Strawberry || ""; out.sound = s.subSound || ""; }
    else if (roleKey === "cheers") { out.icon1 = ai.spraklestrawberry1 || ""; out.icon2 = ""; out.sound = s.cheersSound || ""; }
    else if (roleKey === "raid") { out.icon1 = ai.Sparkledot || ""; out.icon2 = ai.Sparkledot || ""; out.sound = s.raidSound || ""; }
    else if (roleKey === "tip") { out.icon1 = ""; out.icon2 = ai.spraklestrawberry1 || ""; out.sound = s.tipSound || ""; }
    else if (roleKey === "follow") { out.icon1 = ai.sparkle || ""; out.icon2 = ""; out.sound = s.followSound || ""; }
    else if (roleKey === "points") { out.icon1 = ai.spraklestrawberry2 || ""; out.icon2 = ai.spraklestrawberry2 || ""; out.sound = s.pointSound || ""; }
    else if (roleKey === "superchat") { out.icon1 = ""; out.icon2 = ai.spraklestrawberry1 || ""; out.sound = s.superchatSound || s.tipSound || ""; }

    return out;
  }

  function mapAlertFromTwitchPayload(state, obj) {
    var listener = obj && obj.detail && obj.detail.listener;
    var ev = obj && obj.detail && obj.detail.event;
    if (!listener || !ev) return null;

    var msgid = safeStr(ev.msgId, "");
    var name = safeStr(ev.name, "");
    var sender = safeStr(ev.sender, "");
    var amount = ev.amount;
    var bulkGifted = ev.bulkGifted;
    var gifted = ev.gifted;
    var isCommunityGift = ev.isCommunityGift;
    var msg = ev.message == null ? "" : safeStr(ev.message, "");

    var show = state.alertToggles || {};
    var key = null;
    var roleKey = null;
    var user = name;

    if (listener === "subscriber-latest") {
      if (bulkGifted === true) { if (show.gift_subs) { key = "gift_subs"; roleKey = "gift-subs"; } }
      else if (bulkGifted === undefined && gifted === undefined) { if (show.sub) { key = "sub"; roleKey = "sub"; } }
      else if (bulkGifted === undefined && gifted === true && isCommunityGift === undefined) { if (show.gifted_sub) { key = "gifted_sub"; roleKey = "sub"; user = sender || name; } }
    } else if (listener === "cheer-latest") {
      if (show.cheer) { key = "cheer"; roleKey = "cheers"; }
    } else if (listener === "raid-latest") {
      if (show.raid) { key = "raid"; roleKey = "raid"; }
    } else if (listener === "tip-latest") {
      if (show.tip) { key = "tip"; roleKey = "tip"; }
    } else if (listener === "follower-latest") {
      if (show.follow) { key = "follow"; roleKey = "follow"; }
    } else if (listener === "event" && ev.type === "channelPointsRedemption") {
      if (show.points) { key = "points"; roleKey = "points"; user = safeStr(ev.data && ev.data.username, ""); amount = ev.data && ev.data.amount; msg = (ev.data && ev.data.message) ? safeStr(ev.data.message, "") : ""; msgid = safeStr(ev.msgId, msgid); }
    }

    if (!key) return null;

    var templates = state.alertTemplates || {};
    var rawTpl = templates[key] || "";
    var parsed = safeStr(rawTpl, "");
    parsed = parsed.replace("$User", user).replace("$Amount", amount == null ? "" : String(amount));
    if (msg && parsed.indexOf("$Message") !== -1) parsed = parsed.replace("$Message", msg);
    else if (parsed.indexOf("$Message") !== -1) parsed = parsed.replace("$Message", "");

    return {
      type: "alert",
      eventKey: key,
      roleKey: roleKey,
      msgId: msgid || "0",
      uid: amount == null ? "" : String(amount),
      user: user,
      amount: amount == null ? "" : String(amount),
      message: msg,
      alertText: parsed
    };
  }

  function mapAlertFromYouTubePayload(state, obj) {
    var listener = obj && obj.detail && obj.detail.listener;
    var ev = obj && obj.detail && obj.detail.event;
    if (!listener || !ev) return null;

    var show = state.alertToggles || {};
    var name = safeStr(ev.name, "");
    var amount = ev.amount;
    var bulkGifted = ev.bulkGifted;
    var gifted = ev.gifted;
    var msg = ev.message == null ? "" : safeStr(ev.message, "");
    var msgid = "0";

    var key = null;
    var roleKey = null;

    if (listener === "sponsor-latest") {
      if (bulkGifted === true) { if (show.gift) { key = "gift_subs"; roleKey = "gift-subs"; } }
      else { if (show.sub) { key = "sub"; roleKey = "sub"; } }
    } else if (listener === "tip-latest") {
      if (show.tip) { key = "tip"; roleKey = "tip"; }
    } else if (listener === "superchat-latest") {
      if (show.superchat) { key = "superchat"; roleKey = "superchat"; }
    } else if (listener === "subscriber-latest") {
      if (show.follow) { key = "follow"; roleKey = "follow"; }
    }

    if (!key) return null;

    var templates = state.alertTemplates || {};
    var rawTpl = templates[key] || "";
    var parsed = safeStr(rawTpl, "");
    parsed = parsed.replace("$User", name).replace("$Amount", amount == null ? "" : String(amount));
    if (msg && parsed.indexOf("$Message") !== -1) parsed = parsed.replace("$Message", msg);
    else if (parsed.indexOf("$Message") !== -1) parsed = parsed.replace("$Message", "");

    return {
      type: "alert",
      eventKey: key,
      roleKey: roleKey,
      msgId: msgid,
      uid: amount == null ? "" : String(amount),
      user: name,
      amount: amount == null ? "" : String(amount),
      message: msg,
      alertText: parsed
    };
  }

  function buildDefaultAlertTemplates() {
    return {
      sub: "$User",
      gifted_sub: "$User",
      gift_subs: "$User $Amount",
      raid: "$User",
      cheer: "$User $Amount",
      tip: "$User $Amount",
      follow: "$User",
      points: "$User $Amount",
      superchat: "$User $Amount"
    };
  }

  function buildCtxAndRenderMessage(state, data, renderedText, provider) {
    if (shouldIgnoreMessage(state, data)) return Promise.resolve(null);

    var role = provider === "twitch" ? detectRoleTwitch(state, data) : detectRoleYouTube(state, data);
    var badgesHTML = buildBadgesHTML(state, data);

    var messagePromise;
    if (provider === "twitch") {
      messagePromise = Promise.resolve(attachEmotesTwitch(state, data, renderedText, data));
    } else {
      messagePromise = attachEmotesYouTube(state, data, renderedText, data);
    }

    var username = safeStr(data && (data.displayName || data.nick || (data.authorDetails && data.authorDetails.displayName)), "");
    var pronoMode = safeStr(state.Config.diplayPronouns || state.Config.pronounsMode, "visible");
    var shouldPronouns = (provider === "twitch") && (pronoMode !== "hidden");

    var pronounPromise = shouldPronouns ? getUserPronoun(state, username) : Promise.resolve(null);

    return Promise.all([messagePromise, pronounPromise]).then(function (vals) {
      var messageHTML = vals[0];
      var pr = vals[1];

      var pronouns = pr ? safeStr(pr, "") : "";
      if (pronoMode === "hidden") pronouns = "";

      var ctx = makeCtxBase(state, data, role, messageHTML, badgesHTML, { pronouns: pronouns });
      var render = resolveMessageTemplate(state, role);
      var html = "";
      try { html = render(ctx); } catch (e) { html = ""; }
      if (!html) return null;

      return {
        type: "message",
        provider: provider,
        role: role,
        html: html,
        ctx: ctx,
        actions: []
      };
    });
  }

  function buildCtxAndRenderAlert(state, alertNorm) {
    var roleKey = alertNorm.roleKey || "sub";
    var icons = buildAlertIconsAndSounds(state, roleKey);
    var ctx = {
      provider: state.provider || "unknown",
      uid: safeStr(alertNorm.uid, ""),
      msgId: safeStr(alertNorm.msgId, "0"),
      messageId: (state.Config.totalMessages += 1),
      user: safeStr(alertNorm.user, ""),
      amount: safeStr(alertNorm.amount, ""),
      role: safeStr(roleKey, "sub"),
      side: computeSide(state),
      highlightClass: "",
      icon: state.Config.displayBadge === "visible" ? (state.Config.badgesSVG && state.Config.badgesSVG[roleKey] ? state.Config.badgesSVG[roleKey] : "") : "",
      eicon: icons.icon2 || "",
      alertHTML: safeStr(alertNorm.alertText, "")
    };

    var templateKey = alertNorm.eventKey;
    var render = resolveAlertTemplate(state, templateKey);
    var html = "";
    try { html = render(ctx); } catch (e) { html = ""; }
    if (!html) return null;

    var actions = [];
    if (icons.sound) actions.push({ type: "sound", url: icons.sound });
    return { type: "alert", provider: state.provider, role: roleKey, html: html, ctx: ctx, actions: actions };
  }

  function buildDeleteAction(obj) {
    var listener = obj && obj.detail && obj.detail.listener;
    var ev = obj && obj.detail && obj.detail.event;
    if (listener === "delete-message") {
      var msgId = safeStr(ev && ev.msgId, "");
      return { type: "delete", selector: '.message-row[data-msgid="' + msgId + '"], .alert-row[data-msgid="' + msgId + '"]', msgId: msgId };
    }
    if (listener === "delete-messages") {
      var uid = safeStr(ev && ev.userId, "");
      return { type: "delete", selector: '.message-row[data-sender="' + uid + '"], .alert-row[data-sender="' + uid + '"]', uid: uid };
    }
    return null;
  }

  function makeState() {
    return {
      initialized: false,
      provider: null,
      templates: normalizeTemplates(null),
      Config: {
        totalMessages: 0,
        messagesLimit: 0,
        removeSelector: null,
        alert_message: "",
        channelName: "",
        provider: "",
        animationIn: "fadeIn",
        animationOut: "fadeOut",
        hideAfter: 60,
        hideCommands: "no",
        ignoredUsers: [],
        botNames: [],
        displayBadge: "visible",
        diplayPronouns: "visible",
        pronounsMode: "visible",
        orientation: "bottom",
        emotes: "visible",
        emotedata: "",
        externalEmotesUrl: "https://raw.githubusercontent.com/Jocando21/Lottie-Repo/refs/heads/main/emotes.json",
        badgesSVG: {},
        alerticons: {},
        sounds: {
          giftSubsSound: "",
          subSound: "",
          cheersSound: "",
          raidSound: "",
          tipSound: "",
          followSound: "",
          pointSound: "",
          superchatSound: ""
        }
      },
      Widget: {
        pronouns: {},
        pronounsCache: {}
      },
      pronounsLoaded: false,
      alertTemplates: buildDefaultAlertTemplates(),
      alertToggles: {
        sub: true,
        gifted_sub: true,
        gift_subs: true,
        raid: true,
        cheer: true,
        tip: true,
        follow: true,
        points: true,
        superchat: true,
        gift: true
      }
    };
  }

  var state = makeState();

  function init(opts) {
    opts = opts || {};
    state.Config = deepMerge(state.Config, opts.settings || {});
    if (opts.provider) {
      state.provider = safeStr(opts.provider, "").toLowerCase();
      state.Config.provider = opts.provider;
    }
    if (opts.templates) state.templates = normalizeTemplates(opts.templates);
    else state.templates = normalizeTemplates(state.templates);

    if (opts.badgesSVG) state.Config.badgesSVG = deepMerge(state.Config.badgesSVG || {}, opts.badgesSVG);
    if (opts.alerticons) state.Config.alerticons = deepMerge(state.Config.alerticons || {}, opts.alerticons);
    if (opts.sounds) state.Config.sounds = deepMerge(state.Config.sounds || {}, opts.sounds);

    if (opts.alertTemplates) state.alertTemplates = deepMerge(state.alertTemplates || {}, opts.alertTemplates);
    if (opts.alertToggles) state.alertToggles = deepMerge(state.alertToggles || {}, opts.alertToggles);

    state.initialized = true;
    return api;
  }

  function applyFields(fieldData, widgetContext) {
    fieldData = fieldData || {};
    widgetContext = widgetContext || {};

    state.Config.hideAfter = clampNum(fieldData.hideAfter != null ? fieldData.hideAfter : state.Config.hideAfter, state.Config.hideAfter);
    state.Config.messagesLimit = clampNum(fieldData.messagesLimit != null ? fieldData.messagesLimit : state.Config.messagesLimit, state.Config.messagesLimit);
    state.Config.hideCommands = safeStr(fieldData.hideCommands != null ? fieldData.hideCommands : state.Config.hideCommands, state.Config.hideCommands);
    state.Config.channelName = safeStr((widgetContext.channel && widgetContext.channel.username) || fieldData.channelName || state.Config.channelName, state.Config.channelName);

    var badgeDisplay = fieldData.badgeDisplay != null ? fieldData.badgeDisplay : state.Config.displayBadge;
    state.Config.displayBadge = safeStr(badgeDisplay, state.Config.displayBadge);

    var pronounsMode = fieldData.pronounsMode != null ? fieldData.pronounsMode : (state.Config.diplayPronouns || state.Config.pronounsMode);
    state.Config.diplayPronouns = safeStr(pronounsMode, state.Config.diplayPronouns);
    state.Config.pronounsMode = state.Config.diplayPronouns;

    state.Config.orientation = safeStr(fieldData.orientation != null ? fieldData.orientation : state.Config.orientation, state.Config.orientation);
    state.Config.emotes = safeStr(fieldData.bigEmotes != null ? fieldData.bigEmotes : state.Config.emotes, state.Config.emotes);

    if (fieldData.emotedata != null) state.Config.emotedata = fieldData.emotedata;
    if (fieldData.externalEmotesUrl != null) state.Config.externalEmotesUrl = safeStr(fieldData.externalEmotesUrl, state.Config.externalEmotesUrl);

    if (fieldData.ignoredUsers != null) state.Config.ignoredUsers = normalizeListCSV(fieldData.ignoredUsers);
    if (fieldData.botNames != null) state.Config.botNames = normalizeListCSV(fieldData.botNames);

    state.Config.removeSelector = ".message-row:nth-last-child(n+" + ((state.Config.messagesLimit || 0) + 1) + "), .alert-row:nth-last-child(n+" + ((state.Config.messagesLimit || 0) + 1) + ")";

    if (fieldData.pointSound != null) state.Config.sounds.pointSound = fieldData.pointSound;
    if (fieldData.giftSubsSound != null) state.Config.sounds.giftSubsSound = fieldData.giftSubsSound;
    if (fieldData.subSound != null) state.Config.sounds.subSound = fieldData.subSound;
    if (fieldData.cheersSound != null) state.Config.sounds.cheersSound = fieldData.cheersSound;
    if (fieldData.raidSound != null) state.Config.sounds.raidSound = fieldData.raidSound;
    if (fieldData.tipSound != null) state.Config.sounds.tipSound = fieldData.tipSound;
    if (fieldData.followSound != null) state.Config.sounds.followSound = fieldData.followSound;
    if (fieldData.superchatSound != null) state.Config.sounds.superchatSound = fieldData.superchatSound;

    state.alertTemplates.sub = fieldData.SubAlertMessage != null ? fieldData.SubAlertMessage : state.alertTemplates.sub;
    state.alertTemplates.gifted_sub = fieldData.GiftedSubAlertMessage != null ? fieldData.GiftedSubAlertMessage : state.alertTemplates.gifted_sub;
    state.alertTemplates.gift_subs = fieldData.GiftSubAlertMessage != null ? fieldData.GiftSubAlertMessage : (fieldData.GiftAlertMessage != null ? fieldData.GiftAlertMessage : state.alertTemplates.gift_subs);
    state.alertTemplates.raid = fieldData.RaidAlertMessage != null ? fieldData.RaidAlertMessage : state.alertTemplates.raid;
    state.alertTemplates.cheer = fieldData.CheerAlertMessage != null ? fieldData.CheerAlertMessage : state.alertTemplates.cheer;
    state.alertTemplates.tip = fieldData.TipAlertMessage != null ? fieldData.TipAlertMessage : state.alertTemplates.tip;
    state.alertTemplates.follow = fieldData.FollowAlertMessage != null ? fieldData.FollowAlertMessage : state.alertTemplates.follow;
    state.alertTemplates.points = fieldData.PointsAlertMessage != null ? fieldData.PointsAlertMessage : state.alertTemplates.points;
    state.alertTemplates.superchat = fieldData.SuperchatAlertMessage != null ? fieldData.SuperchatAlertMessage : state.alertTemplates.superchat;

    state.alertToggles.sub = fieldData.ShowSubAlert != null ? !!fieldData.ShowSubAlert : state.alertToggles.sub;
    state.alertToggles.gifted_sub = fieldData.ShowGiftedSubAlert != null ? !!fieldData.ShowGiftedSubAlert : state.alertToggles.gifted_sub;
    state.alertToggles.gift_subs = fieldData.ShowGiftSubAlert != null ? !!fieldData.ShowGiftSubAlert : (fieldData.ShowGiftAlert != null ? !!fieldData.ShowGiftAlert : state.alertToggles.gift_subs);
    state.alertToggles.raid = fieldData.ShowRaidAlert != null ? !!fieldData.ShowRaidAlert : state.alertToggles.raid;
    state.alertToggles.cheer = fieldData.ShowCheerAlert != null ? !!fieldData.ShowCheerAlert : state.alertToggles.cheer;
    state.alertToggles.tip = fieldData.ShowTipAlert != null ? !!fieldData.ShowTipAlert : state.alertToggles.tip;
    state.alertToggles.follow = fieldData.ShowFollowAlert != null ? !!fieldData.ShowFollowAlert : state.alertToggles.follow;
    state.alertToggles.points = fieldData.ShowPointsAlert != null ? !!fieldData.ShowPointsAlert : state.alertToggles.points;
    state.alertToggles.superchat = fieldData.ShowSuperchatAlert != null ? !!fieldData.ShowSuperchatAlert : state.alertToggles.superchat;
    state.alertToggles.gift = fieldData.ShowGiftAlert != null ? !!fieldData.ShowGiftAlert : state.alertToggles.gift;

    var channelId = (widgetContext.channel && widgetContext.channel.id) || (widgetContext.detail && widgetContext.detail.channel && widgetContext.detail.channel.id);
    if (channelId && (!state.provider || state.provider === "unknown")) {
      return maybeLoadProviderFromSEChannel(state, channelId).then(function () { return api; });
    }
    return Promise.resolve(api);
  }

  function onWidgetStart(widgetLoadObj, opts) {
    opts = opts || {};
    if (!state.initialized) init(opts);
    var detail = widgetLoadObj && widgetLoadObj.detail;
    var fieldData = detail && detail.fieldData ? detail.fieldData : {};
    return applyFields(fieldData, detail || {}).then(function () {
      var provider = state.provider || ensureProvider(state) || resolveProviderFromPayload(widgetLoadObj) || "unknown";
      state.provider = provider;

      var pronounsMode = safeStr(state.Config.diplayPronouns || state.Config.pronounsMode, "visible");
      if (provider === "twitch" && pronounsMode !== "hidden") return initPronounsIfNeeded(state).then(function () { return true; });
      return true;
    });
  }

  function onEventReceived(eventObj) {
    if (!state.initialized) init({});
    var del = buildDeleteAction(eventObj);
    if (del) return Promise.resolve({ type: "delete", actions: [del], html: "", ctx: null });

    var listener = eventObj && eventObj.detail && eventObj.detail.listener;
    var ev = eventObj && eventObj.detail && eventObj.detail.event;

    if (listener !== "message") {
      var provider = state.provider || ensureProvider(state) || resolveProviderFromPayload(eventObj) || "unknown";
      state.provider = provider;
      var alertNorm = null;
      if (provider === "twitch") alertNorm = mapAlertFromTwitchPayload(state, eventObj);
      else if (provider === "youtube") alertNorm = mapAlertFromYouTubePayload(state, eventObj);
      if (!alertNorm) return Promise.resolve(null);

      var rendered = buildCtxAndRenderAlert(state, alertNorm);
      if (!rendered) return Promise.resolve(null);

      for (var i = 0; i < rendered.actions.length; i++) {
        var a = rendered.actions[i];
        if (a && a.type === "sound") playSound(a.url);
      }
      return Promise.resolve(rendered);
    }

    var provider2 = state.provider || ensureProvider(state) || resolveProviderFromPayload(eventObj) || "unknown";
    state.provider = provider2;

    var data = ev && ev.data ? ev.data : null;
    if (!data) return Promise.resolve(null);

    var renderedText = ev || {};
    return buildCtxAndRenderMessage(state, data, renderedText, provider2).then(function (res) {
      return res;
    });
  }

  function setTemplates(templates) {
    state.templates = normalizeTemplates(templates);
    return api;
  }

  function setBadgesSVG(map) {
    state.Config.badgesSVG = deepMerge(state.Config.badgesSVG || {}, map || {});
    return api;
  }

  function setAlertIcons(map) {
    state.Config.alerticons = deepMerge(state.Config.alerticons || {}, map || {});
    return api;
  }

  function setSounds(map) {
    state.Config.sounds = deepMerge(state.Config.sounds || {}, map || {});
    return api;
  }

  function setProvider(p) {
    state.provider = safeStr(p, "").toLowerCase();
    state.Config.provider = p;
    return api;
  }

  function getState() {
    return state;
  }

  function resetRuntime() {
    state.Config.totalMessages = 0;
    state.Widget.pronounsCache = {};
    return api;
  }

  var api = {
    init: init,
    applyFields: applyFields,
    onWidgetStart: onWidgetStart,
    onEventReceived: onEventReceived,
    setTemplates: setTemplates,
    setBadgesSVG: setBadgesSVG,
    setAlertIcons: setAlertIcons,
    setSounds: setSounds,
    setProvider: setProvider,
    getState: getState,
    resetRuntime: resetRuntime,
    utils: {
      html_encode: html_encode
    }
  };

  return api;
});
