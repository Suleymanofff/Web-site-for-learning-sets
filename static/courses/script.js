/* -----------------------
   1. Функция навигации
------------------------ */
function navigate(url) {
	// Перенаправляет браузер на указанный URL
	window.location.href = url
}

/* -----------------------
   2. Подгрузка аватарки в навбар
------------------------ */
async function loadUserIcon() {
	try {
		const res = await fetch('/api/profile', { credentials: 'same-origin' })
		if (!res.ok) return // не залогинен или другая ошибка
		const user = await res.json()

		if (user.avatar_path) {
			const navImg = document.querySelector('.user-icon img')
			if (navImg) navImg.src = user.avatar_path
		}
	} catch (err) {
		console.error('Error loading user icon:', err)
	}
}

// Обновление иконки темы
function updateToggleIcon(theme) {
	const btn = document.getElementById('theme-toggle')
	// Очищаем содержимое кнопки
	btn.innerHTML = ''

	// Создаём элемент изображения
	const icon = document.createElement('img')
	icon.alt = 'Toggle theme' // Альтернативный текст для доступности

	// Устанавливаем путь к изображению в зависимости от темы
	icon.src =
		theme === 'dark'
			? '/static/img/light-theme.png'
			: '/static/img/dark-theme.png'

	// Добавляем изображение в кнопку
	btn.appendChild(icon)
}

document.addEventListener('DOMContentLoaded', () => {
	// Активная ссылка меню
	const path = window.location.pathname
	document.querySelectorAll('.nav-links a').forEach(link => {
		link.classList.toggle('active', path.startsWith(link.getAttribute('href')))
	})

	// Инициализация темы
	const stored = localStorage.getItem('theme')
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
	const theme = stored || (prefersDark ? 'dark' : 'light')
	document.documentElement.setAttribute('data-theme', theme)
	updateToggleIcon(theme)

	// Переключатель темы
	document.getElementById('theme-toggle').addEventListener('click', () => {
		const next =
			document.documentElement.getAttribute('data-theme') === 'dark'
				? 'light'
				: 'dark'
		document.documentElement.setAttribute('data-theme', next)
		localStorage.setItem('theme', next)
		updateToggleIcon(next)
	})

	loadUserIcon()

	// TODO: загрузка и отображение списка курсов
})
