/* Example css to use: 

.stats-popup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 20, 30, 0.45);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: 16px;
}

.stats-popup {
  width: min(720px, 100%);
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
  padding: 18px;
}

.stats-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.stats-popup-title {
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.3;
}

.stats-popup-close {
  border: 0;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  background: #f0f3f6;
}

.stats-popup-summary {
  margin: 6px 0 14px;
  color: #344054;
}

.stats-chart {
  display: grid;
  gap: 8px;
}

.stats-chart-row {
  display: grid;
  grid-template-columns: 110px 1fr 36px;
  align-items: center;
  gap: 10px;
  font-size: 0.95rem;
}

.stats-chart-track {
  height: 12px;
  border-radius: 999px;
  background: #e6ecf2;
  overflow: hidden;
}

.stats-chart-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #1e6aa8, #2d8fcb);
  transition: width 220ms ease;
}

.stats-chart-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.stats-popup-kofi {
  display: block;
  margin-top: 14px;
  text-align: center;
}

.stats-popup-kofi img {
  transition: opacity 150ms ease;
}

.stats-popup-kofi:hover img {
  opacity: 0.85;
}
*/

import {sendRequest} from "./sendRequest.js"

const statsBarOrder = [
    "games_with_attempts_1",
    "games_with_attempts_2",
    "games_with_attempts_3",
    "games_with_attempts_4",
    "games_with_attempts_5",
    "games_with_attempts_6",
    "games_with_attempts_plus",
    "games_failed"
]

const statsLabels = {
    games_with_attempts_1: "1 guess",
    games_with_attempts_2: "2 guesses",
    games_with_attempts_3: "3 guesses",
    games_with_attempts_4: "4 guesses",
    games_with_attempts_5: "5 guesses",
    games_with_attempts_6: "6 guesses",
    games_with_attempts_plus: "7+ guesses",
    games_failed: "Failed"
}

function normalizeStats(stats = {}) {
    const schema = typeof emptyStats !== "undefined" ? emptyStats : {
        games_with_attempts_1: 0,
        games_with_attempts_2: 0,
        games_with_attempts_3: 0,
        games_with_attempts_4: 0,
        games_with_attempts_5: 0,
        games_with_attempts_6: 0,
        games_with_attempts_plus: 0,
        games_failed: 0
    }
    const order = typeof statsBarOrder !== "undefined" && Array.isArray(statsBarOrder) && statsBarOrder.length > 0
        ? statsBarOrder
        : Object.keys(schema)

    return order.reduce((acc, key) => {
        const value = Number(stats[key])
        acc[key] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
        return acc
    }, {})
}

function buildStatsElement(tagName, className, text = "") {
    const el = document.createElement(tagName)
    if (className) {
        el.className = className
    }
    if (text) {
        el.textContent = text
    }
    return el
}

function getStatsSummary(stats, order) {
    const values = order.map(key => stats[key])
    const totalGames = values.reduce((sum, value) => sum + value, 0)
    const failedGames = stats.games_failed
    const wins = Math.max(totalGames - failedGames, 0)
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0
    const maxValue = Math.max(...values, 1)

    return {
        totalGames,
        wins,
        winRate,
        maxValue
    }
}

function getSuccessfulAttemptKeys(order) {
    return order.filter(key => key !== "games_failed")
}

function inferSingleGameCompletionKey(stats, order) {
    const successKeys = getSuccessfulAttemptKeys(order)
    const completedInKeys = successKeys.filter(key => stats[key] > 0)
    const completedCount = successKeys.reduce((sum, key) => sum + stats[key], 0)

    if (completedCount === 1 && completedInKeys.length === 1) {
        return completedInKeys[0]
    }

    return null
}

function getTopPercentageMessage(globalStats, completionKey, order, labels) {
    if (!completionKey || completionKey === "games_failed") {
        return "Global ranking is available after a completed game."
    }

    const totalPlayers = order.reduce((sum, key) => sum + globalStats[key], 0)
    if (totalPlayers <= 0) {
        return "Global ranking is not available yet."
    }

    if ((globalStats[completionKey] - 1 || 0) <= 0) {
        return `No global players completed in ${labels[completionKey] || completionKey} yet.`
    }

    let bucketCount = 0

    for (let statKey of order) {
        if (statKey === completionKey) {
            break
        }
        bucketCount += globalStats[statKey] || 0
    }

    const percent = Math.max(1, Math.round((bucketCount / totalPlayers) * 100))
    return `You are in the top ${percent}% of players globally.`
}

function renderStatsView({ stats, order, labels, summaryElement, chartElement, summaryOverride }) {
    const meta = getStatsSummary(stats, order)
    summaryElement.textContent = summaryOverride || `Games: ${meta.totalGames} | Wins: ${meta.wins} | Win rate: ${meta.winRate}%`

    chartElement.setAttribute("role", "list")
    chartElement.innerHTML = ""

    order.forEach(key => {
        const value = stats[key]
        const widthPercent = Math.round((value / meta.maxValue) * 100)

        const row = buildStatsElement("div", "stats-chart-row")
        row.setAttribute("role", "listitem")
        row.dataset.key = key

        const label = buildStatsElement("span", "stats-chart-label", labels[key] || key)
        const barTrack = buildStatsElement("div", "stats-chart-track")
        const barFill = buildStatsElement("div", "stats-chart-fill")
        const valueLabel = buildStatsElement("span", "stats-chart-value", String(value))

        barFill.style.width = `${widthPercent}%`
        barFill.dataset.widthPercent = String(widthPercent)
        barFill.setAttribute("aria-label", `${labels[key] || key}: ${value}`)

        barTrack.appendChild(barFill)
        row.append(label, barTrack, valueLabel)
        chartElement.appendChild(row)
    })

    return meta
}
function getGlobalStats(playerCompletionKey, gameTitle) { 
    let stat = sendRequest(gameTitle) 

    let keyUpdatedStats = {
        games_failed: stat.failures || 0,
    }

    for (let i = 1; i <= 6; i++) {
        keyUpdatedStats[`games_with_attempts_${i}`] = stat[`attempts${i}`] || 0
    }
    keyUpdatedStats["games_with_attempts_plus"] = stat.attempts_plus || 0

    if (playerCompletionKey) {
        keyUpdatedStats[playerCompletionKey] = keyUpdatedStats[playerCompletionKey] + 1
    }

    return keyUpdatedStats
}

export function createStatsPopup(statsInput, options = {}) {
    const fallbackStats = {
        games_with_attempts_1: 0,
        games_with_attempts_2: 0,
        games_with_attempts_3: 0,
        games_with_attempts_4: 0,
        games_with_attempts_5: 0,
        games_with_attempts_6: 0,
        games_with_attempts_plus: 0,
        games_failed: 0
    }
    const fallbackLabels = {
        games_with_attempts_1: "1 guess",
        games_with_attempts_2: "2 guesses",
        games_with_attempts_3: "3 guesses",
        games_with_attempts_4: "4 guesses",
        games_with_attempts_5: "5 guesses",
        games_with_attempts_6: "6 guesses",
        games_with_attempts_plus: "7+ guesses",
        games_failed: "Failed"
    }
    const defaultStats = typeof emptyStats !== "undefined" ? emptyStats : fallbackStats
    const defaultLabels = typeof statsLabels !== "undefined" ? statsLabels : fallbackLabels
    const localStats = normalizeStats(statsInput || defaultStats)
    const globalStats = normalizeStats(getGlobalStats(options.playerCompletionKey, options.gameTitle))
    const labels = { ...defaultLabels, ...(options.labels || {}) }
    const title = options.title || "Your previous performance"
    const mountTarget = options.mountTarget || document.body
    const kofiImageNumber = options.kofiImageNumber ?? 5
    const order = typeof statsBarOrder !== "undefined" && Array.isArray(statsBarOrder) && statsBarOrder.length > 0
        ? statsBarOrder
        : Object.keys(localStats)
    const inferredCompletionKey = inferSingleGameCompletionKey(localStats, order)
    const playerCompletionKey = options.playerCompletionKey || inferredCompletionKey

    const hasProvidedElements = Boolean(options.overlay)
    const overlay = options.overlay || buildStatsElement("div", "stats-popup-overlay")
    overlay.setAttribute("role", "presentation")

    const popup = options.popup || buildStatsElement("section", "stats-popup")
    popup.setAttribute("role", "dialog")
    popup.setAttribute("aria-modal", "true")
    popup.setAttribute("aria-label", title)

    const closeButton = options.closeButton || buildStatsElement("button", "stats-popup-close", "Close")
    closeButton.type = "button"
    closeButton.setAttribute("aria-label", "Close stats popup")

    const heading = options.titleElement || buildStatsElement("h2", "stats-popup-title", title)
    heading.textContent = title

    const summary = options.summaryElement || buildStatsElement("p", "stats-popup-summary")

    const chart = options.chart || buildStatsElement("div", "stats-chart")

    const tabs = options.tabsElement || buildStatsElement("div", "stats-popup-tabs")
    tabs.setAttribute("role", "tablist")

    const localTabButton = options.localTabButton || buildStatsElement("button", "stats-popup-tab", "My stats")
    localTabButton.type = "button"
    localTabButton.setAttribute("role", "tab")
    localTabButton.dataset.tab = "local"

    const globalTabButton = options.globalTabButton || buildStatsElement("button", "stats-popup-tab", "Global stats")
    globalTabButton.type = "button"
    globalTabButton.setAttribute("role", "tab")
    globalTabButton.dataset.tab = "global"

    const kofiButton = options.kofiButton || (() => {
        const anchor = document.createElement("a")
        anchor.href = "https://ko-fi.com/R5H524XXQ8"
        anchor.target = "_blank"
        anchor.rel = "noopener noreferrer"
        anchor.className = "stats-popup-kofi"

        const img = document.createElement("img")
        img.height = 36
        img.style.cssText = "border:0px;height:36px;"
        img.src = `https://storage.ko-fi.com/cdn/kofi${kofiImageNumber}.png?v=6`
        img.alt = "Buy Me a Coffee at ko-fi.com"

        anchor.appendChild(img)
        return anchor
    })()

    if (!localTabButton.isConnected) {
        tabs.appendChild(localTabButton)
    }
    if (!globalTabButton.isConnected) {
        tabs.appendChild(globalTabButton)
    }

    if (!hasProvidedElements) {
        const header = buildStatsElement("div", "stats-popup-header")
        header.append(heading, closeButton)
        popup.append(header, tabs, summary, chart, kofiButton)
        overlay.appendChild(popup)
    } else if (!tabs.isConnected) {
        const insertionPoint = popup.querySelector(".stats-popup-summary") || summary
        popup.insertBefore(tabs, insertionPoint)
    }

    let activeTab = "local"
    let currentMeta = renderStatsView({
        stats: localStats,
        order,
        labels,
        summaryElement: summary,
        chartElement: chart
    })

    function setActiveTab(tabName) {
        const isLocal = tabName === "local"
        activeTab = isLocal ? "local" : "global"

        localTabButton.classList.toggle("is-active", isLocal)
        globalTabButton.classList.toggle("is-active", !isLocal)
        localTabButton.setAttribute("aria-selected", isLocal ? "true" : "false")
        globalTabButton.setAttribute("aria-selected", !isLocal ? "true" : "false")

        currentMeta = renderStatsView({
            stats: isLocal ? localStats : globalStats,
            order,
            labels,
            summaryElement: summary,
            chartElement: chart,
            summaryOverride: isLocal
                ? null
                : getTopPercentageMessage(globalStats, playerCompletionKey, order, labels)
        })
    }

    function getActiveTab() {
        return activeTab
    }

    function getCurrentSummary() {
        return {
            totalGames: currentMeta.totalGames,
            wins: currentMeta.wins,
            winRate: currentMeta.winRate
        }
    }

    setActiveTab("local")

    function close() {
        overlay.hidden = true
        if (!hasProvidedElements) {
            overlay.remove()
        }
        document.removeEventListener("keydown", onEscape)
    }

    function open() {
        if (!overlay.isConnected) {
            mountTarget.appendChild(overlay)
        }
        overlay.hidden = false
        document.addEventListener("keydown", onEscape)
    }

    function destroy() {
        close()
    }

    function onEscape(event) {
        if (event.key === "Escape") {
            close()
        }
    }

    closeButton.addEventListener("click", close)
    localTabButton.addEventListener("click", () => setActiveTab("local"))
    globalTabButton.addEventListener("click", () => setActiveTab("global"))
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            close()
        }
    })

    overlay.hidden = true

    if (options.openOnCreate === true) {
        open()
    }

    return {
        open,
        close,
        destroy,
        overlay,
        popup,
        chart,
        tabs,
        getActiveTab,
        getCurrentSummary,
        setActiveTab,
        stats: localStats,
        totalGames: currentMeta.totalGames,
        wins: currentMeta.wins,
        winRate: currentMeta.winRate
    }
}
