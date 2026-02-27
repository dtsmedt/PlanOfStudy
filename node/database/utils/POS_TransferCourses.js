const { DB, tableNames } = require('../handler.js');

class TransferCourse {
  constructor({ transfer_id, plan_of_study, description, credit_hours, grade }) {
    this.transfer_id = Number(transfer_id);
    this.plan_of_study = Number(plan_of_study);
    this.description = String(description || '');
    this.credit_hours = Number(credit_hours || 0);
    this.grade = String(grade || '');
  }
  toJSON() {
    return {
      transfer_id: this.transfer_id,
      plan_of_study: this.plan_of_study,
      description: this.description,
      credit_hours: this.credit_hours,
      grade: this.grade,
    };
  }
}
module.exports.TransferCourse = TransferCourse;

// Normalize DB.query return shape
function normalizeRows(execResult) {
  return Array.isArray(execResult)
    ? execResult
    : (execResult && execResult.result) || [];
}

/* Get all transfer rows for a plan_of_study (pos_id) */
module.exports.listTransfersByPlan = async (plan_of_study) => {
  const sql = `
    SELECT transfer_id, plan_of_study, description, credit_hours, grade
    FROM ${tableNames.posTransferCourses}
    WHERE plan_of_study = ?
    ORDER BY transfer_id ASC
  `;
  const rows = normalizeRows(await DB.query(sql, [plan_of_study]));
  return rows.map(r => new TransferCourse(r));
};

/* Get one transfer row by id (or null) */
module.exports.getTransferById = async (transfer_id) => {
  const sql = `
    SELECT transfer_id, plan_of_study, description, credit_hours, grade
    FROM ${tableNames.posTransferCourses}
    WHERE transfer_id = ?
    LIMIT 1
  `;
  const rows = normalizeRows(await DB.query(sql, [transfer_id]));
  if (!rows.length) return null;
  return new TransferCourse(rows[0]);
};

/* Add a single transfer row */
module.exports.addTransfer = async ({ plan_of_study, description, credit_hours, grade }) => {
  const payload = validate({ plan_of_study, description, credit_hours, grade });
  await DB.insert(tableNames.posTransferCourses, {
    plan_of_study: payload.plan_of_study,
    description: payload.description,
    credit_hours: payload.credit_hours,
    grade: payload.grade,
  });
  const sql = `
    SELECT transfer_id, plan_of_study, description, credit_hours, grade
    FROM ${tableNames.posTransferCourses}
    WHERE plan_of_study = ?
    ORDER BY transfer_id DESC
    LIMIT 1
  `;
  const rows = normalizeRows(await DB.query(sql, [payload.plan_of_study]));
  return rows.length ? new TransferCourse(rows[0]) : null;
};

/* Delete a transfer row by id */
module.exports.removeTransfer = async (transfer_id) => {
  await DB.delete(tableNames.posTransferCourses, { transfer_id });
  return true;
};

/*
 * Replace all transfer rows for a plan with the provided array.
 */
module.exports.replaceAllTransfers = async (plan_of_study, rows /* array of {description, credit_hours, grade} */) => {
  // 1) Clear existing
  await DB.query(`DELETE FROM ${tableNames.posTransferCourses} WHERE plan_of_study = ?`, [plan_of_study]);

  // 2) Insert new
  if (Array.isArray(rows) && rows.length) {
    const cleaned = rows
      .map(r => validate({ plan_of_study, ...r }))
      .filter(r => r.description.length > 0 && r.credit_hours >= 0); // defensive

    if (cleaned.length) {
      await DB.insertMany(
        tableNames.posTransferCourses,
        cleaned.map(r => ({
          plan_of_study: r.plan_of_study,
          description: r.description,
          credit_hours: r.credit_hours,
          grade: r.grade,
        }))
      );
    }
  }
  // 3) Return the new list
  return module.exports.listTransfersByPlan(plan_of_study);
};

/* Sum of transfer credit hours for a plan */
module.exports.sumTransferCredits = async (plan_of_study) => {
  const sql = `
    SELECT COALESCE(SUM(credit_hours), 0) AS total
    FROM ${tableNames.posTransferCourses}
    WHERE plan_of_study = ?
  `;
  const rows = normalizeRows(await DB.query(sql, [plan_of_study]));
  return Number(rows[0]?.total || 0);
};

/* Basic validation */
function validate({ plan_of_study, description, credit_hours, grade }) {
  const posId = Number(plan_of_study);
  const desc = String(description || '').trim();
  const ch = Number(credit_hours);
  const g = String(grade || '').trim().toUpperCase();

  if (!Number.isFinite(posId) || posId <= 0) throw new Error('Invalid plan_of_study');
  if (!desc) throw new Error('Description required');
  if (!Number.isFinite(ch) || ch < 0) throw new Error('credit_hours must be a non-negative integer');
  if (!['A', 'B'].includes(g)) throw new Error("grade must be 'A' or 'B'");

  return { plan_of_study: posId, description: desc, credit_hours: ch, grade: g };
}
