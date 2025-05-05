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

// -----------------------
// 4. Инициализация
// -----------------------
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

	// 4.3. Определяем текущую страницу и запускаем нужный модуль
	if (document.getElementById('usersBody')) initUsers()
	if (document.getElementById('coursesBody')) initCourses()
})

// -----------------------
// Управление пользователями
// -----------------------
function initUsers() {
	const tbody = document.getElementById('usersBody')
	fetch('/api/admin/users', { credentials: 'include' })
		.then(r => (r.ok ? r.json() : Promise.reject(r.statusText)))
		.then(arr => {
			arr.forEach(u => {
				const tr = document.createElement('tr')
				tr.innerHTML = `
          <td>${u.email}</td>
          <td>${u.full_name}</td>
          <td>
            <select data-id="${u.id}">
              <option value="student"${
								u.role === 'student' ? ' selected' : ''
							}>student</option>
              <option value="teacher"${
								u.role === 'teacher' ? ' selected' : ''
							}>teacher</option>
              <option value="admin"${
								u.role === 'admin' ? ' selected' : ''
							}>admin</option>
            </select>
          </td>
          <td>${u.is_active ? 'Да' : 'Нет'}</td>
          <td>${new Date(u.last_login).toLocaleString()}</td>
          <td>
            <button class="save-btn" data-id="${u.id}">Сохранить</button>
            <button class="del-btn"  data-id="${u.id}">Удалить</button>
          </td>`
				tbody.appendChild(tr)
			})
		})
		.catch(e => alert('Не удалось загрузить пользователей: ' + e))

	tbody.addEventListener('click', async e => {
		const id = +e.target.dataset.id
		// Сохранить
		if (e.target.classList.contains('save-btn')) {
			const role = tbody.querySelector(`select[data-id="${id}"]`).value
			try {
				const res = await fetch('/api/admin/users', {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, role }),
				})
				if (!res.ok) throw new Error(await res.text())
				alert('Роль обновлена')
			} catch (err) {
				alert('Ошибка: ' + err.message)
			}
		}
		// Удалить
		if (e.target.classList.contains('del-btn')) {
			if (!confirm('Удалить пользователя?')) return
			try {
				const res = await fetch('/api/admin/users', {
					method: 'DELETE',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id }),
				})
				if (!res.ok) throw new Error(await res.text())
				e.target.closest('tr').remove()
				alert('Пользователь удалён')
			} catch (err) {
				alert('Ошибка: ' + err.message)
			}
		}
	})
}

// -----------------------
// Управление курсами
// -----------------------
function initCourses() {
	const tbody = document.getElementById('coursesBody')
	const form = document.getElementById('newCourseForm')

	// загрузить
	fetch('/api/admin/courses', { credentials: 'include' })
		.then(r => (r.ok ? r.json() : Promise.reject(r.statusText)))
		.then(arr => {
			arr.forEach(c => {
				const tr = document.createElement('tr')
				tr.innerHTML = `
          <td><input class="edit-title"    data-id="${c.id}" value="${
					c.title
				}"></td>
          <td><input class="edit-desc"     data-id="${c.id}" value="${
					c.description
				}"></td>
          <td><input class="edit-teacher"  data-id="${c.id}" value="${
					c.teacher_id
				}"></td>
          <td>${new Date(c.created_at).toLocaleDateString()}</td>
          <td>
            <button class="save-course" data-id="${c.id}">Сохранить</button>
            <button class="del-course"  data-id="${c.id}">Удалить</button>
          </td>`
				tbody.appendChild(tr)
			})
		})
		.catch(e => console.error('Курсы не загружены:', e))

	// добавить
	form.addEventListener('submit', async e => {
		e.preventDefault()
		const fd = new FormData(form)
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

	// делегирование кнопок
	tbody.addEventListener('click', async e => {
		const id = +e.target.dataset.id
		// update
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
				if (!res.ok) throw new Error(await res.text())
				alert('Курс обновлён')
			} catch (err) {
				alert('Ошибка: ' + err.message)
			}
		}
		// delete
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
