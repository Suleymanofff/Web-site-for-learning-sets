function debounce(fn, ms = 300) {
	let timer
	return (...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => fn(...args), ms)
	}
}

function initTeacherQuestionSearch() {
	const input = document.getElementById('teacher-question-search')
	const sugg = document.getElementById('teacher-question-suggestions')
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

	const tbody = document.getElementById('questionsBody')
	// Только основные строки вопросов (исключая строки с опциями)
	const rows = Array.from(tbody.querySelectorAll('tr:not(.options-row)'))
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
		const inputEl = row.querySelector('input.edit-text')
		const text = inputEl
			? inputEl.value.trim().toLowerCase()
			: row.cells[0].innerText.trim().toLowerCase()
		return text
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

	function filterRows(q) {
		const query = q.trim().toLowerCase()
		if (!query) return rows
		// точное
		let matches = rows.filter(r => getRowData(r) === query)
		if (matches.length) return matches
		// подстрока
		matches = rows.filter(r => getRowData(r).includes(query))
		if (matches.length) return matches
		// нечеткий
		return rows.filter(r => {
			const text = getRowData(r)
			let idx = 0
			for (const ch of text) {
				if (ch === query[idx]) {
					idx++
					if (idx === query.length) return true
				}
			}
			return false
		})
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
			const raw =
				row.querySelector('input.edit-text')?.value || row.cells[0].innerText
			const highlighted = highlightText(raw, q.toLowerCase())
			const li = document.createElement('li')
			li.id = `question-sugg-${idx}`
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

// Ждём события после загрузки вопросов из loadQuestions()
document.addEventListener('teacherQuestions:loaded', () => {
	if (document.getElementById('teacher-question-search')) {
		initTeacherQuestionSearch()
	}
})

function updateDifficultyStyles() {
	document.querySelectorAll('.edit-difficulty').forEach(select => {
		select.classList.remove('easy', 'medium', 'hard')
		const value = select.value
		select.classList.add(value)
	})
}

document.getElementById('questionsBody').addEventListener('change', e => {
	if (e.target.classList.contains('edit-difficulty')) {
		e.target.classList.remove('easy', 'medium', 'hard')
		const value = e.target.value
		e.target.classList.add(value)
	}
})
