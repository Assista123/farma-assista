const {
  logFeedPurchase,
  logFeedConsumption,
  getFeedSummary,
  getDailyUsageRate
} = require('../services/feedService')
const { saveSession } = require('../utils/sessionManager')

// Start feed logging — ask purchase or consumption
async function startFeedLogging(ctx, session) {
  session.current_flow = 'FEED_LOGGING'
  session.current_step = 'ASK_FEED_ACTION'
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  await ctx.reply(
    '🌾 Feed Logging\n\n' +
    'What would you like to log?',
    {
      reply_markup: {
        keyboard: [
          [{ text: '🛒 I bought feed' }, { text: '🍽️ I fed the birds' }],
          [{ text: '📊 Check feed stock' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    }
  )
}

// Handle each step
async function handleFeedLoggingStep(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  // ASK_FEED_ACTION
  if (currentStep === 'ASK_FEED_ACTION') {
    if (input === '🛒 I bought feed') {
      session.collected_data.action = 'PURCHASE'
      session.current_step = 'ASK_FLOCK'
      await saveSession(session.farmer_id, session)
      await askWhichFlock(ctx, session)
      return
    }

    if (input === '🍽️ I fed the birds') {
      session.collected_data.action = 'CONSUMPTION'
      session.current_step = 'ASK_FLOCK'
      await saveSession(session.farmer_id, session)
      await askWhichFlock(ctx, session)
      return
    }

    if (input === '📊 Check feed stock') {
      await showFeedStock(ctx, session)
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
    session.current_step = 'ASK_FEED_TYPE'
    await saveSession(session.farmer_id, session)

    const flockType = flock.type
    let feedTypes = []

    if (flockType === 'BROILER') {
      feedTypes = [
        [{ text: 'Starter (0-2 weeks)' }],
        [{ text: 'Grower (2-4 weeks)' }],
        [{ text: 'Finisher (4-8 weeks)' }]
      ]
    } else {
      feedTypes = [
        [{ text: 'Starter (0-8 weeks)' }],
        [{ text: 'Grower (8-18 weeks)' }],
        [{ text: 'Layer (18 weeks+)' }]
      ]
    }

    await ctx.reply(
      'What type of feed?',
      {
        reply_markup: {
          keyboard: feedTypes,
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    )
    return
  }

  // ASK_FEED_TYPE
  if (currentStep === 'ASK_FEED_TYPE') {
    const feedTypeMap = {
      'Starter (0-2 weeks)': 'STARTER',
      'Grower (2-4 weeks)': 'GROWER',
      'Finisher (4-8 weeks)': 'FINISHER',
      'Starter (0-8 weeks)': 'LAYER_STARTER',
      'Grower (8-18 weeks)': 'LAYER_GROWER',
      'Layer (18 weeks+)': 'LAYER'
    }

    const feedType = feedTypeMap[input]

    if (!feedType) {
      await ctx.reply('Please select a feed type from the options.')
      return
    }

    session.collected_data.feed_type = feedType
    session.current_step = 'ASK_QUANTITY_UNIT'
    await saveSession(session.farmer_id, session)

    if (session.collected_data.action === 'PURCHASE') {
      await ctx.reply(
        'How do you want to enter the quantity?',
        {
          reply_markup: {
            keyboard: [
              [{ text: '📦 In bags (25kg each)' }],
              [{ text: '⚖️ In kg' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      )
    } else {
      session.current_step = 'ASK_QUANTITY_KG'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        `How many kg of ${input} did the birds consume today?\n\n` +
        `Enter just the number. For example: 12.5`
      )
    }
    return
  }

  // ASK_QUANTITY_UNIT
  if (currentStep === 'ASK_QUANTITY_UNIT') {
    if (input === '📦 In bags (25kg each)') {
      session.current_step = 'ASK_QUANTITY_BAGS'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        'How many bags did you buy?\n\n' +
        'Enter just the number. For example: 10'
      )
      return
    }

    if (input === '⚖️ In kg') {
      session.current_step = 'ASK_QUANTITY_KG'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        'How many kg?\n\n' +
        'Enter just the number. For example: 50'
      )
      return
    }

    await ctx.reply('Please use the buttons to select an option.')
    return
  }

  // ASK_QUANTITY_BAGS
  if (currentStep === 'ASK_QUANTITY_BAGS') {
    const bags = parseFloat(input)

    if (isNaN(bags) || bags <= 0) {
      await ctx.reply(
        'Please enter a valid number of bags.\n' +
        'For example: 10'
      )
      return
    }

    const quantityKg = bags * 25
    session.collected_data.quantity_kg = quantityKg
    session.collected_data.bags = bags

    if (session.collected_data.action === 'PURCHASE') {
      session.current_step = 'ASK_COST'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        `Got it — ${bags} bags = ${quantityKg}kg. 👍\n\n` +
        `How much did you pay in total?\n\n` +
        `Enter the amount in Naira. For example: 25000`
      )
    } else {
      await saveFeedConsumption(ctx, session)
    }
    return
  }

  // ASK_QUANTITY_KG
  if (currentStep === 'ASK_QUANTITY_KG') {
    const quantity = parseFloat(input)

    if (isNaN(quantity) || quantity <= 0) {
      await ctx.reply(
        'Please enter a valid quantity in kg.\n' +
        'For example: 50'
      )
      return
    }

    session.collected_data.quantity_kg = quantity

    if (session.collected_data.action === 'PURCHASE') {
      session.current_step = 'ASK_COST'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        `How much did you pay for ${quantity}kg?\n\n` +
        `Enter the amount in Naira. For example: 25000`
      )
    } else {
      await saveFeedConsumption(ctx, session)
    }
    return
  }

  // ASK_COST (purchase only)
  if (currentStep === 'ASK_COST') {
    const cost = parseFloat(input)

    if (isNaN(cost) || cost <= 0) {
      await ctx.reply(
        'Please enter a valid amount in Naira.\n' +
        'For example: 25000'
      )
      return
    }

    session.collected_data.cost_naira = cost
    session.current_step = 'CONFIRM_PURCHASE'
    await saveSession(session.farmer_id, session)

    const data = session.collected_data
    const bagsText = data.bags
      ? `${data.bags} bags (${data.quantity_kg}kg)`
      : `${data.quantity_kg}kg`
    const costPerKg = (cost / data.quantity_kg).toFixed(0)

    await ctx.reply(
      `Please confirm your feed purchase:\n\n` +
      `🌾 Feed: ${data.feed_type}\n` +
      `📦 Quantity: ${bagsText}\n` +
      `💰 Amount: ₦${cost.toLocaleString()}\n` +
      `📊 Cost per kg: ₦${costPerKg}\n` +
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
    return
  }

  // CONFIRM_PURCHASE
  if (currentStep === 'CONFIRM_PURCHASE') {
    if (input === '❌ No, start over') {
      await startFeedLogging(ctx, session)
      return
    }

    if (input !== '✅ Yes, save it') {
      await ctx.reply('Please use the buttons to confirm or start over.')
      return
    }

    await saveFeedPurchase(ctx, session)
    return
  }
}

// Ask which flock
async function askWhichFlock(ctx, session) {
  if (session.active_flocks.length === 1) {
    const flock = session.active_flocks[0]
    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'ASK_FEED_TYPE'
    await saveSession(session.farmer_id, session)

    const flockType = flock.type
    let feedTypes = []

    if (flockType === 'BROILER') {
      feedTypes = [
        [{ text: 'Starter (0-2 weeks)' }],
        [{ text: 'Grower (2-4 weeks)' }],
        [{ text: 'Finisher (4-8 weeks)' }]
      ]
    } else {
      feedTypes = [
        [{ text: 'Starter (0-8 weeks)' }],
        [{ text: 'Grower (8-18 weeks)' }],
        [{ text: 'Layer (18 weeks+)' }]
      ]
    }

    await ctx.reply(
      `Logging for ${flock.flock_name}.\n\nWhat type of feed?`,
      {
        reply_markup: {
          keyboard: feedTypes,
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    )
    return
  }

  const flockButtons = session.active_flocks.map(
    f => [{ text: f.flock_name }]
  )

  await ctx.reply(
    'Which flock is this for?',
    {
      reply_markup: {
        keyboard: flockButtons,
        resize_keyboard: true,
        one_time_keyboard: true
      }
    }
  )
}

// Save feed purchase
async function saveFeedPurchase(ctx, session) {
  const data = session.collected_data
  const today = new Date().toISOString().split('T')[0]

  const purchase = await logFeedPurchase({
    flock_id: data.flock_id,
    date: today,
    feed_type: data.feed_type,
    quantity_kg: data.quantity_kg,
    cost_naira: data.cost_naira
  })

  if (!purchase) {
    await ctx.reply('Sorry, something went wrong. Please try again.')
    return
  }

  session.current_flow = null
  session.current_step = null
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  const costPerKg = (data.cost_naira / data.quantity_kg).toFixed(0)
  const bagsText = data.bags
    ? `${data.bags} bags (${data.quantity_kg}kg)`
    : `${data.quantity_kg}kg`

  await ctx.reply(
    `✅ Feed purchase recorded!\n\n` +
    `🌾 ${bagsText} of ${data.feed_type}\n` +
    `💰 ₦${data.cost_naira.toLocaleString()}\n` +
    `📊 ₦${costPerKg} per kg\n` +
    `🐔 Flock: ${data.flock_name}\n\n` +
    `What would you like to do next?`,
    {
      reply_markup: {
        keyboard: [
          [{ text: '🌾 Log Feed' }, { text: '💀 Log Mortality' }],
          [{ text: '💵 Log Sales' }, { text: '📦 Check Stock' }],
          [{ text: '❤️ Health Check' }, { text: '💰 Profit Summary' }]
        ],
        resize_keyboard: true
      }
    }
  )
}

// Save feed consumption
async function saveFeedConsumption(ctx, session) {
  const data = session.collected_data
  const today = new Date().toISOString().split('T')[0]

  const consumption = await logFeedConsumption({
    flock_id: data.flock_id,
    date: today,
    feed_type: data.feed_type,
    quantity_kg: data.quantity_kg
  })

  if (!consumption) {
    await ctx.reply('Sorry, something went wrong. Please try again.')
    return
  }

  const { saveUndoEntry } = require('../utils/undoManager')
  await saveUndoEntry(session.farmer_id, {
    type: 'FEED_CONSUMPTION',
    record_id: consumption.id,
    table: 'feed_consumption_logs',
    description: `${data.quantity_kg}kg ${data.feed_type} for ${data.flock_name}`
  })

  const summary = await getFeedSummary(data.flock_id)
  const dailyRate = await getDailyUsageRate(data.flock_id)
  const daysRemaining = dailyRate > 0
    ? Math.floor(summary.current_stock_kg / dailyRate)
    : null

  session.current_flow = null
  session.current_step = null
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  let stockMessage = `📦 Current stock: ${summary.current_stock_kg.toFixed(1)}kg`
  if (daysRemaining !== null) {
    const indicator = daysRemaining <= 3 ? '⚠️' : '✅'
    stockMessage += `\n${indicator} ~${daysRemaining} days remaining`
  }

  await ctx.reply(
    `✅ Feed consumption recorded!\n\n` +
    `🌾 ${data.quantity_kg}kg ${data.feed_type}\n` +
    `🐔 Flock: ${data.flock_name}\n\n` +
    `${stockMessage}\n\n` +
    `What would you like to do next?`,
    {
      reply_markup: {
        keyboard: [
          [{ text: '🌾 Log Feed' }, { text: '💀 Log Mortality' }],
          [{ text: '💵 Log Sales' }, { text: '📦 Check Stock' }],
          [{ text: '❤️ Health Check' }, { text: '💰 Profit Summary' }],
          [{ text: '↩️ Undo last entry' }]
        ],
        resize_keyboard: true
      }
    }
  )
}

// Show feed stock summary
async function showFeedStock(ctx, session) {
  if (session.active_flocks.length === 0) {
    await ctx.reply('You have no active flocks.')
    return
  }

  let message = '📦 Feed Stock Summary\n\n'

  for (const flock of session.active_flocks) {
    const summary = await getFeedSummary(flock.id)
    const dailyRate = await getDailyUsageRate(flock.id)
    const daysRemaining = dailyRate > 0
      ? Math.floor(summary.current_stock_kg / dailyRate)
      : null

    message += `🐔 ${flock.flock_name}\n`
    message += `   Stock: ${summary.current_stock_kg.toFixed(1)}kg\n`
    if (daysRemaining !== null) {
      const indicator = daysRemaining <= 3 ? '⚠️' : '✅'
      message += `   ${indicator} ~${daysRemaining} days remaining\n`
    }
    message += '\n'
  }

  session.current_flow = null
  session.current_step = null
  await saveSession(session.farmer_id, session)

  await ctx.reply(message, {
    reply_markup: {
      keyboard: [
        [{ text: '🌾 Log Feed' }, { text: '💀 Log Mortality' }],
        [{ text: '💵 Log Sales' }, { text: '📦 Check Stock' }],
        [{ text: '❤️ Health Check' }, { text: '💰 Profit Summary' }]
      ],
      resize_keyboard: true
    }
  })
}

module.exports = {
  startFeedLogging,
  handleFeedLoggingStep
}