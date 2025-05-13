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
		const u = await res.json()
		if (u.avatar_path) {
			const img = document.querySelector('.user-icon img')
			if (img) img.src = u.avatar_path
		}
	} catch (err) {
		console.error(err)
	}
}

// -----------------------
// 3. Тема
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

// Возвращает строку вида "в сети" или "был(а) сегодня в HH:MM", "был(а) вчера в HH:MM" или "был(а) DD MMM YYYY в HH:MM"
function formatActiveStatus(isActive, lastLogin) {
	if (isActive) return 'в сети'

	const dt = new Date(lastLogin)
	const now = new Date()
	const two = n => String(n).padStart(2, '0')
	const hhmm = `${two(dt.getHours())}:${two(dt.getMinutes())}`

	// сегодня?
	if (dt.toDateString() === now.toDateString()) {
		return `был(а) сегодня в ${hhmm}`
	}
	// вчера?
	const yesterday = new Date(now)
	yesterday.setDate(now.getDate() - 1)
	if (dt.toDateString() === yesterday.toDateString()) {
		return `был(а) вчера в ${hhmm}`
	}
	// раньше
	const monthNames = [
		'янв.',
		'фев.',
		'мар.',
		'апр.',
		'май',
		'июн.',
		'июл.',
		'авг.',
		'сен.',
		'окт.',
		'ноя.',
		'дек.',
	]
	const day = two(dt.getDate())
	const month = monthNames[dt.getMonth()]
	const year = dt.getFullYear()
	return `был(а) ${day} ${month} ${year} в ${hhmm}`
}

// -----------------------
// Управление пользователями
// -----------------------
async function initUsers() {
	const tbody = document.getElementById('usersBody')

	// 1. Забираем одновременно группы и пользователей
	let groups, users
	try {
		const [gRes, uRes] = await Promise.all([
			fetch('/api/admin/groups', { credentials: 'include' }),
			fetch('/api/admin/users', { credentials: 'include' }),
		])
		if (!gRes.ok) throw new Error('Не удалось загрузить группы')
		if (!uRes.ok) throw new Error('Не удалось загрузить пользователей')
		groups = await gRes.json()
		users = await uRes.json()
	} catch (err) {
		return alert(err.message)
	}

	// 2. Формируем HTML-опции для селекта групп
	const groupOptions = [
		`<option value="">Без группы</option>`,
		...groups.map(g => `<option value="${g.id}">${g.name}</option>`),
	].join('')

	// 3. Рендерим таблицу
	tbody.innerHTML = ''
	users.forEach(u => {
		const tr = document.createElement('tr')
		const isStudent = u.role === 'student'

		tr.innerHTML = `
		  <td>${u.email}</td>
		  <td>${u.full_name}</td>
		  <td>
			<select class="role-select" data-id="${u.id}">
			  <option value="student"${
					u.role === 'student' ? ' selected' : ''
				}>student</option>
			  <option value="teacher"${
					u.role === 'teacher' ? ' selected' : ''
				}>teacher</option>
			  <option value="admin"${u.role === 'admin' ? ' selected' : ''}>admin</option>
			</select>
		  </td>
		  <td>${formatActiveStatus(u.is_active, u.last_login)}</td>
		  
		  <td>
			${
				isStudent
					? `<select class="group-select" data-user-id="${u.id}">
					 ${groupOptions}
				   </select>`
					: `<span class="muted">—</span>`
			}
		  </td>
		  <td class="action-cell">
			<button class="save-btn" data-id="${u.id}">Сохранить</button>
			<button class="del-btn"  data-id="${u.id}">Удалить</button>
		  </td>
		`
		tbody.appendChild(tr)

		// выставляем текущую группу только для студентов
		if (isStudent) {
			const gs = tr.querySelector('select.group-select')
			gs.value = u.group_id != null ? u.group_id : ''
		}
	})

	// 4. Обработка кликов
	tbody.onclick = async e => {
		const btn = e.target.closest('button')
		if (!btn) return

		const tr = btn.closest('tr')
		const id = +btn.dataset.id
		if (!tr || !id) return

		// 4.1. Сохранить
		if (btn.classList.contains('save-btn')) {
			const roleSelect = tr.querySelector('select.role-select')
			const groupSelect = tr.querySelector('select.group-select')
			const newRole = roleSelect.value
			const newGroup = groupSelect.value ? +groupSelect.value : null

			try {
				// обновляем роль
				let r1 = await fetch('/api/admin/users', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, role: newRole }),
				})
				if (!r1.ok) {
					let t = await r1.text()
					throw new Error(t || 'Не удалось обновить роль')
				}

				// обновляем группу (null закрывает старую связь)
				let r2 = await fetch('/api/admin/student-groups', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ student_id: id, group_id: newGroup }),
				})
				if (!r2.ok) {
					let t = await r2.text()
					throw new Error(t || 'Не удалось обновить группу')
				}

				// **Важное отличие:** сразу выставляем значение, не перезагружая всех
				groupSelect.value = newGroup != null ? newGroup : ''
				alert('Данные успешно сохранены')
			} catch (err) {
				alert('Ошибка: ' + err.message)
			}
		}

		// 4.2. Удалить пользователя
		if (btn.classList.contains('del-btn')) {
			if (!confirm('Удалить пользователя?')) return
			try {
				let res = await fetch('/api/admin/users', {
					method: 'DELETE',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id }),
				})
				if (!res.ok) {
					let t = await res.text()
					throw new Error(t || 'Не удалось удалить пользователя')
				}
				tr.remove()
			} catch (err) {
				alert('Ошибка: ' + err.message)
			}
		}
	}
}

// -----------------------
// Управление курсами
// -----------------------
async function initCourses() {
	const tbody = document.getElementById('coursesBody')
	const form = document.getElementById('newCourseForm')

	// 1. Загружаем преподавателей (если ещё нет)
	if (!teachersCache.length) {
		await loadTeachers()
	}

	// 2. Заполняем селект в форме создания курса
	const teacherSelectInForm = form.querySelector('select[name="teacher_id"]')
	teacherSelectInForm.innerHTML = [
		`<option value="">-- выберите преподавателя --</option>`,
		...teachersCache.map(
			t => `<option value="${t.id}">${t.full_name}</option>`
		),
	].join('')

	// 3. Загрузка и рендер курсов
	try {
		const r = await fetch('/api/admin/courses', { credentials: 'include' })
		if (!r.ok) throw new Error('Курсы не загружены: ' + r.statusText)
		const arr = await r.json()

		tbody.innerHTML = ''
		arr.forEach(c => {
			const teacherOptions = [
				`<option value="">—</option>`,
				...teachersCache.map(
					t =>
						`<option value="${t.id}"${
							t.id === c.teacher_id ? ' selected' : ''
						}>${t.full_name}</option>`
				),
			].join('')

			const tr = document.createElement('tr')
			tr.innerHTML = `
				<td><input class="edit-title"    data-id="${c.id}" value="${c.title}"></td>
				<td><input class="edit-desc"     data-id="${c.id}" value="${
				c.description
			}"></td>
				<td>
					<select class="edit-teacher" data-id="${c.id}">
						${teacherOptions}
					</select>
				</td>
				<td>${new Date(c.created_at).toLocaleDateString()}</td>
				<td class="action-cell">
					<button class="save-course" data-id="${c.id}">Сохранить</button>
					<button class="del-course"  data-id="${c.id}">Удалить</button>
				</td>`
			tbody.appendChild(tr)
		})
	} catch (e) {
		console.error(e)
	}

	// 4. Обработчик создания
	form.addEventListener('submit', async e => {
		e.preventDefault()
		const fd = new FormData(form)
		const data = {
			title: fd.get('title'),
			description: fd.get('description'),
			teacher_id: fd.get('teacher_id') ? +fd.get('teacher_id') : null,
		}
		try {
			const res = await fetch('/api/admin/courses', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data),
			})
			if (!res.ok) throw new Error(await res.text())
			const { id } = await res.json()
			alert('Курс создан, ID=' + id)
			await initCourses() // перерисовать
		} catch (err) {
			alert('Ошибка создания курса: ' + err.message)
		}
	})

	// 5. Делегирование кнопок
	tbody.addEventListener('click', async e => {
		const id = +e.target.dataset.id
		if (!id) return

		if (e.target.classList.contains('save-course')) {
			const title = document.querySelector(`.edit-title[data-id="${id}"]`).value
			const desc = document.querySelector(`.edit-desc[data-id="${id}"]`).value
			const sel = document.querySelector(`select.edit-teacher[data-id="${id}"]`)
			const tid = sel.value ? +sel.value : null

			try {
				const res = await fetch('/api/admin/courses', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id,
						title,
						description: desc,
						teacher_id: tid,
					}),
				})
				if (!res.ok) throw new Error(await res.text())
				alert('Курс обновлён')
			} catch (err) {
				alert('Ошибка: ' + err.message)
			}
		}

		if (e.target.classList.contains('del-course')) {
			if (!confirm('Удалить курс?')) return
			try {
				const res = await fetch('/api/admin/courses', {
					method: 'DELETE',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id }),
				})
				if (!res.ok) throw new Error(await res.text())
				e.target.closest('tr').remove()
				alert('Курс удалён')
			} catch (err) {
				alert('Ошибка: ' + err.message)
			}
		}
	})
}

// -----------------------
// Управление группами
// -----------------------

// -----------------------
// 1. Кэш преподавателей
// -----------------------
let teachersCache = []

// -----------------------
// 2. Загрузка преподавателей
// -----------------------
async function loadTeachers() {
	const res = await fetch('/api/admin/users', { credentials: 'include' })
	if (!res.ok) {
		alert('Не удалось загрузить список пользователей')
		return
	}
	const users = await res.json()
	// Оставляем только с ролью teacher
	teachersCache = users.filter(u => u.role === 'teacher')
}

// -----------------------
// 3. Инициализация формы создания
// -----------------------
function initCreateForm() {
	// (оставляем без изменений)
	const form = document.getElementById('newGroupForm')
	const select = form.querySelector('#newGroupTeacher')

	select.innerHTML = [
		`<option value="">Без преподавателя</option>`,
		...teachersCache.map(
			t => `<option value="${t.id}">${t.full_name}</option>`
		),
	].join('')

	form.addEventListener('submit', async e => {
		e.preventDefault()
		const name = form.name.value.trim()
		const teacherId = form.teacher.value || null

		if (!name) {
			alert('Введите название группы')
			return
		}

		try {
			const res = await fetch('/api/admin/groups', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					teacher_id: teacherId ? +teacherId : null,
				}),
			})
			if (!res.ok) throw new Error(await res.text())
			alert('Группа создана')
			form.reset()
			await renderGroupsTable()
		} catch (err) {
			alert('Ошибка создания группы: ' + err.message)
		}
	})
}

// -----------------------
// 4. Рендер таблицы групп
// -----------------------
async function renderGroupsTable() {
	// (оставляем без изменений)
	const res = await fetch('/api/admin/groups', { credentials: 'include' })
	if (!res.ok) {
		alert('Ошибка загрузки групп')
		return
	}
	const groups = await res.json()

	const tbody = document.getElementById('groupsBody')
	tbody.innerHTML = ''

	groups.forEach(g => {
		const teacherOptions = [
			`<option value="">—</option>`,
			...teachersCache.map(
				t =>
					`<option value="${t.id}"${t.id === g.teacher_id ? ' selected' : ''}>${
						t.full_name
					}</option>`
			),
		].join('')

		const tr = document.createElement('tr')
		tr.dataset.id = g.id
		tr.innerHTML = `
      <td>${g.id}</td>
      <td><input type="text" class="group-name" value="${g.name}" style="width:100%"></td>
      <td><select class="group-teacher" style="width:100%">${teacherOptions}</select></td>
      <td>
        <button class="save-group" title="Сохранить"><i class="fas fa-check"></i></button>
        <button class="del-group"  title="Удалить"><i class="fas fa-trash"></i></button>
      </td>
    `
		tbody.appendChild(tr)
	})
}

// -----------------------
// 5. Делегирование действий
// -----------------------
function initTableActions() {
	// (оставляем без изменений)
	document.getElementById('groupsBody').addEventListener('click', async e => {
		const btn = e.target.closest('button')
		const tr = e.target.closest('tr')
		if (!btn || !tr) return
		const id = +tr.dataset.id

		if (btn.classList.contains('save-group')) {
			const name = tr.querySelector('.group-name').value.trim()
			const teacherId = tr.querySelector('.group-teacher').value || null
			if (!name) {
				alert('Название не может быть пустым')
				return
			}
			try {
				const res = await fetch('/api/admin/groups', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id,
						name,
						teacher_id: teacherId ? +teacherId : null,
					}),
				})
				if (!res.ok) throw new Error(await res.text())
				alert('Изменения сохранены')
				await renderGroupsTable()
			} catch (err) {
				alert('Ошибка сохранения: ' + err.message)
			}
		}

		if (btn.classList.contains('del-group')) {
			if (!confirm('Вы уверены, что хотите удалить эту группу?')) return
			try {
				const res = await fetch('/api/admin/groups', {
					method: 'DELETE',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id }),
				})
				if (!res.ok) throw new Error(await res.text())
				tr.remove()
			} catch (err) {
				alert('Ошибка удаления: ' + err.message)
			}
		}
	})
}

document.addEventListener('DOMContentLoaded', () => {
	// 4.1. Активная ссылка
	const path = window.location.pathname.split('/').pop()
	document.querySelectorAll('.nav-links a').forEach(link => {
		link.classList.toggle('active', link.getAttribute('href') === path)
	})

	// 4.2. Тема
	const stored = localStorage.getItem('theme')
	const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
	const theme = stored || (dark ? 'dark' : 'light')
	document.documentElement.setAttribute('data-theme', theme)
	updateToggleIcon(theme)
	document.getElementById('theme-toggle').onclick = () => {
		const next =
			document.documentElement.getAttribute('data-theme') === 'dark'
				? 'light'
				: 'dark'
		document.documentElement.setAttribute('data-theme', next)
		localStorage.setItem('theme', next)
		updateToggleIcon(next)
	}
	loadUserIcon()
	////////////////////////
	;(async () => {
		try {
			await loadTeachers()
			initCreateForm()
			await renderGroupsTable()
			initTableActions()
		} catch (err) {
			//alert(err.message)
		}
	})()

	// 4.3. Определяем текущую страницу и запускаем нужный модуль
	if (document.getElementById('usersBody')) initUsers()
	if (document.getElementById('coursesBody')) initCourses()
	if (document.getElementById('groupsBody')) renderGroupsTable()
})
