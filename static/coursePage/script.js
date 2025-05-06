function navigate(url) {
	window.location.href = url
}

function getCourseId() {
	const params = new URLSearchParams(window.location.search)
	return params.get('course') || params.get('id')
}

async function loadUserIcon() {
	try {
		const res = await fetch('/api/profile', { credentials: 'same-origin' })
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

function getToken() {
	const match = document.cookie.match(/token=([^;]+)/)
	return match ? match[1] : null
}

async function loadCoursePage() {
	const courseId = getCourseId()
	if (!courseId) return

	try {
		const res = await fetch(`/api/courses/${courseId}`, {
			credentials: 'same-origin',
		})
		if (!res.ok) throw new Error(`Status ${res.status}`)
		const course = await res.json()
		document.getElementById('course-title').textContent = course.title
	} catch (err) {
		console.error('Error loading course:', err)
		document.getElementById('course-title').textContent =
			'Ошибка загрузки курса'
	}

	await loadTheory(courseId)
	await loadTests(courseId)
}

async function loadTheory(courseId) {
	const container = document.getElementById('theory-list')
	container.innerHTML = 'Загрузка теории...'
	try {
		const res = await fetch(`/api/courses/${courseId}/theory`, {
			headers: { Authorization: `Bearer ${getToken()}` },
			credentials: 'same-origin',
		})
		if (!res.ok) throw new Error('Ошибка загрузки теории')
		const data = await res.json()
		container.innerHTML = ''
		data.forEach(item => {
			const div = document.createElement('div')
			div.className = 'card'
			div.innerHTML = `
				<h3>${item.title}</h3>
				<p>${item.summary}</p>
				<button onclick="navigate('/static/theory/index.html?topic=${item.id}')">Читать</button>
			`
			container.appendChild(div)
		})
	} catch (err) {
		container.textContent = 'Ошибка при загрузке теории'
	}
}

async function loadTests(courseId) {
	const container = document.getElementById('tests-list')
	container.innerHTML = 'Загрузка тестов...'
	try {
		const res = await fetch(`/api/courses/${courseId}/tests`, {
			headers: { Authorization: `Bearer ${getToken()}` },
			credentials: 'same-origin',
		})
		if (!res.ok) {
			const text = await res.text()
			console.error('Ошибка загрузки тестов:', res.status, text)
			throw new Error('Ошибка загрузки тестов')
		}
		const data = await res.json()
		container.innerHTML = ''
		data.forEach(test => {
			const div = document.createElement('div')
			div.className = 'card'
			div.innerHTML = `
				<h3>${test.title}</h3>
				<p>Вопросов: ${test.question_count}</p>
				<button onclick="navigate('/static/questions/index.html?test=${test.id}')">Пройти тест</button>
			`
			container.appendChild(div)
		})
	} catch (err) {
		console.error('Ошибка в loadTests:', err)
		container.textContent = 'Ошибка при загрузке тестов'
	}
}

document.addEventListener('DOMContentLoaded', () => {
	initThemeToggle()
	loadUserIcon()
	loadCoursePage()
})
