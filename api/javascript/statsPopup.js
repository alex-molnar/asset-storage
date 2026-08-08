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
*/


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
    const stats = normalizeStats(statsInput || defaultStats)
    const labels = { ...defaultLabels, ...(options.labels || {}) }
    const title = options.title || "Your previous performance"
    const mountTarget = options.mountTarget || document.body
    const order = typeof statsBarOrder !== "undefined" && Array.isArray(statsBarOrder) && statsBarOrder.length > 0
        ? statsBarOrder
        : Object.keys(stats)

    const values = order.map(key => stats[key])
    const totalGames = values.reduce((sum, value) => sum + value, 0)
    const failedGames = stats.games_failed
    const wins = Math.max(totalGames - failedGames, 0)
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0
    const maxValue = Math.max(...values, 1)

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
    summary.textContent = `Games: ${totalGames} | Wins: ${wins} | Win rate: ${winRate}%`

    const chart = options.chart || buildStatsElement("div", "stats-chart")
    chart.setAttribute("role", "list")
    chart.innerHTML = ""

    order.forEach(key => {
        const value = stats[key]
        const widthPercent = Math.round((value / maxValue) * 100)

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
        chart.appendChild(row)
    })

    if (!hasProvidedElements) {
        const header = buildStatsElement("div", "stats-popup-header")
        header.append(heading, closeButton)
        popup.append(header, summary, chart)
        overlay.appendChild(popup)
    }

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
        stats,
        totalGames,
        wins,
        winRate
    }
}
