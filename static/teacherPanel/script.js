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

// -----------------------
// 3. Иконка темы
// -----------------------
function updateToggleIcon(theme) {
	const btn = document.getElementById('theme-toggle')
	btn.innerHTML = ''
	const icon = document.createElement('img')
	icon.alt = 'Toggle theme'
	icon.src =
		theme === 'dark'
			? '/static/img/light-theme.png'
			: '/static/img/dark-theme.png'
	btn.appendChild(icon)
}

// ——— State и функции для быстрой модалки вопросов ———
let quickIsDirty = false

function openQuestionModal(testId) {
	document.getElementById('quickTestId').value = testId
	document.getElementById('questionModal').style.display = 'flex'
	quickIsDirty = false
	document.getElementById('saveQuickQuestions').disabled = true
}

function clearQuickModal() {
	document.getElementById('quickQuestionsList').innerHTML = ''
	document.getElementById('quickQuestionForm').reset()
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
		const qRes = await fetch('/api/teacher/questions', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				test_id: testId,
				question_text: li.querySelector('.question-text').textContent,
				question_type: li.dataset.type,
				multiple_choice: li.dataset.multi === 'true',
			}),
		})
		if (!qRes.ok) throw new Error('Не удалось сохранить вопрос')
		const { id: realQid } = await qRes.json()

		for (let opt of li.querySelectorAll('.options-list .option-item')) {
			await fetch('/api/teacher/options', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					question_id: realQid,
					option_text: opt.querySelector('.option-text').textContent,
					is_correct: opt.querySelector('input').checked,
				}),
			})
		}
	}
	quickIsDirty = false
	document.getElementById('saveQuickQuestions').disabled = true
	forceCloseModal()
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
        <td>
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
          <td>
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
          <td>
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
			const { id: newTestId } = await res.json()
			openQuestionModal(newTestId)
		} catch (err) {
			alert('Ошибка создания теста: ' + err.message)
		}
	})
}

// -----------------------
// Стартуем всё при загрузке страницы
// -----------------------
document.addEventListener('DOMContentLoaded', () => {
	loadUserIcon()
	updateToggleIcon(document.documentElement.getAttribute('data-theme'))
	if (document.getElementById('teacherCoursesBody')) initCourses()
	if (document.getElementById('testsBody')) initTests()
	if (document.getElementById('questionsBody')) initQuestions()
})
