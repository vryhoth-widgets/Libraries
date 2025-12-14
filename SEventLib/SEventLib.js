(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SEventLib = factory();
})(typeof window !== "undefined" ? window : this, function () {
  const DEFAULTS = {
    commandPrefix: "!",
    hideCommands: "no",
    ignoredUsers: [],
    botNames: [],
    preferEvent: true,
    dedupeWindowMs: 2000,
    communitySuppressMs: 15000
  };

  const _seen = new Map();
  const _communitySuppress = new Map();

  function _now() {
    return Date.now();
  }

  function _mergeOpts(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    o.ignoredUsers = Array.isArray(o.ignoredUsers) ? o.ignoredUsers : [];
    o.botNames = Array.isArray(o.botNames) ? o.botNames : [];
    return o;
  }

  function _cleanExpired() {
    const t = _now();
    for (const [k, v] of _seen) if (v <= t) _seen.delete(k);
    for (const [k, v] of _communitySuppress) if (v.until <= t) _communitySuppress.delete(k);
  }

  function _markSeen(key, ms) {
    _seen.set(key, _now() + (ms || DEFAULTS.dedupeWindowMs));
  }

  function _isSeen(key) {
    _cleanExpired();
    return _seen.has(key);
  }

  function _stableStr(v) {
    if (v == null) return "";
    if (typeof v === "string") return v.trim().toLowerCase();
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "1" : "0";
    return "";
  }

  function _getMsgId(detail) {
    return detail?.event?.data?.msgId || detail?.event?.msgId || detail?.event?.data?.id || detail?.event?.id || "";
  }

  function _getUserId(detail) {
    return detail?.event?.data?.userId || detail?.event?.userId || "";
  }

  function _getActivityId(ev) {
    return ev?.activityId || ev?._id || ev?.id || "";
  }

  function _getActivityGroup(ev) {
    return ev?.activityGroup || "";
  }

  function _getProvider(ev) {
    return ev?.provider || ev?.service || "";
  }

  function _pickUserFromEventPayload(ev, listener) {
    const data = ev?.data || ev || {};
    const username =
      data.username ||
      data.name ||
      data.userName ||
      data.login ||
      "";
    const displayName =
      data.displayName ||
      data.display_name ||
      data.username ||
      data.name ||
      "";
    const providerId =
      data.providerId ||
      data.providerID ||
      data.userId ||
      data.userID ||
      "";
    const sender =
      data.sender ||
      data.from ||
      data.gifter ||
      "";
    return {
      username: username ? String(username) : "",
      displayName: displayName ? String(displayName) : "",
      providerId: providerId ? String(providerId) : "",
      sender: sender ? String(sender) : ""
    };
  }

  function _roleFromChat(data, opts) {
    const nick = (data?.nick || "").toLowerCase();
    const badgesStr = String(data?.tags?.["badges"] || "");
    if (opts.botNames.map(s => String(s).toLowerCase()).includes(nick)) return "bot";
    if (badgesStr.includes("broadcaster")) return "broadcaster";
    if (badgesStr.includes("mod")) return "mod";
    if (badgesStr.includes("vip")) return "vip";
    if (badgesStr.includes("subscriber") || badgesStr.includes("founder")) return "subscriber";
    if (badgesStr.includes("artist-badge")) return "artist";
    if (badgesStr.includes("premium")) return "prime";
    if (Number(data?.tags?.["first-msg"]) === 1) return "first";
    return "viewer";
  }

  function parseCommand(text, opts) {
    const o = _mergeOpts(opts);
    if (!text || typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith(o.commandPrefix)) return null;

    const rest = trimmed.slice(o.commandPrefix.length).trim();
    if (!rest) return null;

    const nameMatch = rest.match(/^([^\s,]+)/);
    if (!nameMatch) return null;
    const name = nameMatch[1];

    const afterName = rest.slice(name.length).trim();
    let args = [];
    if (afterName) {
      args = afterName
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
        .flatMap(part => part.split(/\s+/).map(s => s.trim()).filter(Boolean));
    }

    return {
      prefix: o.commandPrefix,
      name,
      args,
      raw: trimmed
    };
  }

  function isCommandMessage(normalized) {
    return !!normalized?.command;
  }

  function _makeKey(norm) {
    const t = _stableStr(norm?.type);
    const a = _stableStr(norm?.amount);
    const u = _stableStr(norm?.user?.username || norm?.user?.displayName);
    const s = _stableStr(norm?.user?.sender);
    const g = _stableStr(norm?.activityGroup);
    const aid = _stableStr(norm?.activityId);
    const origin = _stableStr(norm?.origin);
    const redemption = _stableStr(norm?.meta?.redemption);
    return [t, a, u, s, g, aid, origin, redemption].join("|");
  }

  function _shouldSuppressCommunityGift(norm, opts) {
    const o = _mergeOpts(opts);
    if (norm.type !== "sub-gift") return false;
    const sender = _stableStr(norm.user?.sender);
    if (!sender) return false;

    _cleanExpired();
    const token = _communitySuppress.get(sender);
    if (!token) return false;

    if (token.until <= _now()) {
      _communitySuppress.delete(sender);
      return false;
    }
    return true;
  }

  function _registerCommunitySuppress(norm, opts) {
    const o = _mergeOpts(opts);
    if (norm.type !== "sub-community") return;
    const sender = _stableStr(norm.user?.sender || norm.user?.username);
    if (!sender) return;
    _communitySuppress.set(sender, { until: _now() + o.communitySuppressMs });
  }

  function normalize(detail, opts) {
    const o = _mergeOpts(opts);
    if (!detail || typeof detail !== "object") return null;

    const listener = detail.listener;
    const ev = detail.event;

    if (listener === "delete-message") {
      const msgId = _getMsgId(detail);
      return {
        type: "delete-message",
        source: "chat",
        listener,
        origin: "system",
        timestamp: _now(),
        message: "",
        amount: null,
        activityId: "",
        activityGroup: "",
        user: { username: "", displayName: "", providerId: "", sender: "" },
        meta: { msgId },
        raw: detail
      };
    }

    if (listener === "delete-messages") {
      const userId = _getUserId(detail);
      return {
        type: "delete-messages",
        source: "chat",
        listener,
        origin: "system",
        timestamp: _now(),
        message: "",
        amount: null,
        activityId: "",
        activityGroup: "",
        user: { username: "", displayName: "", providerId: "", sender: "" },
        meta: { userId },
        raw: detail
      };
    }

    if (listener === "message") {
      const data = ev?.data || {};
      const text = String(data.text || "");
      const nick = String(data.nick || "").toLowerCase();

      if (text.startsWith(o.commandPrefix) && String(o.hideCommands).toLowerCase() === "yes") return null;
      if (o.ignoredUsers.map(s => String(s).toLowerCase()).includes(nick)) return null;

      const role = _roleFromChat(data, o);

      const user = {
        username: String(data.nick || ""),
        displayName: String(data.displayName || data["display-name"] || data.tags?.["display-name"] || data.nick || ""),
        userId: String(data.userId || data.tags?.["user-id"] || ""),
        color: String(data.displayColor || data.tags?.["color"] || ""),
        msgId: String(data.msgId || data.tags?.["id"] || ""),
        badges: Array.isArray(data.badges) ? data.badges : [],
        tags: data.tags || {}
      };

      const isHighlight = String(data.tags?.["msg-id"] || "") === "highlighted-message";
      const isFirst = Number(data.tags?.["first-msg"]) === 1;
      const isAction = !!data.isAction;

      const command = parseCommand(text, o);

      const norm = {
        type: "message",
        source: "chat",
        listener,
        origin: "chat",
        timestamp: Number(ev?.data?.time || _now()),
        message: {
          text,
          renderedText: String(ev?.renderedText || text),
          isAction,
          isHighlight,
          isFirst,
          role,
          badges: user.badges
        },
        command,
        amount: null,
        activityId: "",
        activityGroup: "",
        user,
        meta: {},
        raw: detail
      };

      const key = _makeKey(norm);
      if (_isSeen(key)) return null;
      _markSeen(key, o.dedupeWindowMs);
      return norm;
    }

    const isLatest = typeof listener === "string" && listener.endsWith("-latest");
    const isEvent = listener === "event";

    let eventType = "";
    if (isEvent) eventType = String(ev?.type || "");
    else if (isLatest) eventType = String(listener).replace(/-latest$/, "");

    const provider = _getProvider(ev);
    const activityId = _getActivityId(ev);
    const activityGroup = _getActivityGroup(ev);

    let user = _pickUserFromEventPayload(ev, listener);

    let amount = null;
    let message = "";
    let meta = {};

    let type = "";

    if (isEvent && eventType === "channelPointsRedemption") {
      type = "points";
      amount = ev?.data?.amount != null ? Number(ev.data.amount) : null;
      message = String(ev?.data?.message || "");
      user = {
        username: String(ev?.data?.username || ""),
        displayName: String(ev?.data?.displayName || ev?.data?.username || ""),
        providerId: String(ev?.data?.providerId || ""),
        sender: ""
      };
      meta = {
        provider,
        channel: String(ev?.channel || ""),
        createdAt: String(ev?.createdAt || ""),
        isMock: !!ev?.isMock,
        redemption: String(ev?.data?.redemption || ""),
        quantity: ev?.data?.quantity != null ? Number(ev.data.quantity) : 0
      };
    } else if (eventType === "follow" || listener === "follower-latest") {
      type = "follow";
      amount = null;
      message = "";
      meta = isEvent
        ? {
            provider,
            channel: String(ev?.channel || ""),
            createdAt: String(ev?.createdAt || ""),
            isMock: !!ev?.isMock,
            activityId,
            activityGroup
          }
        : {
            originalEventName: String(ev?.originalEventName || "follower-latest"),
            sessionTop: !!ev?.sessionTop
          };
    } else if (eventType === "subscriber" || listener === "subscriber-latest") {
      const bulkGifted = !!(ev?.data?.bulkGifted ?? ev?.bulkGifted);
      const gifted = !!(ev?.data?.gifted ?? ev?.gifted);
      const isCommunityGift = !!(ev?.data?.isCommunityGift ?? ev?.isCommunityGift);
      const sender = String(ev?.data?.sender ?? ev?.sender ?? "");
      const nm = String(ev?.data?.name ?? ev?.name ?? "");
      const amt = ev?.data?.amount ?? ev?.amount ?? null;
      amount = amt != null ? Number(amt) : null;
      message = String(ev?.data?.message ?? ev?.message ?? "");

      const recipientUsername = String(ev?.data?.username ?? ev?.username ?? ev?.data?.name ?? ev?.name ?? "");
      const recipientDisplay = String(ev?.data?.displayName ?? ev?.displayName ?? recipientUsername);

      const effectiveSender = sender || nm || "";

      const senderEqRecipient =
        _stableStr(effectiveSender) &&
        (_stableStr(effectiveSender) === _stableStr(recipientUsername) || _stableStr(effectiveSender) === _stableStr(recipientDisplay));

      if (bulkGifted || isCommunityGift || (amount != null && amount > 1 && !!effectiveSender && !gifted)) {
        type = "sub-community";
        user = {
          username: effectiveSender || recipientUsername,
          displayName: effectiveSender || recipientDisplay,
          providerId: String(ev?.data?.providerId ?? ev?.providerId ?? ""),
          sender: effectiveSender || recipientUsername
        };
      } else if (gifted && !senderEqRecipient) {
        type = "sub-gift";
        user = {
          username: recipientUsername,
          displayName: recipientDisplay,
          providerId: String(ev?.data?.providerId ?? ev?.providerId ?? ""),
          sender: effectiveSender
        };
        amount = 1;
      } else {
        type = (amount != null && amount > 1) ? "sub-re" : "sub-new";
        user = {
          username: recipientUsername,
          displayName: recipientDisplay,
          providerId: String(ev?.data?.providerId ?? ev?.providerId ?? ""),
          sender: ""
        };
      }

      meta = isEvent
        ? {
            provider,
            channel: String(ev?.channel || ""),
            createdAt: String(ev?.createdAt || ""),
            isMock: !!ev?.isMock,
            activityId,
            activityGroup,
            bulkGifted,
            gifted,
            isCommunityGift
          }
        : {
            originalEventName: String(ev?.originalEventName || "subscriber-latest"),
            sessionTop: !!ev?.sessionTop,
            bulkGifted,
            gifted,
            isCommunityGift
          };
    } else if (eventType === "tip" || listener === "tip-latest") {
      type = "tip";
      amount = ev?.data?.amount != null ? Number(ev.data.amount) : (ev?.amount != null ? Number(ev.amount) : null);
      message = String(ev?.data?.message ?? ev?.message ?? "");
      meta = isEvent
        ? {
            provider,
            channel: String(ev?.channel || ""),
            createdAt: String(ev?.createdAt || ""),
            isMock: !!ev?.isMock,
            activityId,
            activityGroup
          }
        : {
            originalEventName: String(ev?.originalEventName || "tip-latest"),
            sessionTop: !!ev?.sessionTop
          };
    } else if (eventType === "cheer" || listener === "cheer-latest") {
      type = "cheer";
      amount = ev?.data?.amount != null ? Number(ev.data.amount) : (ev?.amount != null ? Number(ev.amount) : null);
      message = String(ev?.data?.message ?? ev?.message ?? "");
      meta = isEvent
        ? {
            provider,
            channel: String(ev?.channel || ""),
            createdAt: String(ev?.createdAt || ""),
            isMock: !!ev?.isMock,
            activityId,
            activityGroup
          }
        : {
            originalEventName: String(ev?.originalEventName || "cheer-latest"),
            sessionTop: !!ev?.sessionTop
          };
    } else if (eventType === "raid" || listener === "raid-latest") {
      type = "raid";
      amount = ev?.data?.amount != null ? Number(ev.data.amount) : (ev?.amount != null ? Number(ev.amount) : null);
      message = "";
      meta = isEvent
        ? {
            provider,
            channel: String(ev?.channel || ""),
            createdAt: String(ev?.createdAt || ""),
            isMock: !!ev?.isMock,
            activityId,
            activityGroup
          }
        : {
            originalEventName: String(ev?.originalEventName || "raid-latest"),
            sessionTop: !!ev?.sessionTop
          };
    } else {
      return null;
    }

    const origin = isEvent ? "event" : (isLatest ? "latest" : "other");

    const norm = {
      type,
      source: type === "message" ? "chat" : "alert",
      listener: String(listener || ""),
      origin,
      timestamp: _now(),
      activityId: String(activityId || ""),
      activityGroup: String(activityGroup || ""),
      amount: amount == null || Number.isNaN(amount) ? null : amount,
      message: message == null ? "" : String(message),
      user: {
        username: String(user?.username || ""),
        displayName: String(user?.displayName || ""),
        providerId: String(user?.providerId || ""),
        sender: String(user?.sender || "")
      },
      meta: meta || {},
      raw: detail
    };

    if (_shouldSuppressCommunityGift(norm, o)) return null;

    if (norm.type === "sub-community") _registerCommunitySuppress(norm, o);

    if (o.preferEvent && norm.origin === "latest") {
      const eventFingerprint = _makeKey(Object.assign({}, norm, { origin: "event" }));
      if (_isSeen(eventFingerprint)) return null;
    }

    const key = _makeKey(norm);
    if (_isSeen(key)) return null;
    _markSeen(key, o.dedupeWindowMs);

    if (norm.origin === "event") {
      const latestFingerprint = _makeKey(Object.assign({}, norm, { origin: "latest" }));
      _markSeen(latestFingerprint, o.dedupeWindowMs);
    }

    return norm;
  }

  return {
    normalize,
    parseCommand,
    isCommandMessage
  };
});
