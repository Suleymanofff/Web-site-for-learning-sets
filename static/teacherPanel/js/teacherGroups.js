// Инициализация страницы "Мои группы"
async function initTeacherGroups() {
	const tbody = document.getElementById('teacherGroupsBody')
	tbody.innerHTML = 'Загрузка...'

	try {
		const res = await fetch('/api/teacher/groups', { credentials: 'include' })
		if (!res.ok) throw new Error('Не удалось загрузить список групп')

		const groups = await res.json()

		if (!groups || !Array.isArray(groups)) {
			throw new Error('Получены некорректные данные')
		}

		tbody.innerHTML = ''

		if (groups.length === 0) {
			tbody.innerHTML =
				'<tr><td colspan="3" style="text-align:center;">Нет доступных групп</td></tr>'
			return
		}

		groups.forEach(g => {
			const tr = document.createElement('tr')
			tr.innerHTML = `
		  <td>${g.id}</td>
		  <td>${g.name}</td>
		  <td>
			<button class="view-group-btn" data-id="${g.id}">
			  <i class="fas fa-eye"></i> Просмотреть
			</button>
		  </td>
		`
			tbody.appendChild(tr)
		})
	} catch (err) {
		tbody.innerHTML = '<tr><td colspan="3">Ошибка загрузки</td></tr>'
		console.error(err)
	}
}

// Обработка клика "Просмотреть"
document.addEventListener('click', e => {
	const btn = e.target.closest('.view-group-btn')
	if (!btn) return

	const id = btn.dataset.id
	if (id) {
		window.location.href = `/static/teacherPanel/html/group.html?id=${id}`
	}
})

// Запуск при загрузке
document.addEventListener('DOMContentLoaded', () => {
	if (document.getElementById('teacherGroupsBody')) {
		initTeacherGroups()
	}
})
