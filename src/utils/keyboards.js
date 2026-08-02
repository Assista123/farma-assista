const mainMenuKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '📋 Daily Logs' }, { text: '💵 Sales & Finance' }],
      [{ text: '📦 Farm Management' }, { text: '🏠 Main Menu' }]
    ],
    resize_keyboard: true
  }
}

const dailyLogsKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '🌾 Log Feed' }, { text: '💀 Log Mortality' }],
      [{ text: '🥚 Log Eggs' }, { text: '⚖️ Log Weight' }],
      [{ text: '🪹 Litter Check' }, { text: '💊 Log Drug' }],
      [{ text: '🔙 Back' }]
    ],
    resize_keyboard: true
  }
}

const salesFinanceKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '💵 Log Sales' }, { text: '💰 Log Expense' }],
      [{ text: '📊 Profit Summary' }],
      [{ text: '🔙 Back' }]
    ],
    resize_keyboard: true
  }
}

const farmManagementKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '📦 Check Stock' }, { text: '❤️ Health Check' }],
      [{ text: '🔒 Close Flock Cycle' }, { text: '➕ New Flock' }],
      [{ text: '🔙 Back' }]
    ],
    resize_keyboard: true
  }
}

function buildGridKeyboard(items, columns = 2, footer = [{ text: '🏠 Main Menu' }]) {
  const keyboard = []
  for (let i = 0; i < items.length; i += columns) {
    const row = items
      .slice(i, i + columns)
      .map(item => (typeof item === 'string' ? { text: item } : item))
    keyboard.push(row)
  }
  if (footer) {
    keyboard.push(Array.isArray(footer) ? footer : [footer])
  }
  return keyboard
}

module.exports = {
  mainMenuKeyboard,
  dailyLogsKeyboard,
  salesFinanceKeyboard,
  farmManagementKeyboard,
  buildGridKeyboard
}