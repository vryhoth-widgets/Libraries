(function (global) {

    function LettersClient(options) {

        this.api = options.api || "https://letters.vrytools.com"
        this.token = options.token
        this.pollInterval = options.pollInterval || 30000

        this.lastId = 0
        this.timer = null

        this.count = 0

        this.queue = []
        this.index = -1

        this.countHandlers = []
        this.letterHandlers = []

    }

    LettersClient.prototype.headers = function () {
        return {
            Authorization: "Bearer " + this.token
        }
    }

    LettersClient.prototype.request = async function (path, opts) {

        opts = opts || {}

        const res = await fetch(this.api + path, {
            ...opts,
            headers: {
                ...(opts.headers || {}),
                ...this.headers()
            }
        })

        if (!res.ok) throw new Error("API " + res.status)

        return res.json()

    }

    LettersClient.prototype.onCount = function (fn) {
        this.countHandlers.push(fn)
    }

    LettersClient.prototype.onLetters = function (fn) {
        this.letterHandlers.push(fn)
    }

    LettersClient.prototype.emitCount = function (count) {
        this.countHandlers.forEach(fn => fn(count))
    }

    LettersClient.prototype.emitLetters = function (letters) {
        this.letterHandlers.forEach(fn => fn(letters))
    }

    LettersClient.prototype.fetchCount = async function () {

        try {

            const data = await this.request("/letters/count")

            if (data.ok) {
                this.count = data.pending
                this.emitCount(this.count)
            }

        } catch (e) {
            console.error(e)
        }

    }

    LettersClient.prototype.fetchLetters = async function () {

        try {

            const data = await this.request("/letters/get?since_id=" + this.lastId)

            if (!data.ok) return

            const letters = data.letters || []

            if (!letters.length) return

            this.lastId = Math.max(
                this.lastId,
                ...letters.map(l => l.id)
            )

            letters.forEach(l => {
                this.queue.push(l)
            })

            this.emitLetters(letters)

        } catch (e) {
            console.error(e)
        }

    }

    LettersClient.prototype.markRead = async function (ids) {

        if (!ids.length) return

        await this.request("/letters/read", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ ids })
        })

    }

    LettersClient.prototype.clear = async function () {

        return this.request("/letters/clear", {
            method: "DELETE"
        })

    }

    LettersClient.prototype.next = function () {

        if (!this.queue.length) return null

        this.index++

        if (this.index >= this.queue.length)
            this.index = this.queue.length - 1

        return this.queue[this.index]

    }

    LettersClient.prototype.prev = function () {

        if (!this.queue.length) return null

        this.index--

        if (this.index < 0)
            this.index = 0

        return this.queue[this.index]

    }

    LettersClient.prototype.current = function () {

        if (this.index < 0 || this.index >= this.queue.length)
            return null

        return this.queue[this.index]

    }

    LettersClient.prototype.getQueue = function () {
        return this.queue
    }

    LettersClient.prototype.getUnreadCount = function () {
        return this.count
    }

    LettersClient.prototype.refresh = async function () {

        await this.fetchCount()
        await this.fetchLetters()

    }

    LettersClient.prototype.start = function () {

        this.fetchCount()
        this.fetchLetters()

        this.timer = setInterval(() => {

            this.fetchCount()
            this.fetchLetters()

        }, this.pollInterval)

    }

    LettersClient.prototype.stop = function () {
        clearInterval(this.timer)
    }

    global.LettersClient = LettersClient

})(window);
