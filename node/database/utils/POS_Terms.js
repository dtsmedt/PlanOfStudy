const { DB, tableNames } = require('../handler.js');

class POS_Terms {
  constructor({ term_id, term }) {
    this.term_id = term_id;
    this.term = term;
  }
  toJSON() {
    return { term_id: this.term_id, term: this.term };
  }
}
module.exports.POS_Terms = POS_Terms;

// Normalize DB.query return shape
function normalizeRows(execResult) {
  return Array.isArray(execResult)
    ? execResult
    : (execResult && execResult.result) || [];
}

/** Get all POS Terms. */
module.exports.listPOSTerms = async () => {
  const sql = `
    SELECT term_id, term
    FROM ${tableNames.posTerms}
    ORDER BY term ASC
  `;
  const rows = normalizeRows(await DB.query(sql, []));
  console.log('listPOSTerms: results', { count: rows.length });
  return rows.map((r) => new POS_Terms(r));
};

/** Get one term by term_id. */
module.exports.getPOSTermByTermId = async (term_id) => {
  const rec = await DB.selectOneWhere(tableNames.posTerms, 'term_id = ?', [term_id]);
  if (rec) {
    console.log('getPOSTermByTermId: found', { term_id });
    return new POS_Terms(rec);
  }
  console.log('getPOSTermByTermId: not found', { term_id });
  return null;
};

/** Add a new term to POS_Terms. */
module.exports.addPOSTerm = async (term_id, term) => {
  if (!term_id || !term) {
    throw new Error('addPOSTerm: term_id and term are required.');
  }
  const sql = `
    INSERT INTO ${tableNames.posTerms} (term_id, term)
    VALUES (?, ?)
  `;
  try {
    await DB.query(sql, [term_id, term]);
    console.log('addPOSTerm: added', { term_id, term });
    return { success: true, term_id, term };
  } catch (err) {
    console.error('addPOSTerm: error inserting', err);
    throw err;
  }
};
