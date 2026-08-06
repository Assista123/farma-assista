const {
  getUpcomingVaccinations,
  markAdministered,
  markSkipped
} = require('../services/vaccinationService')
const { getFlockById } = require('../services/flockService')
const { saveSession } = require('../utils/sessionManager')
const { mainMenuKeyboard } = require('../utils/keyboards')

async function showVaccinationSchedule(ctx, session) {
  if (session.active_flocks.length === 0) {
    await ctx.reply(
      'You have no active flocks.',
      mainMenuKeyboard
    )
    return
  }

  session.current_flow = 'VACCINATION'
  session.current_step = 'ASK_FLOCK'
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  if (session.active_flocks.length === 1) {
    const flock = session.active_flocks[0]
    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'SHOW_SCHEDULE'
    await saveSession(session.farmer_id, session)
    await displaySchedule(ctx, session, flock.id)
    return
  }

  const flockButtons = session.active_flocks.map(f => [{ text: f.flock_name }])
  flockButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    '💉 Vaccination Schedule\n\nWhich flock?',
    {
      reply_markup: {
        keyboard: flockButtons,
        resize_keyboard: true
      }
    }
  )
}

async function handleVaccinationStep(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  if (currentStep === 'ASK_FLOCK') {
    const flock = session.active_flocks.find(f => f.flock_name === input)

    if (!flock) {
      await ctx.reply('Please select a flock from the options.')
      return
    }

    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'SHOW_SCHEDULE'
    await saveSession(session.farmer_id, session)
    await displaySchedule(ctx, session, flock.id)
    return
  }

  if (currentStep === 'SHOW_SCHEDULE') {
    if (input === '✅ Mark one as done') {
      session.current_step = 'MARK_ADMINISTERED'
      await saveSession(session.farmer_id, session)
      await showVaccinationOptions(ctx, session, 'administered')
      return
    }

    if (input === '⏭️ Skip a vaccination') {
      session.current_step = 'MARK_SKIPPED'
      await saveSession(session.farmer_id, session)
      await showVaccinationOptions(ctx, session, 'skipped')
      return
    }

    await ctx.reply('Please use the buttons.')
    return
  }

  if (currentStep === 'MARK_ADMINISTERED') {
    const vacc = session.collected_data.upcoming_vaccinations?.find(
      v => v.vaccination_schedules?.vaccine_name === input
    )

    if (!vacc) {
      await ctx.reply('Please select a vaccination from the options.')
      return
    }

    await markAdministered(vacc.id)

    session.current_flow = null
    session.current_step = null
    session.collected_data = {}
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `✅ ${vacc.vaccination_schedules.vaccine_name} marked as done!\n\n` +
      `Great job keeping your flock protected. 💪`,
      mainMenuKeyboard
    )
    return
  }

  if (currentStep === 'MARK_SKIPPED') {
    const vacc = session.collected_data.upcoming_vaccinations?.find(
      v => v.vaccination_schedules?.vaccine_name === input
    )

    if (!vacc) {
      await ctx.reply('Please select a vaccination from the options.')
      return
    }

    session.collected_data.selected_vacc_id = vacc.id
    session.collected_data.selected_vacc_name = vacc.vaccination_schedules.vaccine_name
    session.current_step = 'ASK_SKIP_REASON'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Why are you skipping ${vacc.vaccination_schedules.vaccine_name}?\n\n` +
      `Or tap Skip reason if you prefer not to say.`,
      {
        reply_markup: {
          keyboard: [
            [{ text: 'Vaccine not available' }],
            [{ text: 'Birds are sick — will vaccinate later' }],
            [{ text: 'Cost — will do when possible' }],
            [{ text: 'Skip reason' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_SKIP_REASON') {
    const reason = input === 'Skip reason' ? null : input

    await markSkipped(session.collected_data.selected_vacc_id, reason)

    const vaccName = session.collected_data.selected_vacc_name
    const isImportant = vaccName?.includes('Newcastle') ||
      vaccName?.includes('Gumboro')

    session.current_flow = null
    session.current_step = null
    session.collected_data = {}
    await saveSession(session.farmer_id, session)

    let warning = ''
    if (isImportant) {
      warning =
        `\n\n⚠️ ${vaccName} is a critical vaccine. ` +
        `Skipping it puts your flock at higher risk of disease. ` +
        `Please vaccinate as soon as possible.`
    }

    await ctx.reply(
      `Noted — ${vaccName} marked as skipped.` +
      warning,
      mainMenuKeyboard
    )
    return
  }
}

async function displaySchedule(ctx, session, flockId) {
  const upcoming = await getUpcomingVaccinations(flockId)

  if (upcoming.length === 0) {
    session.current_flow = null
    session.current_step = null
    session.collected_data = {}
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `💉 ${session.collected_data.flock_name || 'Your flock'} — Vaccination Schedule\n\n` +
      `✅ No upcoming vaccinations due.\n\n` +
      `Your flock is up to date!`,
      mainMenuKeyboard
    )
    return
  }

  session.collected_data.upcoming_vaccinations = upcoming

  let message = `💉 Upcoming Vaccinations\n\n`

  for (const vacc of upcoming) {
    const schedule = vacc.vaccination_schedules
    const daysUntil = Math.ceil(
      (new Date(vacc.scheduled_date) - new Date()) / (1000 * 60 * 60 * 24)
    )

    const urgency = daysUntil < 0
      ? '🔴 OVERDUE'
      : daysUntil === 0
        ? '🔴 DUE TODAY'
        : daysUntil <= 2
          ? '🟡 Due soon'
          : '📅 Upcoming'

    message +=
      `${urgency}\n` +
      `💉 ${schedule.vaccine_name}\n` +
      `📅 Due: ${vacc.scheduled_date}\n` +
      `💊 How: ${schedule.administration_method.replace('_', ' ')}\n` +
      `⭐ ${schedule.importance}\n\n`
  }

  await saveSession(session.farmer_id, session)

  await ctx.reply(message, {
    reply_markup: {
      keyboard: [
        [{ text: '✅ Mark one as done' }, { text: '⏭️ Skip a vaccination' }],
        [{ text: '🏠 Main Menu' }]
      ],
      resize_keyboard: true
    }
  })
}

async function showVaccinationOptions(ctx, session, action) {
  const upcoming = session.collected_data.upcoming_vaccinations || []
  const vaccButtons = upcoming.map(
    v => [{ text: v.vaccination_schedules?.vaccine_name || 'Unknown' }]
  )
  vaccButtons.push([{ text: '🏠 Main Menu' }])

  const prompt = action === 'administered'
    ? 'Which vaccination did you administer?'
    : 'Which vaccination are you skipping?'

  await ctx.reply(prompt, {
    reply_markup: {
      keyboard: vaccButtons,
      resize_keyboard: true
    }
  })
}

module.exports = {
  showVaccinationSchedule,
  handleVaccinationStep
}