const supabase = require('../config/database')

// Check if bird count reconciles with deaths and sales
async function checkBirdCountReconciliation(flockId) {
  try {
    // Get flock details
    const { data: flock, error: flockError } = await supabase
      .from('flocks')
      .select('initial_bird_count, current_bird_count, flock_name')
      .eq('id', flockId)
      .single()

    if (flockError) throw flockError

    // Total deaths
    const { data: deaths, error: deathError } = await supabase
      .from('mortality_logs')
      .select('count')
      .eq('flock_id', flockId)

    if (deathError) throw deathError

    // Total sold
    const { data: sales, error: salesError } = await supabase
      .from('bird_sales_logs')
      .select('bird_count')
      .eq('flock_id', flockId)

    if (salesError) throw salesError

    const totalDeaths = (deaths || []).reduce(
      (sum, d) => sum + parseInt(d.count || 0), 0
    )
    const totalSold = (sales || []).reduce(
      (sum, s) => sum + parseInt(s.bird_count || 0), 0
    )

    const expectedCount = flock.initial_bird_count - totalDeaths - totalSold
    const actualCount = flock.current_bird_count
    const discrepancy = expectedCount - actualCount

    return {
      flock_name: flock.flock_name,
      initial_count: flock.initial_bird_count,
      total_deaths: totalDeaths,
      total_sold: totalSold,
      expected_count: expectedCount,
      actual_count: actualCount,
      discrepancy: discrepancy,
      has_discrepancy: Math.abs(discrepancy) > 0
    }
  } catch (err) {
    console.error('Error checking reconciliation:', err.message)
    return null
  }
}

// Build discrepancy message for farmer
function buildDiscrepancyMessage(reconciliation) {
  if (!reconciliation || !reconciliation.has_discrepancy) return null

  const { flock_name, expected_count, actual_count, discrepancy } = reconciliation

  if (discrepancy > 0) {
    return (
      `⚠️ Bird Count Discrepancy — ${flock_name}\n\n` +
      `Based on your records:\n` +
      `• Deaths logged: ${reconciliation.total_deaths}\n` +
      `• Birds sold: ${reconciliation.total_sold}\n` +
      `• Expected remaining: ${expected_count}\n` +
      `• System count: ${actual_count}\n\n` +
      `${discrepancy} birds are unaccounted for.\n\n` +
      `Please verify your actual bird count.`
    )
  } else {
    return (
      `⚠️ Bird Count Discrepancy — ${flock_name}\n\n` +
      `System shows ${actual_count} birds but records suggest ${expected_count}.\n\n` +
      `${Math.abs(discrepancy)} more birds logged as dead or sold than expected.\n\n` +
      `Please verify your actual bird count.`
    )
  }
}

module.exports = {
  checkBirdCountReconciliation,
  buildDiscrepancyMessage
}