const supabase = require('../config/database')

// Add a new stock item
async function addStockItem(data) {
  try {
    const { data: item, error } = await supabase
      .from('stock')
      .insert([{
        farmer_id: data.farmer_id,
        item_name: data.item_name,
        item_type: data.item_type,
        current_quantity: data.current_quantity || 0,
        unit: data.unit,
        unit_cost_naira: data.unit_cost_naira || 0,
        reorder_threshold: data.reorder_threshold || 0,
        last_updated: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) throw error

    return item
  } catch (err) {
    console.error('Error adding stock item:', err.message)
    return null
  }
}

// Get all stock items for a farmer
async function getStockItems(farmerId) {
  try {
    const { data, error } = await supabase
      .from('stock')
      .select('*')
      .eq('farmer_id', farmerId)
      .order('item_type', { ascending: true })

    if (error) throw error

    return data || []
  } catch (err) {
    console.error('Error getting stock items:', err.message)
    return []
  }
}

// Update stock quantity
async function updateStockQuantity(stockId, newQuantity) {
  try {
    const { data, error } = await supabase
      .from('stock')
      .update({
        current_quantity: newQuantity,
        last_updated: new Date().toISOString()
      })
      .eq('id', stockId)
      .select()
      .single()

    if (error) throw error

    return data
  } catch (err) {
    console.error('Error updating stock quantity:', err.message)
    return null
  }
}

// Log consumable usage
async function logConsumableUsage(data) {
  try {
    const { data: log, error } = await supabase
      .from('consumable_usage_logs')
      .insert([{
        stock_id: data.stock_id,
        flock_id: data.flock_id || null,
        date: data.date,
        quantity_used: data.quantity_used,
        unit: data.unit,
        cost_naira: data.cost_naira || null,
        note: data.note || null
      }])
      .select()
      .single()

    if (error) throw error

    return log
  } catch (err) {
    console.error('Error logging consumable usage:', err.message)
    return null
  }
}

// Get low stock items
async function getLowStockItems(farmerId) {
  try {
    const { data, error } = await supabase
      .from('stock')
      .select('*')
      .eq('farmer_id', farmerId)
      .filter('current_quantity', 'lte', supabase.raw('reorder_threshold'))

    if (error) throw error

    return data || []
  } catch (err) {
    console.error('Error getting low stock:', err.message)
    return []
  }
}

// Calculate days remaining for a stock item
function calculateDaysRemaining(currentQuantity, dailyUsageRate) {
  if (!dailyUsageRate || dailyUsageRate === 0) return null
  return Math.floor(currentQuantity / dailyUsageRate)
}

module.exports = {
  addStockItem,
  getStockItems,
  updateStockQuantity,
  logConsumableUsage,
  getLowStockItems,
  calculateDaysRemaining
}