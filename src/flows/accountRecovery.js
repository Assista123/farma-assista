// Inside a recovery handler (e.g. src/flows/accountRecovery.js)
async function handleAccountRecoveryStep(ctx, session) {
  const input = ctx.message.text.trim()
  const farmerId = session.farmer_id

  if (session.current_step === 'ASK_RECOVERY_PHONE') {
    if (input.length < 10) {
      await ctx.reply('Please enter a valid WhatsApp phone number.')
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
        '❌ No farm found with that WhatsApp number.\n\n' +
        'Please check the number and try again, or type "cancel" to start fresh onboarding.',
        { reply_markup: { keyboard: [[{ text: '🏠 Main Menu' }]], resize_keyboard: true } }
      )
      return
    }

    // Update their record in Supabase so their new Telegram ID becomes their new phone_number key!
    const { error: updateErr } = await supabase
      .from('farmers')
      .update({ phone_number: farmerId })
      .eq('id', farmer.id)

    if (updateErr) {
      await ctx.reply('Sorry, something went wrong linking your account. Please try again.')
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