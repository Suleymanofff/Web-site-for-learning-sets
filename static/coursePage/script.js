// 1. Функция навигации
function navigate(url) {
	window.location.href = url
}

// 2. Извлечение параметра course из URL
function getCourseId() {
	const params = new URLSearchParams(window.location.search)
	return params.get('course')
}

// 3. Пользователь и тема — вынесены из общего script.js
async function loadUserIcon() {
	try {
		const res = await fetch('/api/profile', { credentials: 'same-origin' })
		if (!res.ok) return null
		const user = await res.json()
		if (user.avatar_path) {
			const navImg = document.querySelector('.user-icon img')
			if (navImg) navImg.src = user.avatar_path
		}
		// Показ ссылок по ролям
		if (user.role === 'admin') {
			const admin = document.getElementById('nav-admin')
			if (admin) admin.style.display = 'inline-block'
		}
		if (user.role === 'teacher') {
			const teacher = document.getElementById('nav-teacher')
			if (teacher) teacher.style.display = 'inline-block'
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

// 4. Загрузка данных курса и рендер
async function loadCoursePage() {
	const courseId = getCourseId()
	if (!courseId) return

	// Получаем данные курса
	let course
	try {
		const res = await fetch(`/api/courses/${courseId}`, {
			credentials: 'same-origin',
		})
		if (!res.ok) throw new Error(`Status ${res.status}`)
		course = await res.json()
	} catch (err) {
		console.error('Error loading course:', err)
		document.getElementById('course-title').textContent =
			'Ошибка загрузки курса'
		return
	}
	document.getElementById('course-title').textContent = course.title

	// Рендер теории
	const theoryList = document.getElementById('theory-list')
	if (Array.isArray(course.theory) && course.theory.length) {
		theoryList.innerHTML = ''
		course.theory.forEach(item => {
			const div = document.createElement('div')
			div.className = 'card'
			div.innerHTML = `
        <h3>${item.title}</h3>
        <p>${item.summary}</p>
        <button onclick="navigate('/static/theory/index.html?topic=${item.id}')">Читать</button>
      `
			theoryList.appendChild(div)
		})
	} else {
		theoryList.textContent = 'Теории пока нет.'
	}

	// Рендер тестов
	const testsList = document.getElementById('tests-list')
	if (Array.isArray(course.tests) && course.tests.length) {
		testsList.innerHTML = ''
		course.tests.forEach(test => {
			const div = document.createElement('div')
			div.className = 'card'
			div.innerHTML = `
        <h3>${test.title}</h3>
        <p>Вопросов: ${test.question_count}</p>
        <button onclick="navigate('/static/questions/index.html?test=${test.id}')">Пройти тест</button>
      `
			testsList.appendChild(div)
		})
	} else {
		testsList.textContent = 'Тестов пока нет.'
	}
}

// 5. Инициализация документа
document.addEventListener('DOMContentLoaded', () => {
	// Инициализируем тему и иконку пользователя
	initThemeToggle()
	loadUserIcon()
	// Загружаем контент курса
	loadCoursePage()
})
