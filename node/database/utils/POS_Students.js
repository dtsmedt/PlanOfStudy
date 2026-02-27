const { DB, tableNames } = require('../handler.js');

class POS_Student {
  constructor({ pid, first, last }) {
    this.pid = pid;
    this.first = first;
    this.last = last;
  }

  toJSON() {
    return { pid: this.pid, first: this.first, last: this.last };
  }
}
module.exports.POS_Student = POS_Student;

// Normalize DB.query return shape
function normalizeRows(execResult) {
  return Array.isArray(execResult)
    ? execResult
    : (execResult && execResult.result) || [];
}

/** Get all POS students. */
module.exports.getAllPOSStudents = async () => {
  const sql = `
    SELECT pid, first, last
    FROM ${tableNames.posStudents}
    ORDER BY last ASC
  `;
  const rows = normalizeRows(await DB.query(sql, []));
  console.log('getAllPOSStudents: results', { count: rows.length });
  return rows.map((r) => new POS_Student(r));
};

/** Get one student by PID. */
module.exports.getPOSStudentByPID = async (pid) => {
  if (!pid) return null;

  const { result: row } = await DB.selectOneWhere(
    tableNames.posStudents,
    null,
    [],
    { pid },
    []
  );

  if (row) {
    console.log('getPOSStudentByPID: found', { pid });
    return new POS_Student(row);
  }
  console.log('getPOSStudentByPID: not found', { pid });
  return null;
};


/** Add a new student to POS_Students. */
module.exports.addPOSStudent = async (pid, first, last) => {
  if (!pid || !first || !last) {
    throw new Error('addPOSStudent: pid, first, and last are required.');
  }

  const sql = `
    INSERT INTO ${tableNames.posStudents} (pid, first, last)
    VALUES (?, ?, ?)
  `;

  try {
    await DB.query(sql, [pid, first, last]);
    console.log('addPOSStudent: added', { pid, first, last });
    return { success: true, pid, first, last };
  } catch (err) {
    console.error('addPOSStudent: error inserting', err);
    throw err;
  }
};
