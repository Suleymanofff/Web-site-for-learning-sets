// Получение ID группы из URL
function getGroupIdFromURL() {
	const params = new URLSearchParams(window.location.search)
	const id = params.get('id')
	console.log('[DEBUG] groupId from URL:', id)
	return id
}

// Загрузка и отрисовка состава группы
async function initTeacherGroupDetail() {
	console.log('[DEBUG] initTeacherGroupDetail() start')
	const groupId = getGroupIdFromURL()
	if (!groupId) {
		console.error('[ERROR] no groupId in URL')
		alert('Не указан ID группы в URL')
		return
	}

	let res, group
	try {
		console.log(`[DEBUG] fetching /api/teacher/groups/${groupId}`)
		res = await fetch(`/api/teacher/groups/${groupId}`, {
			credentials: 'include',
		})
	} catch (err) {
		console.error('[ERROR] fetch threw:', err)
		alert('Ошибка сети при загрузке группы')
		return
	}

	console.log('[DEBUG] fetch response status:', res.status)
	if (!res.ok) {
		const text = await res.text().catch(() => '')
		console.error('[ERROR] fetch response not ok:', res.status, text)
		alert('Ошибка загрузки группы: ' + text)
		return
	}

	try {
		group = await res.json()
		console.log('[DEBUG] group JSON:', group)
	} catch (err) {
		console.error('[ERROR] JSON parse error:', err)
		alert('Ошибка разбора ответа от сервера')
		return
	}

	// ----------------------------------------
	// 1) Название: помещаем в input
	// ----------------------------------------
	const nameInput = document.getElementById('groupNameInput')
	if (!nameInput) {
		console.error('[ERROR] #groupNameInput element not found')
	} else {
		nameInput.value = group.name
		console.log('[DEBUG] set groupNameInput to:', group.name)
	}

	// ----------------------------------------
	// 2) Студенты
	// ----------------------------------------
	const tbody = document.getElementById('studentsBody')
	if (!tbody) {
		console.error('[ERROR] #studentsBody element not found')
		return
	}
	tbody.innerHTML = ''

	if (!Array.isArray(group.students)) {
		console.error('[ERROR] group.students is not array:', group.students)
		tbody.innerHTML =
			'<tr><td colspan="3">Неверный формат данных студентов</td></tr>'
		return
	}

	if (group.students.length === 0) {
		tbody.innerHTML =
			'<tr><td colspan="3" style="text-align:center;">Нет студентов в группе</td></tr>'
		console.log('[DEBUG] no students to render')
	} else {
		group.students.forEach(s => {
			console.log('[DEBUG] render student:', s)
			const tr = document.createElement('tr')
			tr.innerHTML = `
		  <td>${s.email}</td>
		  <td>${s.full_name}</td>
		  <td>
			<button class="remove-student-btn" data-id="${s.id}">
			  <i class="fas fa-trash"></i> Удалить
			</button>
		  </td>`
			tbody.appendChild(tr)
		})
	}
	document.dispatchEvent(new CustomEvent('teacherGroupDetail:loaded'))
}
document.addEventListener('teacherGroupDetail:loaded', initTeacherGroupSearch)

// поисковая строка
function debounce(fn, ms = 300) {
	let timer
	return (...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => fn(...args), ms)
	}
}

function initTeacherGroupSearch() {
	const input = document.getElementById('teacher-group-search')
	const sugg = document.getElementById('teacher-group-suggestions')
	const wrapper = document.querySelector('.search-wrapper')
	const clearBtn = wrapper.querySelector('.clear-search')

	// все строки студентов
	const tbody = document.getElementById('studentsBody')
	const rows = Array.from(tbody.querySelectorAll('tr'))
	let currentIndex = -1

	clearBtn.style.display = 'none'

	function clearSearch() {
		input.value = ''
		rows.forEach(r => (r.style.display = 'table-row'))
		sugg.innerHTML = ''
		wrapper.setAttribute('aria-expanded', 'false')
		clearBtn.style.display = 'none'
		currentIndex = -1
	}

	function getRowData(row) {
		const email = row.cells[0].innerText.trim().toLowerCase()
		const name = row.cells[1].innerText.trim().toLowerCase()
		return { email, name }
	}

	function isFuzzy(text, q) {
		let idx = 0
		for (const ch of text) {
			if (ch === q[idx]) {
				idx++
				if (idx === q.length) return true
			}
		}
		return false
	}

	function filterRows(q) {
		const query = q.trim().toLowerCase()
		if (!query) return rows

		// 1) точное совпадение email или ФИО
		let matches = rows.filter(r => {
			const d = getRowData(r)
			return d.email === query || d.name === query
		})
		if (matches.length) return matches

		// 2) подстрока
		matches = rows.filter(r => {
			const d = getRowData(r)
			return d.email.includes(query) || d.name.includes(query)
		})
		if (matches.length) return matches

		// 3) нечеткий поиск
		return rows.filter(r => {
			const d = getRowData(r)
			return isFuzzy(d.email + ' ' + d.name, query)
		})
	}

	function highlightText(text, query) {
		const lower = text.toLowerCase()
		const idx = lower.indexOf(query)
		if (idx === -1) return text
		const before = text.slice(0, idx)
		const match = text.slice(idx, idx + query.length)
		const after = text.slice(idx + query.length)
		return `${before}<mark>${match}</mark>${after}`
	}

	function updateSuggestions(q) {
		sugg.innerHTML = ''
		currentIndex = -1
		const results = filterRows(q)
		if (!q) {
			clearSearch()
			return
		}

		clearBtn.style.display = 'block'
		wrapper.setAttribute('aria-expanded', 'true')

		results.slice(0, 10).forEach((row, i) => {
			const data = getRowData(row)
			// отображаем email и ФИО
			const raw = `${row.cells[0].innerText} — ${row.cells[1].innerText}`
			const li = document.createElement('li')
			li.id = `group-sugg-${i}`
			li.role = 'option'
			li.innerHTML = highlightText(raw, q.toLowerCase())
			li.addEventListener('click', () => selectSuggestion(i, results))
			sugg.appendChild(li)
		})
	}

	function renderResults(res) {
		rows.forEach(r => (r.style.display = 'none'))
		res.forEach(r => (r.style.display = 'table-row'))
	}

	function highlightItem(items, idx) {
		items.forEach((li, i) => li.classList.toggle('active', i === idx))
		if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' })
	}

	function selectSuggestion(idx, results) {
		const row = results[idx]
		// Собираем оригинальный raw (email — name)
		const raw = `${row.cells[0].innerText} — ${row.cells[1].innerText}`
		// Берём только ту часть до " — "
		const key = raw.split(' — ')[0]
		// Подставляем в input только email (или ключевую часть)
		input.value = key
		// Применяем фильтр по ключу, чтобы оставить одну строку
		const filtered = filterRows(key)
		renderResults(filtered)
		sugg.innerHTML = ''
		wrapper.setAttribute('aria-expanded', 'false')
		clearBtn.style.display = 'block'
		currentIndex = -1
	}

	const deb = debounce(e => updateSuggestions(e.target.value))
	input.addEventListener('input', deb)

	input.addEventListener('keydown', e => {
		const items = Array.from(sugg.children)
		if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key))
			e.preventDefault()

		if (e.key === 'ArrowDown' && items.length) {
			currentIndex = (currentIndex + 1) % items.length
			highlightItem(items, currentIndex)
		} else if (e.key === 'ArrowUp' && items.length) {
			currentIndex = (currentIndex - 1 + items.length) % items.length
			highlightItem(items, currentIndex)
		} else if (e.key === 'Enter') {
			const res = filterRows(input.value)
			if (currentIndex > -1 && items.length) selectSuggestion(currentIndex, res)
			else renderResults(res)
			sugg.innerHTML = ''
			wrapper.setAttribute('aria-expanded', 'false')
		} else if (e.key === 'Escape') {
			clearSearch()
		}
	})

	clearBtn.addEventListener('click', clearSearch)
	document.addEventListener('click', e => {
		if (!wrapper.contains(e.target)) {
			sugg.innerHTML = ''
			wrapper.setAttribute('aria-expanded', 'false')
			currentIndex = -1
		}
	})
}

document.addEventListener('DOMContentLoaded', () => {
	console.log('[DEBUG] DOMContentLoaded')
	initTeacherGroupDetail()

	// ----------------------------------------
	// Обработчик: сохранить новое название
	// ----------------------------------------
	const saveBtn = document.getElementById('saveNameBtn')
	const nameInput = document.getElementById('groupNameInput')
	if (saveBtn && nameInput) {
		saveBtn.addEventListener('click', async () => {
			const groupId = getGroupIdFromURL()
			const newName = nameInput.value.trim()
			if (!newName) {
				alert('Название не может быть пустым')
				return
			}

			console.log('[DEBUG] saving new group name:', newName)
			let res, text
			try {
				res = await fetch(`/api/teacher/groups/${groupId}`, {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: newName }),
				})
			} catch (err) {
				console.error('[ERROR] PUT fetch threw:', err)
				alert('Ошибка сети при сохранении названия')
				return
			}

			console.log('[DEBUG] save name response status:', res.status)
			if (!res.ok) {
				text = await res.text().catch(() => '')
				console.error('[ERROR] save name failed:', res.status, text)
				alert('Ошибка сохранения: ' + text)
				return
			}
			console.log('[DEBUG] save name succeeded')
			alert('Название группы сохранено')
		})
	} else {
		console.error('[ERROR] saveNameBtn or groupNameInput not found')
	}

	// ----------------------------------------
	// Обработчик: удалить студента
	// ----------------------------------------
	const studentsBody = document.getElementById('studentsBody')
	if (studentsBody) {
		studentsBody.addEventListener('click', async e => {
			const btn = e.target.closest('.remove-student-btn')
			if (!btn) return
			console.log('[DEBUG] remove-student-btn clicked, id=', btn.dataset.id)
			if (!confirm('Удалить студента из группы?')) return

			const studentId = +btn.dataset.id
			const groupId = getGroupIdFromURL()
			console.log('[DEBUG] sending DELETE student-groups', {
				student_id: studentId,
				group_id: groupId,
			})

			let res, text
			try {
				res = await fetch('/api/teacher/student-groups', {
					method: 'DELETE',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ student_id: studentId, group_id: +groupId }),
				})
			} catch (err) {
				console.error('[ERROR] DELETE fetch threw:', err)
				alert('Ошибка сети при удалении студента')
				return
			}

			console.log('[DEBUG] DELETE response status:', res.status)
			if (!res.ok) {
				text = await res.text().catch(() => '<no body>')
				console.error('[ERROR] remove failed:', res.status, text)
				alert('Ошибка удаления: ' + text)
				return
			}

			console.log('[DEBUG] remove succeeded, reloading detail')
			await initTeacherGroupDetail()
		})
	} else {
		console.error('[ERROR] studentsBody not found')
	}

	// ----------------------------------------
	// Обработчик: добавить студента
	// ----------------------------------------
	const addForm = document.getElementById('addStudentForm')
	if (addForm) {
		addForm.addEventListener('submit', async e => {
			e.preventDefault()
			console.log('[DEBUG] addStudentForm submit')
			const email = addForm.student_email.value.trim()
			const groupId = getGroupIdFromURL()

			if (!email) {
				console.warn('[WARN] email empty')
				alert('Введите email студента')
				return
			}

			console.log('[DEBUG] sending PUT student-groups', {
				student_email: email,
				group_id: +groupId,
			})

			let res, text
			try {
				res = await fetch('/api/teacher/student-groups', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ student_email: email, group_id: +groupId }),
				})
			} catch (err) {
				console.error('[ERROR] PUT fetch threw:', err)
				alert('Ошибка сети при добавлении студента')
				return
			}

			console.log('[DEBUG] PUT response status:', res.status)
			if (!res.ok) {
				text = await res.text().catch(() => '<no body>')
				console.error('[ERROR] add failed:', res.status, text)
				alert('Ошибка добавления: ' + text)
				return
			}

			console.log('[DEBUG] add succeeded, reloading detail')
			addForm.reset()
			await initTeacherGroupDetail()
		})
	} else {
		console.error('[ERROR] addStudentForm not found')
	}
})
