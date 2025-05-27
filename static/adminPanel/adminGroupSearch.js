function debounce(fn, ms = 300) {
	let timer
	return (...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => fn(...args), ms)
	}
}

function initAdminGroupSearch() {
	const input = document.getElementById('admin-group-search')
	const sugg = document.getElementById('admin-group-suggestions')
	const wrapper = document.querySelector('.search-wrapper')
	const clearBtn = wrapper.querySelector('.clear-search')

	const tbody = document.getElementById('groupsBody')
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
		const name =
			row.querySelector('input.group-name')?.value.trim().toLowerCase() || ''
		return name
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
		let m = rows.filter(r => getRowData(r) === query)
		if (m.length) return m

		// подстрока
		m = rows.filter(r => getRowData(r).includes(query))
		if (m.length) return m

		// нечёткий
		return rows.filter(r => isFuzzy(getRowData(r), query))
	}

	function highlightText(text, query) {
		const lower = text.toLowerCase()
		const idx = lower.indexOf(query)
		if (idx === -1) return text
		return (
			text.slice(0, idx) +
			'<mark>' +
			text.slice(idx, idx + query.length) +
			'</mark>' +
			text.slice(idx + query.length)
		)
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
			const raw = row.querySelector('input.group-name')?.value || ''
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
		const name = row.querySelector('input.group-name')?.value || ''
		input.value = name
		renderResults(results)
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

// Запуск после рендера групп
document.addEventListener('adminGroups:loaded', initAdminGroupSearch)
