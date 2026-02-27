import { useState } from "react";
import axios from "axios";
import FileInput from "../../HelperComponents/FileInput";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import "../../../css/Submissions.scss";

const fileTypes = ["XLSX"];

export default function Transcripts() {
  return (
    <div className="submissions-container">
      <div className="page-body">
        <h1>Plan of Study Transcripts</h1>
        <div className="submissions-split">
          <TranscriptImport />
        </div>
        <TranscriptDocs />
      </div>
    </div>
  );
}

function TranscriptImport() {
  const [ptd, setPtd] = useState(null);
  const [loading, setLoading] = useState(false);
  const [severity, setSeverity] = useState("info");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

  const show = (m, s = "info") => { setMsg(m); setSeverity(s); setOpen(true); };

  const accept = (setter) => (files) => {
    if (files?.length) {
      const f = files[0];
      const ext = f.name.split(".").pop().toUpperCase();
      if (!fileTypes.includes(ext)) return show("File uploaded was not XLSX!", "error");
      setter(f);
    } else {
      setter(null);
      show("No file selected", "error");
    }
  };

  const onSizeError = (f) => show(`File size error for ${f.name}.`, "error");
  const onTypeError = () => show("Invalid file type. Please upload an .xlsx (Excel) file.", "error");

  const handleUpload = async () => {
    if (!ptd) return show("Please upload a Progress Towards Degree file.", "error");

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("files", ptd ?? {});
      await axios.post("/api/pos_transcripts", fd);
      show("Processed Transcripts!", "success");
      setPtd(null);
    } catch (err) {
      const errorMessage = err?.response?.data?.message;
      if (errorMessage?.includes("Not XLSX"))
        show("File uploaded was not XLSX.", "error");
      else show("Error while processing the file.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Snackbar open={open} autoHideDuration={8000} onClose={() => setOpen(false)}>
        <Alert onClose={() => setOpen(false)} severity={severity} sx={{ width: "100%" }}>
          {msg}
        </Alert>
      </Snackbar>

      <h2>Import</h2>

      <h3>Progress Towards Degree:</h3>
      <div className="file-uploader">
        <FileInput
          file={ptd}
          fileTypes={fileTypes}
          handleChange={accept(setPtd)}
          errorMsg={msg}
          onSizeError={onSizeError}
          onTypeError={onTypeError}
          clearFile={() => setPtd(null)}
        />
      </div>

      <button className="form-btn" onClick={handleUpload} disabled={loading || !ptd}>
        {loading ? (<><div className="spinner-border" role="status"></div> Processing, please wait...</>) : "Click to Upload"}
      </button>
    </div>
  );
}

function TranscriptDocs() {
  return (
    <div className="submission-docs">
            <h2>Import File Formats</h2>
            <p>
                This tool requires the import of one <strong>.xlsx</strong> 
                file that you import must be of specific formats.
                <blockquote>
                    The file that comes directly from the Progress Toward Degree
                    tool should work fine.
                </blockquote>
            </p>
            <h4>
                Progress Towards Degree File
            </h4>
            <p>
                All information to be included in the submission should be
                stored in the first tab of the spreadsheet. Each row, except for
                the first, represents a course a student has taken during a
                semester. The first row is a header that describes the
                information stored in its column. While cells may be blank, the
                import must have the following headers at a minimum:
            </p>
            <ul>
                <li><strong>ID</strong>: The 90* ID number of the student taking the course in the row.</li>
                <li><strong>name</strong>: The name of the student.</li>
                <li><strong>admit_term</strong>: The semester the student was admitted. It is represented as a number formed with the year and the month of the semester (i.e. Fall 2022 is 202209, Spring 2023 is 202301, etc.)</li>
                <li><strong>advisor_last_name</strong>: The last name of the student's advisor.</li>
                <li><strong>standing_message</strong>: The standing message for the student's current semester.</li>
                <li><strong>conc</strong>: The concentration (focus) of the student within CS. If left blank, defaults to "CS".</li>
                <li><strong>overall_hrs_attempted</strong>: The total number of hours attempted by the student.</li>
                <li><strong>overall_gpa</strong>: The overall GPA of the student.</li>
                <li><strong>transfer_hrs_earned</strong>: The total number of transfer hours earned by the student.</li>
                <li><strong>subj_expanded</strong>: The subject of the course in this row (CS, MATH, etc.).</li>
                <li><strong>crse_numb</strong>: The course number of the course in this row.</li>
                <li><strong>term_taken</strong>: The course number of the course in this row.</li>
                <li><strong>credit_hours</strong>: The number of credit hours the course counts for.</li>
                <li><strong>grade</strong>: The grade earned by the student for this course in that semester.</li>
            </ul>
            <p>
                Upon uploading the file, students transcripts will be compared with their plan of study to find any discrepancies.
            </p>
            <p>
                <strong>A NEW FILE NEEDS TO BE UPLOADED EVERY SEMESTER FOR TRANSCRIPTS TO STAY UP TO DATE.</strong>
            </p>
        </div>
  );
}