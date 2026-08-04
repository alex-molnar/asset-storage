import { capitalize, unLe } from "./stringUtils.js"

let selectedSuggestionIndex = -1
let alreadyGuessed = []
const currentDate = new Date().toISOString().split("T")[0];

export function loadGame(gameTitle, todaysSolutionName, solutions, displayRowsCallback) {
    if (localStorage.getItem(`${gameTitle}-${currentDate}`) != null) {
        alreadyGuessed = JSON.parse(localStorage.getItem(`${gameTitle}-${currentDate}`))
    }
    document.getElementById("game-title").textContent = gameTitle.capitalize()

    alreadyGuessed
        .filter(guess => guess !== todaysSolutionName)
        .forEach((guess, index) => displayRowsCallback(guess, index + 1, true))
    if (alreadyGuessed.includes(todaysSolutionName)) {
        displayRowsCallback(todaysSolutionName, alreadyGuessed.length, true)
    } else {
        let guessInput = document.getElementById("guess-input")
        guessInput.addEventListener("input", (e) => searchForSolution(e, solutions))
        guessInput.addEventListener("keydown", handleKeyboardNavigation)
        guessInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                submitGuess(e, solutions, displayRowsCallback)
            }
        })
        guessInput.addEventListener("blur", () => {
            setTimeout(hideSuggestions, 150) // Delay to allow click on suggestion
        })
        guessInput.focus()
        guessInput.select()
        document.getElementById("submit-button").addEventListener("click", (e) => submitGuess(e, solutions, displayRowsCallback))
    }
}

function submitGuess(e, solutions, displayRowsCallback) {
    let guessInput = document.getElementById("guess-input")
    let guess = guessInput.value
    if (!solutions.includes(guess)) {
        let firstChoice = solutions
            .filter(solution => !alreadyGuessed.includes(solution))
            .find(solution => solution.toLowerCase().startsWith(guess.toLowerCase().trim()) || solution.toLowerCase().includes(`(${guess.toLowerCase().trim()}`))
        if (firstChoice && guess.toLowerCase().trim().length > 0) {
            guessInput.value = firstChoice.trim()
            submitGuess(e, solutions, displayRowsCallback)
        } else if (guess.toLowerCase().trim().length > 0) {
            alert(`Please select a valid ${gameTitle.unLe()} from the suggestions.`)
        }
    } else if (alreadyGuessed.includes(guess)) {
        alert(`You have already guessed this ${gameTitle.unLe()}.`)
    } else {
        alreadyGuessed.push(guess)
        localStorage.setItem(`${gameTitle}-${currentDate}`, JSON.stringify(alreadyGuessed))
        guessInput.value = ""
        displayRowsCallback(guess, alreadyGuessed.length, false)
    } 
    hideSuggestions()
}

function searchForSolution(e, solutions) {
    let guess = e.target.value
    let suggestionsContainer = document.getElementById("suggestions-container")
    selectedSuggestionIndex = -1
    
    if (guess.length > 0 && !solutions.includes(guess)) {
        let filteredSolutions = solutions
            .filter(solution => solution.toLowerCase().startsWith(guess.toLowerCase().trim()) || solution.toLowerCase().includes(`(${guess.toLowerCase().trim()}`))
            .filter(solution => !alreadyGuessed.includes(solution))
            .slice(0, 8) // Limit to 8 suggestions
        
        if (filteredSolutions.length > 0) {
            suggestionsContainer.innerHTML = filteredSolutions.map((solution, index) => 
                `<div class="suggestion-item" data-value="${solution}" data-index="${index}">${solution}</div>`
            ).join('')
            suggestionsContainer.classList.add("show")
            
            // Add click handlers to suggestions
            suggestionsContainer.querySelectorAll(".suggestion-item").forEach(item => {
                item.addEventListener("click", () => selectSuggestion(item.dataset.value))
            })
        } else {
            hideSuggestions()
        }
    } else {
        hideSuggestions()
    }
}

function hideSuggestions() {
    let suggestionsContainer = document.getElementById("suggestions-container")
    suggestionsContainer.innerHTML = ""
    suggestionsContainer.classList.remove("show")
    selectedSuggestionIndex = -1
}

function selectSuggestion(value) {
    document.getElementById("guess-input").value = value
    hideSuggestions()
}

function handleKeyboardNavigation(e) {
    let suggestionsContainer = document.getElementById("suggestions-container")
    let items = suggestionsContainer.querySelectorAll(".suggestion-item")
    
    if (!suggestionsContainer.classList.contains("show") || items.length === 0) return
    
    if (e.key === "ArrowDown") {
        e.preventDefault()
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, items.length - 1)
        updateSelectedSuggestion(items)
    } else if (e.key === "ArrowUp") {
        e.preventDefault()
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, 0)
        updateSelectedSuggestion(items)
    } else if (e.key === "Escape") {
        hideSuggestions()
    }
}

function updateSelectedSuggestion(items) {
    items.forEach((item, index) => {
        item.classList.toggle("selected", index === selectedSuggestionIndex)
    })
    if (selectedSuggestionIndex >= 0) {
        document.getElementById("guess-input").value = items[selectedSuggestionIndex].dataset.value
    }
}