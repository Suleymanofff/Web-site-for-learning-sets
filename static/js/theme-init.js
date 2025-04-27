;(function () {
	// 1) Пробуем взять сохранённую тему
	var stored = localStorage.getItem('theme')
	// 2) Если нет, берём системную
	var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
	var theme = stored || (prefersDark ? 'dark' : 'light')
	// 3) Сразу ставим атрибут на <html>
	document.documentElement.setAttribute('data-theme', theme)
})()
