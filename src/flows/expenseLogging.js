const { logExpense } = require('../services/expenseService')
const { saveUndoEntry } = require('../utils/undoManager')
const { saveSession } = require('../utils/sessionManager')
const { mapToOption, mapToNumber } = require('../utils/optionMapper')
const { suggestNextAction } = require('../utils/nextActionHelper')

const CATEGORIES = [
  { label: '💉 Drugs & medication', value: 'DRUGS' },
  { label: '👷 Labour', value: 'LABOR' },
  { label: '🔧 Equipment', value: 'EQUIPMENT' },
  { label: '📦 Other (specify)', value: 'CUSTOM' }
]

async function startExpenseLogging(ctx, session) {
  session.current_flow = 'EXPENSE_LOGGING'
  session.current_step = 'ASK_CATEGORY'
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  const categoryButtons = CATEGORIES.map(c => [{ text: c.label }])
  categoryButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    '💰 Log Expense\n\nWhat type of expense is this?',
    {
      reply_markup: {
        keyboard: categoryButtons,
        resize_keyboard: true
      }
    }
  )
}

async function handleExpenseStep(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  if (currentStep === 'ASK_CATEGORY') {
    let category = CATEGORIES.find(c => c.label === input)

    if (!category) {
      const mapped = await mapToOption(
        input,
        CATEGORIES.map(c => c.label),
        'Farmer is selecting expense category'
      )
      if (mapped) category = CATEGORIES.find(c => c.label === mapped)
    }

    if (!category) {
      await ctx.reply('Please select a category from the options.')
      return
    }

    session.collected_data.category = category.value
    session.collected_data.category_label = category.label

    if (category.value === 'CUSTOM') {
      session.current_step = 'ASK_CUSTOM_CATEGORY'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        'Please describe this expense in a few words:\n\n' +
        'For example: Generator fuel, Disinfectant, Water bill',
        {
          reply_markup: {
            keyboard: [[{ text: '🏠 Main Menu' }]],
            resize_keyboard: true
          }
        }
      )
      return
    }

    session.current_step = 'ASK_FLOCK'
    await saveSession(session.farmer_id, session)
    await askFlockOrFarm(ctx, session)
    return
  }

  if (currentStep === 'ASK_CUSTOM_CATEGORY') {
    if (input.length < 2) {
      await ctx.reply('Please describe the expense.')
      return
    }

    session.collected_data.custom_category_name = input
    session.current_step = 'ASK_FLOCK'
    await saveSession(session.farmer_id, session)
    await askFlockOrFarm(ctx, session)
    return
  }

  if (currentStep === 'ASK_FLOCK') {
    if (input === '🏠 Whole farm') {
      session.collected_data.flock_id = null
      session.collected_data.flock_name = 'Whole farm'

      // Capture total farm birds for proportional allocation
      const totalBirds = session.active_flocks.reduce(
        (sum, f) => sum + (f.current_bird_count || 0), 0
      )
      session.collected_data.total_farm_birds = totalBirds
      session.current_step = 'ASK_AMOUNT'
      await saveSession(session.farmer_id, session)
      await askAmount(ctx)
      return
    }

    const flock = session.active_flocks.find(f => f.flock_name === input)

    if (!flock) {
      await ctx.reply('Please select an option from the buttons.')
      return
    }

    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'ASK_AMOUNT'
    await saveSession(session.farmer_id, session)
    await askAmount(ctx)
    return
  }

  if (currentStep === 'ASK_AMOUNT') {
    let amount = parseFloat(input)

    if (isNaN(amount)) {
      const mapped = await mapToNumber(
        input,
        'Farmer is entering expense amount in Naira'
      )
      if (mapped !== null) amount = mapped
    }

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply(
        'Please enter a valid amount in Naira.\n' +
        'For example: 15000'
      )
      return
    }

    session.collected_data.amount_naira = amount
    session.current_step = 'ASK_DESCRIPTION'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      'Any additional description?\n\n' +
      'For example: Paid Emeka for pen cleaning\n\n' +
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
    return
  }

  if (currentStep === 'ASK_DESCRIPTION') {
    session.collected_data.description = input === 'Skip' ? null : input
    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)
    await showConfirmation(ctx, session)
    return
  }

  if (currentStep === 'CONFIRM') {
    if (input === '❌ No, start over') {
      await startExpenseLogging(ctx, session)
      return
    }

    if (input !== '✅ Yes, save it') {
      await ctx.reply('Please use the buttons to confirm or start over.')
      return
    }

    await saveExpense(ctx, session)
    return
  }
}

async function askFlockOrFarm(ctx, session) {
  if (session.active_flocks.length === 1) {
    const flock = session.active_flocks[0]
    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'ASK_AMOUNT'
    await saveSession(session.farmer_id, session)
    await askAmount(ctx)
    return
  }

  const flockButtons = session.active_flocks.map(f => [{ text: f.flock_name }])
  flockButtons.push([{ text: '🏠 Whole farm' }])
  flockButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    'Is this expense for a specific flock or the whole farm?',
    {
      reply_markup: {
        keyboard: flockButtons,
        resize_keyboard: true
      }
    }
  )
}

async function askAmount(ctx) {
  await ctx.reply(
    'How much did you spend?\n\n' +
    'Enter the amount in Naira. For example: 15000',
    {
      reply_markup: {
        keyboard: [[{ text: '🏠 Main Menu' }]],
        resize_keyboard: true
      }
    }
  )
}

async function showConfirmation(ctx, session) {
  const data = session.collected_data
  const categoryName = data.custom_category_name || data.category_label

  await ctx.reply(
    `Please confirm this expense:\n\n` +
    `📋 Category: ${categoryName}\n` +
    `🐔 For: ${data.flock_name}\n` +
    `💰 Amount: ₦${data.amount_naira.toLocaleString()}\n` +
    `📝 Description: ${data.description || 'None'}\n\n` +
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
}

async function saveExpense(ctx, session) {
  const data = session.collected_data
  const today = new Date().toISOString().split('T')[0]

  const expense = await logExpense({
    farmer_id: session.farmer_db_id,
    flock_id: data.flock_id,
    date: today,
    category: data.category,
    custom_category_name: data.custom_category_name || null,
    amount_naira: data.amount_naira,
    description: data.description,
    total_farm_birds: data.total_farm_birds || null
  })

  if (!expense) {
    await ctx.reply('Sorry, something went wrong. Please try again.')
    return
  }

  await saveUndoEntry(session.farmer_id, {
    type: 'EXPENSE',
    record_id: expense.id,
    table: 'expenses',
    description: `₦${data.amount_naira.toLocaleString()} expense for ${data.flock_name}`
  })

  // flock_id is null for whole-farm expenses — no single flock to pass in that case
  const flock = data.flock_id
    ? session.active_flocks.find(f => f.id === data.flock_id) || null
    : null

  session.current_flow = null
  session.current_step = null
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  let allocationNote = ''
  if (!data.flock_id && session.active_flocks.length > 1) {
    allocationNote =
      `\n\n💡 This farm-wide expense will be split proportionally ` +
      `across your ${session.active_flocks.length} active flocks ` +
      `by bird count in your profit reports.`
  }

  const suggestion = await suggestNextAction(session, { type: 'EXPENSE', flock })

  await ctx.reply(
    `✅ Expense recorded!\n\n` +
    `📋 ${data.custom_category_name || data.category_label}\n` +
    `💰 ₦${data.amount_naira.toLocaleString()}\n` +
    `🐔 For: ${data.flock_name}` +
    allocationNote +
    (suggestion || ''),
    {
      reply_markup: {
        keyboard: [
          [{ text: '📋 Daily Logs' }, { text: '💵 Sales & Finance' }],
          [{ text: '📦 Farm Management' }, { text: '🏠 Main Menu' }]
        ],
        resize_keyboard: true
      }
    }
  )
}

module.exports = {
  startExpenseLogging,
  handleExpenseStep
}