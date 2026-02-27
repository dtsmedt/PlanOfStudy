const { DB, tableNames } = require('../handler');

class Faculty {
  constructor({ pid, first, last, email, permissions, cs_department }) {
    this.pid = pid;
    this.first = first;
    this.last = last;
    this.email = email || null;
    this.permissions = Number(permissions); // tinyint(1)
    this.cs_department = Number(cs_department); // tinyint(1)
  }

  toJSON() {
    return {
      pid: this.pid,
      first: this.first,
      last: this.last,
      email: this.email,
      permissions: this.permissions,
      cs_department: this.cs_department,
    };
  }
}
module.exports.Faculty = Faculty;

// Normalize DB.query output (array vs { result: array })
function normalizeRows(execResult) {
  return Array.isArray(execResult) ? execResult : execResult?.result || [];
}

/** List ALL faculty names, ordered by last then first. */
module.exports.listAllFacultyNames = () => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT pid, first, last, email, permissions, cs_department
      FROM ${tableNames.faculty}
      ORDER BY last ASC, first ASC
    `;
    DB.query(sql, [])
      .then((res) => {
        const rows = normalizeRows(res);
        resolve(
          rows.map((r) => ({
            pid: r.pid,
            first: r.first,
            last: r.last,
            email: r.email || null,
            permissions: Number(r.permissions),
            cs_department: Number(r.cs_department),
          }))
        );
      })
      .catch(reject);
  });
};

/**
 * List faculty names by department membership (CS only if inCS = 1).
 */
module.exports.listFacultyNamesByDepartment = (inCS) => {
  const flag = (inCS === true || inCS === 1 || inCS === '1') ? 1 : 0;

  return new Promise((resolve, reject) => {
    const sql = `
      SELECT pid, first, last, email, permissions, cs_department
      FROM ${tableNames.faculty}
      WHERE cs_department = ?
      ORDER BY last ASC, first ASC
    `;
    DB.query(sql, [flag])
      .then((res) => {
        const rows = normalizeRows(res);
        resolve(
          rows.map((r) => ({
            pid: r.pid,
            first: r.first,
            last: r.last,
            email: r.email || null,
            permissions: Number(r.permissions),
            cs_department: Number(r.cs_department),
          }))
        );
      })
      .catch(reject);
  });
};

/** Get one faculty member by PID. */
module.exports.getFacultyByPID = async (pid) => {
  if (!pid) return null;

  const { result: row } = await DB.selectOneWhere(
    tableNames.faculty,
    null,
    [],
    { pid },
    []
  );

  if (row) {
    console.log('getFacultyByPID: found', { pid });
    return new Faculty(row);
  }
  console.log('getFacultyByPID: not found', { pid });
  return null;
};
