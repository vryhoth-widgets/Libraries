(function (global) {
    const VERSION = "1.0";
    const LIB = "[SEventLib.js " + VERSION + "]";

    const config = {
        debug: true,
        commandPrefix: "!",
        hideCommands: "no",
        ignoredUsers: [],
        botNames: [],
        dedupeWindowMs: 1500
    };

    const state = {
        lastEvents: new Map(),
        communityLocks: new Set(),
        lastChannelPointUser: null,
        lastChannelPointTs: 0
    };

    function now() {
        return Date.now();
    }

    function log(data) {
        if (config.debug) console.log(LIB, data);
    }

    function dedupe(key, windowMs) {
        const t = now();
        const last = state.lastEvents.get(key);
        if (last && t - last < windowMs) return true;
        state.lastEvents.set(key, t);
        return false;
    }

    function parseCommand(text) {
        if (!text || !text.startsWith(config.commandPrefix)) return null;
        const raw = text.slice(config.commandPrefix.length).trim();
        if (!raw) return null;
        const parts = raw.split(/\s+/);
        return {
            prefix: config.commandPrefix,
            name: parts.shift(),
            args: parts,
            raw: text
        };
    }

    function init(options = {}) {
        Object.assign(config, options);
    }

    function normalize(detail) {
        if (!detail || !detail.listener) return null;

        const listener = detail.listener;
        const ev = detail.event || {};
        const ts = now();

        if (listener === "event:test" && ev.listener === "widget-button") {
            const out = {
                type: "button",
                source: "widget",
                listener: "widget-button",
                timestamp: ts,
                field: ev.field,
                value: ev.value,
                raw: detail
            };
            log(out);
            return out;
        }

        if (listener === "event" && ev.type === "channelPointsRedemption") {
            state.lastChannelPointUser = ev.data?.username || null;
            state.lastChannelPointTs = ts;

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

        if (listener === "message") {
            const d = ev.data;
            if (!d) return null;

            if (
                state.lastChannelPointUser === d.displayName &&
                ts - state.lastChannelPointTs < 800
            ) {
                return null;
            }

            if (config.ignoredUsers.includes(d.nick)) return null;

            const cmd = parseCommand(d.text);
            if (cmd && config.hideCommands === "yes") return null;

            const role =
                config.botNames.includes(d.nick) ? "bot" :
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
                if (dedupe(key, config.dedupeWindowMs)) return null;

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
                    meta,
                    raw: detail
                };

                log(out);
                return out;
            }

            if (meta.gifted === true && !meta.isCommunityGift) {
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
                user: {
                    username: meta.name,
                    displayName: meta.name
                },
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
            if (dedupe("follow-" + ev.name, config.dedupeWindowMs)) return null;

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
        init,
        normalize,
        version: VERSION
    };
})(window);
