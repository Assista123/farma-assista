const { logEggProduction, getLayRate } = require('../services/eggProductionService')
const { getFlockById, getBirdAgeDays } = require('../services/flockService')
const { saveUndoEntry } = require('../utils/undoManager')
const { saveSession } = require('../utils/sessionManager')
const { mapToOption } = require('../utils/optionMapper')

async function startEggProductionLogging(ctx, session) {
  const layerFlocks = session.active_flocks.filter(f => f.type === 'LAYER')

  if (layerFlocks.length === 0) {
    await ctx.reply(
      'Egg production logging is only for layer flocks.\n\n' +
      'You do not have any active layer flocks.',
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
    return
  }

  session.current_flow = 'EGG_PRODUCTION_LOGGING'
  session.current_step = 'ASK_FLOCK'
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  if (layerFlocks.length === 1) {
    const flock = layerFlocks[0]
    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'ASK_EGGS_COLLECTED'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `🥚 Egg Production — ${flock.flock_name}\n\n` +
      `How many eggs did you collect today?`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  const flockButtons = layerFlocks.map(f => [{ text: f.flock_name }])
  flockButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    '🥚 Egg Production\n\nWhich layer flock are you logging for?',
    {
      reply_markup: {
        keyboard: flockButtons,
        resize_keyboard: true
      }
    }
  )
}

async function handleEggProductionStep(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  if (currentStep === 'ASK_FLOCK') {
    const flock = session.active_flocks.find(
      f => f.flock_name === input && f.type === 'LAYER'
    )

    if (!flock) {
      await ctx.reply('Please select a layer flock from the options.')
      return
    }

    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'ASK_EGGS_COLLECTED'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `How many eggs did you collect today from ${flock.flock_name}?`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_EGGS_COLLECTED') {
    const count = parseInt(input)

    if (isNaN(count) || count < 0) {
      await ctx.reply(
        'Please enter a valid number of eggs.\n' +
        'For example: 85'
      )
      return
    }

    session.collected_data.eggs_collected = count
    session.current_step = 'ASK_BROKEN_EGGS'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Got it — ${count} eggs collected. 🥚\n\n` +
      `How many were broken or cracked?`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '0' }, { text: '1' }, { text: '2' }],
            [{ text: '3' }, { text: '4' }, { text: '5+' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_BROKEN_EGGS') {
    let broken = 0

    if (input === '5+') {
      session.current_step = 'ASK_BROKEN_EXACT'
      await saveSession(session.farmer_id, session)
      await ctx.reply(
        'How many broken eggs exactly?',
        {
          reply_markup: {
            keyboard: [[{ text: '🏠 Main Menu' }]],
            resize_keyboard: true
          }
        }
      )
      return
    }

    broken = parseInt(input)
    if (isNaN(broken) || broken < 0) {
      await ctx.reply('Please enter a valid number.')
      return
    }

    session.collected_data.broken_eggs = broken
    session.current_step = 'ASK_EGG_SIZE'
    await saveSession(session.farmer_id, session)
    await askEggSize(ctx)
    return
  }

  if (currentStep === 'ASK_BROKEN_EXACT') {
    const broken = parseInt(input)

    if (isNaN(broken) || broken < 0) {
      await ctx.reply('Please enter a valid number.')
      return
    }

    session.collected_data.broken_eggs = broken
    session.current_step = 'ASK_EGG_SIZE'
    await saveSession(session.farmer_id, session)
    await askEggSize(ctx)
    return
  }

  if (currentStep === 'ASK_EGG_SIZE') {
    const sizeMap = {
      '✅ Normal size': 'NORMAL',
      '🟡 Slightly smaller than usual': 'SMALLER_THAN_USUAL',
      '🔴 Much smaller than usual': 'MUCH_SMALLER'
    }

    let sizeValue = sizeMap[input]

    if (!sizeValue) {
      const mapped = await mapToOption(
        input,
        Object.keys(sizeMap),
        'Farmer is describing egg size compared to normal'
      )
      if (mapped) sizeValue = sizeMap[mapped]
    }

    if (!sizeValue) {
      await ctx.reply('Please select an option from the buttons.')
      return
    }

    session.collected_data.egg_size_concern = sizeValue
    session.current_step = 'ASK_EGG_WEIGHT_1'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Now let us weigh 3 eggs to track egg size over time.\n\n` +
      `Pick 3 eggs randomly and weigh them.\n\n` +
      `Enter the weight of egg 1 in grams:\n` +
      `For example: 55`,
      {
        reply_markup: {
          keyboard: [[{ text: '⏭️ Skip weighing' }, { text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_EGG_WEIGHT_1') {
    if (input === '⏭️ Skip weighing') {
      session.collected_data.egg_weight_1_g = null
      session.collected_data.egg_weight_2_g = null
      session.collected_data.egg_weight_3_g = null
      session.current_step = 'CONFIRM'
      await saveSession(session.farmer_id, session)
      await showConfirmation(ctx, session)
      return
    }

    const weight = parseFloat(input)
    if (isNaN(weight) || weight < 20 || weight > 90) {
      await ctx.reply(
        'Please enter a valid egg weight in grams between 20 and 90.\n' +
        'For example: 55'
      )
      return
    }

    session.collected_data.egg_weight_1_g = weight
    session.current_step = 'ASK_EGG_WEIGHT_2'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Egg 1: ${weight}g ✅\n\nEnter the weight of egg 2 in grams:`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_EGG_WEIGHT_2') {
    const weight = parseFloat(input)
    if (isNaN(weight) || weight < 20 || weight > 90) {
      await ctx.reply(
        'Please enter a valid egg weight in grams between 20 and 90.\n' +
        'For example: 55'
      )
      return
    }

    session.collected_data.egg_weight_2_g = weight
    session.current_step = 'ASK_EGG_WEIGHT_3'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Egg 2: ${weight}g ✅\n\nEnter the weight of egg 3 in grams:`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_EGG_WEIGHT_3') {
    const weight = parseFloat(input)
    if (isNaN(weight) || weight < 20 || weight > 90) {
      await ctx.reply(
        'Please enter a valid egg weight in grams between 20 and 90.\n' +
        'For example: 55'
      )
      return
    }

    session.collected_data.egg_weight_3_g = weight
    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)
    await showConfirmation(ctx, session)
    return
  }

  if (currentStep === 'CONFIRM') {
    if (input === '❌ No, start over') {
      await startEggProductionLogging(ctx, session)
      return
    }

    if (input !== '✅ Yes, save it') {
      await ctx.reply('Please use the buttons to confirm or start over.')
      return
    }

    await saveEggProduction(ctx, session)
    return
  }
}

async function askEggSize(ctx) {
  await ctx.reply(
    'How do the eggs look in size today?',
    {
      reply_markup: {
        keyboard: [
          [{ text: '✅ Normal size' }],
          [{ text: '🟡 Slightly smaller than usual' }],
          [{ text: '🔴 Much smaller than usual' }],
          [{ text: '🏠 Main Menu' }]
        ],
        resize_keyboard: true
      }
    }
  )
}

async function showConfirmation(ctx, session) {
  const data = session.collected_data

  const sizeLabels = {
    'NORMAL': '✅ Normal',
    'SMALLER_THAN_USUAL': '🟡 Slightly smaller',
    'MUCH_SMALLER': '🔴 Much smaller'
  }

  let weightText = 'Skipped'
  if (data.egg_weight_1_g) {
    const avg = ((data.egg_weight_1_g + data.egg_weight_2_g + data.egg_weight_3_g) / 3).toFixed(1)
    weightText = `${data.egg_weight_1_g}g, ${data.egg_weight_2_g}g, ${data.egg_weight_3_g}g (avg: ${avg}g)`
  }

  await ctx.reply(
    `Please confirm today's egg production:\n\n` +
    `🥚 Eggs collected: ${data.eggs_collected}\n` +
    `💔 Broken eggs: ${data.broken_eggs}\n` +
    `📏 Egg size: ${sizeLabels[data.egg_size_concern]}\n` +
    `⚖️ Egg weights: ${weightText}\n` +
    `🐔 Flock: ${data.flock_name}\n\n` +
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

async function saveEggProduction(ctx, session) {
  const data = session.collected_data
  const today = new Date().toISOString().split('T')[0]

  const flock = await getFlockById(data.flock_id)
  const birdAgeDays = getBirdAgeDays(flock.start_date)

  const log = await logEggProduction({
    flock_id: data.flock_id,
    date: today,
    bird_age_days: birdAgeDays,
    eggs_collected: data.eggs_collected,
    broken_eggs: data.broken_eggs,
    egg_weight_1_g: data.egg_weight_1_g,
    egg_weight_2_g: data.egg_weight_2_g,
    egg_weight_3_g: data.egg_weight_3_g,
    egg_size_concern: data.egg_size_concern
  })

  if (!log) {
    await ctx.reply('Sorry, something went wrong. Please try again.')
    return
  }

  await saveUndoEntry(session.farmer_id, {
    type: 'EGG_PRODUCTION',
    record_id: log.id,
    table: 'egg_production_logs',
    description: `${data.eggs_collected} eggs logged for ${data.flock_name}`
  })

  // Calculate lay rate
  const layRate = await getLayRate(data.flock_id, flock.current_bird_count)

  session.current_flow = null
  session.current_step = null
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  // Build performance message
  let performanceMessage = ''
  if (layRate !== null) {
    if (layRate >= 80) {
      performanceMessage = `\n\n📊 7-day lay rate: ${layRate}% ✅ Excellent production!`
    } else if (layRate >= 65) {
      performanceMessage = `\n\n📊 7-day lay rate: ${layRate}% 🟡 Good but can improve. Check feed and water access.`
    } else {
      performanceMessage = `\n\n📊 7-day lay rate: ${layRate}% ⚠️ Below average. Consider a health check.`
    }
  }

  // Egg size warning
  let sizeWarning = ''
  if (data.egg_size_concern === 'SMALLER_THAN_USUAL') {
    sizeWarning = `\n\n🟡 You flagged eggs as slightly smaller than usual. Monitor over the next few days. Check calcium and protein in feed.`
  } else if (data.egg_size_concern === 'MUCH_SMALLER') {
    sizeWarning = `\n\n🔴 Eggs are significantly smaller than usual. This may indicate nutritional deficiency, heat stress, or disease. Consider a health check.`
  }

  // Broken egg warning
  let brokenWarning = ''
  if (data.eggs_collected > 0) {
    const brokenRate = (data.broken_eggs / data.eggs_collected) * 100
    if (brokenRate > 5) {
      brokenWarning = `\n\n⚠️ ${data.broken_eggs} broken eggs today (${brokenRate.toFixed(1)}%). High breakage may indicate calcium deficiency or housing issues.`
    }
  }

  await ctx.reply(
    `✅ Egg production recorded!\n\n` +
    `🥚 Eggs collected: ${data.eggs_collected}\n` +
    `💔 Broken: ${data.broken_eggs}\n` +
    `✅ Good eggs: ${data.eggs_collected - data.broken_eggs}\n` +
    `🐔 Flock: ${data.flock_name}` +
    performanceMessage +
    sizeWarning +
    brokenWarning +
    `\n\nWhat would you like to do next?`,
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
  startEggProductionLogging,
  handleEggProductionStep
}