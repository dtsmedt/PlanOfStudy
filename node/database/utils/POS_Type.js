const { DB, tableNames } = require('../handler.js');

class POS_Type {
  constructor({ pos_type_id, type }) {
    this.pos_type_id = pos_type_id;
    this.type = type;
  }
  toJSON() {
    return {
      pos_type_id: this.pos_type_id,
      type: this.type,
    };
  }
}

module.exports.POS_Type = POS_Type;

// Normalize DB.query return shape
function normalizeRows(execResult) {
  return Array.isArray(execResult)
    ? execResult
    : (execResult && execResult.result) || [];
}

/** List all POS terms. */
module.exports.listPOSTypes = async() => {
  const sql = `
    SELECT *
    FROM ${tableNames.posType}
    ORDER BY pos_type_id ASC
  `;
  const rows = normalizeRows(await DB.query(sql, []));
  console.log('listPOSTypes: results', { count: rows.length });
  return rows.map(r => new POS_Type(r));
}