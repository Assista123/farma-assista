const { getBirdAgeDays } = require('../services/flockService')

async function suggestNextAction(session, { type, flock }) {
  switch (type) {
    case 'FEED_CONSUMPTION': {
      if (flock && flock.type === 'BROILER' && flock.start_date) {
        const ageDays = getBirdAgeDays(flock.start_date)
        if (ageDays >= 14 && ageDays % 7 === 0) {
          return `\n\n💡 Your broilers are due for a weekly weight check today.`
        }
      }
      return `\n\n💡 Don't forget to check your litter condition today.`
    }

    case 'FEED_PURCHASE':
      return `\n\n💡 Ready to log today's feeding?`

    case 'MORTALITY':
      return `\n\n💡 We recommend running a health check after bird losses.`

    case 'BIRD_SALE':
      return `\n\n💡 Want to see how your profits are looking? Tap 📊 Profit Summary.`

    case 'EGG_SALE':
      return `\n\n💡 Don't forget to log today's egg production if you haven't yet.`

    case 'EGG_PRODUCTION':
      return `\n\n💡 Ready to log any egg sales? Tap 💵 Log Sales.`

    case 'DRUG_LOG':
      return `\n\n💡 Remember to check withdrawal periods before selling birds or eggs.`

    case 'WEIGHT_LOG':
      return `\n\n💡 Want to see your FCR and profit summary? Tap 📊 Profit Summary.`

    case 'LITTER_LOG':
      return `\n\n💡 Ready to log today's feed? Tap 🌾 Log Feed.`

    case 'EXPENSE':
      return `\n\n💡 Keep your records complete — log today's feed if you haven't yet.`

    default:
      return null
  }
}

module.exports = { suggestNextAction }