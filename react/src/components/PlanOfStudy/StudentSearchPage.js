import React, { useState,  useEffect} from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../../../css/POS_StudentPage.css";

export default function StudentSearchPlanOfStudy() {
  const [pendingPOS, setPendingPOS] = useState([]);
  const [searchPID, setSearchPID] = useState("");
  const [filteredPOS, setFilteredPOS] = useState([]);
  const [students, setStudents] = useState({});
  const [filters, setFilters] = useState({
    degreeType: "Any",
    committeeChair: "Any",
    status: "Any",
  });
  const [degreeTypes, setDegreeTypes] = useState([]);
  const [committeeChairs, setCommitteeChairs] = useState([]);
  const [chairLookup, setChairLookup] = useState({});
  const [statuses, setStatuses] = useState([]);

  const navigate = useNavigate();

  // Fetch pending POS from API
  useEffect(() => {
    const fetchPendingPOS = async () => {
      try {
        const { data } = await axios.get("/api/pos/pending"); 
        setPendingPOS(data.pending || []);
      } catch (err) {
        console.error("Failed to fetch pending POS:", err);
      }
    };
    fetchPendingPOS();
  }, []);

  //Fetch students (for first and last name)
  useEffect(() => {
  async function fetchStudents() {
    try {
      const response = await fetch("/api/pos/students");
      if (!response.ok) throw new Error("Failed to fetch students");
      const data = await response.json();

      // Convert array -> map by PID
      const studentMap = {};
      data.students.forEach((s) => {
        studentMap[s.pid] = s;
      });
      setStudents(studentMap);
    } catch (err) {
      console.error("Error fetching students:", err);
    }
  }

  fetchStudents();
  }, []);
  
  // Fetch degree types and committee chairs for filters
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [degreeRes, chairRes, statusRes] = await Promise.all([
          axios.get("/api/pos/types"),
          axios.get("/api/pos/faculty?onlyCS=1"),
          axios.get("/api/pos/statuses")
        ]);
        setDegreeTypes(degreeRes.data.types || []);
        setCommitteeChairs(chairRes.data.faculty || []);
        const lookup = {};
        (chairRes.data.faculty || []).forEach((c) => {
          lookup[c.pid] = c;
        });
        setChairLookup(lookup);

        setStatuses(statusRes.data.statuses || []);

      } catch (err) {
        console.error("Error fetching filter options:", err);
      }
    };
    fetchFilters();
  }, []);

  // Filter by PID, name, and dropdowns
  useEffect(() => {
    if (
      !searchPID &&
      filters.degreeType === "Any" &&
      filters.committeeChair === "Any" &&
      filters.status === "Any"
    ) {
      setFilteredPOS(pendingPOS);
      return;
    }

    const search = searchPID.toLowerCase().trim();
    const [firstPart, lastPart] = search.split(" ");

    const filtered = pendingPOS.filter((pos) => {
      const student = students[pos.pid] || students[pos.student_id] || {};
      const pid = pos.pid?.toLowerCase() || pos.student_id?.toLowerCase() || "";
      const first = student.first?.toLowerCase() || "";
      const last = student.last?.toLowerCase() || "";

      const matchesSearch =
        !search ||
        pid.includes(search) ||
        first.includes(search) ||
        last.includes(search) ||
        (firstPart && lastPart && first.includes(firstPart) && last.includes(lastPart));

      const matchesDegree =
        filters.degreeType === "Any" ||
        Number(pos.pos_type) === Number(filters.degreeType);
      const matchesChair =
        filters.committeeChair === "Any" ||
        String(pos.committee_chair) === String(filters.committeeChair);
      const matchesStatus =
        filters.status === "Any" ||
        Number(pos.current_status) === Number(filters.status);

      return matchesSearch && matchesDegree && matchesChair && matchesStatus;
    });

    setFilteredPOS(filtered);
  }, [searchPID, filters, pendingPOS, students]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="faculty-pending-page">
      <h1>Pending Plans of Study</h1>

      {/* Search bar */}
      <div className="search-bar">
        <label htmlFor="searchPID">Search Plan by PID or Name:</label>
        <input
          type="text"
          id="searchPID"
          value={searchPID}
          onChange={(e) => setSearchPID(e.target.value)}
          placeholder="Enter PID or First Last"
        />
      </div>

      {/* Dropdown filters */}
      <div className="filter-bar" style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <div>
          <label>Degree Type:</label>
          <select name="degreeType" value={filters.degreeType} onChange={handleFilterChange}>
            <option value="Any">Any</option>
            {degreeTypes.map((deg) => (
              <option key={deg.pos_type_id} value={deg.pos_type_id}>
                {deg.type}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Committee Chair:</label>
          <select name="committeeChair" value={filters.committeeChair} onChange={handleFilterChange}>
            <option value="Any">Any</option>
            {committeeChairs
            .slice()
            .sort((a,b) => a.first.localeCompare(b.first))
            .map((chair) => (
              <option key={chair.pid} value={chair.pid}>
                {chair.first} {chair.last} ({chair.pid})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Status:</label>
          <select name="status" value={filters.status} onChange={handleFilterChange}>
            <option value="Any">Any</option>
            {statuses.map((s) => (
              <option key={s.status_id} value={s.status_id}>
                {s.status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="table table-striped">
          <thead>
            <tr>
              <th>PID</th>
              <th>First Name</th>
              <th>Last Name</th>
              <th>Degree Type</th>
              <th>Committee Chair</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPOS.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: "center" }}>
                  No pending plans found.
                </td>
              </tr>
            ) : (
              filteredPOS.map((pos) => {
                const student = students[pos.pid] || {};
                return (
                  <tr key={pos.pos_id}>
                    <td>{pos.pid}</td>
                    <td>{student.first || "-"}</td>
                    <td>{student.last || "-"}</td>
                    <td>{pos.pos_type_label || pos.pos_type || "-"}</td>
                    <td>
                        {chairLookup[pos.committee_chair]
                        ? `${chairLookup[pos.committee_chair].first} ${chairLookup[pos.committee_chair].last} (${pos.committee_chair})`
                        : pos.committee_chair || "-"}
                    </td>
                    <td>{pos.pos_status_label || pos.current_status || "-"}</td>
                    <td>
                      <button
                        className="btn btn-primary"
                        onClick={() =>
                          navigate(`/faculty/pos/${pos.pos_id}`, {
                            state: {
                              pid: pos.pid,
                              pos_type: pos.pos_type,
                              pos_type_label: pos.pos_type_label,
                              committee_chair:pos.committee_chair,
                              committee_chair_name: chairLookup[pos.committee_chair]
                              ? `${chairLookup[pos.committee_chair].first} ${chairLookup[pos.committee_chair].last}`
                              : null,
                            },
                          })
                        }
                      >
                        View POS
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}