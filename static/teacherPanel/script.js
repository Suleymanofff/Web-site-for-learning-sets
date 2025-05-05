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

document.addEventListener('DOMContentLoaded', () => {
	// Навбар: активная ссылка
	const path = window.location.pathname.split('/').pop()
	document.querySelectorAll('.nav-links a').forEach(link => {
		link.classList.toggle('active', link.getAttribute('href') === path)
	})

	// Тема
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

	// Аватар
	loadUserIcon()

	// Определяем текущую страницу
	const page = path.replace('.html', '')
	if (page === 'courses') initCourses()
	if (page === 'tests') initTests()
	if (page === 'questions') initQuestions()
})

// -----------------------
// Управление курсами
// -----------------------
function initCourses() {
	const tbody = document.getElementById('teacherCoursesBody')
	fetch('/api/teacher/courses', { credentials: 'include' })
		.then(r => (r.ok ? r.json() : Promise.reject(r.statusText)))
		.then(courses => {
			courses.forEach(c => {
				const tr = document.createElement('tr')
				tr.innerHTML = `
          <td><input class="edit-title" data-id="${c.id}" value="${
					c.title
				}"></td>
          <td><input class="edit-desc"  data-id="${c.id}" value="${
					c.description
				}"></td>
          <td>${new Date(c.created_at).toLocaleDateString()}</td>
          <td>
            <button class="save-course" data-id="${c.id}">
              <i class="fas fa-save"></i> Сохранить
            </button>
            <button class="del-course" data-id="${c.id}">
              <i class="fas fa-trash"></i> Удалить
            </button>
          </td>`
				tbody.appendChild(tr)
			})
		})
		.catch(err => console.error('Не загрузить курсы:', err))

	tbody.addEventListener('click', async e => {
		const btn = e.target.closest('button')
		if (!btn) return
		const id = +btn.dataset.id
		if (btn.classList.contains('save-course')) {
			const title = document.querySelector(`.edit-title[data-id="${id}"]`).value
			const desc = document.querySelector(`.edit-desc[data-id="${id}"]`).value
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
				alert('Ошибка: ' + err.message)
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
				alert('Ошибка: ' + err.message)
			}
		}
	})

	document
		.getElementById('newTeacherCourseForm')
		.addEventListener('submit', async e => {
			e.preventDefault()
			const fd = new FormData(e.target)
			const data = {
				title: fd.get('title'),
				description: fd.get('description'),
			}
			try {
				const res = await fetch('/api/teacher/courses', {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(data),
				})
				if (!res.ok) throw new Error(await res.text())
				location.reload()
			} catch (err) {
				alert('Ошибка создания курса: ' + err.message)
			}
		})
}

// -----------------------
// Управление тестами
// -----------------------
function initTests() {
	const select = document.querySelector('#newTestForm select[name="course_id"]')
	fetch('/api/teacher/courses', { credentials: 'include' })
		.then(r => (r.ok ? r.json() : Promise.reject(r.statusText)))
		.then(cs =>
			cs.forEach(c => {
				const o = document.createElement('option')
				o.value = c.id
				o.textContent = c.title
				select.appendChild(o)
			})
		)
		.catch(err => console.error('Не загрузить курсы для теста:', err))

	const tbody = document.getElementById('testsBody')
	fetch('/api/teacher/tests', { credentials: 'include' })
		.then(r => (r.ok ? r.json() : Promise.reject(r.statusText)))
		.then(ts =>
			ts.forEach(t => {
				const tr = document.createElement('tr')
				tr.innerHTML = `
        <td><input class="edit-title" data-id="${t.id}" value="${t.title}"></td>
        <td><input class="edit-desc"  data-id="${t.id}" value="${
					t.description
				}"></td>
        <td>${t.course_id}</td>
        <td>${new Date(t.created_at).toLocaleDateString()}</td>
        <td>
          <button class="save-test" data-id="${t.id}">
            <i class="fas fa-save"></i> Сохранить
          </button>
          <button class="del-test" data-id="${t.id}">
            <i class="fas fa-trash"></i> Удалить
          </button>
        </td>`
				tbody.appendChild(tr)
			})
		)
		.catch(err => console.error('Не загрузить тесты:', err))

	tbody.addEventListener('click', async e => {
		const btn = e.target.closest('button')
		if (!btn) return
		const id = +btn.dataset.id
		if (btn.classList.contains('save-test')) {
			const title = document.querySelector(`.edit-title[data-id="${id}"]`).value
			const desc = document.querySelector(`.edit-desc[data-id="${id}"]`).value
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
				alert('Ошибка: ' + err.message)
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
				alert('Ошибка: ' + err.message)
			}
		}
	})

	document.getElementById('newTestForm').addEventListener('submit', async e => {
		e.preventDefault()
		const fd = new FormData(e.target)
		const data = {
			title: fd.get('title'),
			description: fd.get('description'),
			course_id: +fd.get('course_id'),
		}
		try {
			const res = await fetch('/api/teacher/tests', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data),
			})
			if (!res.ok) throw new Error(await res.text())
			location.reload()
		} catch (err) {
			alert('Ошибка создания теста: ' + err.message)
		}
	})
}

// -----------------------
// Управление вопросами
// -----------------------
function initQuestions() {
	const select = document.querySelector(
		'#newQuestionForm select[name="test_id"]'
	)
	const tbody = document.getElementById('questionsBody')

	// подгрузить тесты
	fetch('/api/teacher/tests', { credentials: 'include' })
		.then(r => (r.ok ? r.json() : Promise.reject(r.statusText)))
		.then(ts => {
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
		})
		.catch(err => console.error('Не загрузить тесты для вопросов:', err))

	select.addEventListener('change', () => loadQuestions(select.value))

	document
		.getElementById('newQuestionForm')
		.addEventListener('submit', async e => {
			e.preventDefault()
			const fd = new FormData(e.target)
			const data = {
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
					body: JSON.stringify(data),
				})
				if (!res.ok) throw new Error(await res.text())
				e.target.reset()
				loadQuestions(select.value)
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
				loadOptions(id)
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
				alert('Ошибка: ' + err.message)
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
				alert('Ошибка: ' + err.message)
			}
			return
		}

		if (btn.classList.contains('save-new-option')) {
			const row = btn.closest('tr')
			const qid = +btn.closest('.options-row').dataset.qid
			const text = row.querySelector('.new-opt-text').value
			const correct = row.querySelector('.new-opt-correct').checked
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
				loadOptions(qid)
			} catch (err) {
				alert('Ошибка добавления варианта: ' + err.message)
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
				alert('Ошибка: ' + err.message)
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
				alert('Ошибка: ' + err.message)
			}
			return
		}
	})
}

// Загрузка вопросов
async function loadQuestions(testId) {
	const tbody = document.getElementById('questionsBody')
	tbody.innerHTML = ''
	if (!testId) return
	const qs = await fetch(`/api/teacher/questions?test_id=${testId}`, {
		credentials: 'include',
	}).then(r => (r.ok ? r.json() : Promise.reject(r.statusText)))
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
      <td>
        <button class="manage-options" data-id="${q.id}">
          <i class="fas fa-list"></i> Варианты
        </button>
      </td>
      <td>
        <button class="save-question" data-id="${q.id}">
          <i class="fas fa-save"></i> Сохранить
        </button>
        <button class="del-question" data-id="${q.id}">
          <i class="fas fa-trash"></i> Удалить
        </button>
      </td>`
		tbody.appendChild(tr)

		const trOpts = document.createElement('tr')
		trOpts.classList.add('options-row')
		trOpts.dataset.qid = q.id
		trOpts.style.display = 'none'
		trOpts.innerHTML = `
      <td colspan="8">
        <div class="options-wrapper">
          <table class="options-table">
            <thead>
              <tr>
                <th>Вариант</th>
                <th>Правильный?</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody id="opts-${q.id}"></tbody>
          </table>
          <table class="options-table new-option-row">
            <tr>
              <td><input class="new-opt-text" placeholder="Новый вариант"></td>
              <td><input type="checkbox" class="new-opt-correct"></td>
              <td>
                <button class="save-new-option">
                  <i class="fas fa-plus"></i> Добавить
                </button>
              </td>
            </tr>
          </table>
        </div>
      </td>`
		tbody.appendChild(trOpts)
	})
}

// Загрузка вариантов ответа
async function loadOptions(questionId) {
	const tbodyOpts = document.getElementById(`opts-${questionId}`)
	tbodyOpts.innerHTML = ''
	const opts = await fetch(`/api/teacher/options?question_id=${questionId}`, {
		credentials: 'include',
	}).then(r => (r.ok ? r.json() : Promise.reject(r.statusText)))
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
        <button class="save-option" data-id="${o.id}">
          <i class="fas fa-save"></i> Сохранить
        </button>
        <button class="del-option" data-id="${o.id}">
          <i class="fas fa-trash"></i> Удалить
        </button>
      </td>`
		tbodyOpts.appendChild(tr)
	})
}
