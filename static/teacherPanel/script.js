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
	// проставляем в скрытое поле id теста
	document.getElementById('quickTestId').value = testId
	// показываем модалку
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
	// Перезагружаем страницу, чтобы обновить список тестов:
	location.reload()
}

function cancelClose() {
	document.getElementById('unsavedConfirm').style.display = 'none'
}

async function saveQuickQuestions() {
	const testId = +document.getElementById('quickTestId').value
	const items = document.querySelectorAll('#quickQuestionsList .question-item')
	for (let li of items) {
		// 1) создаём вопрос
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

		// 2) создаём варианты
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

document.addEventListener('DOMContentLoaded', () => {
	// активная ссылка
	const page = window.location.pathname.split('/').pop()
	document.querySelectorAll('.nav-links a').forEach(link => {
		link.classList.toggle('active', link.getAttribute('href') === page)
	})

	// тема
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

	loadUserIcon()

	// в зависимости от страницы запускаем нужную инициализацию
	if (page === 'courses.html') initCourses()
	if (page === 'tests.html') initTests()
	if (page === 'questions.html') initQuestions()

	// === слушатели модалки ===
	document
		.getElementById('closeQuestionModal')
		.addEventListener('click', tryCloseModal)
	document
		.getElementById('forceClose')
		.addEventListener('click', forceCloseModal)
	document.getElementById('cancelClose').addEventListener('click', cancelClose)
	window.addEventListener('click', e => {
		if (e.target.id === 'questionModal') tryCloseModal()
	})

	// добавить вопрос «на лету»
	document.getElementById('quickQuestionForm').addEventListener('submit', e => {
		e.preventDefault()
		const fd = new FormData(e.target)
		const qid = Date.now().toString()
		const text = fd.get('question_text').trim()
		const type = fd.get('question_type')
		const multi = fd.get('multiple_choice') === 'on'
		if (!text) return

		const li = document.createElement('li')
		li.className = 'question-item'
		li.dataset.qid = qid
		li.dataset.type = type
		li.dataset.multi = multi
		li.innerHTML = `
    <div class="question-header">
    <span class="question-text">${text}</span>
    <button class="expand-options" title="Варианты">+</button>
	</div>
    <div class="options-builder" style="display:none">
      <ul class="options-list"></ul>
      <form class="new-option-form">
        <input type="text" name="option_text" placeholder="Новый вариант" required>
        <label>
          <input type="${
						multi ? 'checkbox' : 'radio'
					}" name="correct_${qid}" class="option-correct">
          Правильный
        </label>
        <button type="submit">Добавить</button>
      </form>
    </div>`
		document.getElementById('quickQuestionsList').appendChild(li)
		quickIsDirty = true
		document.getElementById('saveQuickQuestions').disabled = false
		e.target.reset()
	})

	// делегируем раскрытие блока вариантов и добавление вариантов
	document.getElementById('quickQuestionsList').addEventListener('click', e => {
		if (e.target.classList.contains('expand-options')) {
			const item = e.target.closest('.question-item')
			const b = item.querySelector('.options-builder')
			b.style.display = b.style.display === 'none' ? 'block' : 'none'
		}
	})

	document
		.getElementById('quickQuestionsList')
		.addEventListener('submit', e => {
			if (!e.target.classList.contains('new-option-form')) return
			e.preventDefault()
			const form = e.target
			const item = form.closest('.question-item')
			const list = item.querySelector('.options-list')
			const fd = new FormData(form)
			const text = fd.get('option_text').trim()
			const corr = form.querySelector('.option-correct').checked
			if (!text) return
			const li = document.createElement('li')
			li.className = 'option-item'
			li.innerHTML = `
    <span class="option-text">${text}</span>
    <input type="${item.dataset.multi === 'true' ? 'checkbox' : 'radio'}"
           name="correct_${item.dataset.qid}"
           ${corr ? 'checked' : ''}>`
			list.appendChild(li)
			quickIsDirty = true
			document.getElementById('saveQuickQuestions').disabled = false
			form.reset()
		})

	// кнопка «Сохранить всё»
	document
		.getElementById('saveQuickQuestions')
		.addEventListener('click', saveQuickQuestions)
})

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
		// save
		if (btn.classList.contains('save-course')) {
			const title = document.querySelector(`.edit-text[data-id="${id}"]`).value
			const desc = document.querySelector(`.edit-text[data-id="${id}"]`).value
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
		// delete
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
            <button class="del-test" data-id="${
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
			const title = document.querySelector(`.edit-text[data-id="${id}"]`).value
			const desc = document.querySelector(`.edit-text[data-id="${id}"]`).value
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
// initQuestions
// -----------------------
async function initQuestions() {
	const select = document.getElementById('testSelect')
	const tbody = document.getElementById('questionsBody')

	// загрузить тесты
	try {
		const res = await fetch('/api/teacher/tests', { credentials: 'include' })
		if (!res.ok) throw ''
		const ts = await res.json()
		ts.forEach(t => {
			const o = document.createElement('option')
			o.value = t.id
			o.textContent = t.title
			select.appendChild(o)
		})
		if (ts.length) {
			select.value = ts[0].id
			loadQuestions(ts[0].id)
		}
	} catch {
		console.error('Не удалось загрузить тесты')
	}

	select.addEventListener('change', () => loadQuestions(select.value))

	document
		.getElementById('newQuestionForm')
		.addEventListener('submit', async e => {
			e.preventDefault()
			const fd = new FormData(e.target)
			const payload = {
				test_id: +fd.get('test_id'),
				question_text: fd.get('question_text'),
				question_type: fd.get('question_type'),
				multiple_choice: fd.get('multiple_choice') === 'on',
			}
			try {
				const res = await fetch('/api/teacher/questions', {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})
				if (!res.ok) throw new Error(await res.text())
				e.target.reset()
				loadQuestions(payload.test_id)
			} catch (err) {
				alert('Ошибка создания вопроса: ' + err.message)
			}
		})

	tbody.addEventListener('click', async e => {
		const btn = e.target.closest('button')
		if (!btn) return
		const id = +btn.dataset.id

		if (btn.classList.contains('manage-options')) {
			const row = document.querySelector(`.options-row[data-qid="${id}"]`)
			if (row.style.display === 'none') {
				await loadOptions(id)
				row.style.display = ''
			} else {
				row.style.display = 'none'
			}
			return
		}

		if (btn.classList.contains('save-question')) {
			const text = document.querySelector(`.edit-text[data-id="${id}"]`).value
			const type = document.querySelector(`.edit-type[data-id="${id}"]`).value
			const multi = document.querySelector(
				`.edit-multi[data-id="${id}"]`
			).checked
			try {
				const res = await fetch('/api/teacher/questions', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id,
						question_text: text,
						question_type: type,
						multiple_choice: multi,
					}),
				})
				if (!res.ok) throw new Error(await res.text())
				alert('Вопрос сохранён')
			} catch (err) {
				alert(err.message)
			}
			return
		}

		if (btn.classList.contains('del-question')) {
			if (!confirm('Удалить вопрос?')) return
			try {
				const res = await fetch('/api/teacher/questions', {
					method: 'DELETE',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id }),
				})
				if (!res.ok) throw new Error(await res.text())
				loadQuestions(select.value)
			} catch (err) {
				alert(err.message)
			}
			return
		}

		if (btn.classList.contains('save-new-option')) {
			const qid = +btn.dataset.id
			const form = btn.closest('.option-form')
			const text = form.querySelector('.new-opt-text').value.trim()
			const correct = form.querySelector('.new-opt-correct').checked
			if (!text) return
			try {
				const res = await fetch('/api/teacher/options', {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						question_id: qid,
						option_text: text,
						is_correct: correct,
					}),
				})
				if (!res.ok) throw new Error(await res.text())
				form.querySelector('.new-opt-text').value = ''
				loadOptions(qid)
			} catch (err) {
				alert(err.message)
			}
			return
		}

		if (btn.classList.contains('save-option')) {
			const oid = +btn.dataset.id
			const text = document.querySelector(
				`.edit-opt-text[data-id="${oid}"]`
			).value
			const correct = document.querySelector(
				`.edit-opt-correct[data-id="${oid}"]`
			).checked
			try {
				const res = await fetch('/api/teacher/options', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id: oid,
						option_text: text,
						is_correct: correct,
					}),
				})
				if (!res.ok) throw new Error(await res.text())
				alert('Вариант сохранён')
			} catch (err) {
				alert(err.message)
			}
			return
		}

		if (btn.classList.contains('del-option')) {
			if (!confirm('Удалить вариант?')) return
			try {
				const res = await fetch('/api/teacher/options', {
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
			return
		}
	})
}

// -----------------------
// loadQuestions
// -----------------------
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
        <td><input type="checkbox" class="edit-multi" data-id="${q.id}"${
				q.multiple_choice ? ' checked' : ''
			}></td>
        <td>${q.test_id}</td>
        <td>${new Date(q.created_at).toLocaleDateString()}</td>
        <td><button class="manage-options" data-id="${
					q.id
				}"><i class="fas fa-list"></i> Варианты</button></td>
        <td>
          <button class="save-question" data-id="${
						q.id
					}"><i class="fas fa-save"></i> Сохранить</button>
          <button class="del-question" data-id="${
						q.id
					}"><i class="fas fa-trash"></i> Удалить</button>
        </td>`
			tbody.appendChild(tr)
			const trOpts = document.createElement('tr')
			trOpts.classList.add('options-row')
			trOpts.dataset.qid = q.id
			trOpts.style.display = 'none'
			trOpts.innerHTML = `
        <td colspan="7">
          <div class="options-wrapper">
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
			tbody.appendChild(trOpts)
		})
	} catch {
		console.error('Ошибка загрузки вопросов')
	}
}

// -----------------------
// loadOptions
// -----------------------
async function loadOptions(questionId) {
	const tbodyOpts = document.getElementById(`opts-${questionId}`)
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
