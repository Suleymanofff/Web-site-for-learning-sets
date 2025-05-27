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

function levenshtein(a, b) {
	const an = a.length
	const bn = b.length
	if (an === 0) return bn
	if (bn === 0) return an

	const matrix = []

	for (let i = 0; i <= bn; i++) {
		matrix[i] = [i]
	}
	for (let j = 0; j <= an; j++) {
		matrix[0][j] = j
	}

	for (let i = 1; i <= bn; i++) {
		for (let j = 1; j <= an; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1]
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1, // замена
					matrix[i][j - 1] + 1, // вставка
					matrix[i - 1][j] + 1 // удаление
				)
			}
		}
	}

	return matrix[bn][an]
}

function compareTextAnswers(userInput, correct, threshold = 80) {
	const u = userInput.trim().toLowerCase()
	const c = correct.trim().toLowerCase()
	if (!c) return false
	const distance = levenshtein(u, c)
	const maxLen = Math.max(u.length, c.length)
	const similarity = (1 - distance / maxLen) * 100
	return similarity >= threshold
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

async function createAttempt(testId) {
	const res = await fetch(`/api/tests/${testId}/attempts`, {
		method: 'POST',
		credentials: 'include',
	})
	if (!res.ok) throw new Error(`Не удалось создать попытку: ${res.status}`)
	return await res.json()
}

// Отправка одного ответа на бэкенд
async function submitAnswer(attemptId, questionId, isCorrect) {
	await fetch('/api/student/answer', {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			attempt_id: attemptId,
			question_id: questionId,
			is_correct: isCorrect,
		}),
	})
}

// Основная логика
document.addEventListener('DOMContentLoaded', async () => {
	initTheme()
	await loadUserIcon()

	const params = new URLSearchParams(location.search)
	const testId = params.get('test')
	const courseId = params.get('course')

	if (!testId || !courseId) {
		document.getElementById('quiz').textContent = 'Тест или курс не указан.'
		return
	}

	// ----- Работа с localStorage -----
	let currentAttempt = null
	function loadState() {
		const raw = localStorage.getItem('currentAttempt')
		currentAttempt = raw ? JSON.parse(raw) : null
	}
	function saveState() {
		localStorage.setItem('currentAttempt', JSON.stringify(currentAttempt))
	}
	function clearState() {
		localStorage.removeItem('currentAttempt')
		currentAttempt = null
	}

	// ===== Загружаем вопросы =====
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

	// ----- Константы и API-обёртки -----
	const MAX_ATTEMPTS = 2

	async function finishAttempt(attemptId, score, correct, wrong) {
		const res = await fetch(`/api/attempts/${attemptId}/finish`, {
			method: 'PATCH',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				score,
				correct_answers: correct,
				wrong_answers: wrong,
			}),
		})
		if (!res.ok) throw new Error(`Не удалось завершить попытку: ${res.status}`)
		return await res.json()
	}

	// ----- Утилиты модалок из coursePage -----
	function showModal(id) {
		const overlay = document.getElementById(id)
		overlay.style.display = 'flex' // flex, чтобы сработали align-items/justify
		// Закрытие кликом по фону
		overlay.addEventListener('click', onOverlayClick)
	}
	function closeModal(id) {
		const overlay = document.getElementById(id)
		overlay.style.display = 'none'
		overlay.removeEventListener('click', onOverlayClick)
	}
	function onOverlayClick(e) {
		// если кликнуто именно по оверлею, закроем
		// if (e.target.classList.contains('modal-overlay')) {
		// 	closeModal(e.target.id)
		// }
	}

	// ----- Основная логика рендера вопросов -----
	;(async function initQuiz() {
		loadState()
		const form = document.getElementById('quiz')

		questions.forEach((q, idx) => {
			const wrapper = document.createElement('div')
			wrapper.className = 'question'

			// Заголовок и метка сложности
			const header = document.createElement('div')
			header.className = 'question-header'

			const h = document.createElement('h4')
			h.textContent = `${idx + 1}. ${q.question_text}`

			const diffLabel = document.createElement('span')
			// diffLabel получает CSS-класс в зависимости от английского уровня,
			// чтобы стилизовать (цвета) по-прежнему работали
			diffLabel.className = `diff-label ${q.difficulty}`

			// Словарь перевода на русский
			const difficultyMap = {
				easy: 'лёгкий',
				medium: 'средний',
				hard: 'сложный',
			}

			// Устанавливаем текст метки на русском
			diffLabel.textContent = difficultyMap[q.difficulty] || q.difficulty

			header.append(h, diffLabel)
			wrapper.appendChild(header)

			// Вопрос закрытого/открытого типа
			if (q.question_type === 'closed') {
				q.options.forEach(opt => {
					const label = document.createElement('label')
					const inp = document.createElement('input')
					inp.type = q.multiple_choice ? 'checkbox' : 'radio'
					inp.name = `q_${q.id}`
					inp.value = String(opt.id)

					// Если в state уже есть ответ — восстановим его
					if (currentAttempt?.answers?.[q.id]) {
						const saved = currentAttempt.answers[q.id]
						if (q.multiple_choice) {
							if (saved.includes(String(opt.id))) inp.checked = true
						} else {
							if (saved === String(opt.id)) inp.checked = true
						}
					}

					// При изменении ответа — сохраняем
					inp.addEventListener('change', () => {
						loadState()
						if (!currentAttempt) return
						if (q.multiple_choice) {
							const sels = Array.from(form.elements[`q_${q.id}`])
								.filter(el => el.checked)
								.map(el => el.value)
							currentAttempt.answers[q.id] = sels
						} else {
							const sel = form.elements[`q_${q.id}`].value
							currentAttempt.answers[q.id] = sel
						}
						saveState()
					})

					label.append(inp, ' ', opt.option_text)
					wrapper.appendChild(label)
				})
			} else {
				const ta = document.createElement('textarea')
				ta.name = `q_${q.id}`
				ta.classList.add('open-question-input')

				// Восстановим предыдущий ввод
				if (currentAttempt?.answers?.[q.id]) {
					ta.value = currentAttempt.answers[q.id]
				}

				ta.addEventListener('input', () => {
					loadState()
					if (!currentAttempt) return
					currentAttempt.answers[q.id] = ta.value.trim()
					saveState()
				})

				wrapper.appendChild(ta)
			}

			form.appendChild(wrapper)
		})

		document.getElementById('check').addEventListener('click', async () => {
			let score = 0,
				correct = 0,
				wrong = 0

			for (const q of questions) {
				let isCorrect
				if (q.question_type === 'closed') {
					const sel = Array.isArray(currentAttempt.answers[q.id])
						? currentAttempt.answers[q.id]
						: [currentAttempt.answers[q.id]]
					const sol = q.options.filter(o => o.is_correct).map(o => String(o.id))
					isCorrect =
						sel.length === sol.length && sel.every(v => sol.includes(v))
				} else {
					isCorrect = compareTextAnswers(
						currentAttempt.answers[q.id] || '',
						q.correct_answer_text,
						80
					)
				}

				// здесь отправляем каждый ответ
				await submitAnswer(currentAttempt.attemptId, q.id, isCorrect)

				// считаем результат
				if (isCorrect) {
					score++
					correct++
				} else {
					wrong++
				}
			}

			// завершаем попытку один раз
			await finishAttempt(currentAttempt.attemptId, score, correct, wrong)

			// показываем модалку с результатом
			document.getElementById(
				'finishAttemptTitle'
			).textContent = `Вы набрали ${score} баллов`
			document.getElementById('finishAttemptMsg').textContent =
				currentAttempt.attemptNumber === 1
					? 'У вас осталась 1 попытка'
					: 'У вас не осталось попыток'
			document.getElementById('btnRetryAttempt').disabled =
				currentAttempt.attemptNumber >= MAX_ATTEMPTS

			showModal('finishAttemptModal')
		})

		// Крестик закрытия результата
		document.getElementById('closeFinishAttempt').onclick = () => {
			const courseId = currentAttempt.courseId
			clearState()
			closeModal('finishAttemptModal')
			navigate(`/static/coursePage/?course=${courseId}`)
		}

		document.getElementById('btnRetryAttempt').onclick = async () => {
			clearState()
			const { attemptId, attemptNumber } = await createAttempt(testId)
			currentAttempt = {
				attemptId,
				attemptNumber,
				startedAt: Date.now(),
				answers: {},
				testId,
				courseId,
			}
			saveState()
			closeModal('finishAttemptModal')
			navigate(`/static/questions/index.html?test=${testId}`)
		}

		// Кнопка «Завершить»
		document.getElementById('btnConfirmFinish').onclick = () => {
			const courseId = currentAttempt.courseId
			clearState()
			closeModal('finishAttemptModal')
			navigate(`/static/coursePage/?course=${courseId}`)
		}
	})()
})
