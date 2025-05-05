/* -----------------------
   1. Функция навигации
------------------------ */
function navigate(url) {
	// Перенаправляет браузер на указанный URL
	window.location.href = url
}

/* -----------------------
   2. Подгрузка аватарки в навбар
   (возвращаем объект user!)  ←!
------------------------ */
async function loadUserIcon() {
	try {
		const res = await fetch('/api/profile', { credentials: 'same-origin' })
		if (!res.ok) return null // не залогинен или другая ошибка
		const user = await res.json()

		if (user.avatar_path) {
			const navImg = document.querySelector('.user-icon img')
			if (navImg) navImg.src = user.avatar_path
		}

		return user // ←! возвращаем для проверки роли
	} catch (err) {
		console.error('Error loading user icon:', err)
		return null // ←! на ошибке тоже возвращаем null
	}
}

// Обновляет иконку темы
function updateToggleIcon(theme) {
	const btn = document.getElementById('theme-toggle')
	// Очищаем содержимое кнопки
	btn.innerHTML = ''

	// Создаём элемент изображения
	const icon = document.createElement('img')
	icon.alt = 'Toggle theme'

	// Устанавливаем путь к изображению в зависимости от темы
	icon.src =
		theme === 'dark'
			? '/static/img/light-theme.png'
			: '/static/img/dark-theme.png'

	// Добавляем изображение в кнопку
	btn.appendChild(icon)
}

document.addEventListener('DOMContentLoaded', () => {
	// Подсветка активного пункта меню
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

	// Обработчик переключения темы
	document.getElementById('theme-toggle').addEventListener('click', () => {
		const next =
			document.documentElement.getAttribute('data-theme') === 'dark'
				? 'light'
				: 'dark'
		document.documentElement.setAttribute('data-theme', next)
		localStorage.setItem('theme', next)
		updateToggleIcon(next)
	})

	// --- показываем аватар и одновременно проверяем роль ---
	loadUserIcon().then(user => {
		if (!user) return
		if (user.role === 'admin') {
			const adminTile = document.getElementById('go-to-admin')
			if (adminTile) adminTile.style.display = 'flex'
		}
		if (user.role === 'teacher') {
			// 1) в навигации
			const navTeacher = document.getElementById('nav-teacher')
			if (navTeacher) navTeacher.style.display = 'inline-block'
			// 2) на главной странице-плитках
			const teacherTile = document.getElementById('go-to-teacher')
			if (teacherTile) teacherTile.style.display = 'flex'
		}
	})

	// TODO: инициализация и запуск анимации в #animation-container
})
