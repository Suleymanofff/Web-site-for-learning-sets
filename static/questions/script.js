// Навигация
function navigate(url) {
	window.location.href = url
}

// Обновление иконки темы
function updateToggleIcon(theme) {
	const btn = document.getElementById('theme-toggle')
	if (!btn) return
	btn.innerHTML = ''
	const icon = document.createElement('img')
	icon.alt = 'Toggle theme'
	icon.src =
		theme === 'dark'
			? '/static/img/light-theme.png'
			: '/static/img/dark-theme.png'
	btn.appendChild(icon)
}

/* -----------------------
   2. Подгрузка аватарки в навбар
   (теперь возвращает user для роли)
------------------------ */
async function loadUserIcon() {
	try {
		const res = await fetch('/api/profile', { credentials: 'same-origin' })
		if (!res.ok) return null // не залогинен или ошибка
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

// Показать popup с результатом
function showPopup(score) {
	const overlay = document.getElementById('popupOverlay')
	document.getElementById(
		'popupResult'
	).textContent = `Вы набрали ${score} из 10.`
	document.getElementById('progressFill').style.width = `${(score / 10) * 100}%`
	overlay.classList.add('active')
}

// Закрыть popup
function closePopup() {
	document.getElementById('popupOverlay').classList.remove('active')
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

	// Переключатель темы
	const toggleBtn = document.getElementById('theme-toggle')
	if (toggleBtn) {
		toggleBtn.addEventListener('click', () => {
			const next =
				document.documentElement.getAttribute('data-theme') === 'dark'
					? 'light'
					: 'dark'
			document.documentElement.setAttribute('data-theme', next)
			localStorage.setItem('theme', next)
			updateToggleIcon(next)
		})
	}

	// Проверка ответов
	const correctAnswers = {
		q1: '2',
		q2: '2',
		q3: '2',
		q4: '1',
		q5: '2',
		q6: '0',
		q7: '1',
		q8: '1',
		q9: '1',
		q10: '2',
	}
	document.getElementById('check').addEventListener('click', () => {
		let score = 0
		for (let q in correctAnswers) {
			const sel = document.querySelector(`input[name="${q}"]:checked`)
			if (sel && sel.value === correctAnswers[q]) score++
		}
		showPopup(score)
	})

	// Закрытие попапа
	document.getElementById('popupOverlay').addEventListener('click', e => {
		if (e.target.id === 'popupOverlay') closePopup()
	})
	document.addEventListener('keydown', e => {
		if (e.key === 'Escape') closePopup()
	})

	// Загрузка аватарки и проверка роли для показа админ‑ссылки
	loadUserIcon().then(user => {
		if (!user) return
		if (user.role === 'admin') {
			const adminTile = document.getElementById('nav-admin')
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
})
