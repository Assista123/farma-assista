const { logBirdSale, logEggSale } = require('../services/salesService')
const { getFlockById, updateBirdCount } = require('../services/flockService')
const { saveUndoEntry } = require('../utils/undoManager')
const { saveSession } = require('../utils/sessionManager')

// Start sales logging
async function startSalesLogging(ctx, session) {
  session.current_flow = 'SALES_LOGGING'
  session.current_step = 'ASK_SALE_TYPE'
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  // Check if farmer has both broiler and layer flocks
  const hasBroilers = session.active_flocks.some(f => f.type === 'BROILER')
  const hasLayers = session.active_flocks.some(f => f.type === 'LAYER')

  if (hasBroilers && hasLayers) {
    await ctx.reply(
      '💵 Sales Logging\n\nWhat are you selling?',
      {
        reply_markup: {
          keyboard: [
            [{ text: '🐔 Selling birds' }, { text: '🥚 Selling eggs' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    )
    return
  }

  // Only one type — go straight to flock selection
  if (hasBroilers) {
    session.collected_data.sale_type = 'BIRDS'
    session.current_step = 'ASK_FLOCK'
    await saveSession(session.farmer_id, session)
    await askWhichFlock(ctx, session, 'BROILER')
    return
  }

  if (hasLayers) {
    session.collected_data.sale_type = 'EGGS'
    session.current_step = 'ASK_FLOCK'
    await saveSession(session.farmer_id, session)
    await askWhichFlock(ctx, session, 'LAYER')
    return
  }
}

// Handle each step
async function handleSalesStep(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  // ASK_SALE_TYPE
  if (currentStep === 'ASK_SALE_TYPE') {
    if (input === '🐔 Selling birds') {
      session.collected_data.sale_type = 'BIRDS'
      session.current_step = 'ASK_FLOCK'
      await saveSession(session.farmer_id, session)
      await askWhichFlock(ctx, session, 'BROILER')
      return
    }

    if (input === '🥚 Selling eggs') {
      session.collected_data.sale_type = 'EGGS'
      session.current_step = 'ASK_FLOCK'
      await saveSession(session.farmer_id, session)
      await askWhichFlock(ctx, session, 'LAYER')
      return
    }

    await ctx.reply('Please use the buttons to select an option.')
    return
  }

  // ASK_FLOCK
  if (currentStep === 'ASK_FLOCK') {
    const flock = session.active_flocks.find(
      f => f.flock_name === input
    )

    if (!flock) {
      await ctx.reply('Please select a flock from the options.')
      return
    }

    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = session.collected_data.sale_type === 'BIRDS'
      ? 'ASK_BIRD_COUNT'
      : 'ASK_EGG_COUNT'
    await saveSession(session.farmer_id, session)

    if (session.collected_data.sale_type === 'BIRDS') {
      const flockDetails = await getFlockById(flock.id)
      await ctx.reply(
        `🐔 Bird Sale — ${flock.flock_name}\n\n` +
        `You currently have ${flockDetails.current_bird_count} birds.\n\n` +
        `How many birds are you selling?`
      )
    } else {
      await ctx.reply(
        `🥚 Egg Sale — ${flock.flock_name}\n\n` +
        `How many eggs are you selling?`
      )
    }
    return
  }

  // ASK_BIRD_COUNT
  if (currentStep === 'ASK_BIRD_COUNT') {
    const count = parseInt(input)

    if (isNaN(count) || count < 1) {
      await ctx.reply(
        'Please enter a valid number of birds.\n' +
        'For example: 50'
      )
      return
    }

    const flock = await getFlockById(session.collected_data.flock_id)

    if (count > flock.current_bird_count) {
      await ctx.reply(
        `You only have ${flock.current_bird_count} birds available.\n\n` +
        `How many birds are you selling?`
      )
      return
    }

    session.collected_data.bird_count = count
    session.collected_data.bird_count_before_sale = flock.current_bird_count
    session.current_step = 'ASK_UNIT_PRICE'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `How much per bird?\n\n` +
      `Enter the price in Naira. For example: 4500`
    )
    return
  }

  // ASK_EGG_COUNT
  if (currentStep === 'ASK_EGG_COUNT') {
    const count = parseInt(input)

    if (isNaN(count) || count < 1) {
      await ctx.reply(
        'Please enter a valid number of eggs.\n' +
        'For example: 300'
      )
      return
    }

    session.collected_data.egg_count = count
    session.current_step = 'ASK_UNIT_PRICE'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `How much per egg?\n\n` +
      `Enter the price in Naira. For example: 80`
    )
    return
  }

  // ASK_UNIT_PRICE
  if (currentStep === 'ASK_UNIT_PRICE') {
    const price = parseFloat(input)

    if (isNaN(price) || price <= 0) {
      await ctx.reply(
        'Please enter a valid price in Naira.\n' +
        'For example: 4500'
      )
      return
    }

    session.collected_data.unit_price_naira = price
    session.current_step = 'ASK_BUYER'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Who is the buyer?\n\n` +
      `Enter their name or tap Skip.`,
      {
        reply_markup: {
          keyboard: [
            [{ text: 'Skip' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    )
    return
  }

  // ASK_BUYER
  if (currentStep === 'ASK_BUYER') {
    session.collected_data.buyer_name = input === 'Skip' ? null : input
    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)
    await showConfirmation(ctx, session)
    return
  }

  // CONFIRM
  if (currentStep === 'CONFIRM') {
    if (input === '❌ No, start over') {
      await startSalesLogging(ctx, session)
      return
    }

    if (input !== '✅ Yes, save it') {
      await ctx.reply('Please use the buttons to confirm or start over.')
      return
    }

    await saveSale(ctx, session)
    return
  }
}

// Ask which flock filtered by type
async function askWhichFlock(ctx, session, flockType) {
  const relevantFlocks = session.active_flocks.filter(
    f => f.type === flockType
  )

  if (relevantFlocks.length === 1) {
    const flock = relevantFlocks[0]
    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = session.collected_data.sale_type === 'BIRDS'
      ? 'ASK_BIRD_COUNT'
      : 'ASK_EGG_COUNT'
    await saveSession(session.farmer_id, session)

    if (session.collected_data.sale_type === 'BIRDS') {
      const flockDetails = await getFlockById(flock.id)
      await ctx.reply(
        `🐔 Bird Sale — ${flock.flock_name}\n\n` +
        `You currently have ${flockDetails.current_bird_count} birds.\n\n` +
        `How many birds are you selling?`
      )
    } else {
      await ctx.reply(
        `🥚 Egg Sale — ${flock.flock_name}\n\n` +
        `How many eggs are you selling?`
      )
    }
    return
  }

  const flockButtons = relevantFlocks.map(f => [{ text: f.flock_name }])

  await ctx.reply(
    'Which flock is this sale from?',
    {
      reply_markup: {
        keyboard: flockButtons,
        resize_keyboard: true,
        one_time_keyboard: true
      }
    }
  )
}

// Show confirmation
async function showConfirmation(ctx, session) {
  const data = session.collected_data
  const isBird = data.sale_type === 'BIRDS'

  const quantity = isBird ? data.bird_count : data.egg_count
  const unit = isBird ? 'birds' : 'eggs'
  const total = quantity * data.unit_price_naira
  data.total_amount_naira = total

  await saveSession(session.farmer_id, session)

  await ctx.reply(
    `Please confirm this sale:\n\n` +
    `${isBird ? '🐔' : '🥚'} ${quantity} ${unit}\n` +
    `💰 Price per ${isBird ? 'bird' : 'egg'}: ₦${data.unit_price_naira.toLocaleString()}\n` +
    `💵 Total: ₦${total.toLocaleString()}\n` +
    `👤 Buyer: ${data.buyer_name || 'Not specified'}\n` +
    `🐔 Flock: ${data.flock_name}\n\n` +
    `Is this correct?`,
    {
      reply_markup: {
        keyboard: [
          [{ text: '✅ Yes, save it' }, { text: '❌ No, start over' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    }
  )
}

// Save sale to database
async function saveSale(ctx, session) {
  const data = session.collected_data
  const today = new Date().toISOString().split('T')[0]
  const isBird = data.sale_type === 'BIRDS'

  let sale

  if (isBird) {
    sale = await logBirdSale({
      flock_id: data.flock_id,
      date: today,
      bird_count: data.bird_count,
      unit_price_naira: data.unit_price_naira,
      total_amount_naira: data.total_amount_naira,
      buyer_name: data.buyer_name
    })
  } else {
    sale = await logEggSale({
      flock_id: data.flock_id,
      date: today,
      egg_count: data.egg_count,
      unit_price_naira: data.unit_price_naira,
      total_amount_naira: data.total_amount_naira,
      buyer_name: data.buyer_name
    })
  }

  if (!sale) {
    await ctx.reply('Sorry, something went wrong. Please try again.')
    return
  }

  // Update bird count if bird sale
  if (isBird) {
    const newCount = data.bird_count_before_sale - data.bird_count
    await updateBirdCount(data.flock_id, newCount)

    const flockIndex = session.active_flocks.findIndex(
      f => f.id === data.flock_id
    )
    if (flockIndex !== -1) {
      session.active_flocks[flockIndex].current_bird_count = newCount
    }
  }

  // Save undo entry
  await saveUndoEntry(session.farmer_id, {
    type: isBird ? 'BIRD_SALE' : 'EGG_SALE',
    record_id: sale.id,
    table: isBird ? 'bird_sales_logs' : 'egg_sales_logs',
    flock_id: data.flock_id,
    bird_count_before_sale: data.bird_count_before_sale,
    description: isBird
      ? `Sale of ${data.bird_count} birds for ₦${data.total_amount_naira.toLocaleString()} from ${data.flock_name}`
      : `Sale of ${data.egg_count} eggs for ₦${data.total_amount_naira.toLocaleString()} from ${data.flock_name}`
  })

  session.current_flow = null
  session.current_step = null
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  const quantity = isBird ? data.bird_count : data.egg_count
  const unit = isBird ? 'birds' : 'eggs'

  await ctx.reply(
    `✅ Sale recorded!\n\n` +
    `${isBird ? '🐔' : '🥚'} ${quantity} ${unit} sold\n` +
    `💵 Total: ₦${data.total_amount_naira.toLocaleString()}\n` +
    `👤 Buyer: ${data.buyer_name || 'Not specified'}\n` +
    `🐔 Flock: ${data.flock_name}\n\n` +
    `What would you like to do next?`,
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
  startSalesLogging,
  handleSalesStep
}