const { DB, tableNames } = require('../handler.js');
const TABLE = tableNames.posHistory;

class History {
  constructor({ history_id, plan_of_study, history_status, note, changed_by, date_changed }) {
    this.history_id = history_id;
    this.plan_of_study = plan_of_study;
    this.history_status = history_status;
    this.note = note ?? null;
    this.changed_by = changed_by ?? null;

    // get date object if possible
    this.date_changed = date_changed instanceof Date ? date_changed : (date_changed ? new Date(date_changed) : null);
  }

  toJSON() {
    return {
      history_id: this.history_id,
      plan_of_study: this.plan_of_study,
      history_status: this.history_status,
      note: this.note,
      changed_by: this.changed_by,
      date_changed: this.date_changed ? this.date_changed.toISOString() : null,
    };
  }
}
module.exports.History = History;

// Normalize DB.query return (array vs { result: [] })
function normalizeRows(execResult) {
  return Array.isArray(execResult) ? execResult : (execResult && execResult.result) || [];
}

/** Get one history row by id. Returns null if not found. */
module.exports.getHistoryById = async (history_id) => {
  const sql = `
    SELECT history_id, plan_of_study, history_status, note, changed_by, date_changed
    FROM ${TABLE}
    WHERE history_id = ?
    LIMIT 1
  `;
  const rows = normalizeRows(await DB.query(sql, [history_id]));
  if (rows.length) {
    console.log('getHistoryById: found', { history_id });
    return new History(rows[0]);
  }
  // else just logs not found and returns null
  console.log('getHistoryById: not found', { history_id });
  return null;
};

/**
 * list history by plan and status
 */
module.exports.listHistoryByPlanAndStatus = async (plan_of_study, history_status) => {
  const sql = `
    SELECT history_id, plan_of_study, history_status, note, changed_by, date_changed
    FROM ${TABLE}
    WHERE plan_of_study = ? AND history_status = ?
    ORDER BY date_changed DESC, history_id DESC
  `;
  const rows = normalizeRows(await DB.query(sql, [plan_of_study, history_status]));
  console.log('listHistoryByPlanAndStatus: results', {
    plan_of_study, history_status, count: rows.length
  });
  return rows.map(r => new History(r));
};

/**
 * global recent history to see what changes have been done overall
 * @param {number} limit default 50
 */
module.exports.listRecentHistory = async (limit = 50) => {
  const lim = limit;
  const sql = `
    SELECT history_id, plan_of_study, history_status, note, changed_by, date_changed
    FROM ${TABLE}
    ORDER BY date_changed DESC, history_id DESC
    LIMIT ${lim}
  `;
  const rows = normalizeRows(await DB.query(sql, []));
  console.log('listRecentHistory: results', { limit: lim, count: rows.length });
  return rows.map(r => new History(r));
};

/**
 * insert a new history entry
 * @returns {object} { success, history_id, payload }
 */
module.exports.addHistory = async ({ plan_of_study, history_status, note = null, changed_by = null }) => {
    // if no pos or hist status, since they are req
  if (!plan_of_study || !history_status) {
    throw new Error('addHistory: plan_of_study and history_status are required.');
  }

  const sql = `
    INSERT INTO ${TABLE}
      (plan_of_study, history_status, note, changed_by, date_changed)
    VALUES
      (?, ?, ?, ?, NOW())
  `;
  try {
    const res = await DB.query(sql, [plan_of_study, history_status, note, changed_by]);
    const insertId = res.insertId || (res.result && res.result.insertId);
    console.log('addHistory: added', { history_id: insertId, plan_of_study, history_status });
    return {
      success: true,
      history_id: insertId,
      payload: { plan_of_study, history_status, note, changed_by }
    };
  } catch (err) {
    // was not able to insert into db
    console.error('addHistory: error inserting', err);
    throw err;
  }
};

/** delete a history row by id. */
module.exports.deleteHistory = async (history_id) => {
  if (!history_id) throw new Error('deleteHistory: history_id is required.');
  const sql = `
    DELETE FROM ${TABLE}
    WHERE history_id = ?
    LIMIT 1
  `;
  const res = await DB.query(sql, [history_id]);
  const affected = res.affectedRows || (res.result && res.result.affectedRows) || 0;
  console.log('deleteHistory:', { history_id, affected });
  return { success: affected > 0, history_id };
};

// list all history for a given plan of study
module.exports.listHistoryByPlan = async (plan_of_study) => {
  const sql = `
    SELECT history_id, plan_of_study, history_status, note, changed_by, date_changed
    FROM ${TABLE}
    WHERE plan_of_study = ?
    ORDER BY date_changed DESC, history_id DESC
  `;
  const rows = normalizeRows(await DB.query(sql, [plan_of_study]));
  console.log('listHistoryByPlan: results', {plan_of_study, count: rows.length});
  return rows.map(r => new History(r));
};