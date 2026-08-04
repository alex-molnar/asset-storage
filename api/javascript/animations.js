export function launchConfetti() {
    let container = document.getElementById('confetti-container')
    if (!container) {
        container = document.createElement('div')
        container.id = 'confetti-container'
        document.body.appendChild(container)
    }
    
    const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181', '#aa96da', '#fcbad3', '#a8d8ea', '#00a629', '#0b74de']
    const shapes = ['square', 'circle', 'ribbon']
    const confettiCount = 150
    
    for (let i = 0; i < confettiCount; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div')
            confetti.className = `confetti ${shapes[Math.floor(Math.random() * shapes.length)]}`
            confetti.style.left = Math.random() * 100 + '%'
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)]
            confetti.style.animationDuration = (Math.random() * 2 + 2) + 's'
            confetti.style.animationDelay = Math.random() * 0.5 + 's'
            confetti.style.setProperty('--random', Math.random())
            container.appendChild(confetti)
            
            setTimeout(() => confetti.remove(), 4500)
        }, i * 20)
    }
    
    setTimeout(() => container.innerHTML = '', 5000)
}