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

		document.dispatchEvent(new CustomEvent('teacherGroups:loaded'))
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

// static/teacherPanel/js/groups.js
// Поиск по группам (без input-полей) с подсветкой и подсказками

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

	const tbody = document.getElementById('teacherGroupsBody')
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

	function getRowText(row) {
		// Название группы во втором столбце
		return row.cells[1].innerText.trim().toLowerCase()
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

		// точное совпадение
		let matches = rows.filter(r => getRowText(r) === query)
		if (matches.length) return matches

		// подстрока
		matches = rows.filter(r => getRowText(r).includes(query))
		if (matches.length) return matches

		// нечеткий поиск
		return rows.filter(r => isFuzzy(getRowText(r), query))
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

		results.slice(0, 10).forEach((row, idx) => {
			const raw = row.cells[1].innerText
			const highlighted = highlightText(raw, q.toLowerCase())
			const li = document.createElement('li')
			li.id = `group-sugg-${idx}`
			li.role = 'option'
			li.innerHTML = highlighted
			li.addEventListener('click', () => selectSuggestion(idx, results))
			sugg.appendChild(li)
		})
	}

	function renderResults(results) {
		rows.forEach(r => (r.style.display = 'none'))
		results.forEach(r => (r.style.display = 'table-row'))
	}

	function highlightItem(items, idx) {
		items.forEach((li, i) => li.classList.toggle('active', i === idx))
		if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' })
	}

	function selectSuggestion(idx, results) {
		const row = results[idx]
		const raw = row.cells[1].innerText
		input.value = raw
		renderResults(results)
		sugg.innerHTML = ''
		wrapper.setAttribute('aria-expanded', 'false')
		clearBtn.style.display = 'block'
		currentIndex = -1
	}

	const debounced = debounce(e => updateSuggestions(e.target.value))
	input.addEventListener('input', debounced)
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

// Запуск при загрузке
document.addEventListener('DOMContentLoaded', () => {
	if (document.getElementById('teacher-group-search')) {
		document.addEventListener('teacherGroups:loaded', () => {
			initTeacherGroupSearch()
		})
	}
	if (document.getElementById('teacherGroupsBody')) {
		initTeacherGroups()
	}
})
