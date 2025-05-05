// -----------------------
// 1. Навигация
// -----------------------
function navigate(url) {
	window.location.href = url
}

// -----------------------
// 2. Загрузка аватарки в навбар
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
// 3. Обновление иконки темы
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

// -----------------------
// 4. Основная инициализация
// -----------------------
document.addEventListener('DOMContentLoaded', () => {
	// 4.1. Активная ссылка меню
	const path = window.location.pathname
	document.querySelectorAll('.nav-links a').forEach(link => {
		link.classList.toggle('active', path.startsWith(link.getAttribute('href')))
	})

	// 4.2. Тема
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

	// 4.3. Подгрузить аватар
	loadUserIcon()

	// 4.4. Загрузка списка пользователей
	const tbody = document.getElementById('usersBody')
	fetch('/api/admin/users', {
		method: 'GET',
		credentials: 'include',
	})
		.then(res => {
			if (!res.ok) throw new Error(`Ошибка ${res.status}`)
			return res.json()
		})
		.then(users => {
			users.forEach(user => {
				const tr = document.createElement('tr')
				tr.innerHTML = `
          <td>${user.email}</td>
          <td>${user.full_name}</td>
          <td>
            <select data-id="${user.id}">
              <option value="student"${
								user.role === 'student' ? ' selected' : ''
							}>student</option>
              <option value="teacher"${
								user.role === 'teacher' ? ' selected' : ''
							}>teacher</option>
              <option value="admin"${
								user.role === 'admin' ? ' selected' : ''
							}>admin</option>
            </select>
          </td>
          <td>${user.is_active ? 'Да' : 'Нет'}</td>
          <td>${new Date(user.last_login).toLocaleString()}</td>
          <td>
            <button class="save-btn" data-id="${user.id}">Сохранить</button>
            <button class="del-btn"  data-id="${user.id}">Удалить</button>
          </td>`
				tbody.appendChild(tr)
			})
		})
		.catch(err => {
			alert('Не удалось загрузить пользователей: ' + err.message)
		})

	// 4.5. Делегирование кнопок
	tbody.addEventListener('click', async e => {
		const id = +e.target.dataset.id
		// Сохранить новую роль
		if (e.target.classList.contains('save-btn')) {
			const sel = tbody.querySelector(`select[data-id="${id}"]`)
			const role = sel.value
			try {
				const res = await fetch('/api/admin/users', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, role }),
				})
				if (!res.ok) throw new Error(res.statusText)
				alert('Роль обновлена')
			} catch (err) {
				alert('Ошибка обновления: ' + err.message)
			}
		}
		// Удалить пользователя
		if (e.target.classList.contains('del-btn')) {
			if (!confirm('Удалить пользователя?')) return
			try {
				const res = await fetch('/api/admin/users', {
					method: 'DELETE',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id }),
				})
				if (!res.ok) throw new Error(res.statusText)
				e.target.closest('tr').remove()
				alert('Пользователь удалён')
			} catch (err) {
				alert('Ошибка удаления: ' + err.message)
			}
		}
	})

	// === 4.6. Управление курсами ===
	const tbodyC = document.getElementById('coursesBody')
	const formNew = document.getElementById('newCourseForm')

	// Загрузка существующих курсов
	fetch('/api/admin/courses', { credentials: 'include' })
		.then(res => {
			if (!res.ok) throw new Error(res.statusText)
			return res.json()
		})
		.then(courses => {
			courses.forEach(c => {
				const tr = document.createElement('tr')
				tr.innerHTML = `
          <td><input data-id="${c.id}" class="edit-title"    value="${
					c.title
				}"></td>
          <td><input data-id="${c.id}" class="edit-desc"     value="${
					c.description
				}"></td>
          <td><input data-id="${c.id}" class="edit-teacher"  value="${
					c.teacher_id
				}"></td>
          <td>${new Date(c.created_at).toLocaleDateString()}</td>
          <td>
            <button class="save-course" data-id="${c.id}">Сохранить</button>
            <button class="del-course"  data-id="${c.id}">Удалить</button>
          </td>`
				tbodyC.appendChild(tr)
			})
		})
		.catch(err => console.error('Курсы не загружены:', err))

	// Создание нового курса
	formNew.addEventListener('submit', async e => {
		e.preventDefault()
		const fd = new FormData(formNew)
		const data = {
			title: fd.get('title'),
			description: fd.get('description'),
			teacher_id: +fd.get('teacher_id'),
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
			location.reload()
		} catch (err) {
			alert('Ошибка создания курса: ' + err.message)
		}
	})

	// Делегирование кнопок в таблице курсов
	tbodyC.addEventListener('click', async e => {
		const id = +e.target.dataset.id
		// Сохранить изменения
		if (e.target.classList.contains('save-course')) {
			const title = document.querySelector(`.edit-title[data-id="${id}"]`).value
			const desc = document.querySelector(`.edit-desc[data-id="${id}"]`).value
			const tid = +document.querySelector(`.edit-teacher[data-id="${id}"]`)
				.value
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
				if (!res.ok) throw new Error(res.statusText)
				alert('Курс обновлён')
			} catch (err) {
				alert('Ошибка обновления курса: ' + err.message)
			}
		}
		// Удалить курс
		if (e.target.classList.contains('del-course')) {
			if (!confirm('Удалить курс?')) return
			try {
				const res = await fetch('/api/admin/courses', {
					method: 'DELETE',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id }),
				})
				if (!res.ok) throw new Error(res.statusText)
				e.target.closest('tr').remove()
				alert('Курс удалён')
			} catch (err) {
				alert('Ошибка удаления курса: ' + err.message)
			}
		}
	})
})
