const redis = require('../config/redis')

// 5 minutes in seconds
const UNDO_EXPIRY = 60 * 5

// Save last entry for potential undo
async function saveUndoEntry(farmerId, entryData) {
  try {
    await redis.set(
      `undo:${farmerId}`,
      JSON.stringify(entryData),
      { ex: UNDO_EXPIRY }
    )
    return true
  } catch (err) {
    console.error('Error saving undo entry:', err.message)
    return false
  }
}

// Get last entry for undo
async function getUndoEntry(farmerId) {
  try {
    const entry = await redis.get(`undo:${farmerId}`)
    if (entry) {
      return typeof entry === 'string' ? JSON.parse(entry) : entry
    }
    return null
  } catch (err) {
    console.error('Error getting undo entry:', err.message)
    return null
  }
}

// Clear undo entry after it is used
async function clearUndoEntry(farmerId) {
  try {
    await redis.del(`undo:${farmerId}`)
    return true
  } catch (err) {
    console.error('Error clearing undo entry:', err.message)
    return false
  }
}

module.exports = {
  saveUndoEntry,
  getUndoEntry,
  clearUndoEntry
}