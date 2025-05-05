/* -----------------------
   1. Функция навигации
------------------------ */
function navigate(url) {
	// Перенаправляет браузер на указанный URL
	window.location.href = url
}

/* -----------------------
   2. Подгрузка аватарки в навбар
   (теперь возвращает объект user)
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

		return user
	} catch (err) {
		console.error('Error loading user icon:', err)
		return null
	}
}

/* -----------------------
   3. Обновление иконки темы
------------------------ */
function updateToggleIcon(theme) {
	const btn = document.getElementById('theme-toggle')
	if (!btn) return

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
	/* -----------------------
     4. Подсветка активной ссылки
  ------------------------ */
	const path = window.location.pathname
	document.querySelectorAll('.nav-links a').forEach(link => {
		link.classList.toggle('active', path.startsWith(link.getAttribute('href')))
	})

	/* -----------------------
     5. Инициализация темы
  ------------------------ */
	const stored = localStorage.getItem('theme')
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
	const theme = stored || (prefersDark ? 'dark' : 'light')
	document.documentElement.setAttribute('data-theme', theme)
	updateToggleIcon(theme)

	/* -----------------------
     6. Переключатель темы
  ------------------------ */
	const toggle = document.getElementById('theme-toggle')
	if (toggle) {
		toggle.addEventListener('click', () => {
			const next =
				document.documentElement.getAttribute('data-theme') === 'dark'
					? 'light'
					: 'dark'
			document.documentElement.setAttribute('data-theme', next)
			localStorage.setItem('theme', next)
			updateToggleIcon(next)
		})
	}

	/* -----------------------
     7. Подгрузка аватарки и показа скрытой ссылки‑ссылки
  ------------------------ */
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

	// TODO: загрузка и отображение списка курсов
})
