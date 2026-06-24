const supabase = require('../config/database')

// Delete a record by table and ID
async function deleteRecord(table, recordId) {
  try {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', recordId)

    if (error) throw error

    return true
  } catch (err) {
    console.error('Error deleting record:', err.message)
    return false
  }
}

module.exports = { deleteRecord }