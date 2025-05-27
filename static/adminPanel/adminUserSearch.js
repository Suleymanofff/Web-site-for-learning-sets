function debounce(fn, ms = 300) {
	let timer
	return (...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => fn(...args), ms)
	}
}

function initAdminUserSearch() {
	const input = document.getElementById('admin-user-search')
	const sugg = document.getElementById('admin-user-suggestions')
	const wrapper = document.querySelector('.search-wrapper')
	const clearBtn = wrapper.querySelector('.clear-search')

	// все строки таблицы пользователей
	const tbody = document.getElementById('usersBody')
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
		return {
			email: row.cells[0].innerText.trim().toLowerCase(),
			name: row.cells[1].innerText.trim().toLowerCase(),
		}
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
		return `${text.slice(0, idx)}<mark>${text.slice(
			idx,
			idx + query.length
		)}</mark>${text.slice(idx + query.length)}`
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
			const raw = `${row.cells[0].innerText} — ${row.cells[1].innerText}`
			const li = document.createElement('li')
			li.id = `user-sugg-${i}`
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

document.addEventListener('adminUsers:loaded', initAdminUserSearch)
