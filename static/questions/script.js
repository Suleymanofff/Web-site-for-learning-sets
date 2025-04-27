// Навигация
function navigate(url) {
	window.location.href = url
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
	document.getElementById('theme-toggle').addEventListener('click', () => {
		const next =
			document.documentElement.getAttribute('data-theme') === 'dark'
				? 'light'
				: 'dark'
		document.documentElement.setAttribute('data-theme', next)
		localStorage.setItem('theme', next)
		updateToggleIcon(next)
	})

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

	loadUserIcon()
})
