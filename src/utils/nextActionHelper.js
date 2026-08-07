const { getBirdAgeDays } = require('../services/flockService')

// Suggest next action based on context
async function suggestNextAction(session, context) {
  const { type, flock } = context

  switch (type) {
    case 'FEED_CONSUMPTION':
      // After logging feed — suggest weight check for broilers
      if (flock && flock.type === 'BROILER') {
        const ageDays = getBirdAgeDays(flock.start_date)
        if (ageDays >= 14 && ageDays % 7 === 0) {
          return {
            message: '💡 Your broilers are due for a weekly weight check today.',
            button: '⚖️ Log Weight'
          }
        }
      }
      // Suggest litter check if not logged recently
      return {
        message: '💡 Don\'t forget to check your litter condition today.',
        button: '🪹 Litter Check'
      }

    case 'MORTALITY':
      // After mortality — strongly suggest health check
      return {
        message: '💡 We recommend running a health check after bird losses.',
        button: '❤️ Health Check'
      }

    case 'FEED_PURCHASE':
      // After buying feed — suggest logging consumption
      return {
        message: '💡 Ready to log today\'s feeding?',
        button: '🌾 Log Feed'
      }

    case 'BIRD_SALE':
      // After selling birds — suggest profit summary
      return {
        message: '💡 Want to see how your profits are looking?',
        button: '📊 Profit Summary'
      }

    case 'EGG_PRODUCTION':
      // After logging eggs — suggest egg sales if production is good
      return {
        message: '💡 Ready to log any egg sales?',
        button: '💵 Log Sales'
      }

    case 'DRUG_LOG':
      // After drug — remind about withdrawal
      return {
        message: '💡 Remember to check withdrawal periods before selling birds or eggs.',
        button: '📊 Profit Summary'
      }

    case 'WEIGHT_LOG':
      // After weight — suggest FCR check
      return {
        message: '💡 Want to see your FCR and profit summary?',
        button: '📊 Profit Summary'
      }

    case 'LITTER_LOG':
      // After litter — suggest feed log
      return {
        message: '💡 Ready to log today\'s feed?',
        button: '🌾 Log Feed'
      }

    default:
      return null
  }
}

module.exports = { suggestNextAction }