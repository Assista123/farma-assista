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
      'Please enter the correct WhatsApp phone number registered to your previous account:\n\n' +
      '📱 *Format:* 11 digits starting with 0 (e.g., 08012345678)',
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

    // Search Supabase for a farmer matching this phone number
    const { data: farmer, error } = await supabase
      .from('farmers')
      .select('*')
      .eq('phone_number', input)
      .maybeSingle()

    if (error) {
      console.error('Database recovery lookup error:', error.message)
      await ctx.reply(
        'Sorry, something went wrong checking your account. Please try again or tap Main Menu.',
        {
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

    if (!farmer) {
      await ctx.reply(
        '❌ *Account Not Found*\n\n' +
        `We could not find any farm registered with the number **${input}**.\n\n` +
        'Please check the number or start a new registration.',
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

    // Update their record in Supabase so their new Telegram ID replaces their old phone_number key
    const { error: updateErr } = await supabase
      .from('farmers')
      .update({ phone_number: farmerId })
      .eq('id', farmer.id)

    if (updateErr) {
      console.error('Database update error during recovery:', updateErr.message)
      await ctx.reply(
        'Sorry, something went wrong linking your account to this Telegram profile. Please try again.',
        {
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


// All the ways the same Nigerian number can be stored: 08012345678, 2348012345678, +2348012345678
function phoneVariants(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return []
  let local = null
  if (digits.startsWith('234') && digits.length === 13) local = '0' + digits.slice(3)
  else if (digits.startsWith('0') && digits.length === 11) local = digits
  if (!local) return [digits]
  const intl = '234' + local.slice(1)
  return [local, intl, '+' + intl]
}

// WhatsApp version of recovery. Meta verifies the sender's number, so we look the farm
// up by that number instead of asking the farmer to type one (which anyone could claim).
async function recoverFarmOnWhatsApp(ctx, session, senderPhone) {
  const farmerId = session.farmer_id
  const variants = phoneVariants(senderPhone)

  const backToName = async () => {
    session.current_flow = 'ONBOARDING'
    session.current_step = 'ASK_NAME'
    session.collected_data = {}
    await saveSession(farmerId, session)
  }

  const { data: rows, error } = await supabase
    .from('farmers')
    .select('*')
    .in('phone_number', variants)
    .limit(1)

  if (error) {
    console.error('WhatsApp recovery lookup error:', error.message)
    await ctx.reply('Sorry, something went wrong checking your account. Please tap Recover Existing Farm again in a moment.')
    return
  }

  let farmer = rows && rows[0]

  if (!farmer) {
    // contact_phone may not exist as a column on every database, so errors are ignored here
    const { data: byContact, error: contactErr } = await supabase
      .from('farmers')
      .select('*')
      .in('contact_phone', variants)
      .limit(1)
    if (!contactErr && byContact && byContact[0]) farmer = byContact[0]
  }

  if (!farmer) {
    await backToName()
    await ctx.reply(
      '❌ *No farm found*\n\n' +
      `We could not find a farm registered with this WhatsApp number (${variants[0] || senderPhone}).\n\n` +
      'If you registered with a different number, please message us from that number.\n\n' +
      'To register a new farm instead, just type your name.'
    )
    return
  }

  // Re-key the farmer to this WhatsApp number (same approach as the Telegram recovery)
  const { error: updateErr } = await supabase
    .from('farmers')
    .update({ phone_number: farmerId })
    .eq('id', farmer.id)

  if (updateErr) {
    console.error('WhatsApp recovery update error:', updateErr.message)
    await ctx.reply('Sorry, something went wrong linking your farm to this number. Please try again.')
    return
  }

  const flocks = await getActiveFlocks(farmer.id)
  session.is_registered = true
  session.farmer_name = farmer.name
  session.farm_name = farmer.farm_name
  session.farmer_db_id = farmer.id
  session.active_flocks = flocks.map(f => ({ id: f.id, flock_name: f.flock_name, type: f.type }))
  session.current_flow = null
  session.current_step = null
  session.collected_data = {}
  await saveSession(farmerId, session)

  await ctx.reply(
    `✅ Account Recovered Successfully!\n\n` +
    `Welcome back, ${farmer.name}! Your farm *${farmer.farm_name}* is now linked to this WhatsApp number. 🎉`,
    mainMenuKeyboard
  )
}

module.exports = {
  handleAccountRecoveryStep,
  recoverFarmOnWhatsApp,
  phoneVariants
}