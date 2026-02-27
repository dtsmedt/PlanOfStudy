const { DB, tableNames } = require('../handler.js');

class Course {
  constructor({ course_id, subject_code, course_number, title, credits, areas }) {
    this.course_id = course_id;
    this.subject_code = subject_code;
    this.course_number = course_number;
    this.title = title;
    this.credits = credits != null ? Number(credits) : null;
    this.areas = Array.isArray(areas) ? areas.map(Number) : [];
  }
  toJSON() {
    return {
      course_id: this.course_id,
      subject_code: this.subject_code,
      course_number: this.course_number,
      title: this.title,
      credits: this.credits,
      areas: this.areas,
    };
  }
}
module.exports.Course = Course;

// Normalize DB.query return (array vs { result: [] })
function normalizeRows(execResult) {
  return Array.isArray(execResult) ? execResult : (execResult && execResult.result) || [];
}

/** Internal: attach areas[] from POS_CourseAreas to raw course rows */
async function attachAreas(rows) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.course_id);
  const placeholders = ids.map(() => '?').join(',');
  const linkSql = `
    SELECT j.course AS course_id, j.area
    FROM ${tableNames.posCourseAreas} j
    WHERE j.course IN (${placeholders})
    ORDER BY j.area ASC
  `;
  const links = normalizeRows(await DB.query(linkSql, ids));

  const map = new Map(ids.map(id => [id, []]));
  for (const l of links) map.get(l.course_id)?.push(Number(l.area));

  return rows.map(r => new Course({ ...r, areas: map.get(r.course_id) || [] }));
}

/** Get one course by id. Returns null if not found. */
module.exports.getCourseById = async (course_id) => {
  const sql = `
    SELECT course_id, subject_code, course_number, title, credits
    FROM ${tableNames.posCourses}
    WHERE course_id = ?
    LIMIT 1
  `;
  const rows = normalizeRows(await DB.query(sql, [course_id]));
  if (!rows.length) return null;
  const [course] = await attachAreas(rows);
  return course;
};

/**
 * List all courses for a given POS_Area.
 * If area_id is null, returns CS-only courses (subject_code = 'CS').
 */
module.exports.listCoursesByArea = async (area_id /* number | null */) => {
  if (area_id == null) {
    const sql = `
      SELECT course_id, subject_code, course_number, title, credits
      FROM ${tableNames.posCourses}
      WHERE subject_code = 'CS'
      ORDER BY subject_code, course_number
    `;
    const rows = normalizeRows(await DB.query(sql));
    return attachAreas(rows);
  }

  const sql = `
    SELECT c.course_id, c.subject_code, c.course_number, c.title, c.credits
    FROM ${tableNames.posCourses} c
    JOIN ${tableNames.posCourseAreas} j ON j.course = c.course_id
    WHERE j.area = ?
    ORDER BY c.subject_code, c.course_number
  `;
  const rows = normalizeRows(await DB.query(sql, [area_id]));
  return attachAreas(rows);
};

/** Convenience: list area ids for one course */
module.exports.listAreasForCourse = async (course_id) => {
  const sql = `
    SELECT area FROM ${tableNames.posCourseAreas}
    WHERE course = ?
    ORDER BY area ASC
  `;
  return normalizeRows(await DB.query(sql, [course_id])).map(r => Number(r.area));
};
