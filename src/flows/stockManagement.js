const {
  addStockItem,
  getStockItems,
  updateStockQuantity,
  logConsumableUsage
} = require('../services/stockService')
const { saveSession } = require('../utils/sessionManager')
const { mainMenuKeyboard } = require('../utils/keyboards')

const ITEM_TYPES = [
  { label: '💊 Drug / Medication', value: 'DRUG' },
  { label: '🪵 Consumable (sawdust, disinfectant)', value: 'CONSUMABLE' },
  { label: '🔧 Equipment', value: 'EQUIPMENT' },
  { label: '📦 Other', value: 'OTHER' }
]

const UNITS = [
  { label: 'KG', value: 'KG' },
  { label: 'GRAMS', value: 'GRAMS' },
  { label: 'BAGS', value: 'BAGS' },
  { label: 'LITRES', value: 'LITRES' },
  { label: 'ML', value: 'ML' },
  { label: 'UNITS', value: 'UNITS' }
]

const { mapToOption, mapToNumber } = require('../utils/optionMapper')

// Show stock summary
async function showStockSummary(ctx, session) {
  const items = await getStockItems(session.farmer_db_id)

  if (items.length === 0) {
    await ctx.reply(
      '📦 Stock Management\n\n' +
      'You have no stock items registered yet.\n\n' +
      'Add your first item to start tracking stock.',
      {
        reply_markup: {
          keyboard: [
            [{ text: '➕ Add Stock Item' }],
            [{ text: '🔙 Back' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  let message = '📦 Stock Summary\n\n'

  for (const item of items) {
    const statusIcon = item.current_quantity <= item.reorder_threshold
      ? '⚠️'
      : '✅'

    message +=
      `${statusIcon} ${item.item_name}\n` +
      `   Quantity: ${item.current_quantity} ${item.unit}\n` +
      `   Reorder at: ${item.reorder_threshold} ${item.unit}\n\n`
  }

  session.current_flow = null
  session.current_step = null
  await saveSession(session.farmer_id, session)

  await ctx.reply(message, {
    reply_markup: {
      keyboard: [
        [{ text: '➕ Add Stock Item' }, { text: '📝 Log Usage' }],
        [{ text: '🔄 Update Quantity' }],
        [{ text: '🔙 Back' }]
      ],
      resize_keyboard: true
    }
  })
}

// Start add stock item flow
async function startAddStockItem(ctx, session) {
  session.current_flow = 'ADD_STOCK_ITEM'
  session.current_step = 'ASK_ITEM_TYPE'
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  const typeButtons = ITEM_TYPES.map(t => [{ text: t.label }])
  typeButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    '➕ Add Stock Item\n\nWhat type of item are you adding?',
    {
      reply_markup: {
        keyboard: typeButtons,
        resize_keyboard: true
      }
    }
  )
}

// Handle add stock item steps
async function handleAddStockItem(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  if (currentStep === 'ASK_ITEM_TYPE') {
    const itemType = ITEM_TYPES.find(t => t.label === input)

    if (!itemType) {
      await ctx.reply('Please select a type from the options.')
      return
    }

    session.collected_data.item_type = itemType.value
    session.current_step = 'ASK_ITEM_NAME'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      'What is the name of this item?\n\n' +
      'For example: Tylosin, Sawdust, Generator, Amprolium',
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_ITEM_NAME') {
    if (input.length < 2) {
      await ctx.reply('Please enter a valid item name.')
      return
    }

    session.collected_data.item_name = input
    session.current_step = 'ASK_UNIT'
    await saveSession(session.farmer_id, session)

    const unitButtons = UNITS.map(u => [{ text: u.label }])
    unitButtons.push([{ text: '🏠 Main Menu' }])

    await ctx.reply(
      `What unit is ${input} measured in?`,
      {
        reply_markup: {
          keyboard: unitButtons,
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_UNIT') {
    const unit = UNITS.find(u => u.label === input)

    if (!unit) {
      await ctx.reply('Please select a unit from the options.')
      return
    }

    session.collected_data.unit = unit.value
    session.current_step = 'ASK_CURRENT_QUANTITY'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `How much ${session.collected_data.item_name} do you currently have?\n\n` +
      `Enter a number. For example: 500\n\n` +
      `Or tap 0 if you have none right now.`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '0' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_CURRENT_QUANTITY') {
    let quantity = parseFloat(input)

    if (isNaN(quantity)) {
      const mapped = await mapToNumber(input, 'Farmer is entering stock quantity')
      if (mapped !== null) quantity = mapped
    }

    if (isNaN(quantity) || quantity < 0) {
      await ctx.reply('Please enter a valid quantity.')
      return
    }

    session.collected_data.current_quantity = quantity
    session.current_step = 'ASK_UNIT_COST'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `What is the cost per ${session.collected_data.unit.toLowerCase()} of ${session.collected_data.item_name}?\n\n` +
      `Enter amount in Naira. For example: 2500\n\n` +
      `Or tap Skip if not sure.`,
      {
        reply_markup: {
          keyboard: [
            [{ text: 'Skip' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_UNIT_COST') {
    if (input === 'Skip') {
      session.collected_data.unit_cost_naira = 0
    } else {
      const cost = parseFloat(input)
      if (isNaN(cost) || cost < 0) {
        await ctx.reply('Please enter a valid amount or tap Skip.')
        return
      }
      session.collected_data.unit_cost_naira = cost
    }

    session.current_step = 'ASK_REORDER_THRESHOLD'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `At what quantity should we alert you to reorder ${session.collected_data.item_name}?\n\n` +
      `For example: if you enter 100, we will alert you when stock drops below 100 ${session.collected_data.unit.toLowerCase()}\n\n` +
      `Or tap Skip to set no alert.`,
      {
        reply_markup: {
          keyboard: [
            [{ text: 'Skip' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_REORDER_THRESHOLD') {
    if (input === 'Skip') {
      session.collected_data.reorder_threshold = 0
    } else {
      const threshold = parseFloat(input)
      if (isNaN(threshold) || threshold < 0) {
        await ctx.reply('Please enter a valid quantity or tap Skip.')
        return
      }
      session.collected_data.reorder_threshold = threshold
    }

    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)

    const data = session.collected_data
    await ctx.reply(
      `Please confirm new stock item:\n\n` +
      `📦 Item: ${data.item_name}\n` +
      `🏷️ Type: ${data.item_type}\n` +
      `📊 Current quantity: ${data.current_quantity} ${data.unit}\n` +
      `💰 Unit cost: ${data.unit_cost_naira > 0 ? `₦${data.unit_cost_naira.toLocaleString()}` : 'Not set'}\n` +
      `⚠️ Reorder alert at: ${data.reorder_threshold > 0 ? `${data.reorder_threshold} ${data.unit}` : 'Not set'}\n\n` +
      `Is this correct?`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '✅ Yes, save it' }, { text: '❌ No, start over' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'CONFIRM') {
    if (input === '❌ No, start over') {
      await startAddStockItem(ctx, session)
      return
    }

    if (input !== '✅ Yes, save it') {
      await ctx.reply('Please use the buttons to confirm or start over.')
      return
    }

    const data = session.collected_data
    const item = await addStockItem({
      farmer_id: session.farmer_db_id,
      item_name: data.item_name,
      item_type: data.item_type,
      current_quantity: data.current_quantity,
      unit: data.unit,
      unit_cost_naira: data.unit_cost_naira,
      reorder_threshold: data.reorder_threshold
    })

    if (!item) {
      await ctx.reply('Sorry, something went wrong. Please try again.')
      return
    }

    session.current_flow = null
    session.current_step = null
    session.collected_data = {}
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `✅ ${item.item_name} added to stock!\n\n` +
      `Current quantity: ${item.current_quantity} ${item.unit}\n\n` +
      `What would you like to do next?`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '➕ Add Stock Item' }, { text: '📝 Log Usage' }],
            [{ text: '🔄 Update Quantity' }],
            [{ text: '🔙 Back' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }
}

// Start log usage flow
async function startLogUsage(ctx, session) {
  const items = await getStockItems(session.farmer_db_id)

  if (items.length === 0) {
    await ctx.reply(
      'You have no stock items registered yet.\n\n' +
      'Add a stock item first before logging usage.',
      {
        reply_markup: {
          keyboard: [
            [{ text: '➕ Add Stock Item' }],
            [{ text: '🔙 Back' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  session.current_flow = 'LOG_STOCK_USAGE'
  session.current_step = 'ASK_ITEM'
  session.collected_data = { items }
  await saveSession(session.farmer_id, session)

  const itemButtons = items.map(i => [{
    text: `${i.item_name} (${i.current_quantity} ${i.unit})`
  }])
  itemButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    '📝 Log Usage\n\nWhich item did you use?',
    {
      reply_markup: {
        keyboard: itemButtons,
        resize_keyboard: true
      }
    }
  )
}

// Handle log usage steps
async function handleLogUsage(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  if (currentStep === 'ASK_ITEM') {
    const item = session.collected_data.items.find(
      i => `${i.item_name} (${i.current_quantity} ${i.unit})` === input
    )

    if (!item) {
      await ctx.reply('Please select an item from the options.')
      return
    }

    session.collected_data.selected_item = item
    session.current_step = 'ASK_QUANTITY_USED'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `How much ${item.item_name} did you use?\n\n` +
      `Enter a number in ${item.unit.toLowerCase()}. For example: 50`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_QUANTITY_USED') {
    const quantity = parseFloat(input)
    const item = session.collected_data.selected_item

    if (isNaN(quantity) || quantity <= 0) {
      await ctx.reply('Please enter a valid quantity.')
      return
    }

    if (quantity > item.current_quantity) {
      await ctx.reply(
        `You only have ${item.current_quantity} ${item.unit} of ${item.item_name}.\n\n` +
        `How much did you use?`
      )
      return
    }

    session.collected_data.quantity_used = quantity
    session.current_step = 'ASK_FLOCK'
    await saveSession(session.farmer_id, session)

    if (session.active_flocks.length === 0) {
      session.collected_data.flock_id = null
      session.current_step = 'ASK_NOTE'
      await saveSession(session.farmer_id, session)
      await askNote(ctx)
      return
    }

    const flockButtons = session.active_flocks.map(f => [{ text: f.flock_name }])
    flockButtons.push([{ text: '🏠 Whole farm' }])
    flockButtons.push([{ text: '🏠 Main Menu' }])

    await ctx.reply(
      'Which flock is this for?',
      {
        reply_markup: {
          keyboard: flockButtons,
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_FLOCK') {
    if (input === '🏠 Whole farm') {
      session.collected_data.flock_id = null
    } else {
      const flock = session.active_flocks.find(f => f.flock_name === input)
      if (!flock) {
        await ctx.reply('Please select an option from the buttons.')
        return
      }
      session.collected_data.flock_id = flock.id
    }

    session.current_step = 'ASK_NOTE'
    await saveSession(session.farmer_id, session)
    await askNote(ctx)
    return
  }

  if (currentStep === 'ASK_NOTE') {
    session.collected_data.note = input === 'Skip' ? null : input
    await saveUsage(ctx, session)
    return
  }
}

async function askNote(ctx) {
  await ctx.reply(
    'Any notes about this usage?\n\n' +
    'For example: Day 2 of treatment\n\n' +
    'Or tap Skip.',
    {
      reply_markup: {
        keyboard: [
          [{ text: 'Skip' }],
          [{ text: '🏠 Main Menu' }]
        ],
        resize_keyboard: true
      }
    }
  )
}

async function saveUsage(ctx, session) {
  const data = session.collected_data
  const item = data.selected_item
  const today = new Date().toISOString().split('T')[0]

  const costNaira = item.unit_cost_naira > 0
    ? data.quantity_used * item.unit_cost_naira
    : null

  const log = await logConsumableUsage({
    stock_id: item.id,
    flock_id: data.flock_id,
    date: today,
    quantity_used: data.quantity_used,
    unit: item.unit,
    cost_naira: costNaira,
    note: data.note
  })

  if (!log) {
    await ctx.reply('Sorry, something went wrong. Please try again.')
    return
  }

  // Update stock quantity
  const newQuantity = item.current_quantity - data.quantity_used
  await updateStockQuantity(item.id, newQuantity)

  session.current_flow = null
  session.current_step = null
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  let lowStockWarning = ''
  if (newQuantity <= item.reorder_threshold && item.reorder_threshold > 0) {
    lowStockWarning =
      `\n\n⚠️ Low stock alert!\n` +
      `${item.item_name} is now at ${newQuantity} ${item.unit} ` +
      `— below your reorder threshold of ${item.reorder_threshold} ${item.unit}.`
  }

  let costNote = ''
  if (costNaira) {
    costNote = `\n💰 Cost: ₦${costNaira.toLocaleString()}`
  }

  await ctx.reply(
    `✅ Usage recorded!\n\n` +
    `📦 ${item.item_name}\n` +
    `Used: ${data.quantity_used} ${item.unit}\n` +
    `Remaining: ${newQuantity} ${item.unit}` +
    costNote +
    lowStockWarning +
    `\n\nWhat would you like to do next?`,
    mainMenuKeyboard
  )
}

// Start update quantity flow
async function startUpdateQuantity(ctx, session) {
  const items = await getStockItems(session.farmer_db_id)

  if (items.length === 0) {
    await ctx.reply(
      'You have no stock items registered yet.',
      {
        reply_markup: {
          keyboard: [
            [{ text: '➕ Add Stock Item' }],
            [{ text: '🔙 Back' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  session.current_flow = 'UPDATE_STOCK_QUANTITY'
  session.current_step = 'ASK_ITEM'
  session.collected_data = { items }
  await saveSession(session.farmer_id, session)

  const itemButtons = items.map(i => [{
    text: `${i.item_name} (${i.current_quantity} ${i.unit})`
  }])
  itemButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    '🔄 Update Quantity\n\nWhich item do you want to update?',
    {
      reply_markup: {
        keyboard: itemButtons,
        resize_keyboard: true
      }
    }
  )
}

// Handle update quantity steps
async function handleUpdateQuantity(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  if (currentStep === 'ASK_ITEM') {
    const item = session.collected_data.items.find(
      i => `${i.item_name} (${i.current_quantity} ${i.unit})` === input
    )

    if (!item) {
      await ctx.reply('Please select an item from the options.')
      return
    }

    session.collected_data.selected_item = item
    session.current_step = 'ASK_NEW_QUANTITY'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Current ${item.item_name} quantity: ${item.current_quantity} ${item.unit}\n\n` +
      `What is the new quantity?`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_NEW_QUANTITY') {
    const quantity = parseFloat(input)

    if (isNaN(quantity) || quantity < 0) {
      await ctx.reply('Please enter a valid quantity.')
      return
    }

    const item = session.collected_data.selected_item
    await updateStockQuantity(item.id, quantity)

    session.current_flow = null
    session.current_step = null
    session.collected_data = {}
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `✅ ${item.item_name} updated to ${quantity} ${item.unit}.`,
      mainMenuKeyboard
    )
    return
  }
}

module.exports = {
  showStockSummary,
  startAddStockItem,
  handleAddStockItem,
  startLogUsage,
  handleLogUsage,
  startUpdateQuantity,
  handleUpdateQuantity
}