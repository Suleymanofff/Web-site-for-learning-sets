// -----------------------
// 1. Навигация
// -----------------------
function navigate(url) {
	window.location.href = url
}

// -----------------------
// 2. Загрузка аватарки
// -----------------------
async function loadUserIcon() {
	try {
		const res = await fetch('/api/profile', { credentials: 'same-origin' })
		if (!res.ok) return null // не залогинен или другая ошибка
		const user = await res.json()
		if (user.avatar_path) {
			const img = document.querySelector('.user-icon img')
			if (img) img.src = user.avatar_path
		}
		return user
	} catch (err) {
		console.error('Error loading user icon:', err)
		return null
	}
}

/* -----------------------
   1. Обновление иконки темы
------------------------ */
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

/* --------------------
       5. Тема
  --------------------- */
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

// ——— State и функции для модалки быстрых вопросов ———
let quickIsDirty = false

function openQuestionModal(testId) {
	document.getElementById('quickTestId').value = testId
	document.getElementById('questionModal').style.display = 'flex'
	quickIsDirty = false
	document.getElementById('saveQuickQuestions').disabled = true
	clearQuickModal()
}

function clearQuickModal() {
	document.getElementById('quickQuestionsList').innerHTML = ''
	document.getElementById('quickQuestionForm').reset()
	document.getElementById('quick_correct_answer').style.display = 'none'
}

function tryCloseModal() {
	if (quickIsDirty) {
		document.getElementById('unsavedConfirm').style.display = 'block'
	} else {
		forceCloseModal()
	}
}

function forceCloseModal() {
	document.getElementById('questionModal').style.display = 'none'
	document.getElementById('unsavedConfirm').style.display = 'none'
	clearQuickModal()
	location.reload()
}

function cancelClose() {
	document.getElementById('unsavedConfirm').style.display = 'none'
}

async function saveQuickQuestions() {
	const testId = +document.getElementById('quickTestId').value
	const items = document.querySelectorAll('#quickQuestionsList .question-item')

	for (let li of items) {
		// Сохраняем сам вопрос
		const qRes = await fetch('/api/teacher/questions', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				test_id: testId,
				question_text: li.querySelector('.question-text')?.textContent ?? '',
				question_type: li.dataset.type,
				multiple_choice: li.dataset.multi === 'true',
				correct_answer_text:
					li.dataset.type === 'open' ? li.dataset.correct : null,
			}),
		})

		if (!qRes.ok) throw new Error('Не удалось сохранить вопрос')

		const { id: questionId } = await qRes.json()

		// Сохраняем варианты
		if (li.dataset.type === 'closed') {
			const opts = li.querySelectorAll('li.option-item')
			for (let opt of opts) {
				const textEl = opt.querySelector('.option-text')
				if (!textEl) continue

				const isCorrect = opt.dataset.correct === 'true'

				await fetch('/api/teacher/options', {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						question_id: questionId,
						option_text: textEl.textContent.trim(),
						is_correct: isCorrect,
					}),
				})
			}
		}
	}

	quickIsDirty = false
	document.getElementById('saveQuickQuestions').disabled = true
	forceCloseModal()
}

function renumberQuestions() {
	document
		.querySelectorAll('#quickQuestionsList .question-item')
		.forEach((li, idx) => {
			const num = li.querySelector('.question-number')
			if (num) num.textContent = `${idx + 1}.`
		})
}

// -----------------------
// loadOptions
// -----------------------
async function loadOptions(questionId) {
	const tbodyOpts = document.getElementById(`opts-${questionId}`)
	if (!tbodyOpts) return
	tbodyOpts.innerHTML = ''
	try {
		const res = await fetch(`/api/teacher/options?question_id=${questionId}`, {
			credentials: 'include',
		})
		if (!res.ok) throw ''
		const opts = await res.json()
		opts.forEach(o => {
			const tr = document.createElement('tr')
			tr.innerHTML = `
        <td><input class="edit-opt-text" data-id="${o.id}" value="${
				o.option_text
			}"></td>
        <td><input type="checkbox" class="edit-opt-correct" data-id="${o.id}"${
				o.is_correct ? ' checked' : ''
			}></td>
        <td>
          <button class="save-option" data-id="${
						o.id
					}"><i class="fas fa-save"></i></button>
          <button class="del-option" data-id="${
						o.id
					}"><i class="fas fa-trash"></i></button>
        </td>`
			tbodyOpts.appendChild(tr)
		})
	} catch {
		console.error('Ошибка загрузки вариантов')
	}
}

async function loadQuestions(testId) {
	const tbody = document.getElementById('questionsBody')
	tbody.innerHTML = ''
	if (!testId) return
	try {
		const res = await fetch(`/api/teacher/questions?test_id=${testId}`, {
			credentials: 'include',
		})
		if (!res.ok) throw ''
		const qs = await res.json()
		qs.forEach(q => {
			// Основная строка
			const tr = document.createElement('tr')
			tr.innerHTML = `
        <td><input class="edit-text" data-id="${q.id}" value="${
				q.question_text
			}"></td>
        <td>
          <select class="edit-type" data-id="${q.id}">
            <option value="open"${
							q.question_type === 'open' ? ' selected' : ''
						}>Открытый</option>
            <option value="closed"${
							q.question_type === 'closed' ? ' selected' : ''
						}>Закрытый</option>
          </select>
        </td>
        <td>
          <input
            type="checkbox"
            class="edit-multi ${
							q.question_type === 'open' ? 'checkbox-disabled' : ''
						}"
            data-id="${q.id}"
            ${q.multiple_choice ? 'checked' : ''}
            ${q.question_type === 'open' ? 'disabled' : ''}
          >
        </td>
        <td>${q.test_id}</td>
        <td>
          <select class="edit-difficulty" data-id="${q.id}">
            <option value="easy"${
							q.difficulty === 'easy' ? ' selected' : ''
						}>лёгкий</option>
            <option value="medium"${
							q.difficulty === 'medium' ? ' selected' : ''
						}>средний</option>
            <option value="hard"${
							q.difficulty === 'hard' ? ' selected' : ''
						}>сложный</option>
          </select>
        </td>
        <td>${new Date(q.created_at).toLocaleDateString()}</td>
        <td>
          <button class="manage-options"
                  data-id="${q.id}"
                  data-type="${q.question_type}">
            <i class="fas fa-list"></i> Варианты
          </button>
        </td>
        <td class="action-cell">
          <button class="save-question" data-id="${
						q.id
					}"><i class="fas fa-save"></i> Сохранить</button>
          <button class="del-question" data-id="${
						q.id
					}"><i class="fas fa-trash"></i> Удалить</button>
        </td>`
			tbody.appendChild(tr)

			// Скрытая строка
			const trOpts = document.createElement('tr')
			trOpts.className = 'options-row'
			trOpts.dataset.qid = q.id
			trOpts.dataset.type = q.question_type
			trOpts.style.display = 'none'

			if (q.question_type === 'closed') {
				trOpts.innerHTML = `
          <td colspan="8">
            <div class="options-wrapper" style="min-height:100px; padding:10px;">
              <table class="options-table">
                <thead><tr><th>Вариант</th><th>Правильный?</th><th>Действия</th></tr></thead>
                <tbody id="opts-${q.id}"></tbody>
              </table>
              <div class="option-form">
                <input type="text" class="new-opt-text" placeholder="Новый вариант">
                <input type="checkbox" class="new-opt-correct">
                <button class="save-new-option" data-id="${q.id}"><i class="fas fa-plus"></i></button>
              </div>
            </div>
          </td>`
			} else {
				trOpts.innerHTML = `
          <td colspan="8">
            <div class="options-wrapper">
              <div class="open-answer-wrapper">
                <label>Правильный ответ:</label>
                <input type="text" class="open-answer-input" value="${
									q.correct_answer_text || ''
								}" />
                <button class="save-open-answer" data-id="${
									q.id
								}">Сохранить</button>
                <button class="delete-open-answer" data-id="${
									q.id
								}">Удалить</button>
              </div>
            </div>
          </td>`
			}
			tbody.appendChild(trOpts)
		})

		document.dispatchEvent(new CustomEvent('teacherQuestions:loaded'))
	} catch {
		console.error('Ошибка загрузки вопросов')
	}
	updateDifficultyStyles()
}

async function initQuestions() {
	const select = document.getElementById('testSelect')

	// 1) Загрузка списка тестов
	try {
		const r = await fetch('/api/teacher/tests', { credentials: 'include' })
		if (!r.ok) throw new Error(r.statusText)
		const ts = await r.json()
		ts.forEach(t => {
			const o = document.createElement('option')
			o.value = t.id
			o.textContent = t.title
			select.appendChild(o)
		})
		if (ts.length) {
			select.value = ts[0].id
			await loadQuestions(ts[0].id)
		}
	} catch (err) {
		console.error('Не удалось загрузить тесты', err)
	}

	// 2) При смене выбранного теста — перезагружаем вопросы
	select.addEventListener('change', () => {
		loadQuestions(select.value)
	})

	// 3) Форма добавления нового вопроса
	const form = document.getElementById('newQuestionForm')
	const typeSelect = document.getElementById('newQuestionType')
	const answerInput = document.getElementById('newAnswerInput')
	const multiCheckboxNew = form.querySelector("input[name='multiple_choice']")
	const multiLabel = document.getElementById('multiAnswerLabel')

	typeSelect.addEventListener('change', () => {
		const isOpen = typeSelect.value === 'open'
		answerInput.style.display = isOpen ? 'block' : 'none'
		multiCheckboxNew.checked = false
		multiCheckboxNew.disabled = isOpen
		multiCheckboxNew.classList.toggle('checkbox-disabled', isOpen)
		multiLabel.classList.toggle('checkbox-disabled', isOpen)
	})

	form.addEventListener('submit', async e => {
		e.preventDefault()
		const fd = new FormData(form)
		const payload = {
			test_id: +fd.get('test_id'),
			question_text: fd.get('question_text'),
			question_type: fd.get('question_type'),
			multiple_choice: fd.get('multiple_choice') === 'on',
			correct_answer_text: fd.get('correct_answer_text') || null,
		}
		try {
			const res = await fetch('/api/teacher/questions', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			if (!res.ok) throw new Error(await res.text())
			form.reset()
			answerInput.style.display = 'none'
			await loadQuestions(payload.test_id)
		} catch (err) {
			alert('Ошибка создания вопроса: ' + err.message)
		}
	})

	// 4) Изменение типа вопроса прямо в таблице вопросов
	const tbody = document.getElementById('questionsBody')
	tbody.addEventListener('change', e => {
		if (!e.target.matches('.edit-type')) return
		const sel = e.target
		const id = sel.dataset.id
		const row = sel.closest('tr')
		const multiInput = row.querySelector(`.edit-multi[data-id="${id}"]`)
		const optsBtn = row.querySelector(`.manage-options[data-id="${id}"]`)
		if (sel.value === 'open') {
			multiInput.checked = false
			multiInput.disabled = true
			multiInput.classList.add('checkbox-disabled')
			optsBtn.style.display = 'none'
		} else {
			multiInput.disabled = false
			multiInput.classList.remove('checkbox-disabled')
			optsBtn.style.display = 'inline-block'
		}
	})

	// 5) Делегированный обработчик кликов по таблице вопросов
	tbody.addEventListener('click', async e => {
		// a) Переключение панели вариантов/ответа
		if (e.target.closest('.manage-options')) {
			const btn = e.target.closest('.manage-options')
			const qid = btn.dataset.id
			const row = document.querySelector(`.options-row[data-qid="${qid}"]`)
			const isHidden = getComputedStyle(row).display === 'none'
			if (isHidden) {
				if (btn.dataset.type === 'closed') {
					await loadOptions(qid)
				}
				row.style.display = 'table-row'
			} else {
				row.style.display = 'none'
			}
			return
		}

		// b) Сохранение открытого ответа
		if (e.target.matches('.save-open-answer')) {
			const qid = e.target.dataset.id
			const row = document.querySelector(`.options-row[data-qid="${qid}"]`)
			const answer = row.querySelector('.open-answer-input').value.trim()
			try {
				const res = await fetch('/api/teacher/questions/set_open_answer', {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: +qid, answer }),
				})
				if (!res.ok) throw new Error(await res.text())
				alert('Ответ сохранён')
			} catch (err) {
				console.error(err)
				alert('Не удалось сохранить ответ')
			}
			return
		}

		// c) Удаление открытого ответа
		if (e.target.matches('.delete-open-answer')) {
			const qid = e.target.dataset.id
			if (!confirm('Удалить ответ?')) return
			try {
				const res = await fetch('/api/teacher/questions/set_open_answer', {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: +qid, answer: '' }),
				})
				if (!res.ok) throw new Error(await res.text())
				const row = document.querySelector(`.options-row[data-qid="${qid}"]`)
				row.querySelector('.open-answer-input').value = ''
				alert('Ответ удалён')
			} catch (err) {
				console.error(err)
				alert('Не удалось удалить ответ')
			}
			return
		}

		// d) Сохранить отредактированный вопрос вместе со всеми вариантами
		if (e.target.matches('.save-question')) {
			const qid = e.target.dataset.id
			const row = e.target.closest('tr')
			const text = row
				.querySelector(`.edit-text[data-id="${qid}"]`)
				.value.trim()
			const type = row.querySelector(`.edit-type[data-id="${qid}"]`).value
			const multi = row.querySelector(`.edit-multi[data-id="${qid}"]`).checked
			const diff = row.querySelector(`.edit-difficulty[data-id="${qid}"]`).value // <-- новое

			const payload = {
				id: +qid,
				question_text: text,
				question_type: type,
				multiple_choice: multi,
				difficulty: diff, // <-- новое поле
			}

			// Для open‑вопросов — корректный ответ
			if (type === 'open') {
				const optionsRow = document.querySelector(
					`.options-row[data-qid="${qid}"]`
				)
				const input = optionsRow?.querySelector('.open-answer-input')
				if (input) payload.correct_answer_text = input.value.trim()
			}

			try {
				// 1) Обновляем сам вопрос
				const resQ = await fetch('/api/teacher/questions', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})
				if (!resQ.ok) throw new Error(await resQ.text())

				// 2) Для закрытых вопросов — обновляем все варианты
				if (type === 'closed') {
					const tbodyOpts = document.getElementById(`opts-${qid}`)
					if (tbodyOpts) {
						for (let rowOpt of tbodyOpts.querySelectorAll('tr')) {
							const oid = rowOpt.querySelector('.edit-opt-text')?.dataset.id
							if (!oid) continue

							const optionText = rowOpt
								.querySelector(`.edit-opt-text[data-id="${oid}"]`)
								.value.trim()
							const isCorrect = rowOpt.querySelector(
								`.edit-opt-correct[data-id="${oid}"]`
							).checked

							const resO = await fetch('/api/teacher/options', {
								method: 'PUT',
								credentials: 'include',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									id: +oid,
									option_text: optionText,
									is_correct: isCorrect,
								}),
							})
							if (!resO.ok) {
								const txt = await resO.text()
								throw new Error(`Ошибка сохранения варианта ${oid}: ${txt}`)
							}
						}
					}
				}

				alert('Вопрос и варианты сохранены')
				await loadQuestions(select.value)
			} catch (err) {
				console.error(err)
				alert(err.message || 'Не удалось сохранить вопрос и варианты')
			}
			return
		}

		// e) Удалить вопрос
		if (e.target.matches('.del-question')) {
			const qid = e.target.dataset.id
			if (!confirm('Удалить вопрос?')) return
			try {
				const res = await fetch('/api/teacher/questions', {
					method: 'DELETE',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: +qid }),
				})
				if (!res.ok) throw new Error(await res.text())
				alert('Вопрос удалён')
				loadQuestions(select.value)
			} catch (err) {
				console.error(err)
				alert('Не удалось удалить вопрос')
			}
			return
		}

		// f) Создать новый вариант ответа для закрытого вопроса
		if (e.target.matches('.save-new-option')) {
			const qid = e.target.dataset.id
			const row = e.target.closest('tr')
			const textEl = row.querySelector('.new-opt-text')
			const correctEl = row.querySelector('.new-opt-correct')
			const optionText = textEl.value.trim()
			const isCorrect = correctEl.checked
			if (!optionText) {
				alert('Введите текст варианта')
				return
			}
			try {
				const res = await fetch('/api/teacher/options', {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						question_id: +qid,
						option_text: optionText,
						is_correct: isCorrect,
					}),
				})
				if (!res.ok) throw new Error(await res.text())
				textEl.value = ''
				correctEl.checked = false
				await loadOptions(qid)
			} catch (err) {
				console.error(err)
				alert('Не удалось добавить вариант')
			}
			return
		}

		// g) Сохранить существующий вариант ответа
		if (e.target.matches('.save-option')) {
			const oid = e.target.dataset.id
			const rowOpt = e.target.closest('tr')
			const optionText = rowOpt
				.querySelector(`.edit-opt-text[data-id="${oid}"]`)
				.value.trim()
			const isCorrect = rowOpt.querySelector(
				`.edit-opt-correct[data-id="${oid}"]`
			).checked
			const qid = rowOpt.closest('tbody').id.split('-')[1]
			try {
				const res = await fetch('/api/teacher/options', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id: +oid,
						option_text: optionText,
						is_correct: isCorrect,
					}),
				})
				if (!res.ok) throw new Error(await res.text())
				alert('Вариант сохранён')
				await loadOptions(qid)
			} catch (err) {
				console.error(err)
				alert('Не удалось сохранить вариант')
			}
			return
		}

		// h) Удалить существующий вариант ответа
		if (e.target.matches('.del-option')) {
			const oid = e.target.dataset.id
			const rowOpt = e.target.closest('tr')
			const qid = rowOpt.closest('tbody').id.split('-')[1]
			if (!confirm('Удалить вариант?')) return
			try {
				const res = await fetch('/api/teacher/options', {
					method: 'DELETE',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: +oid }),
				})
				if (!res.ok) throw new Error(await res.text())
				alert('Вариант удалён')
				await loadOptions(qid)
			} catch (err) {
				console.error(err)
				alert('Не удалось удалить вариант')
			}
			return
		}
	})
}

// -----------------------
// initCourses
// -----------------------
async function initCourses() {
	const tbody = document.getElementById('teacherCoursesBody')
	try {
		const response = await fetch('/api/teacher/courses', {
			credentials: 'include',
		})
		if (!response.ok) throw new Error(response.statusText)
		const courses = await response.json()

		courses.forEach(c => {
			const tr = document.createElement('tr')
			tr.innerHTML = `
		  <td><input class="edit-text" data-id="${c.id}" value="${c.title}"></td>
		  <td><input class="edit-text" data-id="${c.id}" value="${c.description}"></td>
		  <td>${new Date(c.created_at).toLocaleDateString()}</td>
		  <td class="action-cell">
			<button class="save-course" data-id="${
				c.id
			}"><i class="fas fa-save"></i> Сохранить</button>
			<button class="del-course" data-id="${
				c.id
			}"><i class="fas fa-trash"></i> Удалить</button>
		  </td>
		`
			tbody.appendChild(tr)
		})

		// Уведомляем о завершении загрузки курсов для поиска
		document.dispatchEvent(new CustomEvent('teacherCourses:loaded'))
	} catch (err) {
		console.error('Ошибка загрузки курсов:', err)
	}

	// Обработка кликов по кнопкам Сохранить/Удалить
	tbody.addEventListener('click', async e => {
		const btn = e.target.closest('button')
		if (!btn) return
		const id = +btn.dataset.id

		if (btn.classList.contains('save-course')) {
			const inputs = Array.from(
				document.querySelectorAll(`.edit-text[data-id="${id}"]`)
			)
			const title = inputs[0].value
			const desc = inputs[1].value
			try {
				const res = await fetch('/api/teacher/courses', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, title, description: desc }),
				})
				if (!res.ok) throw new Error(await res.text())
				alert('Курс сохранён')
			} catch (err) {
				alert(err.message)
			}
		}

		if (btn.classList.contains('del-course')) {
			if (!confirm('Удалить курс?')) return
			try {
				const res = await fetch('/api/teacher/courses', {
					method: 'DELETE',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id }),
				})
				if (!res.ok) throw new Error(await res.text())
				btn.closest('tr').remove()
			} catch (err) {
				alert(err.message)
			}
		}
	})

	// Обработка добавления нового курса
	const form = document.getElementById('newTeacherCourseForm')
	form.addEventListener('submit', async e => {
		e.preventDefault()
		const fd = new FormData(form)
		try {
			const res = await fetch('/api/teacher/courses', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: fd.get('title'),
					description: fd.get('description'),
				}),
			})
			if (!res.ok) throw new Error(await res.text())
			// перезагрузка страницы после успешного добавления
			location.reload()
		} catch (err) {
			alert(err.message)
		}
	})
}

// -----------------------
// initTests
// -----------------------
async function initTests() {
	// Заполняем селект курсами
	const select = document.querySelector('#newTestForm select[name="course_id"]')
	try {
		const resCourses = await fetch('/api/teacher/courses', {
			credentials: 'include',
		})
		if (!resCourses.ok) throw new Error(resCourses.statusText)
		const cs = await resCourses.json()
		cs.forEach(c => {
			const o = document.createElement('option')
			o.value = c.id
			o.textContent = c.title
			select.appendChild(o)
		})
	} catch (err) {
		console.error('Ошибка загрузки курсов для тестов:', err)
	}

	// Загружаем тесты и рендерим строки
	const tbody = document.getElementById('testsBody')
	try {
		const resTests = await fetch('/api/teacher/tests', {
			credentials: 'include',
		})
		if (!resTests.ok) throw new Error(resTests.statusText)
		const ts = await resTests.json()
		ts.forEach(t => {
			const tr = document.createElement('tr')
			tr.innerHTML = `
		  <td><input class="edit-text" data-id="${t.id}" value="${t.title}"></td>
		  <td><input class="edit-text" data-id="${t.id}" value="${t.description}"></td>
		  <td>${t.course_id}</td>
		  <td>${new Date(t.created_at).toLocaleDateString()}</td>
		  <td class="action-cell">
			<button class="save-test" data-id="${
				t.id
			}"><i class="fas fa-save"></i> Сохранить</button>
			<button class="del-test" data-id="${
				t.id
			}"><i class="fas fa-trash"></i> Удалить</button>
		  </td>
		`
			tbody.appendChild(tr)
		})
		// Сигнализируем модулю поиска о готовности таблицы
		document.dispatchEvent(new CustomEvent('teacherTests:loaded'))
	} catch (err) {
		console.error('Ошибка загрузки тестов:', err)
	}

	// Обработка кликов Сохранить/Удалить
	tbody.addEventListener('click', async e => {
		const btn = e.target.closest('button')
		if (!btn) return
		const id = +btn.dataset.id

		if (btn.classList.contains('save-test')) {
			const inputs = Array.from(
				document.querySelectorAll(`.edit-text[data-id="${id}"]`)
			)
			const title = inputs[0].value
			const desc = inputs[1].value
			try {
				const res = await fetch('/api/teacher/tests', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, title, description: desc }),
				})
				if (!res.ok) throw new Error(await res.text())
				alert('Тест сохранён')
			} catch (err) {
				alert(err.message)
			}
		}

		if (btn.classList.contains('del-test')) {
			if (!confirm('Удалить тест?')) return
			try {
				const res = await fetch('/api/teacher/tests', {
					method: 'DELETE',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id }),
				})
				if (!res.ok) throw new Error(await res.text())
				btn.closest('tr').remove()
			} catch (err) {
				alert(err.message)
			}
		}
	})

	// Обработка формы добавления теста
	const form = document.getElementById('newTestForm')
	form.addEventListener('submit', async e => {
		e.preventDefault()
		const fd = new FormData(form)
		try {
			const res = await fetch('/api/teacher/tests', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: fd.get('title'),
					description: fd.get('description'),
					course_id: +fd.get('course_id'),
				}),
			})
			if (!res.ok) throw new Error(await res.text())
			const data = await res.json()
			const newTestId = data.id ?? data.test_id
			if (!newTestId) throw new Error('Не удалось получить ID созданного теста')
			openQuestionModal(newTestId)
		} catch (err) {
			alert('Ошибка создания теста: ' + err.message)
		}
	})
}

// Страница Теория

// -----------------------
// Инициализация и CRUD для раздела «Теория»
// -----------------------

// Глобальные переменные
let _theoryList = []
let _theoryCourseId = null
let _theoryCourseTitle = ''

let quill,
	quillInitialized = false
let _isCreatingTheory = false

// -----------------------
// initTheory — заполняет селектор курсов и загружает темы
// -----------------------
async function initTheory() {
	// 1) Заполняем селект курсами
	const select = document.getElementById('theoryCourseSelect')
	if (!select) {
		console.error('Не найден селект #theoryCourseSelect')
		return
	}
	select.innerHTML = '<option value="" disabled selected>Выберите курс</option>'

	let courses
	try {
		const res = await fetch('/api/teacher/courses', { credentials: 'include' })
		if (!res.ok) throw new Error(`Status ${res.status}`)
		courses = await res.json()
	} catch (err) {
		console.error('Ошибка загрузки курсов:', err)
		return
	}
	if (!Array.isArray(courses) || !courses.length) {
		console.warn('Нет курсов')
		return
	}
	courses.forEach(c => {
		const o = document.createElement('option')
		o.value = c.id
		o.textContent = c.title
		select.appendChild(o)
	})

	// 2) Выбираем первый курс и загружаем темы
	select.selectedIndex = 1
	_theoryCourseId = +select.value
	_theoryCourseTitle = select.selectedOptions[0].textContent
	document.getElementById(
		'page-title'
	).textContent = `Теория — ${_theoryCourseTitle}`
	await reloadTheoryList(_theoryCourseId)
	// Сигнализируем модулю поиска, что темы отрисованы
	document.dispatchEvent(new CustomEvent('teacherTheory:loaded'))

	// 3) При смене селекта — перезагружаем темы
	select.addEventListener('change', async e => {
		_theoryCourseId = +e.target.value
		_theoryCourseTitle = e.target.selectedOptions[0].textContent
		document.getElementById(
			'page-title'
		).textContent = `Теория — ${_theoryCourseTitle}`
		await reloadTheoryList(_theoryCourseId)
		// Снова кидаем событие после перерисовки
		document.dispatchEvent(new CustomEvent('teacherTheory:loaded'))
	})

	// 4) Обработка формы создания новой темы — вешаем только один раз
	const newForm = document.getElementById('newTheoryForm')
	if (newForm && !newForm.dataset.bound) {
		newForm.dataset.bound = 'true'
		newForm.addEventListener('submit', async e => {
			e.preventDefault()
			if (_isCreatingTheory) return
			const title = e.target.title.value.trim()
			if (!title) return
			_isCreatingTheory = true
			try {
				const res = await fetch(
					`/api/teacher/courses/${_theoryCourseId}/theory`,
					{
						method: 'POST',
						credentials: 'include',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ title }),
					}
				)
				if (!res.ok) throw new Error(await res.text())
				e.target.reset()
				await reloadTheoryList(_theoryCourseId)
				showToast('Тема успешно создана!', 'success')
				// Сигнал для поиска: новые строки отрисованы
				document.dispatchEvent(new CustomEvent('teacherTheory:loaded'))
			} catch (err) {
				console.error('Ошибка создания темы:', err)
				showToast('Ошибка при создании темы: ' + err.message, 'error')
			} finally {
				_isCreatingTheory = false
			}
		})
	}

	// 5) Делегированное открытие модалки редактирования содержания
	document.body.addEventListener('click', e => {
		const btn = e.target.closest('[data-action="open-theory-modal"]')
		if (!btn) return
		openTheoryModal(btn.dataset.topicId)
	})
}

// -----------------------
// reloadTheoryList — загрузить список тем и отрисовать карточки
// -----------------------
async function reloadTheoryList(courseId) {
	const container = document.getElementById('theoryCards')
	container.innerHTML = ''

	// 1) Запрос списка тем
	let res
	try {
		res = await fetch(`/api/courses/${courseId}/theory`, {
			credentials: 'include',
		})
	} catch (err) {
		console.error('Сетевая ошибка при загрузке тем:', err)
		container.innerHTML =
			'<p class="error">Не удалось загрузить темы (сетевая ошибка).</p>'
		showToast('Не удалось загрузить темы (сетевая ошибка).', 'error')
		return
	}

	// 2) Обработка HTTP‑статуса
	if (!res.ok) {
		console.error(`Ошибка ${res.status} при загрузке тем: ${res.statusText}`)
		container.innerHTML = `<p class="error">Не удалось загрузить темы (код ${res.status}).</p>`
		showToast(`Не удалось загрузить темы (код ${res.status}).`, 'error')
		return
	}

	// 3) Парсинг JSON
	let list
	try {
		list = await res.json()
	} catch (err) {
		console.error('Ошибка разбора JSON от сервера:', err)
		container.innerHTML = '<p class="error">Некорректный ответ сервера.</p>'
		showToast('Некорректный ответ сервера.', 'error')
		return
	}

	// 4) Пустой список тем
	if (!Array.isArray(list) || list.length === 0) {
		container.innerHTML = '<p class="empty">Тем ещё нет. Создайте первую!</p>'
		return
	}

	// 5) Рендер каждой карточки темы
	list.forEach(item => {
		const card = document.createElement('div')
		card.classList.add('theory-card')
		card.dataset.id = item.id

		// --- Редактирование заголовка ---
		const titleInput = document.createElement('input')
		titleInput.type = 'text'
		titleInput.classList.add('title-input')
		titleInput.value = item.title
		card.appendChild(titleInput)

		// --- Кнопка редактирования содержания ---
		const editBtn = document.createElement('button')
		editBtn.classList.add('edit-content', 'btn')
		editBtn.textContent = 'Редактировать содержание'
		editBtn.setAttribute('data-action', 'open-theory-modal')
		editBtn.setAttribute('data-topic-id', item.id)
		card.appendChild(editBtn)

		container.appendChild(card)

		// кнопка сохранить
		const saveBtn = document.createElement('button')
		saveBtn.classList.add('save-theory')
		saveBtn.textContent = 'Сохранить'
		saveBtn.addEventListener('click', async () => {
			const newTitle = titleInput.value.trim()
			if (!newTitle) {
				alert('Заголовок не может быть пустым')
				titleInput.value = item.title
				return
			}
			if (newTitle === item.title) return
			try {
				const updRes = await fetch(`/api/teacher/theory/${item.id}`, {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title: newTitle }),
				})
				if (!updRes.ok) throw new Error(`Код ${updRes.status}`)
				item.title = newTitle
				saveBtn.textContent = 'Сохранено'
				setTimeout(() => (saveBtn.textContent = 'Сохранить'), 1000)
			} catch (err) {
				console.error('Ошибка при сохранении темы:', err)
				alert('Не удалось сохранить: ' + err.message)
				titleInput.value = item.title
			}
		})
		card.appendChild(saveBtn)

		// --- Удаление темы ---
		const delBtn = document.createElement('button')
		delBtn.classList.add('btn', 'btn-danger')
		delBtn.textContent = 'Удалить'

		delBtn.addEventListener('click', async () => {
			if (!confirm('Удалить тему?')) return
			try {
				const delRes = await fetch(`/api/teacher/theory/${item.id}`, {
					method: 'DELETE',
					credentials: 'include',
				})
				if (!delRes.ok) throw new Error(`Код ${delRes.status}`)
				await reloadTheoryList(courseId)
			} catch (err) {
				console.error('Ошибка при удалении темы:', err)
				alert('Не удалось удалить тему: ' + err.message)
			}
		})
		card.appendChild(delBtn)
	})
}

let currentTheoryId = null

async function openTheoryModal(topicId) {
	currentTheoryId = topicId
	const modal = document.getElementById('theoryModal')
	modal.classList.remove('hidden')

	// Инициализируем Quill единожды
	if (!quillInitialized) {
		quill = new Quill('#editorCanvas', {
			modules: { toolbar: '#editorToolbar' },
			theme: 'snow',
		})
		quillInitialized = true

		// Регистрируем PDF‑blot
		const BlockEmbed = Quill.import('blots/block/embed')
		class PdfBlot extends BlockEmbed {
			static create(val) {
				const node = super.create()
				node.setAttribute('href', val.url)
				node.setAttribute('target', '_blank')
				node.innerHTML = `<i class="pdf-icon"></i>${val.name}`
				return node
			}
			static value(node) {
				return { url: node.getAttribute('href'), name: node.textContent }
			}
		}
		PdfBlot.blotName = 'pdf'
		PdfBlot.tagName = 'a'
		Quill.register(PdfBlot)

		// Обработчик вставки PDF
		document.getElementById('ql-insert-pdf').addEventListener('click', () => {
			const input = document.createElement('input')
			input.type = 'file'
			input.accept = 'application/pdf'
			input.click()
			input.onchange = async () => {
				const file = input.files[0]
				if (!file) return
				const fd = new FormData()
				fd.append('file', file)
				// showLoader()
				try {
					const res = await fetch(`/api/teacher/upload-theory-asset`, {
						method: 'POST',
						credentials: 'include',
						body: fd,
					})
					if (!res.ok) throw new Error(res.status)
					const { url } = await res.json()
					const range = quill.getSelection(true)
					quill.insertEmbed(range.index, 'pdf', { url, name: file.name })
					quill.setSelection(range.index + 1)
					showToast('PDF вставлен', 'success')
				} catch (err) {
					console.error(err)
					showToast('Ошибка загрузки PDF: ' + err.message, 'error')
				} finally {
					hideLoader()
				}
			}
		})
	}

	// Активируем редактор и загружаем контент
	quill.enable(true)
	quill.focus()
	try {
		const data = await fetch(`/api/teacher/theory/${currentTheoryId}`, {
			credentials: 'include',
		}).then(r => {
			if (!r.ok) throw r
			return r.json()
		})
		quill.root.innerHTML = data.content || ''
	} catch (err) {
		console.error(err)
		showToast('Не удалось загрузить содержание', 'error')
	}

	// Закрытие по оверлею и Esc
	modal.querySelector('.modal-overlay').onclick = () =>
		modal.classList.add('hidden')
	document.addEventListener('keydown', function esc(e) {
		if (e.key === 'Escape') {
			modal.classList.add('hidden')
			document.removeEventListener('keydown', esc)
		}
	})
}

function insertHtmlAtCursor(html) {
	const sel = window.getSelection()
	if (!sel.rangeCount) return
	const range = sel.getRangeAt(0)
	range.deleteContents()
	const el = document.createElement('div')
	el.innerHTML = html
	const frag = document.createDocumentFragment()
	let node, lastNode
	while ((node = el.firstChild)) {
		lastNode = frag.appendChild(node)
	}
	range.insertNode(frag)
	// Сдвинуть курсор после вставленного фрагмента
	if (lastNode) {
		range.setStartAfter(lastNode)
		sel.removeAllRanges()
		sel.addRange(range)
	}
}

async function handleFileUpload(inputEl, field) {
	if (!inputEl.files || inputEl.files.length === 0) return

	const file = inputEl.files[0]
	const allowedTypes = {
		image: ['image/jpeg', 'image/png', 'image/gif'],
		pdf: ['application/pdf'],
	}

	// Валидация файла
	if (!allowedTypes[field].includes(file.type)) {
		showToast('Недопустимый тип файла', 'error')
		return
	}

	if (file.size > 5 * 1024 * 1024) {
		// 5MB лимит
		showToast('Файл слишком большой (макс. 5MB)', 'error')
		return
	}

	const fd = new FormData()
	fd.append('file', file)
	fd.append('type', field)

	try {
		showToast('Загрузка файла...', 'info')
		const response = await fetch('/api/teacher/upload-theory-asset', {
			method: 'POST',
			credentials: 'include',
			body: fd,
		})

		if (!response.ok) throw new Error(await response.text())

		const data = await response.json()
		const safeUrl = DOMPurify.sanitize(data.url)
		const safeName = this.escapeHtml(file.name)

		switch (field) {
			case 'image':
				quill.insertEmbed(quill.getSelection().index, 'image', safeUrl)
				break

			case 'pdf':
				quill.insertEmbed(quill.getSelection().index, 'pdf', {
					url: safeUrl,
					name: safeName,
				})
				break
		}

		showToast('Файл успешно загружен', 'success')
	} catch (error) {
		console.error('Ошибка загрузки:', error)
		showToast(`Ошибка: ${error.message}`, 'error')
	} finally {
		inputEl.value = '' // Сброс инпута
	}
}

function createToastContainer() {
	const container = document.createElement('div')
	container.id = 'toast-container'
	document.body.appendChild(container)
	return container
}

// Универсальная функция тостов
function showToast(message, type = 'success', timeout = 3000) {
	const container = document.getElementById('toast-container')
	const toast = document.createElement('div')
	toast.className = `toast ${type}`
	toast.textContent = message
	container.appendChild(toast)
	setTimeout(() => {
		toast.style.opacity = '0'
		setTimeout(() => container.removeChild(toast), 300)
	}, timeout)
}

// -----------------------
// Стартуем всё при загрузке страницы
// -----------------------
document.addEventListener('DOMContentLoaded', () => {
	loadUserIcon()
	updateToggleIcon(document.documentElement.getAttribute('data-theme'))

	// Инициализация страниц
	if (document.getElementById('teacherCoursesBody')) initCourses()
	if (document.getElementById('testsBody')) initTests()
	if (document.getElementById('questionsBody')) initQuestions()
	if (document.querySelector('#newTheoryForm')) initTheory()

	// Открытие модалки
	document.body.addEventListener('click', e => {
		const btn = e.target.closest('[data-action="open-quick-modal"]')
		if (!btn) return
		openQuestionModal(btn.dataset.testId)
	})

	// Закрытие модалки
	document
		.getElementById('closeQuestionModal')
		?.addEventListener('click', tryCloseModal)
	document
		.getElementById('forceClose')
		?.addEventListener('click', forceCloseModal)
	document.getElementById('cancelClose')?.addEventListener('click', cancelClose)

	// Форма выбора типа вопроса
	const quickType = document.getElementById('question_type')
	const quickCorrect = document.getElementById('quick_correct_answer')
	const multiEl = document.getElementById('multiple_choice')
	const multiLabel = document.getElementById('multiLabel')
	quickType?.addEventListener('change', () => {
		const isOpen = quickType.value === 'open'
		quickCorrect.style.display = isOpen ? 'inline-block' : 'none'
		if (!isOpen) quickCorrect.value = ''
		multiLabel.style.display = isOpen ? 'none' : 'inline-flex'
		if (isOpen) multiEl.checked = false
	})

	// Добавление нового вопроса
	document
		.getElementById('quickQuestionForm')
		?.addEventListener('submit', e => {
			e.preventDefault()
			const text = document.getElementById('question_text').value.trim()
			const type = quickType.value
			const multi = multiEl.checked
			const correctOpen = quickCorrect.value.trim()
			if (!text) return alert('Введите текст вопроса')

			const li = document.createElement('li')
			li.className = 'question-item'
			li.dataset.type = type
			li.dataset.multi = multi
			if (type === 'open') li.dataset.correct = correctOpen

			if (type === 'closed') {
				li.innerHTML = `
		  <div class="question-header">
			<span class="question-number"></span>
			<span class="question-text">${text}</span>
			<div class="question-controls">
			  <button class="toggle-options" title="Варианты"><i class="fas fa-caret-down"></i></button>
			  <button class="remove-quick-question" title="Удалить">×</button>
			</div>
		  </div>
		  <div class="options-builder" style="display:none;">
			<ul class="option-list" style="list-style:none; padding:0;"></ul>
			<div class="add-option-form" style="display:flex; gap:0.5rem; margin-top:0.5rem;">
			  <input type="text" class="new-opt-text" placeholder="Новый вариант" style="flex:1;" />
			  <label><input type="checkbox" class="new-opt-correct" /> Правильный</label>
			  <button type="button" class="add-option-btn btn">Добавить</button>
			</div>
		  </div>
		`
			} else {
				li.innerHTML = `
		  <div class="question-header">
			<span class="question-number"></span>
			<span class="question-text">${text}</span>
			<div class="question-controls">
			  <button class="remove-quick-question" title="Удалить">×</button>
			</div>
		  </div>
		  <div class="options-builder" style="padding:0.5rem 0;">
			<label>Правильный ответ:</label>
			<input type="text" class="open-answer-builder" value="${correctOpen}" style="width:100%;" />
		  </div>
		`
			}

			document.getElementById('quickQuestionsList').appendChild(li)
			renumberQuestions()
			// clearQuickModal()
			quickIsDirty = true
			document.getElementById('saveQuickQuestions').disabled = false
		})

	// Делегированное управление вариантами и вопросами
	document
		.getElementById('quickQuestionsList')
		?.addEventListener('click', e => {
			const li = e.target.closest('li.question-item')
			if (!li) return

			// Переключаем блок вариантов
			if (e.target.closest('.toggle-options')) {
				const builder = li.querySelector('.options-builder')
				const icon = li.querySelector('.toggle-options i')
				const open = builder.style.display === 'block'
				builder.style.display = open ? 'none' : 'block'
				icon.className = open ? 'fas fa-caret-down' : 'fas fa-caret-up'
				return
			}
			// Добавляем вариант
			if (e.target.closest('.add-option-btn')) {
				const form = li.querySelector('.add-option-form')
				const txt = form.querySelector('.new-opt-text').value.trim()
				const corr = form.querySelector('.new-opt-correct').checked
				if (!txt) return alert('Введите текст варианта')

				const item = document.createElement('li')
				item.className = 'option-item'
				item.dataset.correct = corr ? 'true' : 'false'
				const span = document.createElement('span')
				span.className = 'option-text'
				span.textContent = txt
				item.appendChild(span)
				if (corr) {
					const badge = document.createElement('span')
					badge.className = 'correct-badge'
					badge.textContent = '✔'
					item.appendChild(badge)
				}
				const delBtn = document.createElement('button')
				delBtn.className = 'remove-option btn'
				delBtn.title = 'Удалить'
				delBtn.textContent = '×'
				item.appendChild(delBtn)

				li.querySelector('.option-list').appendChild(item)

				form.querySelector('.new-opt-text').value = ''
				form.querySelector('.new-opt-correct').checked = false
				quickIsDirty = true
				document.getElementById('saveQuickQuestions').disabled = false
			}

			// Удаляем вариант
			if (e.target.closest('.remove-option')) {
				e.target.closest('li.option-item').remove()
				quickIsDirty = true
				document.getElementById('saveQuickQuestions').disabled = false
				return
			}
			// Удаляем вопрос
			if (e.target.closest('.remove-quick-question')) {
				li.remove()
				renumberQuestions()
				quickIsDirty = true
				document.getElementById('saveQuickQuestions').disabled = false
				return
			}
		})

	// Обработка open-ответа
	document
		.getElementById('quickQuestionsList')
		?.addEventListener('input', e => {
			if (e.target.matches('.open-answer-builder')) {
				const li = e.target.closest('li.question-item')
				li.dataset.correct = e.target.value.trim()
				quickIsDirty = true
				document.getElementById('saveQuickQuestions').disabled = false
			}
		})

	// Сохранение всех
	document
		.getElementById('saveQuickQuestions')
		?.addEventListener('click', saveQuickQuestions)

	// Обработчик кнопки «PDF»
	document.getElementById('ql-insert-pdf').addEventListener('click', () => {
		const input = document.createElement('input')
		input.setAttribute('type', 'file')
		input.setAttribute('accept', 'application/pdf')
		input.click()
		input.onchange = async () => {
			const file = input.files[0]
			if (!file) return
			const fd = new FormData()
			fd.append('file', file)
			// showLoader()
			try {
				const res = await fetch('/api/teacher/upload-theory-asset', {
					method: 'POST',
					credentials: 'include',
					body: fd,
				})
				if (!res.ok) throw new Error(`Ошибка ${res.status}`)
				const { url } = await res.json()
				// Вставляем ссылку‑иконку PDF
				const range = quill.getSelection(true)
				quill.insertEmbed(range.index, 'pdf', { url, name: file.name })
				quill.setSelection(range.index + 1)
				showToast('PDF вставлен', 'success')
			} catch (err) {
				console.error(err)
				showToast('Ошибка загрузки PDF: ' + err.message, 'error')
			} finally {
				// hideLoader()
			}
		}
	})

	// Регистрируем кастомный blot для PDF
	const BlockEmbed = Quill.import('blots/block/embed')
	class PdfBlot extends BlockEmbed {
		static create(value) {
			const node = super.create()
			node.setAttribute('href', value.url)
			node.setAttribute('target', '_blank')
			node.innerHTML = `<i class="pdf-icon"></i>${value.name}`
			return node
		}
		static value(node) {
			return {
				url: node.getAttribute('href'),
				name: node.textContent,
			}
		}
	}
	PdfBlot.blotName = 'pdf'
	PdfBlot.tagName = 'a'
	Quill.register(PdfBlot)

	const saveBtn = document.getElementById('saveTheoryContent')
	if (saveBtn) {
		saveBtn.addEventListener('click', async () => {
			const content = quill.root.innerHTML
			try {
				const res = await fetch(`/api/teacher/theory/${currentTheoryId}`, {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ content }),
				})
				if (!res.ok) throw new Error(`Ошибка ${res.status}`)
				showToast('Содержание сохранено', 'success')
				document.getElementById('theoryModal').classList.add('hidden')
			} catch (err) {
				console.error(err)
				showToast(err.message, 'error')
			}
		})
	}

	// Закрытие модалки по кнопке Отмена
	const closeBtn = document.getElementById('closeTheoryModal')
	if (closeBtn) {
		closeBtn.addEventListener('click', () => {
			document.getElementById('theoryModal').classList.add('hidden')
		})
	}

	document
		.getElementById('questionsBody')
		.addEventListener('change', async e => {
			if (!e.target.classList.contains('edit-difficulty')) return

			const select = e.target
			const id = select.dataset.id
			const newDiff = select.value

			// Найти остальные поля из строки
			const row = select.closest('tr')
			const text = row.querySelector('.edit-text').value
			const type = row.querySelector('.edit-type').value
			const multi = row.querySelector('.edit-multi').checked
			// Правильный ответ для открытых:
			const correct =
				row.nextElementSibling.querySelector('.open-answer-input')?.value || ''

			const payload = {
				id: Number(id),
				test_id: testId, // передайте текущий testId
				question_text: text,
				question_type: type,
				multiple_choice: multi,
				correct_answer_text: correct,
				difficulty: newDiff,
			}

			const res = await fetch('/api/teacher/questions', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(payload),
			})

			if (!res.ok) {
				alert('Не удалось сохранить сложность')
				// можно откатить select к предыдущему значению при желании
			}
		})
})
