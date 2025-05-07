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

// Инициализация темы
function initTheme() {
	const stored = localStorage.getItem('theme')
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
	const theme = stored || (prefersDark ? 'dark' : 'light')
	document.documentElement.setAttribute('data-theme', theme)
	updateToggleIcon(theme)
	document.getElementById('theme-toggle').addEventListener('click', () => {
		const next =
			document.documentElement.getAttribute('data-theme') === 'dark'
				? 'light'
				: 'dark'
		document.documentElement.setAttribute('data-theme', next)
		localStorage.setItem('theme', next)
		updateToggleIcon(next)
	})
}

// Подгрузка аватарки и ролей
async function loadUserIcon() {
	try {
		const res = await fetch('/api/profile', { credentials: 'same-origin' })
		if (!res.ok) return null
		const user = await res.json()
		if (user.avatar_path) {
			const navImg = document.querySelector('.user-icon img')
			if (navImg) navImg.src = user.avatar_path
		}
		if (user.role === 'admin') {
			document.getElementById('nav-admin').style.display = 'flex'
		}
		if (user.role === 'teacher') {
			document.getElementById('nav-teacher').style.display = 'inline-block'
		}
		return user
	} catch (err) {
		console.error('Error loading user icon:', err)
		return null
	}
}

// Показать popup с результатом
function showPopup(score, total) {
	const overlay = document.getElementById('popupOverlay')
	document.getElementById(
		'popupResult'
	).textContent = `Вы набрали ${score} из ${total}.`
	document.getElementById('progressFill').style.width = `${
		(score / total) * 100
	}%`
	overlay.classList.add('active')
}
function closePopup() {
	document.getElementById('popupOverlay').classList.remove('active')
}

// Основная логика
document.addEventListener('DOMContentLoaded', async () => {
	initTheme()
	await loadUserIcon()

	// Парсим ?test=ID
	const params = new URLSearchParams(location.search)
	const testId = params.get('test')
	if (!testId) {
		document.getElementById('quiz').textContent = 'Тест не указан.'
		return
	}

	// Загружаем вопросы
	let questions
	try {
		const res = await fetch(`/api/tests/${testId}/questions`, {
			credentials: 'same-origin',
		})
		if (!res.ok) throw new Error(res.status)
		questions = await res.json()
	} catch (e) {
		document.getElementById('quiz').textContent = 'Ошибка загрузки теста.'
		console.error(e)
		return
	}

	// Отрисовка вопросов
	const form = document.getElementById('quiz')
	questions.forEach((q, idx) => {
		const wrapper = document.createElement('div')
		wrapper.className = 'question'
		const h = document.createElement('h4')
		h.textContent = `${idx + 1}. ${q.question_text}`
		wrapper.appendChild(h)

		if (q.question_type === 'closed') {
			q.options.forEach(opt => {
				const label = document.createElement('label')
				const inp = document.createElement('input')
				inp.type = q.multiple_choice ? 'checkbox' : 'radio'
				inp.name = `q_${q.id}`
				inp.value = opt.id
				label.append(inp, ' ', opt.option_text)
				wrapper.appendChild(label)
			})
		} else {
			const ta = document.createElement('textarea')
			ta.name = `q_${q.id}`
			wrapper.appendChild(ta)
		}
		form.appendChild(wrapper)
	})

	// Проверка ответов
	document.getElementById('check').addEventListener('click', () => {
		let score = 0
		const total = questions.length

		questions.forEach(q => {
			const name = `q_${q.id}`
			if (q.question_type === 'closed') {
				const selected = Array.from(form.elements[name])
					.filter(el => el.checked)
					.map(el => el.value)
				const correct = q.options
					.filter(o => o.is_correct)
					.map(o => String(o.id))
				// сравниваем как множества
				if (
					selected.length === correct.length &&
					selected.every(v => correct.includes(v))
				) {
					score++
				}
			} else {
				// для открытых вопросов можно договориться о ручной проверке
			}
		})

		showPopup(score, total)
	})

	// Закрытие попапа
	document.getElementById('popupOverlay').addEventListener('click', e => {
		if (e.target.id === 'popupOverlay') closePopup()
	})
	document.addEventListener('keydown', e => {
		if (e.key === 'Escape') closePopup()
	})
})
