// Поиск с подсветкой подстроки в подсказках
function debounce(fn, ms = 300) {
	let timer
	return (...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => fn(...args), ms)
	}
}

function initTeacherCourseSearch() {
	const input = document.getElementById('teacher-course-search')
	const sugg = document.getElementById('teacher-suggestions')
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

	const tbody = document.getElementById('teacherCoursesBody')
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
		const inputs = row.querySelectorAll('input.edit-text')
		const title = inputs[0]?.value.trim().toLowerCase() || ''
		const description = inputs[1]?.value.trim().toLowerCase() || ''
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

		let matches = rows.filter(r => getRowData(r).title === query)
		if (matches.length) return matches

		matches = rows.filter(r => {
			const data = getRowData(r)
			return data.title.includes(query) || data.description.includes(query)
		})
		if (matches.length) return matches

		return rows.filter(r => {
			const data = getRowData(r)
			return isFuzzy(data.title + ' ' + data.description, query)
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
			const data = getRowData(row)
			const titleRaw = data.title
			// В оригинале название может быть в любом регистре, берем из input
			const origInput = row.querySelector('input.edit-text')
			const titleDisplay = origInput ? origInput.value : titleRaw
			const highlighted = highlightText(titleDisplay, q.toLowerCase())
			const li = document.createElement('li')
			li.id = `sugg-${idx}`
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
		const title = row.querySelector('input.edit-text')?.value.trim() || ''
		input.value = title
		renderResults(results)
		sugg.innerHTML = ''
		wrapper.setAttribute('aria-expanded', 'false')
		currentIndex = -1
		clearBtn.style.display = 'block'
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
			const results = filterRows(input.value)
			if (currentIndex > -1 && items.length)
				selectSuggestion(currentIndex, results)
			else renderResults(results)
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

document.addEventListener('teacherCourses:loaded', () => {
	if (document.getElementById('teacher-course-search')) {
		initTeacherCourseSearch()
	}
})
