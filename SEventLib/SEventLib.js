(function (global) {
    const VERSION = "1.0";

    const DEFAULT_OPTIONS = {
        commandPrefix: "!",
        hideCommands: "no",
        ignoredUsers: [],
        botNames: [],
        dedupeWindowMs: 1500,
        debug: true
    };

    const _dedupeCache = new Map();
    const _communityLocks = new Map();

    function now() {
        return Date.now();
    }

    function logDebug(...args) {
        if (SEventLib.options.debug) {
            console.log("[SEventLib]", ...args);
        }
    }

    function dedupe(key) {
        const t = now();
        const last = _dedupeCache.get(key);
        if (last && t - last < SEventLib.options.dedupeWindowMs) {
            return true;
        }
        _dedupeCache.set(key, t);
        return false;
    }

    function normalizeUserFromEvent(ev) {
        return {
            username: ev.name || ev.username || "",
            displayName: ev.displayName || ev.name || "",
            providerId: ev.providerId || "",
            sender: ev.sender || ""
        };
    }

    function normalizeChat(detail) {
        const d = detail.event.data;
        if (!d || !d.text) return null;

        if (
            SEventLib.options.hideCommands === "yes" &&
            d.text.startsWith(SEventLib.options.commandPrefix)
        ) {
            return null;
        }

        if (SEventLib.options.ignoredUsers.includes(d.nick)) return null;

        const isCommand = d.text.startsWith(SEventLib.options.commandPrefix);
        let command = null;

        if (isCommand) {
            const raw = d.text.slice(SEventLib.options.commandPrefix.length);
            const parts = raw.split(/\s+/);
            command = {
                prefix: SEventLib.options.commandPrefix,
                name: parts.shift() || "",
                args: parts,
                raw: d.text
            };
        }

        return {
            type: "message",
            source: "chat",
            listener: "message",
            origin: "message",
            timestamp: now(),
            user: {
                username: d.nick,
                displayName: d.displayName,
                userId: d.userId,
                color: d.color || ""
            },
            role: d.tags?.badges || [],
            message: {
                text: d.text,
                renderedText: detail.event.renderedText || d.text,
                isAction: d.isAction || false,
                isHighlight: d.tags?.["msg-id"] === "highlighted-message",
                isFirst: Number(d.tags?.["first-msg"]) === 1
            },
            command,
            raw: detail
        };
    }

    function normalizeFollow(detail) {
        return {
            type: "follow",
            source: "alert",
            listener: detail.listener,
            origin: detail.listener === "event" ? "event" : "latest",
            timestamp: now(),
            user: normalizeUserFromEvent(detail.event),
            amount: null,
            message: "",
            raw: detail
        };
    }

    function normalizeSub(detail) {
        const ev = detail.event;
        const isEvent = detail.listener === "event";
        const isLatest = detail.listener === "subscriber-latest";

        const activityGroup = ev.activityGroup || "";
        const activityId = ev.activityId || ev._id || "";

        if (isEvent && activityGroup) {
            if (_communityLocks.has(activityGroup)) return null;
            _communityLocks.set(activityGroup, true);

            return {
                type: "sub-community",
                source: "alert",
                listener: "event",
                origin: "event",
                timestamp: now(),
                activityGroup,
                activityId,
                amount: ev.amount || ev.count || 1,
                user: {
                    username: ev.sender || "",
                    displayName: ev.sender || "",
                    providerId: ev.providerId || "",
                    sender: ev.sender || ""
                },
                message: ev.message || "",
                meta: ev,
                raw: detail
            };
        }

        if (isLatest) {
            return null;
        }

        if (isEvent) {
            const amount = ev.amount || 1;
            let type = "sub-new";
            if (amount > 1) type = "sub-re";
            if (ev.gifted === true) type = "sub-gift";

            return {
                type,
                source: "alert",
                listener: "event",
                origin: "event",
                timestamp: now(),
                activityGroup: "",
                activityId,
                amount,
                user: normalizeUserFromEvent(ev),
                message: ev.message || "",
                meta: ev,
                raw: detail
            };
        }

        return null;
    }

    function normalizeCheer(detail) {
        const ev = detail.event;
        return {
            type: "cheer",
            source: "alert",
            listener: detail.listener,
            origin: "latest",
            timestamp: now(),
            amount: ev.amount || 0,
            user: normalizeUserFromEvent(ev),
            message: ev.message || "",
            raw: detail
        };
    }

    function normalizeTip(detail) {
        const ev = detail.event;
        return {
            type: "tip",
            source: "alert",
            listener: detail.listener,
            origin: "latest",
            timestamp: now(),
            amount: ev.amount || 0,
            user: normalizeUserFromEvent(ev),
            message: ev.message || "",
            raw: detail
        };
    }

    function normalizeRaid(detail) {
        const ev = detail.event;
        return {
            type: "raid",
            source: "alert",
            listener: detail.listener,
            origin: "latest",
            timestamp: now(),
            amount: ev.amount || 0,
            user: normalizeUserFromEvent(ev),
            message: "",
            raw: detail
        };
    }

    function normalizePoints(detail) {
        const ev = detail.event;
        if (ev.type !== "channelPointsRedemption") return null;

        return {
            type: "points",
            source: "alert",
            listener: "event",
            origin: "event",
            timestamp: now(),
            amount: ev.data.amount,
            user: {
                username: ev.data.username,
                displayName: ev.data.displayName,
                providerId: ev.data.providerId
            },
            message: ev.data.message || "",
            meta: {
                redemption: ev.data.redemption,
                quantity: ev.data.quantity || 0
            },
            raw: detail
        };
    }

    function normalize(detail, options = {}) {
        SEventLib.options = { ...DEFAULT_OPTIONS, ...options };

        if (!detail || !detail.listener) return null;

        let result = null;

        switch (detail.listener) {
            case "message":
                result = normalizeChat(detail);
                break;

            case "follower-latest":
            case "event":
                if (detail.event?.type === "channelPointsRedemption") {
                    result = normalizePoints(detail);
                } else if (detail.listener === "event" || detail.listener === "follower-latest") {
                    result = normalizeFollow(detail);
                }
                break;

            case "subscriber-latest":
                result = normalizeSub(detail);
                break;

            case "cheer-latest":
                result = normalizeCheer(detail);
                break;

            case "tip-latest":
                result = normalizeTip(detail);
                break;

            case "raid-latest":
                result = normalizeRaid(detail);
                break;
        }

        if (!result) return null;

        const key = `${result.type}:${result.listener}:${result.timestamp}`;
        if (dedupe(key)) return null;

        logDebug(result);
        return result;
    }

    const SEventLib = {
        version: VERSION,
        options: { ...DEFAULT_OPTIONS },
        normalize
    };

    global.SEventLib = SEventLib;
})(window);
