(function (global) {
    const VERSION = "1.0";
    const LIB = "[SEventLib.js " + VERSION + "]";
    const state = {
        lastEvents: new Map(),
        communityLocks: new Set()
    };

    function now() {
        return Date.now();
    }

    function log(data) {
        console.log(LIB, data);
    }

    function dedupe(key, windowMs) {
        const t = now();
        const last = state.lastEvents.get(key);
        if (last && t - last < windowMs) return true;
        state.lastEvents.set(key, t);
        return false;
    }

    function parseCommand(text, prefix) {
        if (!text || !text.startsWith(prefix)) return null;
        const raw = text.slice(prefix.length).trim();
        if (!raw) return null;
        const parts = raw.split(/\s+/);
        return {
            prefix,
            name: parts.shift(),
            args: parts
        };
    }

    function normalize(detail, opts) {
        const {
            commandPrefix = "!",
            hideCommands = "no",
            ignoredUsers = [],
            botNames = [],
            dedupeWindowMs = 1500
        } = opts || {};

        if (!detail || !detail.listener) return null;

        const listener = detail.listener;
        const ev = detail.event || {};
        const ts = now();

        if (listener === "message") {
            const d = ev.data;
            if (!d) return null;
            if (ignoredUsers.includes(d.nick)) return null;

            const cmd = parseCommand(d.text, commandPrefix);
            if (cmd && hideCommands === "yes") return null;

            const role =
                botNames.includes(d.nick) ? "bot" :
                d.tags?.badges?.includes("broadcaster") ? "broadcaster" :
                d.tags?.badges?.includes("mod") ? "mod" :
                d.tags?.badges?.includes("vip") ? "vip" :
                d.tags?.badges?.includes("subscriber") || d.tags?.badges?.includes("founder") ? "subscriber" :
                Number(d.tags?.["first-msg"]) === 1 ? "first" :
                "viewer";

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
                raw: detail
            };

            log(out);
            return out;
        }

        if (listener === "event") {
            if (ev.type === "channelPointsRedemption") {
                const out = {
                    type: "points",
                    source: "alert",
                    listener,
                    origin: "event",
                    timestamp: ts,
                    amount: ev.data?.amount || 0,
                    message: ev.data?.message || "",
                    user: {
                        username: ev.data?.username,
                        displayName: ev.data?.username
                    },
                    meta: ev.meta || {},
                    raw: detail
                };
                log(out);
                return out;
            }

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
                    user: {
                        username: ev.sender,
                        displayName: ev.sender,
                        sender: ev.sender
                    },
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
                    user: {
                        username: ev.name,
                        displayName: ev.name
                    },
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
                    user: {
                        username: meta.sender,
                        displayName: meta.sender,
                        sender: meta.sender
                    },
                    meta: meta,
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
                    user: {
                        username: meta.name,
                        displayName: meta.name,
                        sender: meta.sender
                    },
                    meta: meta,
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
                user: {
                    username: meta.name,
                    displayName: meta.name
                },
                meta: meta,
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
                user: {
                    username: ev.name,
                    displayName: ev.name
                },
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
                user: {
                    username: ev.name,
                    displayName: ev.name
                },
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
                user: {
                    username: ev.name,
                    displayName: ev.name
                },
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
                user: {
                    username: ev.name,
                    displayName: ev.name
                },
                raw: detail
            };
            log(out);
            return out;
        }

        return null;
    }

    global.SEventLib = {
        normalize,
        version: VERSION
    };
})(window);
