const { logWeight, getBreedBenchmark } = require('../services/weightService')
const { getFlockById, getBirdAgeDays } = require('../services/flockService')
const { saveUndoEntry } = require('../utils/undoManager')
const { saveSession } = require('../utils/sessionManager')
const { getFeedSummary } = require('../services/feedService')
const { mapToNumber } = require('../utils/optionMapper')

async function startWeightLogging(ctx, session) {
  const broilerFlocks = session.active_flocks.filter(f => f.type === 'BROILER')

  if (broilerFlocks.length === 0) {
    await ctx.reply(
      'Weight logging is only for broiler flocks.\n\n' +
      'You do not have any active broiler flocks.',
      {
        reply_markup: {
          keyboard: [
            [{ text: '🌾 Log Feed' }, { text: '💀 Log Mortality' }],
            [{ text: '💵 Log Sales' }, { text: '📦 Check Stock' }],
            [{ text: '❤️ Health Check' }, { text: '💰 Profit Summary' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  session.current_flow = 'WEIGHT_LOGGING'
  session.current_step = 'ASK_FLOCK'
  session.collected_data = { weights: [] }
  await saveSession(session.farmer_id, session)

  if (broilerFlocks.length === 1) {
    const flock = broilerFlocks[0]
    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'ASK_WEIGHT_1'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `⚖️ Weight Log — ${flock.flock_name}\n\n` +
      `Pick 5 birds randomly from different parts of the pen and weigh them one by one.\n\n` +
      `Enter the weight of bird 1 in kg:\n` +
      `For example: 1.85`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  const flockButtons = broilerFlocks.map(f => [{ text: f.flock_name }])
  flockButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    '⚖️ Weight Log\n\nWhich broiler flock are you weighing?',
    {
      reply_markup: {
        keyboard: flockButtons,
        resize_keyboard: true
      }
    }
  )
}

async function handleWeightStep(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  if (currentStep === 'ASK_FLOCK') {
    const flock = session.active_flocks.find(
      f => f.flock_name === input && f.type === 'BROILER'
    )

    if (!flock) {
      await ctx.reply('Please select a broiler flock from the options.')
      return
    }

    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'ASK_WEIGHT_1'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Pick 5 birds randomly and weigh them one by one.\n\n` +
      `Enter the weight of bird 1 in kg:\n` +
      `For example: 1.85`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  const weightSteps = ['ASK_WEIGHT_1', 'ASK_WEIGHT_2', 'ASK_WEIGHT_3', 'ASK_WEIGHT_4', 'ASK_WEIGHT_5']
  const weightIndex = weightSteps.indexOf(currentStep)

  if (weightIndex !== -1) {
    let weight = parseFloat(input)

    if (isNaN(weight)) {
      const mapped = await mapToNumber(
        input,
        'Farmer is entering bird weight in kg'
      )
      if (mapped !== null) weight = mapped
    }

    if (isNaN(weight) || weight <= 0 || weight > 8) {
      await ctx.reply(
        `That doesn't look right for a broiler weight.\n\n` +
        `Please enter a weight in kg between 0.1 and 8.\n` +
        `For example: 1.85`
      )
      return
    }

    session.collected_data.weights.push(weight)

    if (weightIndex < 4) {
      session.current_step = weightSteps[weightIndex + 1]
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        `Bird ${weightIndex + 1}: ${weight}kg ✅\n\n` +
        `Enter the weight of bird ${weightIndex + 2} in kg:`
      )
    } else {
      session.current_step = 'CONFIRM'
      await saveSession(session.farmer_id, session)

      const weights = session.collected_data.weights
      const average = (weights.reduce((sum, w) => sum + w, 0) / 5).toFixed(3)

      await ctx.reply(
        `All 5 weights recorded!\n\n` +
        `Bird 1: ${weights[0]}kg\n` +
        `Bird 2: ${weights[1]}kg\n` +
        `Bird 3: ${weights[2]}kg\n` +
        `Bird 4: ${weights[3]}kg\n` +
        `Bird 5: ${weights[4]}kg\n\n` +
        `📊 Average weight: ${average}kg\n` +
        `🐔 Flock: ${session.collected_data.flock_name}\n\n` +
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
    return
  }

  if (currentStep === 'CONFIRM') {
    if (input === '❌ No, start over') {
      session.collected_data.weights = []
      session.current_step = 'ASK_WEIGHT_1'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        `No problem — let us start again.\n\n` +
        `Enter the weight of bird 1 in kg:`,
        {
          reply_markup: {
            keyboard: [[{ text: '🏠 Main Menu' }]],
            resize_keyboard: true
          }
        }
      )
      return
    }

    if (input !== '✅ Yes, save it') {
      await ctx.reply('Please use the buttons to confirm or start over.')
      return
    }

    await saveWeight(ctx, session)
    return
  }
}

async function saveWeight(ctx, session) {
  const data = session.collected_data
  const today = new Date().toISOString().split('T')[0]

  const flock = await getFlockById(data.flock_id)
  const birdAgeDays = getBirdAgeDays(flock.start_date)

  const weight = await logWeight({
    flock_id: data.flock_id,
    date: today,
    bird_age_days: birdAgeDays,
    weight_1_kg: data.weights[0],
    weight_2_kg: data.weights[1],
    weight_3_kg: data.weights[2],
    weight_4_kg: data.weights[3],
    weight_5_kg: data.weights[4]
  })

  if (!weight) {
    await ctx.reply('Sorry, something went wrong. Please try again.')
    return
  }

  await saveUndoEntry(session.farmer_id, {
    type: 'WEIGHT_LOG',
    record_id: weight.id,
    table: 'weight_logs',
    description: `Weight log for ${data.flock_name} — average ${weight.average_weight_kg}kg`
  })

  const benchmark = await getBreedBenchmark(flock.breed, birdAgeDays)

  session.current_flow = null
  session.current_step = null
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  let benchmarkMessage = ''
  if (benchmark && benchmark.expected_weight_kg) {
    const avg = parseFloat(weight.average_weight_kg)
    const expected = parseFloat(benchmark.expected_weight_kg)
    const diff = avg - expected
    const percentDiff = ((diff / expected) * 100).toFixed(1)

    if (diff >= 0) {
      benchmarkMessage =
        `\n\n📊 Benchmark for ${birdAgeDays} day old birds: ${expected}kg\n` +
        `✅ Your flock is ${diff.toFixed(2)}kg above target (${percentDiff}% ahead)\n\n` +
        `Keep it up! Maintain current feeding schedule.`
    } else if (Math.abs(percentDiff) <= 10) {
      benchmarkMessage =
        `\n\n📊 Benchmark for ${birdAgeDays} day old birds: ${expected}kg\n` +
        `🟡 Your flock is ${Math.abs(diff).toFixed(2)}kg below target (${Math.abs(percentDiff)}% behind)\n\n` +
        `Slightly below target. Check:\n` +
        `• Are birds eating well?\n` +
        `• Is feed type correct for this age?\n` +
        `• Any signs of illness?`
    } else {
      benchmarkMessage =
        `\n\n📊 Benchmark for ${birdAgeDays} day old birds: ${expected}kg\n` +
        `⚠️ Your flock is ${Math.abs(diff).toFixed(2)}kg below target (${Math.abs(percentDiff)}% behind)\n\n` +
        `Significantly below target. Urgent checks needed:\n` +
        `• Review feed quality and quantity\n` +
        `• Check for disease symptoms\n` +
        `• Consider a health check\n` +
        `• Ensure clean water is always available`
    }
  } else {
    benchmarkMessage =
      `\n\n💡 Tip: Add your flock breed during setup to get weight benchmarks and performance comparisons.`
  }

  // Check feed logging consistency
  const feedSummary = await getFeedSummary(data.flock_id)
  const noFeedLogged = !feedSummary || feedSummary.total_consumed_kg === 0

  let feedWarning = ''
  if (noFeedLogged) {
    feedWarning =
      `\n\n💡 Note: No feed consumption has been logged for this flock yet. ` +
      `For accurate FCR calculations log daily feed consumption.`
  } else {
    // Check how many days have been logged vs flock age
    const flock = await getFlockById(data.flock_id)
    const ageDays = getBirdAgeDays(flock.start_date)
    const expectedLogs = ageDays
    const { data: consumptionLogs } = await require('../config/database')
      .from('feed_consumption_logs')
      .select('date')
      .eq('flock_id', data.flock_id)
    
    const actualLogs = consumptionLogs ? consumptionLogs.length : 0
    const coveragePercent = Math.round((actualLogs / expectedLogs) * 100)

    if (coveragePercent < 50) {
      feedWarning =
        `\n\n⚠️ Feed logging is sparse — only ${actualLogs} out of ~${expectedLogs} days logged (${coveragePercent}% coverage). ` +
        `FCR calculations may not be accurate. Try to log feed consumption daily.`
    } else if (coveragePercent < 80) {
      feedWarning =
        `\n\n💡 Feed logging coverage: ${coveragePercent}%. ` +
        `For best FCR accuracy, aim to log feed consumption every day.`
    }
  }

  await ctx.reply(
    `✅ Weight recorded!\n\n` +
    `🐔 Flock: ${data.flock_name}\n` +
    `📅 Age: ${birdAgeDays} days\n` +
    `⚖️ Average weight: ${weight.average_weight_kg}kg` +
    benchmarkMessage +
    feedWarning +
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
  startWeightLogging,
  handleWeightStep
}