const {
  calculateBroilerFCR,
  calculateLayerFCR,
  calculateProfitability,
  getMortalityReport
} = require('../services/recordsService')
const { getFlockById, getBirdAgeDays } = require('../services/flockService')
const { saveSession } = require('../utils/sessionManager')
const { mainMenuKeyboard } = require('../utils/keyboards')
const { askRecountPrompt } = require('../utils/recountHelper')

async function startProfitSummary(ctx, session) {
  if (session.active_flocks.length === 0) {
    await ctx.reply('You have no active flocks to report on.', mainMenuKeyboard)
    return
  }

  session.current_flow = 'PROFIT_SUMMARY'
  session.current_step = 'ASK_FLOCK'
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  if (session.active_flocks.length === 1) {
    await showProfitReport(ctx, session, session.active_flocks[0].id)
    return
  }

  const flockButtons = session.active_flocks.map(f => [{ text: f.flock_name }])
  flockButtons.push([{ text: '📊 All Flocks Combined' }])
  flockButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    '📊 Profit Summary\n\nWhich flock would you like to see?',
    {
      reply_markup: {
        keyboard: flockButtons,
        resize_keyboard: true
      }
    }
  )
}

async function handleReportsStep(ctx, session) {
  const input = ctx.message.text.trim()

  if (session.current_flow === 'PROFIT_SUMMARY') {
    if (input === '📊 All Flocks Combined') {
      await showAllFlocksSummary(ctx, session)
      return
    }

    const flock = session.active_flocks.find(f => f.flock_name === input)
    if (!flock) {
      await ctx.reply('Please select a flock from the options.')
      return
    }

    await showProfitReport(ctx, session, flock.id)
    return
  }
}

async function showProfitReport(ctx, session, flockId) {
  const flock = await getFlockById(flockId)
  const profitability = await calculateProfitability(flockId, session.farmer_db_id)
  const mortality = await getMortalityReport(flockId)
  const birdAgeDays = getBirdAgeDays(flock.start_date)

  let fcrMessage = ''
  if (flock.type === 'BROILER') {
    const fcr = await calculateBroilerFCR(flockId, flock.start_date)
    if (fcr) {
      fcrMessage =
        `\n📈 FCR: ${fcr.fcr} ` +
        `(${fcr.fcr <= 2.0 ? '✅ Good' : fcr.fcr <= 2.3 ? '🟡 Fair' : '⚠️ Poor'})\n` +
        `⚖️ Avg weight: ${fcr.current_avg_weight_kg}kg`
    }
  } else {
    const fcr = await calculateLayerFCR(flockId)
    if (fcr) {
      fcrMessage =
        `\n📈 FCR: ${fcr.fcr} kg feed per 10 eggs\n` +
        `🥚 Total eggs produced: ${fcr.total_eggs.toLocaleString()}`
    }
  }

  // Clear flow
  session.current_flow = null
  session.current_step = null
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  if (!profitability) {
    await ctx.reply(
      `📊 ${flock.flock_name} — Summary\n\n` +
      `📅 Age: ${birdAgeDays} days\n` +
      `🐔 Current birds: ${flock.current_bird_count}\n\n` +
      `No financial data recorded yet.\n` +
      `Start logging sales and expenses to see your profit summary.`,
      mainMenuKeyboard
    )
    return
  }

  const profitLabel = profitability.is_profit ? '✅ Profit' : '❌ Loss'
  const mortalityRate = flock.initial_bird_count > 0
    ? ((mortality.total_deaths / flock.initial_bird_count) * 100).toFixed(1)
    : 0

  await ctx.reply(
    `📊 ${flock.flock_name} — Profit Summary\n\n` +
    `📅 Age: ${birdAgeDays} days\n` +
    `🐔 Started: ${flock.initial_bird_count} birds\n` +
    `🐔 Remaining: ${flock.current_bird_count} birds\n` +
    `💀 Deaths: ${mortality.total_deaths} (${mortalityRate}%)` +
    fcrMessage +
    `\n\n💰 Revenue:\n` +
    `   Bird sales: ₦${profitability.revenue.bird_sales.toLocaleString()}\n` +
    `   Egg sales: ₦${profitability.revenue.egg_sales.toLocaleString()}\n` +
    `   Total: ₦${profitability.revenue.total.toLocaleString()}\n\n` +
    `📉 Expenses:\n` +
    `   Feed: ₦${profitability.expenses.feed.toLocaleString()}\n` +
    `   Drugs: ₦${profitability.expenses.drugs.toLocaleString()}\n` +
    `   Other: ₦${(profitability.expenses.direct + profitability.expenses.consumables + profitability.expenses.allocated_farm).toLocaleString()}\n` +
    `   Total: ₦${profitability.expenses.total.toLocaleString()}\n\n` +
    `${profitLabel}: ₦${Math.abs(profitability.profit_loss).toLocaleString()}`
  )

  // Ask recount prompt after report
  await askRecountPrompt(
    ctx,
    session,
    flockId,
    flock.flock_name,
    flock.current_bird_count
  )
}

async function showAllFlocksSummary(ctx, session) {
  let totalRevenue = 0
  let totalExpenses = 0
  let totalDeaths = 0
  let message = '📊 All Flocks — Combined Summary\n\n'

  for (const flock of session.active_flocks) {
    const profitability = await calculateProfitability(
      flock.id, session.farmer_db_id
    )
    const mortality = await getMortalityReport(flock.id)

    if (profitability) {
      totalRevenue += profitability.revenue.total
      totalExpenses += profitability.expenses.total
    }
    totalDeaths += mortality ? mortality.total_deaths : 0

    const profit = profitability ? profitability.profit_loss : 0
    const profitLabel = profit >= 0 ? '✅' : '❌'

    message +=
      `🐔 ${flock.flock_name}\n` +
      `   Revenue: ₦${profitability ? profitability.revenue.total.toLocaleString() : '0'}\n` +
      `   Expenses: ₦${profitability ? profitability.expenses.total.toLocaleString() : '0'}\n` +
      `   ${profitLabel} ₦${Math.abs(profit).toLocaleString()}\n\n`
  }

  const totalProfit = totalRevenue - totalExpenses
  const profitLabel = totalProfit >= 0 ? '✅ Total Profit' : '❌ Total Loss'

  message +=
    `─────────────────\n` +
    `💰 Total Revenue: ₦${totalRevenue.toLocaleString()}\n` +
    `📉 Total Expenses: ₦${totalExpenses.toLocaleString()}\n` +
    `${profitLabel}: ₦${Math.abs(totalProfit).toLocaleString()}\n` +
    `💀 Total Deaths: ${totalDeaths}`

  session.current_flow = null
  session.current_step = null
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  await ctx.reply(message, mainMenuKeyboard)
}

module.exports = {
  startProfitSummary,
  handleReportsStep
}