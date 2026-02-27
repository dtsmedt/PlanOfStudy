const { DB, tableNames } = require('../handler.js');
const { getCourseById, listAreasForCourse } = require('./POS_Courses');

class PlannedCourse {
  constructor({
    planned_course_id,
    plan_of_study,
    planned_course,
    course_area,
    credit_hours,
    planned_term,
    term_year,
  }) {
    this.planned_course_id = planned_course_id;
    this.plan_of_study = plan_of_study;
    this.planned_course = planned_course;
    this.course_area = course_area;
    this.credit_hours = credit_hours;
    this.planned_term = planned_term;
    this.term_year = term_year;
  }
  toJSON() {
    return {
      planned_course_id: this.planned_course_id,
      plan_of_study: this.plan_of_study,
      planned_course: this.planned_course,
      course_area: this.course_area,
      credit_hours: this.credit_hours,
      planned_term: this.planned_term,
      term_year: this.term_year,
    };
  }
}
module.exports.PlannedCourse = PlannedCourse;

// Normalize DB.query return shape (array vs { result: [] })
function normalizeRows(execResult) {
  return Array.isArray(execResult) ? execResult : (execResult && execResult.result) || [];
}

// --- helpers ----------------------------------------------------------------

// Use catalog credits unless it's a zero-credit course; then use user input (0–18), else 0.
async function resolveCreditHours(planned_course_id, provided) {
  // try to load the catalog course row
  let catalogCredits = null;
  try {
    const course = await getCourseById(planned_course_id);
    catalogCredits = Number(course?.credits);
  } catch (_) {
    
  }

  // If catalog has a positive fixed credit, use that
  if (Number.isInteger(catalogCredits) && catalogCredits > 0) {
    return catalogCredits;
  }

  // For zero-credit catalog courses, use the user-provided value if valid (0–18)
  const n = Number(provided);
  if (Number.isInteger(n) && n >= 0 && n <= 18) {
    return n;
  }

  // Default if no valid user input was provided
  return 0;
}


/**
 * Resolve course_area to store:
 *  If caller provided, use it.
 */
 async function resolveCourseArea(planned_course_id, provided) {
    // If caller supplied an area, use it.
    if (provided != null) return Number(provided);

    // Otherwise, get from POS_CourseAreas
    const areas = await listAreasForCourse(planned_course_id);
    if (areas.length === 1) return areas[0];
    if (areas.length === 0) {
      throw new Error('course_area is required: course has no mapped areas.');
    }
    throw new Error('course_area is ambiguous: course maps to multiple areas. Provide course_area explicitly.');
 }


//---------------------------------------------------------------------------------

/** Add a single planned course row. Returns the created PlannedCourse. */
module.exports.addPlannedCourse = async (
  plan_of_study,
  planned_course,
  credit_hours,
  planned_term,
  term_year,
  course_area 
) => {
  if (!plan_of_study) throw new Error('addPlannedCourse: plan_of_study is required');
  if (!planned_course) throw new Error('addPlannedCourse: planned_course is required');
  if (!planned_term) throw new Error('addPlannedCourse: planned_term is required');
  if (term_year == null) throw new Error('addPlannedCourse: term_year is required');

  const usedCreditHours = await resolveCreditHours(planned_course, credit_hours);
  const usedArea = await resolveCourseArea(planned_course, course_area);

  const row = {
    plan_of_study,
    planned_course,
    course_area: usedArea,
    credit_hours: usedCreditHours,
    planned_term,
    term_year,
  };
  const resp = await DB.insert(tableNames.posPlannedCourses, row);
  const planned_course_id = resp?.result?.insertId ?? null;
  console.log('addPlannedCourse: course inserted');
  return new PlannedCourse({ planned_course_id, ...row });
};

/** List all planned course rows for a plan */
module.exports.listPlannedCoursesByPlan = async (plan_of_study) => {
  const rows = await DB.selectWhere(
    tableNames.posPlannedCourses,
    null,       
    [],          
    { plan_of_study }
  );
  const out = normalizeRows(rows).map(r => new PlannedCourse(r));
  console.log('listPlannedCoursesByPlan: course count', out.length);
  return out;
};

/**
 * Same as above, but with labels from POS_Courses, POS_Terms, and POS_Areas.
 */
module.exports.listPlannedCoursesByPlanWithLabels = async (plan_of_study) => {
  const sql = `
    SELECT
      pc.planned_course_id,
      pc.plan_of_study,
      pc.planned_course,
      c.subject_code,
      c.course_number,
      c.title            AS course_title,
      pc.course_area     AS area_id,
      a.area_description AS area_label,
      pc.credit_hours,
      pc.planned_term,
      t.term        AS term_label,
      pc.term_year
    FROM ${tableNames.posPlannedCourses} pc
    LEFT JOIN ${tableNames.posCourses} c ON c.course_id = pc.planned_course
    LEFT JOIN ${tableNames.posTerms}   t ON t.term_id    = pc.planned_term
    LEFT JOIN ${tableNames.posAreas}   a ON a.pos_area   = pc.course_area
    WHERE pc.plan_of_study = ?
    ORDER BY pc.term_year ASC, pc.planned_term ASC, c.subject_code ASC, c.course_number ASC
  `;
  const out = await DB.query(sql, [plan_of_study]);
  const rows = normalizeRows(out);
  console.log('listPlannedCoursesByPlanWithLabels: course count', rows.length);
  return rows;
};

/** Remove a single planned course row by its primary key. Returns affected row count (0/1). */
module.exports.removePlannedCourse = async (planned_course_id) => {
  const affected = await DB.delete(tableNames.posPlannedCourses, { planned_course_id });
  console.log('removePlannedCourse: course removed', { planned_course_id, affected });
  return affected;
};

/**
 * Replace all planned courses for a plan with the provided array.
 * Returns the final labeled list after replacement.
 */
module.exports.ReplaceAllPlannedCourses = async (plan_of_study, rows) => {
  if (!Array.isArray(rows)) {
    throw new Error('ReplaceAllPlannedCourses: rows must be an array');
  }

  const deleted = await DB.delete(tableNames.posPlannedCourses, { plan_of_study });
  console.log('ReplaceAllPlannedCourses: cleared existing courses', { deleted });

  let inserted = 0;
  for (const r of rows) {
    if (!r || !r.planned_course || !r.planned_term || r.term_year == null) {
      console.log('ReplaceAllPlannedCourses: skip invalid row', r);
      continue;
    }
    try {
      const ch = await resolveCreditHours(r.planned_course, r.credit_hours);
      const area = await resolveCourseArea(r.planned_course, r.course_area);

      const row = {
        plan_of_study,
        planned_course: r.planned_course,
        course_area: area,
        credit_hours: ch,
        planned_term: r.planned_term,
        term_year: r.term_year,
      };
      const resp = await DB.insert(tableNames.posPlannedCourses, row);
      const planned_course_id = resp?.result?.insertId ?? null;
      inserted++;
      console.log('ReplaceAllPlannedCourses: inserted row', { planned_course_id, ...row });
    } catch (e) {
      console.log('ReplaceAllPlannedCourses: skip row (unable to resolve area/credits)', { row: r, error: e?.message });
    }
  }

  const result = await module.exports.listPlannedCoursesByPlanWithLabels(plan_of_study);
  console.log('ReplaceAllPlannedCourses: inserted courses', { inserted, finalCount: result.length });
  return result;
};

/** Delete all planned courses for a plan. Returns affected row count. */
module.exports.deleteAllPlannedCoursesForPlan = async (plan_of_study) => {
  const affected = await DB.delete(tableNames.posPlannedCourses, { plan_of_study });
  console.log('deleteAllPlannedCoursesForPlan: all courses deleted', { plan_of_study, affected });
  return affected;
};

/** Update term/year for an existing planned course */
module.exports.updateTermYear = async (planned_course_id, planned_term, term_year) => {
  if (!planned_course_id) throw new Error("planned_course_id is required");
  if (!planned_term || term_year == null) throw new Error("planned_term and term_year are required");

  const { result } = await DB.query(
    `UPDATE ${tableNames.posPlannedCourses}
     SET planned_term = ?, term_year = ?
     WHERE planned_course_id = ?`,
    [planned_term, term_year, planned_course_id]
  );

  console.log("updateTermYear: moved planned course", {
    planned_course_id,
    planned_term,
    term_year,
    affected: result?.affectedRows,
  });

  return result?.affectedRows || 0;
};
