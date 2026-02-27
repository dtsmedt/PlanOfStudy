const { DB, tableNames } = require("../handler.js");

class IgnoredCourse {
  constructor({ ignored_id, pid, pos_type, course_code, planned_term, term_year }) {
    this.ignored_id   = Number(ignored_id);
    this.pid          = String(pid || "");
    this.pos_type     = Number(pos_type);
    this.course_code  = String(course_code || "");
    this.planned_term = Number(planned_term);
    this.term_year    = Number(term_year);
  }

  toJSON() {
    return {
      ignored_id: this.ignored_id,
      pid: this.pid,
      pos_type: this.pos_type,
      course_code: this.course_code,
      planned_term: this.planned_term,
      term_year: this.term_year,
    };
  }
}
module.exports.IgnoredCourse = IgnoredCourse;

// Normalize DB.query results (like POS_TransferCourses)
function normalizeRows(execResult) {
  return Array.isArray(execResult)
    ? execResult
    : (execResult && execResult.result) || [];
}

/* Get ignored courses for one student + POS type */
module.exports.listIgnoredByPidAndType = async (pid, pos_type) => {
  const sql = `
    SELECT ignored_id, pid, pos_type, course_code, planned_term, term_year
    FROM ${tableNames.posIgnoredCourses}
    WHERE pid = ? AND pos_type = ?
    ORDER BY ignored_id ASC
  `;
  const rows = normalizeRows(await DB.query(sql, [pid, Number(pos_type)]));
  return rows.map(r => new IgnoredCourse(r));
};

/* Add an ignored course */
module.exports.addIgnoredCourse = async ({ pid, pos_type, course_code, planned_term, term_year }) => {
  const payload = validate({ pid, pos_type, course_code, planned_term, term_year });

  const sql = `
    INSERT INTO ${tableNames.posIgnoredCourses}
      (pid, pos_type, course_code, planned_term, term_year)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE ignored_id = ignored_id
  `;
  await DB.query(sql, [
    payload.pid,
    payload.pos_type,
    payload.course_code,
    payload.planned_term,
    payload.term_year,
  ]);

  const fetchSql = `
    SELECT ignored_id, pid, pos_type, course_code, planned_term, term_year
    FROM ${tableNames.posIgnoredCourses}
    WHERE pid = ? AND pos_type = ? AND course_code = ? AND planned_term = ? AND term_year = ?
    LIMIT 1
  `;
  const rows = normalizeRows(await DB.query(fetchSql, [
    payload.pid,
    payload.pos_type,
    payload.course_code,
    payload.planned_term,
    payload.term_year,
  ]));

  return rows.length ? new IgnoredCourse(rows[0]) : null;
};

/* Remove ignored entry */
module.exports.removeIgnoredCourse = async (ignored_id) => {
  await DB.delete(tableNames.posIgnoredCourses, { ignored_id });
  return true;
};

/* Validation helper */
function validate({ pid, pos_type, course_code, planned_term, term_year }) {
  const p = String(pid || "").trim();
  const t = Number(pos_type);
  const code = String(course_code || "").trim();
  const term = Number(planned_term);
  const year = Number(term_year);

  if (!p) throw new Error("Invalid pid");
  if (!Number.isFinite(t) || t <= 0) throw new Error("Invalid pos_type");
  if (!code) throw new Error("course_code required");
  if (!Number.isFinite(term) || term <= 0) throw new Error("planned_term required");
  if (!Number.isFinite(year) || year <= 0) throw new Error("term_year required");

  return {
    pid: p,
    pos_type: t,
    course_code: code.toUpperCase(),
    planned_term: term,
    term_year: year,
  };
}
