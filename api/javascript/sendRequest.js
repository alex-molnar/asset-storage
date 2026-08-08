
export function sendRequest(gameTitle) {
	if (typeof gameTitle !== "string" || gameTitle.trim().length === 0) {
		throw new Error("gameTitle must be a non-empty string")
	}

    const url = `https://api.games.kak.im/games/${gameTitle}/today`
	const request = new XMLHttpRequest()

	// Synchronous request by passing false as the third argument.
	request.open("GET", url, false)
	request.setRequestHeader("Accept", "application/json")
	request.send(null)

	if (request.status < 200 || request.status >= 300) {
		throw new Error(`Request failed with status ${request.status}`)
	}

	const contentType = request.getResponseHeader("Content-Type") || ""
	if (contentType.toLowerCase().includes("application/json")) {
		return JSON.parse(request.responseText)
	}

	return request.responseText
}
