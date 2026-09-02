// Shared date helpers for all logging flows.
// Lets farmers log entries for Today, Yesterday, or a specific past date.

function getToday() {
  return new Date().toISOString().split('T')[0]
}

function isToday(dateStr) {
  return dateStr === getToday()
}

// Parses DD/MM/YYYY typed by the farmer into a YYYY-MM-DD string.
// Returns null if the format is wrong, the date doesn't exist,
// it's in the future, or it's more than a year in the past.
function parseFarmerDate(input) {
  const trimmed = input.trim()
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null

  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  const year = parseInt(match[3], 10)

  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null

  const daysInMonth = new Date(year, month, 0).getDate()
  if (day > daysInMonth) return null

  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  // Reject future dates — farmers can't log something that hasn't happened yet
  if (dateStr > getToday()) return null

  // Reject dates more than a year old — almost certainly a typo
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0]
  if (dateStr < oneYearAgoStr) return null

  return dateStr
}

// Converts a YYYY-MM-DD string into a farmer-friendly label for confirmations.
function formatDisplayDate(dateStr) {
  if (isToday(dateStr)) return 'Today'

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]
  if (dateStr === yesterdayStr) return 'Yesterday'

  const [year, month, day] = dateStr.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${day} ${months[month - 1]} ${year}`
}

// Show the date selection prompt
async function askLogDate(ctx) {
  await ctx.reply(
    'Which date is this for?',
    {
      reply_markup: {
        keyboard: [
          [{ text: '📅 Today' }, { text: '📅 Yesterday' }],
          [{ text: '📅 Enter a different date' }],
          [{ text: '🏠 Main Menu' }]
        ],
        resize_keyboard: true
      }
    }
  )
}

// Handle date selection input — returns date string, 'AWAITING_CUSTOM_DATE', or null if needs retry
async function handleDateInput(ctx, input) {
  const today = getToday()

  if (input === '📅 Today') return today

  if (input === '📅 Yesterday') {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    return yesterday.toISOString().split('T')[0]
  }

  if (input === '📅 Enter a different date') {
    await ctx.reply(
      'Enter the date in format DD/MM/YYYY\n\nFor example: 25/08/2026',
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return 'AWAITING_CUSTOM_DATE'
  }

  // Try to parse as custom date
  const parsed = parseFarmerDate(input)
  if (parsed) return parsed

  // Invalid input
  await ctx.reply(
    'Please enter a valid date in format DD/MM/YYYY\n\nFor example: 25/08/2026',
    {
      reply_markup: {
        keyboard: [
          [{ text: '📅 Today' }, { text: '📅 Yesterday' }],
          [{ text: '🏠 Main Menu' }]
        ],
        resize_keyboard: true
      }
    }
  )
  return null
}

module.exports = {
  parseFarmerDate,
  formatDisplayDate,
  getToday,
  isToday,
  askLogDate,
  handleDateInput
}