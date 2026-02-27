const Log = require("../../database/utils/Log");
const { getCurrentUser } = require("../helpers");

const Student = require("../../database/utils/POS_Students");
const Areas = require("../../database/utils/POS_Areas");
const Status = require("../../database/utils/POS_Status");
const Types = require("../../database/utils/POS_Type");
const Terms = require("../../database/utils/POS_Terms");
const Courses = require("../../database/utils/POS_Courses");
const Faculty = require("../../database/utils/Faculty");
const POSPlan = require("../../database/utils/POS_PlanOfStudy");
const PlannedCourses = require("../../database/utils/POS_PlannedCourses");
const Committee = require("../../database/utils/POS_Committee");
const History = require("../../database/utils/POS_History");
const Transfers = require("../../database/utils/POS_TransferCourses");
const Transcripts = require("../../database/utils/POS_Transcripts");
const IgnoredCourses = require("../../database/utils/POS_IgnoredCourses");
/* 
* -----------------------------------------------------------------------------------
* -                                                                                 -
* -                                   * USER *                                      -
* -                                                                                 -
* -----------------------------------------------------------------------------------
*/
// GET /api/pos/session/me
module.exports.getSessionUser = (req, res) => {
  try {
    const user = getCurrentUser(res);

    if (!user) {
      return res.status(401).json({ message: "Not Authenticated" });
    }

    return res.json({
      pid: user.pid,
      permissions: user.permissions,
      campus: user.campus
    });

  } catch (err) {
    console.error("Error in getSessionUser:", err);
    return res.status(500).json({ message: "Failed to load session user" });
  }
};

/* 
* -----------------------------------------------------------------------------------
* -                                                                                 -
* -                              * DROPDOWNS *                                      -
* -                                                                                 -
* -----------------------------------------------------------------------------------
*/

// GET /api/pos/areas  -> [{ value, label }]
module.exports.getPOS_Areas = async (req, res) => {
  Log.info("Received request to get POS Areas.", getCurrentUser(res)?.pid);
  try {
    // returns [{ value: POS_Area, label: Area_Description }]
    const areas = await Areas.listAreaAndDesc();
    Log.info("Successfully got POS Areas.", getCurrentUser(res)?.pid);
    return res.status(200).json({ areas });
  } catch (err) {
    Log.error(`Error getting POS Areas: ${err}`, getCurrentUser(res)?.pid);
    return res.status(500).json({ message: "Failed to fetch POS Areas" });
  }
};

// GET /api/pos/statuses
// Dropdown for faculty searching student POS
module.exports.getPOS_Statuses = async (req, res) => {
  const user = getCurrentUser(res);
  const permissions = user?.permissions || 0;
  Log.info("Received request to get POS Statuses.", getCurrentUser(res)?.pid);
  try {
    const allStatuses = await Status.getAllPOSStatus();
    
    let allowed = allStatuses;
    // Using Permission Bit Fields (see User class)
    // Committee Chair viewable statuses
    if (permissions & 1 > 0) {
      const facultyAllowed = [3, 6, 99];
      allowed = allStatuses.filter(s => facultyAllowed.includes(s.status_id));
    }

    // Grad Coordinator viewable statuses
    if (permissions & 8 > 0) {
      const gcAllowed = [2, 4, 5, 6, 99];
      allowed = allStatuses.filter(s => gcAllowed.includes(s.status_id));
    }
    // Both Bitfields
    if (permissions & 9 > 0) {
      const gcAllowed = [2, 3, 4, 5, 6, 99];
      allowed = allStatuses.filter(s => gcAllowed.includes(s.status_id));
    }
    Log.info("Successfully got POS Statuses.", getCurrentUser(res)?.pid);
    return res.status(200).json({ statuses: allowed });
  } catch (err) {
    Log.error(`Error getting POS Statuses: ${err}`, getCurrentUser(res)?.pid);
    return res.status(500).json({ message: "Failed to fetch POS Statuses" });
  }
};

// GET /api/pos/types
module.exports.getPOS_Types = async(req, res) => {
  Log.info("Received request to get POS Types.", getCurrentUser(res)?.pid);
  try {
    const types = await Types.listPOSTypes();
    Log.info("Successfully got POS Types.", getCurrentUser(res)?.pid);
    return res.status(200).json({ types });
  } catch (err) {
    Log.error(`Error getting POS Types: ${err}`, getCurrentUser(res)?.pid);
    return res.status(500).json({ message: "Failed to fetch POS Types" });
  }
};

// GET /api/pos/terms -> [{ term_id, term }]
module.exports.getPOS_Terms = async (req, res) => {
  Log.info("Received request to get POS Terms.", getCurrentUser(res)?.pid);
  try {
    const terms = await Terms.listPOSTerms();
    Log.info("Successfully got POS Terms.", getCurrentUser(res)?.pid);
    return res.status(200).json({ terms });
  } catch (err) {
    Log.error(`Error getting POS Terms: ${err}`, getCurrentUser(res)?.pid);
    return res.status(500).json({ message: "Failed to fetch POS Terms" });
  }
};

// GET /api/pos/courses?area=<id|null>
module.exports.getPOS_Courses = async (req, res) => {
  try {
    const area = (req.query.area ?? "") === "" ? null : Number(req.query.area);
    const rows = await Courses.listCoursesByArea(area);
    return res.status(200).json({ courses: rows.map(c => c.toJSON()) });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch POS Courses" });
  }
};


// GET /api/pos/faculty?onlyCS=1
module.exports.getPOS_Faculty = async (req, res) => {
  Log.info(
    `Received request to get POS Faculty: ${JSON.stringify(req.query)}`,
    getCurrentUser(res)?.pid
  );
  try {
    const onlyCS = req.query.onlyCS;
    let rows;
    if (onlyCS === "1") {
      rows = await Faculty.listFacultyNamesByDepartment(1);
    } else {
      rows = await Faculty.listAllFacultyNames();
    }
    Log.info(
      `Successfully got POS Faculty (count=${rows.length}).`,
      getCurrentUser(res)?.pid
    );
    // rows should be [{ pid, first, last }]
    return res.status(200).json({ faculty: rows });
  } catch (err) {
    Log.error(`Error getting POS Faculty: ${err}`, getCurrentUser(res)?.pid);
    return res.status(500).json({ message: "Failed to fetch POS Faculty" });
  }
};


/* 
* -----------------------------------------------------------------------------------
* -                                                                                 -
* -                              * STUDENT *                                        -
* -                                                                                 -
* -----------------------------------------------------------------------------------
*/


// POST /api/pos/ensure-student
module.exports.ensurePOS_Student = async (req, res) => {
  Log.info("Received request to ensure POS student record.", getCurrentUser(res)?.pid);
  try {
    const pid = getCurrentUser(res)?.pid;

    // 1) Check if POS_Students already has this PID
    const existing = await Student.getPOSStudentByPID(pid);
    if (existing) {
      Log.info("ensurePOS_Student: Student already exists.", pid);
      return res.status(200).json({ created: false, student: existing.toJSON?.() ?? existing });
    }

    // 2) Otherwise insert with defaults for required columns
    const first = "First";
    const last  = "Last";
    await Student.addPOSStudent(pid, first, last);

    Log.info("ensurePOS_Student: Added new POS student.", pid);
    return res.status(201).json({ created: true, student: { pid, first, last } });
  } catch (err) {
    Log.error(`ensurePOS_Student: ${err}`, getCurrentUser(res)?.pid);
    return res.status(500).json({ message: "Failed to ensure POS student." });
  }
};

// GET /api/pos/students
module.exports.getPOS_Students = async (req, res) => {
  try {
    const students = await Student.getAllPOSStudents();
    return res.status(200).json({ students: students.map(s => s.toJSON()) });
  } catch (err) {
    Log.error(`getPOSStudents error: ${err}`);
    return res.status(500).json({ message: "Failed to fetch POS students" });
  }
};

// GET /api/pos/is-student  -> { exists: boolean, pid?: string }
module.exports.getPOS_IsStudent = async (req, res) => {
  try {
    const pid = getCurrentUser(res)?.pid;
    if (!pid) return res.status(200).json({ exists: false });
    const existing = await Student.getPOSStudentByPID(pid);
    return res.status(200).json({ exists: !!existing, pid: existing?.pid || null });
  } catch (err) {
    return res.status(500).json({ message: "Failed to check student status" });
  }
};

/* 
* -----------------------------------------------------------------------------------
* -                                                                                 -
* -                          * PLAN OF STUDY *                                      -
* -                                                                                 -
* -----------------------------------------------------------------------------------
*/

// POST /api/pos/plan
module.exports.createPOS_Plan = async (req, res) => {
  const userPid = getCurrentUser(res)?.pid;
  try {
    const body = req.body || {};

    // Required inputs (with safe defaults)
    const pid = body.pid || userPid;
    const pos_type = body.pos_type != null ? Number(body.pos_type) : null;

    // Optional inputs
    const hasChairField   = Object.prototype.hasOwnProperty.call(body, "committee_chair");
    const hasStatusField  = Object.prototype.hasOwnProperty.call(body, "current_status");

    const committee_chair =
      hasChairField && body.committee_chair && String(body.committee_chair).trim() !== ""
        ? String(body.committee_chair).trim()
        : null;

    const current_status =
      hasStatusField && body.current_status != null
        ? Number(body.current_status)
        : 1; // default "Saved"

    if (!pid || pos_type == null) {
      return res.status(400).json({ message: "pid and pos_type are required" });
    }

    Log.info(`createPOS_Plan pid=${pid} pos_type=${pos_type}`, userPid);

    // Ensure the plan exists
    await POSPlan.createPlanOfStudy(pid, pos_type, null, current_status);

    // Apply updates so existing plans get chair/status changes.
    if (hasChairField) {
      await POSPlan.setCommitteeChairByPidAndType(pid, pos_type, committee_chair);
    }
    if (hasStatusField || !hasChairField) {
      // if caller included status, set it
      await POSPlan.setCurrentStatusByPidAndType(pid, pos_type, current_status);
    }

    // 3) Re-read and return the latest state
    const latest = await POSPlan.getPlanyPidAndType(pid, pos_type);

    // Add history entry
    try {
      if (latest?.pos_id && current_status != null) {
        // Fetch student to record name
        const student = await Student.getPOSStudentByPID(pid);
        const changedBy = student ? `${student.first} ${student.last}`.trim() : pid;

        await History.addHistory({
          plan_of_study: latest.pos_id,
          history_status: current_status,
          note: "",                        // Empty; reserved for faculty input
          changed_by: changedBy,
        });
      }
    } catch (e) {
      console.error("createPOS_Plan: failed to write POS_History", e);
    }

    return res.status(200).json({ plan: latest?.toJSON ? latest.toJSON() : latest });
  } catch (err) {
    Log.error(`createPOS_Plan error: ${err}`, userPid);
    return res.status(500).json({ message: "Failed to create plan of study" });
  }
};


// GET /api/pos/plan?pid=<pid>&pos_type=<type>
module.exports.getPOS_Plan = async (req, res) => {
  const userPid = getCurrentUser(res)?.pid;
  try {
    const pid = req.query.pid;
    const pos_type = req.query.pos_type != null ? Number(req.query.pos_type) : null;
    if (!pid || pos_type == null) {
      return res.status(400).json({ message: "pid and pos_type are required" });
    }
    Log.info(`getPOS_Plan pid=${pid} pos_type=${pos_type}`, userPid);

    const plan = await POSPlan.getPlanyPidAndType(pid, pos_type);
    return res.status(200).json({ plan: plan ? (plan.toJSON ? plan.toJSON() : plan) : null });
  } catch (err) {
    Log.error(`getPOS_Plan error: ${err}`, userPid);
    return res.status(500).json({ message: "Failed to get plan of study" });
  }
};

// PATCH /api/pos/plan/committee
module.exports.setPOS_CommitteeChair = async (req, res) => {
  const userPid = getCurrentUser(res)?.pid;
  try {
    const { pid, pos_type, committee_chair = null } = req.body || {};
    if (!pid || pos_type == null) {
      return res.status(400).json({ message: "pid and pos_type are required" });
    }
    Log.info(`setPOS_CommitteeChair pid=${pid} pos_type=${pos_type} chair=${committee_chair}`, userPid);

    // Ensure plan row exists (idempotent)
    await POSPlan.createPlanOfStudy(pid, Number(pos_type));

    await POSPlan.setCommitteeChairByPidAndType(pid, Number(pos_type), committee_chair);
    return res.status(200).json({ updated: true });
  } catch (err) {
    Log.error(`setPOS_CommitteeChair error: ${err}`, userPid);
    return res.status(500).json({ message: "Failed to set committee chair" });
  }
};

// PATCH /api/pos/plan/status
module.exports.setPOS_CurrentStatus = async (req, res) => {
  const userPid = getCurrentUser(res)?.pid;
  try {
    const { pid, pos_type, status_id } = req.body || {};
    if (!pid || pos_type == null || status_id == null) {
      return res.status(400).json({ message: "pid, pos_type, and status_id are required" });
    }
    Log.info(`setPOS_CurrentStatus pid=${pid} pos_type=${pos_type} status_id=${status_id}`, userPid);

    // Ensure plan row exists (idempotent)
    await POSPlan.createPlanOfStudy(pid, Number(pos_type));

    // Add history entry
    try {
      if (latest?.pos_id && current_status != null) {
        // Fetch student to record name
        const student = await Student.getPOSStudentByPID(pid);
        const changedBy = student ? `${student.first} ${student.last}`.trim() : pid;

        await History.addHistory({
          plan_of_study: latest.pos_id,
          history_status: current_status,
          note: "",                        // Empty; reserved for faculty input
          changed_by: changedBy,
        });
      }
    } catch (e) {
      console.error("createPOS_Plan: failed to write POS_History", e);
    }

    await POSPlan.setCurrentStatusByPidAndType(pid, Number(pos_type), Number(status_id));
    return res.status(200).json({ updated: true });
  } catch (err) {
    Log.error(`setPOS_CurrentStatus error: ${err}`, userPid);
    return res.status(500).json({ message: "Failed to set current status" });
  }
};

/* 
* -----------------------------------------------------------------------------------
* -                                                                                 -
* -                           * PLANNED COURSES *                                   -
* -                                                                                 -
* -----------------------------------------------------------------------------------
*/

// Validate planned course row before DB operations
async function validatePlannedCourseRow(r) {
  const planned_course = Number(r.planned_course);
  const planned_term   = Number(r.planned_term);
  const term_year      = Number(r.term_year);
  const course_area    = r.course_area != null ? Number(r.course_area) : null;

  if (!planned_course || !planned_term || !Number.isInteger(term_year)) {
    throw new Error("planned_course, planned_term, and term_year are required");
  }

  // Find all allowed areas for this course
  const allowedAreas = (await Courses.listAreasForCourse(planned_course)).map(Number);
  if (course_area != null && !allowedAreas.includes(Number(course_area))) {
    throw new Error(
      `Invalid course_area=${course_area} for course ${planned_course}. Allowed: ${
        allowedAreas.length ? allowedAreas.join(", ") : "none"
      }`
    );
  }
}

// Helper: resolve plan_of_study (pos_id) from either pos_id OR (pid,pos_type)
async function resolvePosIdOrThrow({ pos_id, pid, pos_type }) {
  if (pos_id != null) return Number(pos_id);
  if (!pid || pos_type == null) {
    throw new Error("pos_id or (pid and pos_type) is required");
  }
  const plan = await POSPlan.getPlanyPidAndType(pid, Number(pos_type));
  if (!plan) {
    const err = new Error("Plan of study not found");
    err.status = 404;
    throw err;
  }
  return plan.pos_id;
}

// GET /api/pos/plan/courses?pid=<pid>&pos_type=<1|2>
module.exports.getPOS_PlannedCourses = async (req, res) => {
  try {
    const pos_id = await resolvePosIdOrThrow({
      pos_id: req.query.pos_id != null ? Number(req.query.pos_id) : null,
      pid: req.query.pid,
      pos_type: req.query.pos_type != null ? Number(req.query.pos_type) : null,
    });

    const rows = await PlannedCourses.listPlannedCoursesByPlanWithLabels(pos_id);
    return res.status(200).json({ planned_courses: rows });
  } catch (err) {
    const code = err.status || 500;
    return res.status(code).json({ message: err.message || "Failed to fetch planned courses" });
  }
};

// PUT /api/pos/plan/courses
// body: { pos_id? OR pid+pos_type, rows: [ { planned_course, planned_term, term_year, credit_hours?, course_area? }, ... ] }
module.exports.replacePOS_PlannedCourses = async (req, res) => {
  try {
    const body = req.body || {};
    const pos_id = await resolvePosIdOrThrow({
      pos_id: body.pos_id != null ? Number(body.pos_id) : null,
      pid: body.pid,
      pos_type: body.pos_type != null ? Number(body.pos_type) : null,
    });

    if (!Array.isArray(body.rows)) {
      return res.status(400).json({ message: "rows (array) is required" });
    }

    // Validate each row before DB replace
    for (const r of body.rows) {
      await validatePlannedCourseRow(r);
    }

    const result = await PlannedCourses.ReplaceAllPlannedCourses(pos_id, body.rows);
    return res.status(200).json({ planned_courses: result });
  } catch (err) {
    const msg = err?.sqlMessage || err?.message || "Failed to save planned courses";
    const low = msg.toLowerCase();
    const isUser =
      low.includes("required") ||
      low.includes("invalid course_area") ||
      low.includes("ambiguous") ||
      low.includes("plan of study not found") ||
      err?.code === "ER_NO_REFERENCED_ROW_2" ||
      err?.code === "ER_ROW_IS_REFERENCED_2";

    console.error("replacePOS_PlannedCourses error:", { code: err?.code, msg });
    return res.status(isUser ? 400 : 500).json({ message: msg });
  }
};

// POST /api/pos/plan/course
// body: { pos_id? OR pid+pos_type, planned_course, planned_term, term_year, credit_hours?, course_area? }
module.exports.addPOS_PlannedCourse = async (req, res) => {
  try {
    const body = req.body || {};
    const pos_id = await resolvePosIdOrThrow({
      pos_id: body.pos_id != null ? Number(body.pos_id) : null,
      pid: body.pid,
      pos_type: body.pos_type != null ? Number(body.pos_type) : null,
    });

    const {
      planned_course,
      planned_term,
      term_year,
      credit_hours = null,
      course_area = null,
    } = body;

    if (!planned_course || !planned_term || term_year == null) {
      return res.status(400).json({ message: "planned_course, planned_term, and term_year are required" });
    }

    await validatePlannedCourseRow(req.body);

    const created = await PlannedCourses.addPlannedCourse(
      pos_id,
      Number(planned_course),
      credit_hours != null ? Number(credit_hours) : null,
      Number(planned_term),
      Number(term_year),
      course_area != null ? Number(course_area) : null
    );

    return res.status(201).json({ planned_course: created.toJSON() });
  } catch (err) {
    const msg = err?.sqlMessage || err?.message || "Failed to save planned courses";
    const low = msg.toLowerCase();
    const isUser =
      low.includes("required") ||
      low.includes("invalid course_area") ||
      low.includes("ambiguous") ||
      low.includes("plan of study not found") ||
      err?.code === "ER_NO_REFERENCED_ROW_2" ||
      err?.code === "ER_ROW_IS_REFERENCED_2";

    console.error("replacePOS_PlannedCourses error:", { code: err?.code, msg });
    return res.status(isUser ? 400 : 500).json({ message: msg });
  }
};

// DELETE /api/pos/plan/course/:id
module.exports.deletePOS_PlannedCourse = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "planned_course_id is required" });
    const affected = await PlannedCourses.removePlannedCourse(id);
    return res.status(200).json({ deleted: affected > 0 });
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete planned course" });
  }
};

// PUT /api/pos/plan/course/:id
// body: { planned_term, term_year }
module.exports.updatePOS_PlannedCourseTermYear = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { planned_term, term_year } = req.body || {};

    if (!id) {
      return res.status(400).json({ message: "planned_course_id is required" });
    }
    if (!planned_term || term_year == null) {
      return res.status(400).json({ message: "planned_term and term_year are required" });
    }

    const affected = await PlannedCourses.updateTermYear(
      id,
      Number(planned_term),
      Number(term_year)
    );

    if (!affected) {
      return res.status(404).json({ message: "Planned course not found" });
    }

    return res.status(200).json({ updated: true });
  } catch (err) {
    const msg = err?.sqlMessage || err?.message || "Failed to update planned course";
    return res.status(500).json({ message: msg });
  }
};



/* 
* -----------------------------------------------------------------------------------
* -                                                                                 -
* -                                 * HISTORY *                                     -
* -                                                                                 -
* -----------------------------------------------------------------------------------
*/

// GET /api/pos/plan/history?pid=<pid>&pos_id=<id>
module.exports.getPOS_History = async (req, res) => {
  try {
    const pos_id = await resolvePosIdOrThrow({
      pos_id: req.query.pos_id != null ? Number(req.query.pos_id) : null,
      pid: req.query.pid,
      pos_type: req.query.pos_type != null ? Number(req.query.pos_type) : null,
    });
    const rows = await History.listHistoryByPlan(pos_id);
    return res.status(200).json({ history: rows.map(r => r.toJSON ? r.toJSON() : r) });
  } catch (err) {
    const code = err.status || 500;
    return res.status(code).json({ message: err.message || "Failed to fetch history by POS ID." });
  }
};

// POST /api/pos/plan/history/comment
module.exports.addPOS_Comment = async (req, res) => {
  try {
    const user = getCurrentUser(res);
    const { pid, pos_type, note } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ message: "Comment cannot be empty." });
    }

    const plan = await POSPlan.getPlanyPidAndType(pid, pos_type);
    if (!plan) {
      return res.status(404).json({ message: "POS Plan not found" });
    }

    let changedBy;
    if (user.permissions === 0) {
      // Student
      const student = await Student.getStudentByPID(user.pid);
      changedBy = student 
        ? `${student.first || ""} ${student.last || ""}`.trim() 
        : String(user.pid);
    } else {
      // Faculty
      const faculty = await Faculty.getFacultyByPID(user.pid);
      changedBy = faculty 
        ? `${faculty.first || ""} ${faculty.last || ""}`.trim() 
        : String(user.pid);
    }

    await History.addHistory({
      plan_of_study: plan.pos_id,
      history_status: plan.current_status,
      note: note.trim(),
      changed_by: changedBy,
    });

    return res.status(201).json({ message: "Comment added." });
  } catch (err) {
    console.error("addPOS_Comment:", err);
    return res.status(500).json({ message: "Failed to add comment." });
  }
};

// POST /api/pos/plan/update-status
module.exports.updatePOS_Status = async (req, res) => {
  try {
    const user = getCurrentUser(res);
    const { pid, pos_type, new_status, note } = req.body;

    const plan = await POSPlan.getPlanyPidAndType(pid, pos_type);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    let changedBy;
    if (user.permissions === 0) {
      // Student
      const student = await Student.getStudentByPID(user.pid);
      changedBy = student 
        ? `${student.first || ""} ${student.last || ""}`.trim() 
        : String(user.pid);
    } else {
      // Faculty
      const faculty = await Faculty.getFacultyByPID(user.pid);
      changedBy = faculty 
        ? `${faculty.first || ""} ${faculty.last || ""}`.trim() 
        : String(user.pid);
    }

    const oldStatus = plan.status_id;

    //Update status
    await POSPlan.setCurrentStatusByPidAndType(pid, pos_type, new_status);

    //Add history entry
    await History.addHistory({
      plan_of_study: plan.pos_id,
      history_status: new_status,
      note: note || "",        // optional comment
      changed_by: changedBy,
    });

    // Email notifications are now handled by cronjob (pos-emailer.py)
    Log.info(`POS status updated to ${new_status}. Emails will be sent by cronjob.`, user?.pid);

    return res.status(200).json({ message: "Status updated" });
  } catch (err) {
    console.error("updatePOS_Status", err);
    return res.status(500).json({ message: "Failed to update status" });
  }
};

/* 
* -----------------------------------------------------------------------------------
* -                                                                                 -
* -                           * TRANSFER COURSES *                                  -
* -                                                                                 -
* -----------------------------------------------------------------------------------
*/


// GET /api/pos/plan/transfers?pid=<pid>&pos_type=<1|2> OR ?pos_id=<id>
module.exports.getPOS_Transfers = async (req, res) => {
  try {
    const pos_id = await resolvePosIdOrThrow({
      pos_id: req.query.pos_id != null ? Number(req.query.pos_id) : null,
      pid: req.query.pid,
      pos_type: req.query.pos_type != null ? Number(req.query.pos_type) : null,
    });
    const rows = await Transfers.listTransfersByPlan(pos_id);
    return res.status(200).json({ transfers: rows.map(r => r.toJSON ? r.toJSON() : r) });
  } catch (err) {
    const code = err.status || 500;
    return res.status(code).json({ message: err.message || "Failed to fetch transfer courses" });
  }
};

// PUT /api/pos/plan/transfers
// body: { pos_id? OR pid+pos_type, rows: [ { description, credit_hours, grade }, ... ] }
module.exports.replacePOS_Transfers = async (req, res) => {
  try {
    const body = req.body || {};
    const pos_id = await resolvePosIdOrThrow({
      pos_id: body.pos_id != null ? Number(body.pos_id) : null,
      pid: body.pid,
      pos_type: body.pos_type != null ? Number(body.pos_type) : null,
    });

    if (!Array.isArray(body.rows)) {
      return res.status(400).json({ message: "rows (array) is required" });
    }

    const result = await Transfers.replaceAllTransfers(pos_id, body.rows);
    return res.status(200).json({ transfers: result.map(r => r.toJSON ? r.toJSON() : r) });
  } catch (err) {
    const msg = err?.sqlMessage || err?.message || "Failed to save transfer courses";
    const isUser = /required|non-negative|plan of study not found|grade must/i.test(msg);
    console.error("replacePOS_Transfers error:", { code: err?.code, msg });
    return res.status(isUser ? 400 : 500).json({ message: msg });
  }
};

// POST /api/pos/plan/transfer
// body: { pos_id? OR pid+pos_type, description, credit_hours, grade }
module.exports.addPOS_Transfer = async (req, res) => {
  try {
    const body = req.body || {};
    const pos_id = await resolvePosIdOrThrow({
      pos_id: body.pos_id != null ? Number(body.pos_id) : null,
      pid: body.pid,
      pos_type: body.pos_type != null ? Number(body.pos_type) : null,
    });

    const created = await Transfers.addTransfer({
      plan_of_study: pos_id,
      description: body.description,
      credit_hours: body.credit_hours,
      grade: body.grade,
    });

    return res.status(201).json({ transfer: created.toJSON ? created.toJSON() : created });
  } catch (err) {
    const msg = err?.sqlMessage || err?.message || "Failed to add transfer course";
    const isUser = /required|non-negative|grade must|invalid/i.test(msg);
    return res.status(isUser ? 400 : 500).json({ message: msg });
  }
};

// DELETE /api/pos/plan/transfer/:id
module.exports.deletePOS_Transfer = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "transfer_id is required" });
    await Transfers.removeTransfer(id);
    return res.status(200).json({ deleted: true });
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete transfer course" });
  }
};


/* 
* -----------------------------------------------------------------------------------
* -                                                                                 -
* -                           * IGNORED COURSES *                                  -
* -                                                                                 -
* -----------------------------------------------------------------------------------
*/


// GET /api/pos/plan/ignored-courses?pid=&pos_type=
module.exports.getPOS_IgnoredCourses = async (req, res) => {
  try {
    const userPid = getCurrentUser(res)?.pid;
    const pid = req.query.pid || userPid;
    const pos_type = req.query.pos_type != null ? Number(req.query.pos_type) : null;
    if (!pid || pos_type == null) {
      return res.status(400).json({ message: "pid and pos_type are required" });
    }

    const rows = await IgnoredCourses.listIgnoredByPidAndType(pid, pos_type);
    return res.status(200).json({ ignored: rows });
  } catch (err) {
    console.error("getPOS_IgnoredCourses:", err);
    return res.status(500).json({ message: "Failed to fetch ignored courses" });
  }
};

// POST /api/pos/plan/ignored-course
// body: { pid?, pos_type, course_code, planned_term, term_year }
module.exports.addPOS_IgnoredCourse = async (req, res) => {
  try {
    const userPid = getCurrentUser(res)?.pid;
    const body = req.body || {};
    const pid = body.pid || userPid;
    const pos_type = body.pos_type != null ? Number(body.pos_type) : null;
    const course_code = String(body.course_code || "").trim();
    const planned_term = Number(body.planned_term);
    const term_year = Number(body.term_year);

    if (!pid || pos_type == null || !course_code || !planned_term || !Number.isInteger(term_year)) {
      return res.status(400).json({ message: "pid, pos_type, course_code, planned_term, term_year are required" });
    }

    await IgnoredCourses.addIgnoredCourse({
      pid,
      pos_type,
      course_code,
      planned_term,
      term_year,
    });

    return res.status(201).json({ ignored: true });
  } catch (err) {
    console.error("addPOS_IgnoredCourse:", err);
    return res.status(500).json({ message: "Failed to ignore course" });
  }
};



/* 
* -----------------------------------------------------------------------------------
* -                                                                                 -
* -                              * COMMITTEE *                                      -
* -                                                                                 -
* -----------------------------------------------------------------------------------
*/

// PUT /api/pos/plan/committee-members
module.exports.replacePOS_CommitteeMembers = async (req, res) => {
  const userPid = getCurrentUser(res)?.pid;
  try {
    const body = req.body || {};
    const pos_id = await resolvePosIdOrThrow({
      pos_id: body.pos_id != null ? Number(body.pos_id) : null,
      pid: body.pid,
      pos_type: body.pos_type != null ? Number(body.pos_type) : null,
    });

    // Allow members to be omitted => []
    const list = Array.isArray(body.members) ? body.members : [];

    // Validate: each provided row must have all fields
    const toAdd = [];
    for (const [i, m] of list.entries()) {
      const first = (m?.first || "").trim();
      const last  = (m?.last || "").trim();
      const department = (m?.department || "").trim();
      const role  = (m?.role || "").trim();
      const institution = (m?.institution || "").trim();

      const any = first || last || department || role || institution;
      if (!any) {
        // ignore fully-blank rows 
        continue;
      }

      const missing = [];
      if (!first) missing.push("first");
      if (!last) missing.push("last");
      if (!department) missing.push("department");
      if (!role) missing.push("role");
      if (!institution) missing.push("institution");
      if (missing.length) {
        return res.status(400).json({ message: `Member #${i+1} missing: ${missing.join(", ")}` });
      }

      toAdd.push({ first, last, department, role, institution });
    }

    // Hard replace: delete then insert fresh
    await Committee.deleteCommitteeByPOS(pos_id);
    const student_id = body.pid;
    for (const m of toAdd) {
      await Committee.addCommitteeMember({ student_id, pos_id, ...m });
    }

    const latest = await Committee.listCommitteeByPOS(pos_id);
    Log.info(`replacePOS_CommitteeMembers pos_id=${pos_id} replaced=${toAdd.length}`, userPid);
    return res.status(200).json({ replaced: true, committee: latest.map(x => x.toJSON ? x.toJSON() : x) });
  } catch (err) {
    const msg = err?.sqlMessage || err?.message || "Failed to replace committee members";
    const low = msg.toLowerCase();
    const isUser =
      low.includes("required") ||
      low.includes("missing");
    console.error("replacePOS_CommitteeMembers error:", { code: err?.code, msg });
    return res.status(isUser ? 400 : 500).json({ message: msg });
  }
};

// GET /api/pos/plan/committee-members?pid=&pos_type=
module.exports.getPOS_CommitteeMembers = async (req, res) => {
  try {
    const pos_id = await resolvePosIdOrThrow({
      pos_id: req.query.pos_id != null ? Number(req.query.pos_id) : null,
      pid: req.query.pid,
      pos_type: req.query.pos_type != null ? Number(req.query.pos_type) : null,
    });
    const list = await Committee.listCommitteeByPOS(pos_id);
    return res.status(200).json({ committee: list.map(m => m.toJSON ? m.toJSON() : m) });
  } catch (err) {
    const code = err.status || 500;
    return res.status(code).json({ message: err.message || "Failed to fetch committee members" });
  }
};


/* 
* -----------------------------------------------------------------------------------
* -                                                                                 -
* -                         * STUDENT TRANSCRIPT *                                      -
* -                                                                                 -
* -----------------------------------------------------------------------------------
*/

// GET /api/pos/transcripts?pid=<optional>
module.exports.getPOS_TranscriptsForStudent = async (req, res) => {
  try {
    const user = getCurrentUser(res);
    const sessionPid = user?.pid;
    const permissions = user?.permissions || 0;

    if (!sessionPid) return res.status(200).json({ transcripts: [] });

    // If caller supplies pid, only allow if faculty/GC (permissions != 0)
    const requestedPid = req.query.pid;
    const pidToUse =
      requestedPid && permissions !== 0
        ? String(requestedPid)
        : sessionPid;

    const student = await Student.getPOSStudentByPID(pidToUse);
    if (!student) return res.status(200).json({ transcripts: [] });

    const lastFirst = `${String(student.last || "").trim()}, ${String(student.first || "").trim()}`;

    const rows = await Transcripts.listTranscriptsByLastFirstName(lastFirst);

    const transcripts = rows.map(r => ({
      student_id: r.student_id,
      name: r.name,
      subj_expanded: r.subj_expanded,
      crse_numb: r.crse_numb,
      term_taken: Number(r.term_taken),
      credit_hours: Number(r.credit_hours),
      grade: (r.grade || "").toUpperCase().trim(),
      created_at: r.created_at || null,
    }));

    return res.status(200).json({ transcripts });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to fetch transcripts" });
  }
};


/* 
* -----------------------------------------------------------------------------------
* -                                                                                 -
* -                         * STUDENT LOOKUP *                                      -
* -                                                                                 -
* -----------------------------------------------------------------------------------
*/

// GET /api/pos/pending

module.exports.getPendingPOS = async (req, res) => {
  const user = getCurrentUser(res);
  const pid = user?.pid;
  const permissions = user?.permissions || 0;

  try {
    let filter = {};
    let statusFilter = [];
    let committeeChairFilter = null;

    // Permission Bit Fields (see User class)
    // Grad admin / Grad Coordinator
    const isGradAdmin = permissions >= 8;
    const isCommitteeChair = permissions === 1 || permissions === 2 ;

    if (!isGradAdmin && !isCommitteeChair) {
      return res.status(403).json({ message: "Not authorized to view this page." });
    }

    if (isGradAdmin && !isCommitteeChair) {
      // Grad admin only
      statusFilter = [2, 4, 5, 6, 99];
    } else if (!isGradAdmin && isCommitteeChair) {
      // Chair only
      statusFilter = [3, 6, 99]; 
      committeeChairFilter = pid;
    } else if (isGradAdmin && isCommitteeChair) {
      // Both roles
      statusFilter = [2, 3, 4, 5, 6, 99];
      committeeChairFilter = pid;
    }

    filter.current_status = statusFilter;

    if (committeeChairFilter) {
      filter.committee_chair = {
        pid: committeeChairFilter,
        status: 3,
      };
    }

    const pendingPlans = await POSPlan.listPlansByFacultyAndStatusWithLabels(
      filter,
      ['pos_id'],
      'DESC'
    );

    console.log(`getPendingPOS: found ${pendingPlans.length} results for user ${pid}`);
    return res.status(200).json({ pending: pendingPlans });
  } catch (err) {
    Log.error(`getPendingPOS error: ${err}`, pid);
    return res.status(500).json({ message: "Failed to fetch pending plans" });
  }
};