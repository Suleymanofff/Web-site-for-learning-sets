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

async function fetchLatestAttempt(testId) {
	const res = await fetch(`/api/tests/${testId}/attempts/latest`, {
		credentials: 'same-origin',
		headers: authHeaders(),
	})
	console.log(`fetchLatestAttempt(${testId}) → status`, res.status)

	if (res.status === 204) {
		console.log(`  → нет завершённых попыток`)
		return null
	}
	if (!res.ok) {
		console.warn(`  → ошибка запроса: ${res.status}`)
		return null
	}

	// Если 200 OK — читаем тело
	const data = await res.json()
	console.log(`  → тело ответа:`, data)

	// Маппим snake_case → camelCase
	const latest = {
		score: data.score,
		attemptNumber: data.attempt_number ?? data.attemptNumber,
	}
	console.log(`  → mapped latest:`, latest)
	return latest
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

let currentAttempt = null // { attemptId, attemptNumber, startedAt, answers:{ [q]:true/false } }
const MAX_ATTEMPTS = 2

async function loadTheory(courseId) {
	const container = document.getElementById('theory-list')
	container.textContent = 'Загрузка теории...'

	try {
		const res = await fetch(`/api/courses/${courseId}/theory`, {
			credentials: 'same-origin',
			headers: authHeaders(),
		})
		if (!res.ok) throw new Error(`Status ${res.status}`)

		const data = await res.json()
		container.innerHTML = ''

		data.forEach(item => {
			const div = document.createElement('div')
			div.className = 'card'

			// 1. Удаляем HTML-теги и преобразуем HTML-сущности
			const tempDiv = document.createElement('div')
			tempDiv.innerHTML = item.content
			let textContent = tempDiv.textContent || tempDiv.innerText || ''

			// 2. Очистка и обрезка текста
			textContent = textContent
				.replace(/\s+/g, ' ') // Заменяем множественные пробелы
				.trim()

			// 3. Умная обрезка до 40 символов
			const preview =
				textContent.length > 40
					? textContent.substring(0, 40).split(' ').slice(0, -1).join(' ') +
					  '...'
					: textContent

			div.innerHTML = `
                <h3>${item.title}</h3>
                ${textContent ? `<p>${preview}</p>` : ''}
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

		for (const test of tests) {
			// 1) Сколько попыток сделано
			let done = await getAttemptsDone(test.id)
			// 2) Последняя завершённая попытка (или null)
			const latest = await fetchLatestAttempt(test.id)
			const remaining = MAX_ATTEMPTS - (latest?.attemptNumber || 0)

			// 3) Рендер карточки
			const card = document.createElement('div')
			card.className = 'card test-card'

			const title = document.createElement('h3')
			title.textContent = test.title
			card.appendChild(title)

			if (test.description) {
				const desc = document.createElement('p')
				desc.textContent = test.description
				card.appendChild(desc)
			}

			const infoCount = document.createElement('div')
			infoCount.className = 'info'
			infoCount.textContent = `Вопросов: ${test.question_count}`
			card.appendChild(infoCount)

			if (test.created_at) {
				const infoDate = document.createElement('div')
				infoDate.className = 'info'
				infoDate.textContent = `Создано: ${new Date(
					test.created_at
				).toLocaleDateString()}`
				card.appendChild(infoDate)
			}

			console.log(`Test ${test.id}: done=${done}, latest=`, latest)

			// 4) Кнопка «Пройти тест»
			const btn = document.createElement('button')
			btn.textContent = 'Пройти тест'
			btn.setAttribute('data-test-id', test.id)

			if (remaining <= 0) {
				btn.classList.add('muted')
				btn.addEventListener('click', () => onClickStart(test.id, remaining))
			} else {
				btn.addEventListener('click', () => onClickStart(test.id, remaining))
			}
			card.appendChild(btn)

			// 5) Если есть результаты — плашка с баллами
			if (latest) {
				const status = document.createElement('div')
				status.className = 'status'
				status.textContent = `Пройден: ${latest.score} баллов`
				card.appendChild(status)
			}

			container.appendChild(card)
		}
	} catch (err) {
		console.error('❌ Ошибка при загрузке тестов:', err)
		container.textContent = 'Ошибка при загрузке тестов'
	}
}

async function onClickStart(testId) {
	// получаем сколько осталось
	const latest = await fetchLatestAttempt(testId)
	const remaining = MAX_ATTEMPTS - (latest?.attemptNumber || 0)

	const titleEl = document.getElementById('startAttemptTitle')
	const btnStart = document.getElementById('btnStartAttempt')

	if (remaining <= 0) {
		// исчерпаны попытки
		titleEl.textContent = `Вы истратили обе попытки`
		btnStart.disabled = true
		btnStart.classList.add('muted')
	} else {
		// остались попытки
		titleEl.textContent = `У вас есть ${remaining} попытк${
			remaining === 1 ? 'а' : 'и'
		}`
		btnStart.disabled = false
		btnStart.classList.remove('muted')

		btnStart.onclick = async () => {
			closeModal('startAttemptModal')
			const { attemptId, attemptNumber } = await createAttempt(testId)
			currentAttempt = {
				attemptId,
				attemptNumber,
				startedAt: Date.now(),
				answers: {},
				courseId: getCourseId(),
				testId,
			}
			saveState()
			navigate(
				`/static/questions/index.html?test=${testId}&course=${getCourseId()}`
			)
		}
	}

	// Показываем модалку всегда
	showModal('startAttemptModal')

	// Привязываем отмену
	document.getElementById('btnCancelStart').onclick = () =>
		closeModal('startAttemptModal')
}

// ----- API: Работа с попытками -----
async function getAttemptsDone(testId) {
	const res = await fetch(`/api/tests/${testId}/attempts/count`, {
		credentials: 'include', // ← ключевой момент
	})
	if (!res.ok) throw new Error(`Ошибка ${res.status}`)
	return (await res.json()).attemptsDone
}

async function createAttempt(testId) {
	const res = await fetch(`/api/tests/${testId}/attempts`, {
		method: 'POST',
		credentials: 'include',
	})
	if (!res.ok) throw new Error(`Не удалось создать попытку: ${res.status}`)
	return await res.json()
}

async function finishAttempt(attemptId, score, correct, wrong) {
	const res = await fetch(`/api/attempts/${attemptId}/finish`, {
		method: 'PATCH',
		credentials: 'include', // ← обязательно
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			score,
			correct_answers: correct,
			wrong_answers: wrong,
		}),
	})
	if (!res.ok) throw new Error(`Не удалось завершить попытку: ${res.status}`)
	return await res.json()
}

function saveState() {
	localStorage.setItem('currentAttempt', JSON.stringify(currentAttempt))
}
function loadState() {
	const raw = localStorage.getItem('currentAttempt')
	currentAttempt = raw ? JSON.parse(raw) : null
}
function clearState() {
	localStorage.removeItem('currentAttempt')
	currentAttempt = null
}

function showModal(id) {
	const overlay = document.getElementById(id)
	overlay.style.display = 'flex'

	// Закрытие по клику вне .modal-content
	overlay.onclick = e => {
		if (e.target === overlay) closeModal(id)
	}
}
function closeModal(id) {
	document.getElementById(id).style.display = 'none'
}

document.addEventListener('DOMContentLoaded', () => {
	initThemeToggle()
	loadUserIcon()
	loadCoursePage()
})
