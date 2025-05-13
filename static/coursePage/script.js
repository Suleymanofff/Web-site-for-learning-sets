function navigate(url) {
	window.location.href = url
}

function getCourseId() {
	const params = new URLSearchParams(window.location.search)
	return params.get('course') || params.get('id')
}

function getToken() {
	const match = document.cookie.match(/token=([^;]+)/)
	return match ? match[1] : ''
}

// ✅ Безопасное добавление заголовка Authorization
function authHeaders() {
	const token = getToken()
	return token ? { Authorization: `Bearer ${token}` } : {}
}

async function loadUserIcon() {
	try {
		const res = await fetch('/api/profile', {
			credentials: 'same-origin',
			headers: authHeaders(),
		})
		if (!res.ok) return null
		const user = await res.json()
		if (user.avatar_path) {
			document.querySelector('.user-icon img').src = user.avatar_path
		}
		if (user.role === 'admin') {
			document.getElementById('nav-admin').style.display = 'inline-block'
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

function initThemeToggle() {
	const stored = localStorage.getItem('theme')
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
	const theme = stored || (prefersDark ? 'dark' : 'light')
	document.documentElement.setAttribute('data-theme', theme)
	updateToggleIcon(theme)
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
}

async function fetchCourses() {
	const res = await fetch('/api/courses', { credentials: 'same-origin' })
	if (!res.ok) throw new Error(`Ошибка ${res.status}`)
	return await res.json()
}

async function loadCoursePage() {
	const courseId = getCourseId()
	if (!courseId) return

	const titleElem = document.getElementById('course-title')
	titleElem.textContent = 'Загрузка курса…'

	try {
		const courses = await fetchCourses() // грузим все курсы
		const course = courses.find(c => String(c.id) === String(courseId)) // ищем нужный
		if (course) {
			titleElem.textContent = course.title
		} else {
			titleElem.textContent = 'Курс #' + courseId
		}
	} catch (err) {
		console.error('Ошибка загрузки курсов:', err)
		titleElem.textContent = 'Курс #' + courseId
	}

	await loadTheory(courseId)
	await loadTests(courseId)
}

async function loadTheory(courseId) {
	const container = document.getElementById('theory-list')
	container.textContent = 'Загрузка теории…'

	try {
		const res = await fetch(`/api/courses/${courseId}/theory`, {
			credentials: 'same-origin',
			headers: authHeaders(),
		})
		if (!res.ok) throw new Error(`Status ${res.status}`)

		const data = await res.json()
		container.innerHTML = ''

		if (!Array.isArray(data) || !data.length) {
			container.textContent = 'Темы теории отсутствуют'
			return
		}

		data.forEach(item => {
			const div = document.createElement('div')
			div.className = 'card'

			const textOnly = item.content.replace(/<[^>]+>/g, '')
			const preview =
				textOnly.length > 100 ? `${textOnly.slice(0, 40)}…` : textOnly

			div.innerHTML = `
        <h3>${item.title}</h3>
        ${preview ? `<p>${preview}</p>` : ''}
        <button onclick="navigate('/static/theory/index.html?topic=${
					item.id
				}')">
          Читать
        </button>
      `
			container.appendChild(div)
		})
	} catch (err) {
		console.error('loadTheory error:', err)
		container.textContent = 'Ошибка при загрузке теории'
	}
}

async function loadTests(courseId) {
	const container = document.getElementById('tests-list')
	container.textContent = 'Загрузка тестов…'

	try {
		const res = await fetch(`/api/courses/${courseId}/tests`, {
			credentials: 'same-origin',
			headers: authHeaders(),
		})
		if (!res.ok) throw new Error(`Status ${res.status}`)
		const tests = await res.json()

		container.innerHTML = ''
		if (!tests.length) {
			container.textContent = 'Тестов пока нет.'
			return
		}

		tests.forEach(test => {
			const div = document.createElement('div')
			div.className = 'card test-card'
			div.innerHTML = `
        <h3>${test.title}</h3>
        ${test.description ? `<p>${test.description}</p>` : ''}
        <div class="info">Вопросов: ${test.question_count}</div>
        ${
					test.created_at
						? `<div class="info">Создано: ${new Date(
								test.created_at
						  ).toLocaleDateString()}</div>`
						: ''
				}
        <button onclick="navigate('/static/questions/index.html?test=${
					test.id
				}')">
          Пройти тест
        </button>
      `
			container.appendChild(div)
		})
	} catch (err) {
		console.error('loadTests error:', err)
		container.textContent = 'Ошибка при загрузке тестов'
	}
}

document.addEventListener('DOMContentLoaded', () => {
	initThemeToggle()
	loadUserIcon()
	loadCoursePage()
})
