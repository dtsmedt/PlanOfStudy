import React, { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import axios from "axios";
import "../../../css/POS_ViewStudentPOSPage.css";
import HistoryModal from "./HistoryModal";

export default function ViewStudentPOSPage() {
  const { pos_id } = useParams();
  const location = useLocation();
  const { pid, pos_type, pos_type_label, committee_chair, committee_chair_name} 
  = location.state || {}; // from navigate(..., { state })

  const [sessionUser, setSessionUser] = useState(null);

  const [plan, setPlan] = useState(null);
  const [courses, setCourses] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [student, setStudent] = useState(null);
  const [committee, setCommittee] = useState([]);

  const [history, setHistory] = useState([]);
  const [newComment, setNewComment] = useState("");

  const [transcripts, setTranscripts] = useState([]);

  //Fetch plan
  useEffect(() => {
    const fetchPlan = async () => {
      const { data } = await axios.get("/api/pos/plan", {
        params: { pid, pos_type }
      });
      setPlan(data.plan);
    };
    fetchPlan();
  }, [pid, pos_type]);
  const isRejected = plan?.current_status === 99;

  //Set session user 
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const { data } = await axios.get("/api/pos/session/me");
        setSessionUser(data);
      } catch (err) {
        console.error("Failed to fetch session user:", err);
      }
    };
    fetchSession();
  }, []);

  // -------------------------
  // BOOLEAN FLAGS
  // -------------------------
  const isGradCoordinator = sessionUser && (sessionUser.permissions & 8) === 8;
  const isCommitteeChair = sessionUser && committee_chair && sessionUser.pid === committee_chair;
  const isBoth = isGradCoordinator && isCommitteeChair;

  const updateStatus = async (statusId, comment = "") => {
    if (!pos_id) return;

    if (isRejected) {
      alert("This POS has already been rejected. No further updates allowed.");
      return;
    }

    if (!comment.trim() && statusId === 99) {
      alert("Please write a comment before rejecting.");
      return;
    }
    try {
      await axios.post("/api/pos/plan/update-status", {
        pid: pid,
        pos_type: pos_type,
        new_status: statusId,
        note: comment,
      });
      setNewComment("");

      // reload history and plan info
      const { data: planData } = await axios.get("/api/pos/plan", {
        params: { pid, pos_type }
      });
      setPlan(planData.plan);

      const { data: historyData } = await axios.get("/api/pos/plan/history", { params: { pid, pos_id } });
      setHistory(historyData.history || []);
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  // Fetch planned courses
  useEffect(() => {
    const fetchCourses = async () => {
      if (!pid || !pos_type) {
        console.error("Missing PID or POS type in route state.");
        return;
      }
      try {
        const { data } = await axios.get(`/api/pos/plan/courses`, {
          params: { pid, pos_type },
        });
        setCourses(data.planned_courses || []);
      } catch (err) {
        console.error("Failed to fetch planned courses:", err);
      }
    };
    fetchCourses();
  }, [pid, pos_type]);

  // Fetch committee members
  useEffect(() => {
    const fetchCommittee = async () => {
      if (!pid || !pos_type) return;
      try {
        const { data } = await axios.get(`/api/pos/plan/committee-members`, {
          params: { pid, pos_type }
        });
        setCommittee(data.committee || []);
      } catch (err) {
        console.error("Failed to fetch committee:", err);
 
      }
    };
    fetchCommittee();
  }, [pid, pos_type]);

  //Fetch transfer courses
  useEffect(() => {
    const fetchTransfers = async () => {
      if (!pid || !pos_type) return;
      try {
        const { data } = await axios.get(`/api/pos/plan/transfers`, {
          params: { pid, pos_type },
        });
        setTransfers(data.transfers || []);
      } catch (err) {
        console.error("Failed to fetch transfer courses:", err);
      }
    };
    fetchTransfers();
  }, [pid, pos_type]);

  //Fetch student first and last name
  useEffect(() => {
    const fetchStudent = async () => {
      if (!pid) return;
      try {
        const { data } = await axios.get(`/api/pos/students`);
        const s = data.students.find((st) => st.pid === pid);
        setStudent(s || null);
      } catch (err) {
        console.error("Error fetching student info:", err);
      }
    };
    fetchStudent();
  }, [pid]);

  // Fetch transcripts to get student_id for view-plan-details
  useEffect(() => {
    const loadTranscripts = async () => {
      try {
        const { data } = await axios.get("/api/pos/transcripts", {
          params: { pid }
        });
        setTranscripts(data.transcripts || []);
      } catch (err) {
        console.error("Transcript load error:", err?.response?.data || err?.message || err);
        setTranscripts([]);
      }
    };

    if (pid) loadTranscripts();
  }, [pid]);

  //Fetch POS History
  useEffect(() => {
    async function fetchHistory() {
      const { data } = await axios.get("/api/pos/plan/history", {
        params: { pid, pos_id }
      });
      setHistory(data.history || []);
    }
    fetchHistory();
  }, [pid, pos_id]);

  // Group planned courses by term + year
  const groupedCourses = (() => {
    if (!courses || courses.length === 0) return [];

    const map = new Map();

    courses.forEach((c) => {
      const termLabel = c.term_label || "Term";
      const termYear = c.term_year || "";
      const key = `${termLabel}-${termYear}`;

      if (!map.has(key)) {
        map.set(key, {
          termLabel,
          termYear,
          rows: [],
        });
      }
      map.get(key).rows.push(c);
    });

    const termRank = (label) => {
      const s = String(label || "").toLowerCase();
      if (s.startsWith("winter")) return 0;
      if (s.startsWith("spring")) return 1;
      if (s.startsWith("summer")) return 2;
      if (s.startsWith("fall")) return 3;
      return 99;
    };

    return Array.from(map.values()).sort((a, b) => {
      const ay = Number(a.termYear) || 0;
      const by = Number(b.termYear) || 0;
      if (ay !== by) return ay - by;
      return termRank(a.termLabel) - termRank(b.termLabel);
    });
  })();

  if (!pid || !pos_type) {
    return <p>Error: Missing plan info.</p>;
  }

  return (
    <div className="view-pos-page">
      <header className="view-pos-header">
        <h1 className="view-pos-title">Graduate Plan of Study Review</h1>

        <div className="view-plan-summary">
          <p>
            This page allows you, as CS faculty or graduate staff, to review a student's
            Graduate Plan of Study. You can:
          </p>
          <ul>
            <li>Review planned courses by term and year.</li>
            <li>Review any transfer credits applied to the plan.</li>
            <li>View the CS Faculty Committee Chair/Co-Chair and committee members.</li>
            <li>Add notes, update status, and review submission history.</li>
            <li>If rejecting a plan, notes explaining the reason are required.</li>
          </ul>
        </div>

        <div className="view-plan-details">
          <p><strong>PID:</strong> {pid}</p>
          <p>
            <strong>90 Number:</strong>{" "}
            {transcripts.length > 0 ? transcripts[0].student_id : "-"}
          </p>
          <p>
            <strong>Student Name:</strong>{" "}
            {student ? `${student.first} ${student.last}` : "-"}
          </p>
          <p><strong>Degree Type:</strong> {pos_type_label || pos_type}</p>
          <p>
            <strong>CS Faculty Committee Chair/Co-Chair:</strong>{" "}
            {committee_chair_name || committee_chair || "-"}
          </p>
        </div>
      </header>

      <div className="view-section-header">
        <h2 className="view-section-title">
          {student ? `${student.first}'s Planned Courses` : "Planned Courses"}
        </h2>
        <HistoryModal
          degreeType={pos_type_label || pos_type}
          pidOverride={pid}
          posTypeOverride={pos_type}
        />
      </div>

      {courses.length === 0 ? (
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Area</th>
              <th>Course</th>
              <th>Credits</th>
              <th>Planned Term</th>
              <th>Year</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan="5" className="view-table-empty">No courses found</td></tr>
          </tbody>
        </table>
      ) : (
        groupedCourses.map((group) => (
          <div key={`${group.termLabel}-${group.termYear}`} className="term-group table-wrap">
            <div className="term-group-header">
              <h2>
                {group.termLabel} {group.termYear}
              </h2>
            </div>
            <table className="table table-striped">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Course</th>
                  <th>Credits</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((c) => (
                  <tr key={c.planned_course_id}>
                    <td>{c.area_label}</td>
                    <td>{`${c.subject_code} ${c.course_number} - ${c.course_title}`}</td>
                    <td>{c.credit_hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      <h3 className="view-transfer-title">Transfer Courses</h3>
      <table className="table table-striped">
        <thead>
          <tr>
            <th>Description</th>
            <th>Credit Hours</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>
          {transfers.length === 0 ? (
            <tr><td colSpan="3" className="view-table-empty">No transfer courses</td></tr>
          ) : (
            transfers.map((t) => (
              <tr key={t.transfer_id}>
                <td>{t.description}</td>
                <td>{t.credit_hours}</td>
                <td>{t.grade}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* committee member table */}
      <section className="view-committee-summary">
        <h2 className="view-committee-members-title">Committee Members</h2>
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Name</th>
              <th>Department</th>
              <th>Role</th>
              <th>Institution</th>
            </tr>
          </thead>
          <tbody>
            {committee.length === 0 ? (
              <tr>
                <td colSpan="4" className="view-table-empty">
                  No other committee members assigned
                </td>
              </tr>
            ) : (
              committee.map((m) => (
                <tr key={m.approval_id}>
                  <td>{m.first} {m.last}</td>
                  <td>{m.department || "-"}</td>
                  <td>{m.role || "-"}</td>
                  <td>{m.institution || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      
      {plan?.current_status != 6 && !isRejected && (
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="These notes will be viewable to students."
          className="form-control view-comment-box"
        ></textarea>
      )}

      <div className="view-status-section">
        {isRejected ? (
          <p className="view-status-note">
            This plan has been rejected. No further changes can be made until the student resubmits.
          </p>
        ) : (
          <>
            {isGradCoordinator && !isBoth && (
              <div className="view-status-buttons">
                {plan?.current_status === 2 && ( //Pending Grad Coordinator
                  <>
                    <button className="btn btn-primary view-status-button" onClick={() => updateStatus(3, newComment)} >
                      Approve as Grad Coordinator
                    </button>
                    <button className="btn btn-danger view-status-button" onClick={() => updateStatus(99, newComment)} >
                      Reject
                    </button>
                  </>
                )}

                {plan?.current_status === 3 && ( //Pending Committee Chair
                  <p className="view-status-note">
                    Waiting on Committee Chair approval.
                  </p>
                )}

                {plan?.current_status === 4 && ( //Awaiting Key
                  <>
                    <button className="btn btn-secondary view-status-button" onClick={() => updateStatus(5, newComment)} >
                      POS Keyed
                    </button>
                    <button className="btn btn-danger view-status-button" onClick={() => updateStatus(99, newComment)} >
                      Reject
                    </button>
                  </>
                )}

                {plan?.current_status === 5 && ( //Pending Grad School Approval
                  <>
                    <button className="btn btn-success view-status-button" onClick={() => updateStatus(6, newComment)} >
                      Final Approval (Grad School)
                    </button>
                    <button className="btn btn-danger view-status-button" onClick={() => updateStatus(99, newComment)} >
                      Reject
                    </button>
                  </>
                )}

                {plan?.current_status === 6 && ( //Approved
                  <p className="view-status-note">
                      This plan has been approved.
                  </p>
                )}
              </div>
            )}

            {isCommitteeChair && !isBoth && (
              <div className="view-status-buttons">
                {plan?.current_status === 3 && ( //Pending Committee Chair
                  <>
                    <button className="btn btn-success view-status-button" onClick={() => updateStatus(4, newComment)} >
                      Approve as Committee Chair
                    </button>
                    <button className="btn btn-danger view-status-button" onClick={() => updateStatus(99, newComment)} >
                      Reject
                    </button>
                  </>
                )}
                {plan?.current_status > 3 && !isRejected && (
                  <p className="view-status-note">
                    You have approved this plan. Please refer to the history for updates on this plan by the graduate coordinator.
                  </p>
                )}
              </div>
            )}

            {isBoth && (
              <div className="view-status-buttons">
                {plan?.current_status === 2 && ( //Pending Grad Coordinator
                  <>
                    <button className="btn btn-primary view-status-button" onClick={() => updateStatus(3, newComment)}
                    >
                      Approve as Grad Coordinator
                    </button>
                    <button className="btn btn-danger view-status-button" onClick={() => updateStatus(99, newComment)} >
                      Reject
                    </button>
                  </>
                )}

                {plan?.current_status === 3 && ( //Pending Committee Chair
                  <>
                    <button className="btn btn-success view-status-button" onClick={() => updateStatus(4, newComment)}
                      >
                        Approve as Committee Chair
                    </button>
                    <button className="btn btn-danger view-status-button" onClick={() => updateStatus(99, newComment)} >
                      Reject
                    </button>
                  </>
                )}

                {plan?.current_status === 4 && ( //Awaiting Key
                  <>
                    <button className="btn btn-secondary view-status-button" onClick={() => updateStatus(5, newComment)} >
                      POS Keyed
                    </button>
                    <button className="btn btn-danger view-status-button" onClick={() => updateStatus(99, newComment)} >
                      Reject
                    </button>
                  </>
                )}

                {plan?.current_status === 5 && ( //Pending Grad School
                  <>
                    <button className="btn btn-success view-status-button" onClick={() => updateStatus(6, newComment)} >
                      Final Approval (Grad School)
                    </button>
                    <button className="btn btn-danger view-status-button" onClick={() => updateStatus(99, newComment)} >
                      Reject
                    </button>
                  </>
                )}

                {plan?.current_status === 6 && ( //Approved
                  <p className="view-status-note">
                      This plan has been approved.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>   
  );
}