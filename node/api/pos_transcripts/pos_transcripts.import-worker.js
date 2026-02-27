const fs = require("fs");
const Log = require("../../database/utils/Log");
const { DB, tableNames } = require("../../database/handler");
const { readCourseExcelFile } = require("../../parser/spreadsheet");
const { uploadPOS_TranscriptsRows, clearPOS_Transcripts } = require("../../database/utils/POS_Transcripts");

/**
 * This is a worker that orchestrates the process of file submission and
 * student transcript processing
 */

module.exports.worker = async (info) => {
    const ptdFile = info.ptdFile;     // required
    const currentUserPID = info.details.initiatingUser;

    try {
    const ok = await DB.init();
    if (!ok) throw new Error("Could not connect to the database from the worker thread");

    Log.info("POS_Transcripts import: Connected to the database.", currentUserPID);
    Log.info("POS_Transcripts import: Reading PTD Excel file...", currentUserPID);

    // readCourseExcelFile returns: { studentId: { name, courses:[{subjExpanded, courseNumber, termTaken, creditHours, grade}, ...] }, ... }
    const studentsById = readCourseExcelFile(ptdFile.path);

    const rows = [];
    for (const [studentId, student] of Object.entries(studentsById)) {
    const studentName = student.name;
    for (const c of student.courses) {
        rows.push({
            student_id:     String(studentId),
            name:            studentName,
            subj_expanded:   c.subjExpanded,
            crse_numb:       String(c.courseNumber),
            term_taken:      c.termTaken,
            credit_hours:    c.creditHours,
            grade:           c.grade,
        });
    }
}

    Log.info(`POS_Transcripts import: Clearing ${tableNames.posTranscripts}...`, currentUserPID);
    await clearPOS_Transcripts();

    Log.info(`POS_Transcripts import: Inserting ${rows.length} rows...`, currentUserPID);
    if (rows.length) await uploadPOS_TranscriptsRows(rows);

    Log.info("POS_Transcripts import: Done.", currentUserPID);
    } catch (err) {
    Log.error("POS_Transcripts import: Error:", currentUserPID, err);
    return Promise.reject(err);
    } finally {
        if (ptdFile?.path) {
            fs.unlink(ptdFile.path, () => {});
            Log.info(`POS_Transcripts import: Deleted temp file '${ptdFile.path}'`, currentUserPID);
        }
    }
    return Promise.resolve();
};
