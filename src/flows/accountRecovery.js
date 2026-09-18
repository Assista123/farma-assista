const supabase = require('../config/database')
const { saveSession } = require('../utils/sessionManager')
const { getActiveFlocks } = require('../services/flockService')
const { startOnboarding } = require('./onboarding')

const mainMenuKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '📋 Daily Logs' }, { text: '💵 Sales & Finance' }],
      [{ text: '📦 Farm Management' }, { text: '🏠 Main Menu' }]
    ],
    resize_keyboard: true
  }
}

async function handleAccountRecoveryStep(ctx, session) {
  const input = ctx.message.text.trim()
  const farmerId = session.farmer_id

  // Global Escape Interceptor
  if (input === '🏠 Main Menu' || input.toLowerCase() === 'cancel' || input.toLowerCase() === 'start over' || input === '✨ Start New Registration') {
    session.current_flow = null
    session.current_step = null
    session.collected_data = {}
    await saveSession(farmerId, session)
    await startOnboarding(ctx, session)
    return
  }

  if (input === '🔄 Try Again') {
    session.current_step = 'ASK_RECOVERY_PHONE'
    await saveSession(farmerId, session)
    await ctx.reply(
      '🔄 *Account Recovery*\n\n' +
      'Please enter the correct WhatsApp phone number registered to your previous account:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (session.current_step === 'ASK_RECOVERY_PHONE') {
    // Strict Nigerian phone validation regex
    const phoneRegex = /^(\+?234|0)[789]\d{9}$/

    if (!phoneRegex.test(input)) {
      await ctx.reply(
        '⚠️ That does not look like a valid phone number format.\n\n' +
        'Please enter a valid 11-digit WhatsApp phone number (e.g., 08012345678), or tap Main Menu to exit.',
        {
          reply_markup: {
            keyboard: [[{ text: '🏠 Main Menu' }]],
            resize_keyboard: true
          }
        }
      )
      return
    }

    // Search Supabase for a farmer with this contact_phone
    const { data: farmer, error } = await supabase
      .from('farmers')
      .select('*')
      .eq('contact_phone', input)
      .single()

    if (error || !farmer) {
      await ctx.reply(
        '❌ *No Farm Found*\n\n' +
        `We couldn't find an existing farm registered with **${input}**.\n\n` +
        'What would you like to do?',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [
              [{ text: '🔄 Try Again' }, { text: '✨ Start New Registration' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      )
      return
    }

    // Update their record in Supabase so their new Telegram ID becomes their new phone_number key
    const { error: updateErr } = await supabase
      .from('farmers')
      .update({ phone_number: farmerId })
      .eq('id', farmer.id)

    if (updateErr) {
      await ctx.reply(
        'Sorry, something went wrong linking your account. Please try again or tap Main Menu.',
        {
          reply_markup: {
            keyboard: [[{ text: '🏠 Main Menu' }]],
            resize_keyboard: true
          }
        }
      )
      return
    }

    // Fetch active flocks and initialize session
    const flocks = await getActiveFlocks(farmer.id)
    session.is_registered = true
    session.farmer_name = farmer.name
    session.farm_name = farmer.farm_name
    session.farmer_db_id = farmer.id
    session.active_flocks = flocks.map(f => ({
      id: f.id,
      flock_name: f.flock_name,
      type: f.type
    }))
    session.current_flow = null
    session.current_step = null
    session.collected_data = {}
    await saveSession(farmerId, session)

    await ctx.reply(
      `✅ Account Recovered Successfully!\n\n` +
      `Welcome back, ${farmer.name}! Your farm **${farmer.farm_name}** is now linked to this Telegram account. 🎉`,
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard }
    )
  }
}

module.exports = {
  handleAccountRecoveryStep
}