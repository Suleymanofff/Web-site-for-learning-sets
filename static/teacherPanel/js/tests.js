// static/teacherPanel/js/tests.js
// Поиск тестов с подсветкой подстроки в подсказках

function debounce(fn, ms = 300) {
	let timer
	return (...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => fn(...args), ms)
	}
}

function initTeacherTestSearch() {
	const input = document.getElementById('teacher-test-search')
	const sugg = document.getElementById('teacher-test-suggestions')
	const wrapper = document.querySelector('.search-wrapper')
	const clearBtn =
		wrapper.querySelector('.clear-search') ||
		(() => {
			const btn = document.createElement('button')
			btn.className = 'clear-search'
			btn.setAttribute('aria-label', 'Очистить поиск')
			btn.innerHTML = '&times;'
			wrapper.appendChild(btn)
			return btn
		})()

	const tbody = document.getElementById('testsBody')
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
		// Для тестов мы тоже считаем, что первые два столбца — это <input class="edit-text">
		const inputs = row.querySelectorAll('input.edit-text')
		const title =
			inputs[0]?.value.trim().toLowerCase() ||
			row.cells[0].innerText.trim().toLowerCase()
		const description =
			inputs[1]?.value.trim().toLowerCase() ||
			row.cells[1].innerText.trim().toLowerCase()
		return { title, description }
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

		// точное совпадение по названию
		let matches = rows.filter(r => getRowData(r).title === query)
		if (matches.length) return matches

		// подстрока
		matches = rows.filter(r => {
			const d = getRowData(r)
			return d.title.includes(query) || d.description.includes(query)
		})
		if (matches.length) return matches

		// нечеткий поиск
		return rows.filter(r => {
			const d = getRowData(r)
			return isFuzzy(d.title + ' ' + d.description, query)
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
			wrapper.setAttribute('aria-expanded', 'false')
			clearBtn.style.display = 'none'
			rows.forEach(r => (r.style.display = 'table-row'))
			return
		}
		clearBtn.style.display = 'block'
		wrapper.setAttribute('aria-expanded', 'true')

		results.slice(0, 10).forEach((row, idx) => {
			// Берём исходный заголовок из input или из ячейки
			const rawText =
				row.querySelector('input.edit-text')?.value || row.cells[0].innerText
			const highlighted = highlightText(rawText, q.toLowerCase())
			const li = document.createElement('li')
			li.id = `test-sugg-${idx}`
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
		const title =
			row.querySelector('input.edit-text')?.value || row.cells[0].innerText
		input.value = title
		renderResults(results)
		sugg.innerHTML = ''
		wrapper.setAttribute('aria-expanded', 'false')
		clearBtn.style.display = 'block'
		currentIndex = -1
	}

	const debouncedUpdate = debounce(e => updateSuggestions(e.target.value))
	input.addEventListener('input', debouncedUpdate)

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

// Ждём события после загрузки и отрисовки тестов в script.js
document.addEventListener('teacherTests:loaded', () => {
	if (document.getElementById('teacher-test-search')) {
		initTeacherTestSearch()
	}
})
