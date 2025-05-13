let heartbeatId

// стартуем пинги каждые 10 сек после загрузки страницы
window.addEventListener('DOMContentLoaded', () => {
	const url = '/api/ping'
	heartbeatId = setInterval(() => {
		fetch(url, { method: 'POST', credentials: 'include' }).catch(() => {
			/* игнорируем ошибки */
		})
	}, 10_000)
})

// при закрытии вкладки/браузера очищаем таймер и шлём финальный пинг
window.addEventListener('unload', () => {
	clearInterval(heartbeatId)
	navigator.sendBeacon('/api/ping')
})
;(function () {
	// 1) Пробуем взять сохранённую тему
	var stored = localStorage.getItem('theme')
	// 2) Если нет, берём системную
	var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
	var theme = stored || (prefersDark ? 'dark' : 'light')
	// 3) Сразу ставим атрибут на <html>
	document.documentElement.setAttribute('data-theme', theme)
})()
