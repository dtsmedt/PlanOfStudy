const { DB, tableNames } = require("../handler.js");

module.exports.clearPOS_Transcripts = () => DB.clearTable(tableNames.posTranscripts);

module.exports.uploadPOS_TranscriptsRows = async (rows) => {
  // rows: [{ student_id, name, subj_expanded, crse_numb, term_taken, credit_hours, grade }]
  return DB.insertMany(tableNames.posTranscripts, rows);
};

// Fetch by "Last, First" (exact match) using (name, term_taken) index
module.exports.listTranscriptsByLastFirstName = async (lastFirst) => {
  const normalized = String(lastFirst || "").trim().replace(/\s+/g, " ");
  
  // Query all rows for that name, sorted by term 
  const sql = `
    SELECT id, student_id, name, subj_expanded, crse_numb, term_taken, credit_hours, grade, created_at
    FROM ${tableNames.posTranscripts}
    WHERE name = ?
    ORDER BY term_taken ASC, subj_expanded ASC, crse_numb ASC
  `;

  const out = await DB.query(sql, [normalized]);
  return Array.isArray(out) ? out : out?.result || [];
};