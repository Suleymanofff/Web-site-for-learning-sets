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
		const res = await fetch('/api/profile', { credentials: 'include' })
		if (!res.ok) return
		const user = await res.json()
		if (user.avatar_path) {
			const img = document.querySelector('.user-icon img')
			if (img) img.src = user.avatar_path
		}
	} catch (err) {
		console.error('Error loading user icon:', err)
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

				const correct = opt.dataset.correct === 'true'

				await fetch('/api/teacher/options', {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						question_id: questionId,
						option_text: textEl.textContent.trim(),
						correct_choice: correct,
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
  <input type="checkbox" class="edit-multi ${
		q.question_type === 'open' ? 'checkbox-disabled' : ''
	}" 
         data-id="${q.id}" 
         ${q.multiple_choice ? 'checked' : ''} 
         ${q.question_type === 'open' ? 'disabled' : ''}>
</td>

        <td>${q.test_id}</td>
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
          <button class="del-question"  data-id="${
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
          <td colspan="7">
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
          <td colspan="7">
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
          </td>`
			}
			tbody.appendChild(trOpts)
		})
	} catch {
		console.error('Ошибка загрузки вопросов')
	}
}

// -----------------------
// initQuestions
// -----------------------
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

		// d) Сохранить отредактированный вопрос
		if (e.target.matches('.save-question')) {
			const qid = e.target.dataset.id
			const row = e.target.closest('tr')
			const text = row
				.querySelector(`.edit-text[data-id="${qid}"]`)
				.value.trim()
			const type = row.querySelector(`.edit-type[data-id="${qid}"]`).value
			const multi = row.querySelector(`.edit-multi[data-id="${qid}"]`).checked
			const payload = {
				id: +qid,
				question_text: text,
				question_type: type,
				multiple_choice: multi,
			}
			if (type === 'open') {
				const optionsRow = document.querySelector(
					`.options-row[data-qid="${qid}"]`
				)
				const input = optionsRow?.querySelector('.open-answer-input')
				if (input) payload.correct_answer_text = input.value.trim()
			}
			try {
				const res = await fetch('/api/teacher/questions', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})
				if (!res.ok) throw new Error(await res.text())
				alert('Вопрос сохранён')
				loadQuestions(select.value)
			} catch (err) {
				console.error(err)
				alert('Не удалось сохранить вопрос')
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
			// находим непосредственно <tr> с формой
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
				// очистка формы
				textEl.value = ''
				correctEl.checked = false
				// обновляем список вариантов
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
function initCourses() {
	const tbody = document.getElementById('teacherCoursesBody')
	fetch('/api/teacher/courses', { credentials: 'include' })
		.then(r => (r.ok ? r.json() : Promise.reject(r.statusText)))
		.then(courses => {
			courses.forEach(c => {
				const tr = document.createElement('tr')
				tr.innerHTML = `
          <td><input class="edit-text" data-id="${c.id}" value="${
					c.title
				}"></td>
          <td><input class="edit-text" data-id="${c.id}" value="${
					c.description
				}"></td>
          <td>${new Date(c.created_at).toLocaleDateString()}</td>
          <td class="action-cell">
            <button class="save-course" data-id="${
							c.id
						}"><i class="fas fa-save"></i> Сохранить</button>
            <button class="del-course" data-id="${
							c.id
						}"><i class="fas fa-trash"></i> Удалить</button>
          </td>`
				tbody.appendChild(tr)
			})
		})
		.catch(console.error)

	tbody.addEventListener('click', async e => {
		const btn = e.target.closest('button')
		if (!btn) return
		const id = +btn.dataset.id

		if (btn.classList.contains('save-course')) {
			const inputs = document.querySelectorAll(`.edit-text[data-id="${id}"]`)
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

	document
		.getElementById('newTeacherCourseForm')
		.addEventListener('submit', async e => {
			e.preventDefault()
			const fd = new FormData(e.target)
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
				location.reload()
			} catch (err) {
				alert(err.message)
			}
		})
}

// -----------------------
// initTests
// -----------------------
function initTests() {
	const select = document.querySelector('#newTestForm select[name="course_id"]')
	fetch('/api/teacher/courses', { credentials: 'include' })
		.then(r => (r.ok ? r.json() : Promise.reject()))
		.then(cs => {
			cs.forEach(c => {
				const o = document.createElement('option')
				o.value = c.id
				o.textContent = c.title
				select.appendChild(o)
			})
		})
		.catch(console.error)

	const tbody = document.getElementById('testsBody')
	fetch('/api/teacher/tests', { credentials: 'include' })
		.then(r => (r.ok ? r.json() : Promise.reject()))
		.then(ts => {
			ts.forEach(t => {
				const tr = document.createElement('tr')
				tr.innerHTML = `
          <td><input class="edit-text" data-id="${t.id}" value="${
					t.title
				}"></td>
          <td><input class="edit-text" data-id="${t.id}" value="${
					t.description
				}"></td>
          <td>${t.course_id}</td>
          <td>${new Date(t.created_at).toLocaleDateString()}</td>
          <td class="action-cell">
            <button class="save-test" data-id="${
							t.id
						}"><i class="fas fa-save"></i> Сохранить</button>
            <button class="del-test"  data-id="${
							t.id
						}"><i class="fas fa-trash"></i> Удалить</button>
          </td>`
				tbody.appendChild(tr)
			})
		})
		.catch(console.error)

	tbody.addEventListener('click', async e => {
		const btn = e.target.closest('button')
		if (!btn) return
		const id = +btn.dataset.id

		if (btn.classList.contains('save-test')) {
			const inputs = document.querySelectorAll(`.edit-text[data-id="${id}"]`)
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

	document.getElementById('newTestForm').addEventListener('submit', async e => {
		e.preventDefault()
		const fd = new FormData(e.target)
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
			// поддерживаем старый ключ id и новый test_id
			const newTestId = data.id ?? data.test_id
			if (!newTestId) {
				throw new Error('Не удалось получить ID созданного теста')
			}
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

// -----------------------
// initTheory — заполняет селектор курсов и загружает темы
// -----------------------
async function initTheory() {
	const select = document.getElementById('theoryCourseSelect')
	if (!select) {
		console.error('Не найден селект #theoryCourseSelect')
		return
	}

	// placeholder
	select.innerHTML = '<option value="" disabled selected>Выберите курс</option>'

	// 1) Загрузить курсы по кукам
	let courses
	try {
		const res = await fetch('/api/teacher/courses', { credentials: 'include' })
		if (!res.ok) throw new Error(`Status ${res.status}`)
		courses = await res.json()
	} catch (err) {
		console.error('Ошибка загрузки курсов:', err)
		return
	}

	if (!Array.isArray(courses) || courses.length === 0) {
		console.warn('Нет курсов')
		return
	}

	// 2) Добавить опции
	courses.forEach(c => {
		const o = document.createElement('option')
		o.value = c.id
		o.textContent = c.title
		select.appendChild(o)
	})

	// 3) Выбрать первый и загрузить темы
	select.selectedIndex = 1
	_theoryCourseId = +select.value
	_theoryCourseTitle = select.selectedOptions[0].textContent
	document.getElementById(
		'page-title'
	).textContent = `Теория — ${_theoryCourseTitle}`
	await reloadTheoryList(_theoryCourseId)

	// 4) При смене селекта — перезагрузить темы
	select.addEventListener('change', async e => {
		_theoryCourseId = +e.target.value
		_theoryCourseTitle = e.target.selectedOptions[0].textContent
		document.getElementById(
			'page-title'
		).textContent = `Теория — ${_theoryCourseTitle}`
		await reloadTheoryList(_theoryCourseId)
	})

	// 5) Делегировать клики по кнопкам Сохранить и Удалить
	document.getElementById('theoryBody').addEventListener('click', async e => {
		const tr = e.target.closest('tr[data-id]')
		if (!tr) return
		const id = +tr.dataset.id

		// Сохранить изменения
		if (e.target.closest('.save-topic')) {
			const title = tr.querySelector('.edit-title').value.trim()
			const content = tr.querySelector('.edit-content').value.trim()
			const orig = _theoryList.find(i => i.id === id) || {}
			const payload = {
				title,
				content,
				sort_order: orig.sort_order || 0,
			}

			try {
				const res = await fetch(
					`/api/teacher/courses/${_theoryCourseId}/theory/${id}`,
					{
						method: 'PUT',
						credentials: 'include',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload),
					}
				)
				if (!res.ok) throw new Error(await res.text())
				alert('Тема сохранена')
				await reloadTheoryList(_theoryCourseId)
			} catch (err) {
				console.error('Ошибка сохранения темы:', err)
				alert('Ошибка сохранения: ' + err.message)
			}
			return
		}

		// Удалить тему
		if (e.target.closest('.delete-topic')) {
			if (!confirm('Удалить тему?')) return
			try {
				const res = await fetch(
					`/api/teacher/courses/${_theoryCourseId}/theory/${id}`,
					{
						method: 'DELETE',
						credentials: 'include',
					}
				)
				if (!res.ok) throw new Error(await res.text())
				await reloadTheoryList(_theoryCourseId)
			} catch (err) {
				console.error('Ошибка удаления темы:', err)
				alert('Ошибка удаления: ' + err.message)
			}
			return
		}
	})
}

// -----------------------
// reloadTheoryList — загрузить список тем и отрисовать таблицу
// -----------------------
async function reloadTheoryList(courseId) {
	const tbody = document.getElementById('theoryBody')
	if (!tbody) return
	tbody.innerHTML = '' // очистка

	let list
	try {
		// правильный публичный эндпоинт для тем
		const res = await fetch(`/api/courses/${courseId}/theory`, {
			credentials: 'include',
		})
		if (!res.ok) throw new Error(`Status ${res.status}`)
		list = await res.json()
	} catch (err) {
		console.error('Ошибка загрузки тем:', err)
		return
	}

	_theoryList = Array.isArray(list) ? list : []
	renderTheoryTable()
}

// -----------------------
// renderTheoryTable — строит HTML строк для каждой темы
// -----------------------
function renderTheoryTable() {
	const tbody = document.getElementById('theoryBody')
	if (_theoryList.length === 0) {
		tbody.innerHTML =
			'<tr><td colspan="7" style="text-align:center">Нет тем</td></tr>'
		return
	}

	tbody.innerHTML = _theoryList
		.map(item => {
			const date = item.updated_at
				? new Date(item.updated_at).toLocaleDateString()
				: new Date(item.created_at).toLocaleDateString()

			return `
      <tr data-id="${item.id}">
        <td><input class="edit-title"    value="${item.title}"></td>
        <td><textarea class="edit-content">${item.content}</textarea></td>
        <td>${_theoryCourseTitle}</td>
        <td>${date}</td>
        <td><!-- сразу редактировать, кнопки нет --></td>
        <td>
          <button class="save-topic">
            <i class="fas fa-save"></i>
          </button>
        </td>
        <td>
          <button class="delete-topic">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `
		})
		.join('')
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
})
