const { DB, tableNames } = require('../handler.js');

class POS_Status {
  constructor({ status_id, status }) {
    this.status_id = status_id;
    this.status = status;
  }

  toJSON() {
    return {status_id: this.status_id, status: this.status};
  }
}
module.exports.POS_Status = POS_Status;

// Normalize DB.query return shape
function normalizeRows(execResult) {
  return Array.isArray(execResult)
    ? execResult
    : (execResult && execResult.result) || [];
}

/** Get all POS Status. */
module.exports.getAllPOSStatus = async () => {
  const sql = `
    SELECT status_id, status
    FROM ${tableNames.posStatus}
    ORDER BY status_id ASC
  `;
  const rows = normalizeRows(await DB.query(sql, []));
  console.log('getAllPOSStatus: results', { count: rows.length });
  return rows.map((r) => new POS_Status(r));
};

/** Get one status by status_id. */
module.exports.getPOSStatusByStatusId = async (statusid) => {
  const rec = await DB.selectOneWhere(tableNames.posStatus, 'status_id = ?', [statusid]);
  if (rec) {
    console.log('getPOSStatusByStatusId: found', { statusid });
    return new POS_Status(rec);
  }
  console.log('getPOSStatusByStatusId: not found', { statusid });
  return null;
};

/** Add a new status to POS_Status. */
module.exports.addPOSStatus = async (statusid, status) => {
  if (!statusid || !status) {
    throw new Error('addPOSStatus: status_id, and status are required.');
  }

  const sql = `
    INSERT INTO ${tableNames.posStatus} (status_id, status)
    VALUES (?, ?)
  `;

  try {
    await DB.query(sql, [statusid, status]);
    console.log('addPOSStudent: added', { statusid, status});
    return { success: true, statusid, stats };
  } catch (err) {
    console.error('addPOSStatus: error inserting', err);
    throw err;
  }
};