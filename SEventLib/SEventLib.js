(function (global) {
    const VERSION = "1.1";
    const LIB = "[SEventLib.js " + VERSION + "]";
    let DEBUG = true;

    const state = {
        lastEvents: new Map(),
        communityLocks: new Set(),
        lastChannelPointUser: null,
        lastChannelPointMsg: null,
        lastChannelPointTs: 0,
        commandRoles: [],
        initOpts: {
            commandPrefix: "!",
            hideCommands: "no",
            ignoredUsers: [],
            botNames: [],
            dedupeWindowMs: 1500
        }
    };

    function now() {
        return Date.now();
    }

    function log(data) {
        if (DEBUG) console.log(LIB, data);
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
            name: parts.shift().toLowerCase(),
            args: parts
        };
    }

    function detectCommandPerms(cmdName, role) {
        if (!cmdName || !Array.isArray(state.commandRoles)) return null;

        for (let i = 0; i < state.commandRoles.length; i++) {
            const group = state.commandRoles[i];
            if (!group || !Array.isArray(group.commands)) continue;
            if (!group.commands.map(c => c.toLowerCase()).includes(cmdName)) continue;

            const perms = Array.isArray(group.perms) ? group.perms : [];
            const hasPerms = perms.includes(role) || perms.includes("any");

            return {
                group: group.name || null,
                hasPerms,
                perms,
                commands: group.commands
            };
        }

        return null;
    }

    function init(options) {
        DEBUG = options?.debug !== false;
        if (!options) return;

        if (Object.prototype.hasOwnProperty.call(options, "commandPrefix")) state.initOpts.commandPrefix = options.commandPrefix;
        if (Object.prototype.hasOwnProperty.call(options, "hideCommands")) state.initOpts.hideCommands = options.hideCommands;
        if (Object.prototype.hasOwnProperty.call(options, "ignoredUsers")) state.initOpts.ignoredUsers = Array.isArray(options.ignoredUsers) ? options.ignoredUsers : [];
        if (Object.prototype.hasOwnProperty.call(options, "botNames")) state.initOpts.botNames = Array.isArray(options.botNames) ? options.botNames : [];
        if (Object.prototype.hasOwnProperty.call(options, "dedupeWindowMs")) state.initOpts.dedupeWindowMs = options.dedupeWindowMs;
        if (Object.prototype.hasOwnProperty.call(options, "commandRoles")) state.commandRoles = Array.isArray(options.commandRoles) ? options.commandRoles : [];
    }

    function normalize(detail, opts) {
        const merged = Object.assign({}, state.initOpts, opts || {});
        const {
            commandPrefix = "!",
            hideCommands = "no",
            ignoredUsers = [],
            botNames = [],
            dedupeWindowMs = 1500
        } = merged || {};

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

            const dn = (d.nick || d.displayName || "").toString().toLowerCase();
            const cpU = state.lastChannelPointUser;
            const cpM = state.lastChannelPointMsg;
            const dt = ts - state.lastChannelPointTs;

            if (cpU && dn && dn === cpU && dt < 1500 && cpM && (d.text || "") === cpM) {
                return null;
            }

            if (ignoredUsers.includes(d.nick)) return null;

            const role =
                botNames.includes(d.nick) ? "bot" :
                d.tags?.badges?.includes("broadcaster") ? "streamer" :
                d.tags?.badges?.includes("mod") ? "mod" :
                d.tags?.badges?.includes("vip") ? "vip" :
                d.tags?.badges?.includes("subscriber") || d.tags?.badges?.includes("founder") ? "sub" :
                Number(d.tags?.["first-msg"]) === 1 ? "first" :
                "viewer";

            const cmd = parseCommand(d.text, commandPrefix);
            if (cmd && hideCommands === "yes") return null;

            let commandPerms = null;
            if (cmd) {
                commandPerms = detectCommandPerms(cmd.name, role);
                if (commandPerms) {
                    cmd.hasPerms = commandPerms.hasPerms;
                    cmd.perms = commandPerms.perms;
                    cmd.group = commandPerms.group;
                } else {
                    cmd.hasPerms = false;
                }
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
        init,
        normalize,
        version: VERSION
    };
})(window);
