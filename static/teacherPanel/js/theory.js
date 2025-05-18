// Показ/скрытие спиннера
function showLoader() {
	document.getElementById('loading-overlay').classList.remove('hidden')
}
function hideLoader() {
	document.getElementById('loading-overlay').classList.add('hidden')
}

// Универсальная функция тостов
function showToast(message, type = 'success', timeout = 3000) {
	const container = document.getElementById('toast-container')
	const toast = document.createElement('div')
	toast.className = `toast ${type}`
	toast.textContent = message
	container.appendChild(toast)
	setTimeout(() => {
		toast.style.opacity = '0'
		setTimeout(() => container.removeChild(toast), 300)
	}, timeout)
}
