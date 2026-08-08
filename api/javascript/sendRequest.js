
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

    console.log(`Request to ${url} succeeded with status ${request.status}`)
    console.log(`Response: ${request.responseText}`)

	const contentType = request.getResponseHeader("Content-Type") || ""
	if (contentType.toLowerCase().includes("application/json")) {
		return JSON.parse(request.responseText)
	}

	return request.responseText
}

export function postRequest(gameTitle, result, optionalPathPart) {
	if (typeof gameTitle !== "string" || gameTitle.trim().length === 0) {
		throw new Error("gameTitle must be a non-empty string")
	}
	if (typeof result !== "string" || result.trim().length === 0) {
		throw new Error("result must be a non-empty string")
	}

	const amount = result === 'success_game' ? `/${optionalPathPart}` || '' : ''

	const url = `https://api.games.kak.im/games/${gameTitle}/date/today/${result}${amount}`
	const request = new XMLHttpRequest()

	// Fire-and-forget request: async mode returns immediately.
	request.open("POST", url, true)
	request.setRequestHeader("Content-Type", "application/json")
	request.send("{}")
}

