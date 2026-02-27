const { DB, tableNames } = require('../handler.js');

class Committee {
  constructor({
    approval_id,
    student_id,
    pos_id,
    first,
    last,
    department,
    role,
    institution,
  }) {
    this.approval_id = approval_id;
    this.student_id = student_id;
    this.pos_id = pos_id;
    this.first = first;
    this.last = last;
    this.department = department;
    this.role = role;
    this.institution = institution;
  }

  toJSON() {
    return {
      approval_id: this.approval_id,
      student_id: this.student_id,
      pos_id: this.pos_id,
      first: this.first,
      last: this.last,
      department: this.department,
      role: this.role,
      institution: this.institution,
    };
  }
}
module.exports.Committee = Committee;

// Normalize DB.query return (array vs { result: [] })
function normalizeRows(execResult) {
  return Array.isArray(execResult) ? execResult : (execResult && execResult.result) || [];
}

/** getter: an approval by approval_id. */
module.exports.getCommitteeApprovalById = async (approval_id) => {
  const sql = `
    SELECT approval_id, student_id, pos_id, first, last, department, role, institution
    FROM ${tableNames.posCommittee}
    WHERE approval_id = ?
    LIMIT 1
  `;
  const rows = normalizeRows(await DB.query(sql, [approval_id]));
  if (rows.length) {
    console.log('getCommitteeApprovalById: found', { approval_id });
    return new Committee(rows[0]);
  }
  // else not found
  console.log('getCommitteeApprovalById: not found', { approval_id });
  return null;
};

/** list all members, we can also filter by pos id or the student's id */
module.exports.listCommittee = async ({ pos_id = null, student_id = null } = {}) => {
  const where = [];
  const params = [];
  if (pos_id != null) {
    where.push('pos_id = ?');
    params.push(pos_id);
  }
  if (student_id != null) {
    where.push('student_id = ?');
    params.push(student_id);
  }

  const sql = `
    SELECT approval_id, student_id, pos_id, first, last, department, role, institution
    FROM ${tableNames.posCommittee}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY last ASC, first ASC, approval_id ASC
  `;
  const rows = normalizeRows(await DB.query(sql, params));
  console.log('listCommittee: results', { pos_id, student_id, count: rows.length });
  return rows.map(r => new Committee(r));
};

/** filters for pos id */
module.exports.listCommitteeByPOS = async (pos_id) => module.exports.listCommittee({ pos_id });

/** filters for student id */
module.exports.listCommitteeByStudent = async (student_id) => module.exports.listCommittee({ student_id });

/** add new committee member */
module.exports.addCommitteeMember = async ({
  student_id,
  pos_id,
  first,
  last,
  department,
  role,
  institution,
}) => {
  // error checking
  if (!student_id || student_id.length > 16) {
    throw new Error('addCommitteeMember: valid student_id (<=16 chars) is required.');
  }
  if (pos_id == null) throw new Error('addCommitteeMember: pos_id is required.');
  if (!first || !last) throw new Error('addCommitteeMember: first and last are required.');

  const sql = `
    INSERT INTO ${tableNames.posCommittee}
      (student_id, pos_id, first, last, department, role, institution)
    VALUES
      (?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [student_id, pos_id, first, last, department || null, role || null, institution || null];

  try {
    const res = await DB.query(sql, params);
    const insertId = res.insertId || (res.result && res.result.insertId);
    console.log('addCommitteeMember: added', { approval_id: insertId, student_id, pos_id });
    return { success: true, approval_id: insertId };
  } catch (err) {
    // error inserting new member
    console.error('addCommitteeMember: error inserting', err);
    throw err;
  }
};

/** delete member using specific approval id */
module.exports.deleteCommitteeMember = async (approval_id) => {
  if (!approval_id) throw new Error('deleteCommitteeMember: approval_id is required.');
  const sql = `
    DELETE FROM ${tableNames.posCommittee}
    WHERE approval_id = ?
    LIMIT 1
  `;
  const res = await DB.query(sql, [approval_id]);
  const affected = res.affectedRows || (res.result && res.result.affectedRows) || 0;
  console.log('deleteCommitteeMember:', { approval_id, affected });
  return { success: affected > 0, approval_id };
};

/** delete all committee rows for a given plan (pos_id) */
module.exports.deleteCommitteeByPOS = async (pos_id) => {
  if (pos_id == null) throw new Error('deleteCommitteeByPOS: pos_id is required.');
  const sql = `DELETE FROM ${tableNames.posCommittee} WHERE pos_id = ?`;
  const resp = await DB.query(sql, [pos_id]);
  const affected = resp?.affectedRows ?? resp?.result?.affectedRows ?? 0;
  return { success: true, affected };
};