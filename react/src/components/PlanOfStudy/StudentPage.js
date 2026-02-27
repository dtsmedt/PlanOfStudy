import React, { useState, useMemo, useEffect, useCallback } from "react";
import axios from "axios";
import { validatePlanRequirements } from "./PlanValidation";
import RequirementsPanel from "./RequirementsPanel";
import HistoryModal from "./HistoryModal";
import { compareTranscriptToPlan, RequiredActionsModal, ensurePlan, addPlannedFromAction, removePlannedFromAction, updatePlannedTermYear, ignoreTakenFromAction } from "./CompareTranscript";
import "../../../css/POS_StudentPage.css";

export default function StudentPlanOfStudy() {
  // Track current plan status & compute read-only flag
  const [planStatus, setPlanStatus] = useState(null);
  const isReadOnly = useMemo(
    () => [2, 3, 4, 5].includes(Number(planStatus)),
    [planStatus]
  );

  // Dropdown data
  const [areas, setAreas] = useState([]);
  const [terms, setTerms] = useState([]);
  const [facultyList, setFacultyList] = useState([]);

  // Degree toggle state (MS, PhD, MSA)
  const [degreeType, setDegreeType] = useState("MS");
  // Track if PhD plan exists (needed to enable MSA button)
  const [phdPlanExists, setPhdPlanExists] = useState(false);

  // Year dropdown
  const currentYear = new Date().getFullYear();
  const YEAR_OPTIONS = useMemo(
    () => Array.from({ length: 14 }, (_, i) => currentYear - 8 + i),
    [currentYear]
  );

  // flag to stop hydrating plan info once already done
  const [readyToHydrate, setReadyToHydrate] = useState(false);

  // Required Actions (compare transcript vs plan) modal state
  const [requiredActions, setRequiredActions] = useState({ toAdd: [], toRemove: [], terms: [] });
  const [showActions, setShowActions] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!showActions) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [showActions]);

  //--------------------COMMITTEE-------------------------------------------------------

  // Committee Chair + committee
  const [committeeChair, setCommitteeChair] = useState("");
  const [committee, setCommittee] = useState([
  { first: "", last: "", dept: "", role: "", inst: "" },
  ]);
  // MSA uses same rules as MS; PhD uses 5 members
  const maxMembers = (degreeType === "MS" || degreeType === "MSA") ? 2 : 5;

  // Determine max committee members by degree type
  // Trim extra members if switching to a lower max
  useEffect(() => {
    if (committee.length > maxMembers) {
      setCommittee((prev) => prev.slice(0, maxMembers));
    }
  }, [degreeType, maxMembers, committee.length]);

  const handleCommitteeChange = (idx, field, value) => {
    // any committee edit invalidates a previous successful validation
    setCanSubmit(false);
    setCommittee((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addMember = () => {
    if (committee.length < maxMembers) {
      setCanSubmit(false);
      setCommittee((prev) => [...prev, { first: "", last: "", dept: "", role: "", inst: "" }]);
    }
  };

  const removeMember = (idx) => {
    setCanSubmit(false);
    setCommittee((prev) => prev.filter((_, i) => i !== idx));
  };

  function buildCommitteeMembersOrThrow() {
    const members = [];
    for (let i = 0; i < committee.length; i++) {
      const m = committee[i] || {};
      const first = (m.first || "").trim();
      const last  = (m.last  || "").trim();
      const dept  = (m.dept  || "").trim();
      const role  = (m.role  || "").trim();
      const inst  = (m.inst  || "").trim();

      const any = first || last || dept || role || inst;
      if (!any) continue; // ignore fully blank rows on Save

      const missing = [];
      if (!first) missing.push("first");
      if (!last)  missing.push("last");
      if (!dept)  missing.push("dept");
      if (!role)  missing.push("role");
      if (!inst)  missing.push("inst");
      if (missing.length) {
        throw new Error(`Committee member #${i + 1} is missing: ${missing.join(", ")}`);
      }

      members.push({ first, last, department: dept, role, institution: inst });
    }
    return members;
  }

  //--------------------DROPDOWN FETCHING-------------------------------------------------------

  // groups: [{ id, termId, year, rows: [{id, area, course, creditHours}] }]
  const [groups, setGroups] = useState([]);
  // per-row dynamic course list: { [rowId]: Course[] }
  const [rowCourses, setRowCourses] = useState({});
  // per-row & plan errors
  const [rowErrors, setRowErrors] = useState({});
  // Flag that becomes true when the plan has been validated and passed all checks
  const [canSubmit, setCanSubmit] = useState(false);
  // Live requirement flags shown in the left requirements panel
  const [requirementFlags, setRequirementFlags] = useState({
    // MS flags
    ethics: false,
    seminar: false,
    researchCredits: false,
    nonResearchCourseCount: false,
    nonResearchCredits: false,
    cs5or6Count: false,
    cs6Count: false,
    cognateLimit: false,
    breadth: false,
    committeeChair: false,
    committeeMembers: false,
    totalCredits: false,
    // PhD flags 
    phd_researchCredits: false,
    phd_totalCredits: false,
    phd_courseCount: false,
    phd_cs5or6Count: false,
    phd_cs6Count: false,
    phd_cognateFound: false,
  });

  // Add Term panel controls
  const [pendingTermId, setPendingTermId] = useState("");
  const [pendingYear, setPendingYear] = useState("");

  // id helper
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);

  // helper to clear plan state when switching degree so old courses don't count
  const clearPlanForDegreeSwitch = () => {
    setGroups([]);
    setRowCourses({});
    setTransferRows([]);
    setRowErrors({});
    // reset committee to a single empty row and clear chair
    setCommittee([{ first: "", last: "", dept: "", role: "", inst: "" }]);
    setCommitteeChair("");
    setCanSubmit(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const [a, t, f] = await Promise.all([
          axios.get("/api/pos/areas"),
          axios.get("/api/pos/terms"),
          axios.get("/api/pos/faculty?onlyCS=1"),
        ]);

        const areaOpts = (a.data.areas || []).map((x) => ({
          POS_Area: x.value,
          Area_Description: x.label,
        }));

        setAreas(areaOpts);
        setTerms(t.data.terms ?? []);
        setFacultyList(f.data.faculty ?? []);
      } catch (err) {
        console.error("Failed to load dropdown data", err);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // 0) Make sure dropdowns are loaded first
        if (!areas.length || !terms.length || !facultyList.length) return;

        // 1) Check if user is already a student
        const check = await axios.get("/api/pos/is-student");
        if (!check?.data?.exists) {
          // Leave the UI empty; Save will create POS_Students.
          setCommitteeChair("");
          setCommittee([{ first: "", last: "", dept: "", role: "", inst: "" }]);
          setGroups([]);
          setRowCourses({});
          setReadyToHydrate(true);
          return;
        }
        const pid = check.data.pid;

        // 2) Probe for an existing plan (prefer MS then PhD then MSA)
        const tryPlan = async (type) => {
          const { data } = await axios.get("/api/pos/plan", { params: { pid, pos_type: type } });
          return data?.plan || null;
        };
        let plan = await tryPlan(1);
        let actualType = 1;
        if (!plan) {
          const phd = await tryPlan(2);
          if (phd) { plan = phd; actualType = 2; }
        }
        if (!plan) {
          const msa = await tryPlan(3);
          if (msa) { plan = msa; actualType = 3; }
        }
        
        // Check if PhD plan exists (for MSA button enablement)
        const phdCheck = await tryPlan(2);
        setPhdPlanExists(!!phdCheck);
        
        if (plan) {
          setDegreeType(actualType === 1 ? "MS" : actualType === 2 ? "PhD" : "MSA");
        }
        setReadyToHydrate(true);
      } catch (e) {
        console.error("Boot load failed:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas.length, terms.length, facultyList.length]);


  const fetchCoursesForRow = useCallback(async (rowId, area) => {
    try {
      const params = {};
      if (area) params.area = area;
      const { data } = await axios.get("/api/pos/courses", { params });
      setRowCourses((prev) => ({ ...prev, [rowId]: data.courses ?? [] }));
    } catch (err) {
      console.error("Failed to load courses for row", rowId, err);
      setRowCourses((prev) => ({ ...prev, [rowId]: [] }));
    }
  }, []);


  const addTermGroup = () => {
    if (!pendingTermId || !pendingYear) {
      alert("Select a Term and Year, then click Add Term.");
      return;
    }
    // Prevent duplicate terms
    const exists = groups.some(g => String(g.termId) === String(pendingTermId) && Number(g.year) === Number(pendingYear));
    if (exists) {
      alert("This term and year already exists in your plan. Duplicate terms are not allowed.");
      return;
    }
    const newGroup = {
      id: uid(),
      termId: String(pendingTermId),
      year: Number(pendingYear),
      rows: [
        {
          id: uid(),
          area: "",
          course: "",
          creditHours: 0,
        },
      ],
    };
    setCanSubmit(false);
    setGroups((prev) => [...prev, newGroup]);
    fetchCoursesForRow(newGroup.rows[0].id, null);
    setPendingTermId("");
    setPendingYear("");
  };

  const removeTermGroup = (groupId) => {
    setCanSubmit(false);
    setGroups(prev => {
      const group = prev.find(g => g.id === groupId);
      setRowCourses(rcPrev => {
        const next = { ...rcPrev };
        if (group) for (const r of group.rows) delete next[r.id];
        return next;
      });
      return prev.filter(g => g.id !== groupId);
    });
  };

  const addCourseRow = (groupId) => {
    const newRow = { id: uid(), area: "", course: "", creditHours: 0 };
    setCanSubmit(false);
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, rows: [...g.rows, newRow] } : g))
    );
    fetchCoursesForRow(newRow.id, null);
  };

  const removeCourseRow = (groupId, rowId) => {
    setCanSubmit(false);
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, rows: g.rows.filter((r) => r.id !== rowId) } : g
      )
    );
    setRowCourses((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  };

  const updateRow = (groupId, rowId, patch) => {
    // any edit to a row invalidates a previous successful validation
    setCanSubmit(false);
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              rows: g.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
            }
          : g
      )
    );

    // clear field-level error for that row
    setRowErrors((prev) => {
      const entry = prev[rowId];
      if (!entry) return prev;
      const next = { ...prev };
      const updated = {
        ...entry,
        badFields: { ...(entry.badFields || {}) },
      };
      for (const k of Object.keys(patch)) delete updated.badFields[k];
      const hasAny =
        (updated.messages && updated.messages.length) ||
        (updated.badFields && Object.keys(updated.badFields).length);
      if (hasAny) next[rowId] = updated;
      else delete next[rowId];
      return next;
    });
  };

  // When Area changes for a row, reload courses
  const onAreaChange = (groupId, row, newArea) => {
    updateRow(groupId, row.id, { area: newArea, course: "", creditHours: 0 });
    fetchCoursesForRow(row.id, newArea);
  };

  // Return the selected course object for a row (or null)
  // Helper: get all planned courses (excluding current row)
  const getAllPlannedCourses = (excludeRowId = null) => {
    const planned = [];
    for (const g of groups) {
      for (const r of g.rows) {
        if (excludeRowId && r.id === excludeRowId) continue;
        if (r.course) planned.push({
          course: r.course,
          termId: g.termId,
          year: g.year,
        });
      }
    }
    return planned;
  };

  const getSelectedCourse = (row) => {
    const list = rowCourses[row.id] || [];
    return list.find((c) => String(c.course_id) === String(row.course)) || null;
  };

  // Map API planned_courses  -> { termId, year, rows[] } groups
  const buildGroupsFromPlannedCourses = useCallback((planned) => {
    const byTerm = new Map();
    for (const pc of planned) {
      const key = `${pc.planned_term}-${pc.term_year}`;
      if (!byTerm.has(key)) {
        byTerm.set(key, {
          id: uid(),
          termId: String(pc.planned_term),
          year: Number(pc.term_year),
          rows: [],
        });
      }
      const group = byTerm.get(key);
      group.rows.push({
        id: uid(),
        area: pc.area_id != null ? String(pc.area_id) : "",
        course: pc.planned_course != null ? String(pc.planned_course) : "",
        creditHours: pc.credit_hours != null ? Number(pc.credit_hours) : 0,
      });
    }
    return Array.from(byTerm.values());
  }, []);

  const hydrateForDegree = useCallback(async (posType) => {
    let pid = null;
    try {
      // check student without creating
      const check = await axios.get("/api/pos/is-student");
      if (!check?.data?.exists) {
        // If not a student yet, keep the degree tab but show an empty plan
        setCommitteeChair("");
        setCommittee([{ first: "", last: "", dept: "", role: "", inst: "" }]);
        setGroups([]);
        setRowCourses({});
        setPlanStatus(null);
        setTransferRows([]);
        return;
      }
      pid = check.data.pid;

      // read plan for the selected degree
      const { data: planRes } = await axios.get("/api/pos/plan", { params: { pid, pos_type: posType } });
      const plan = planRes?.plan || null;

      // If no plan for that degree, then clear and stop.
      if (!plan) {
        setCommitteeChair("");
        setCommittee([{ first: "", last: "", dept: "", role: "", inst: "" }]);
        setGroups([]);
        setRowCourses({});
        setPlanStatus(null);
        setTransferRows([]);
        return;
      }

      // chair
      if (plan.committee_chair) setCommitteeChair(String(plan.committee_chair));

      setPlanStatus(Number(plan.current_status));

      // planned courses
      const { data: pcRes } = await axios.get("/api/pos/plan/courses", { params: { pid, pos_type: posType } });
      const planned = pcRes?.planned_courses || [];
      const groupsFromServer = buildGroupsFromPlannedCourses(planned);
      setGroups(groupsFromServer);

      // preload per-row course lists
      setRowCourses({});
      for (const g of groupsFromServer) {
        for (const r of g.rows) {
          if (r.area) await fetchCoursesForRow(r.id, r.area);
        }
      }

      // committee members
      const { data: cmRes } = await axios.get("/api/pos/plan/committee-members", { params: { pid, pos_type: posType } });
      const list = cmRes?.committee || [];
      if (list.length) {
        setCommittee(list.map(m => ({
          first: m.first || "",
          last: m.last || "",
          dept: m.department || "",
          role: m.role || "",
          inst: m.institution || "",
        })));
      }
    } catch (e) {
      console.error("hydrateForDegree failed:", e);
    }

    // Transfer Courses
    try {
      if (!pid) return;
      const { data: trRes } = await axios.get("/api/pos/plan/transfers", { params: { pid, pos_type: posType } });
      const trs = (trRes?.transfers || []).map(t => ({
        id: uid(),
        description: t.description || "",
        creditHours: Number(t.credit_hours || 0),
        grade: (t.grade || "A").toUpperCase() === "B" ? "B" : "A",
      }));
      setTransferRows(trs);
    } catch (e) {
      console.error("hydrate transfers failed:", e);
      setTransferRows([]);
    }

  }, [fetchCoursesForRow, buildGroupsFromPlannedCourses]);

  async function finalizeRequiredActions() {
    // Close modal and hydrate the page with up-to-date plan
    const posType = degreeType === "MS" ? 1 : degreeType === "PhD" ? 2 : 3;
    setShowActions(false);
    await hydrateForDegree(posType);
  }

  useEffect(() => {
    if (!showActions) return;
    const noneLeft =
      (!requiredActions.toAdd || requiredActions.toAdd.length === 0) &&
      (!requiredActions.toRemove || requiredActions.toRemove.length === 0) &&
      (!requiredActions.toMissing || requiredActions.toMissing.length === 0);
    if (noneLeft) {
      const posType = degreeType === "MS" ? 1 : degreeType === "PhD" ? 2 : 3;
      setShowActions(false);
      // hydrate so the table reflects the up-to-date plan
      Promise.resolve().then(() => hydrateForDegree(posType));
    }
  }, [showActions, requiredActions, degreeType, hydrateForDegree]);

  useEffect(() => {
    (async () => {
      // wait for dropdowns to be ready so hydration can render correctly
      if (!readyToHydrate) return;
      if (!areas.length || !terms.length || !facultyList.length) return;
      const posType = degreeType === "MS" ? 1 : degreeType === "PhD" ? 2 : 3;
      try {
        // Ensure the student exists to get pid; if not a student, keep UI empty & hydrate will clear anyway
        const check = await axios.get("/api/pos/is-student");
        if (!check?.data?.exists) {
          hydrateForDegree(posType);
          return;
        }
        const pid = check.data.pid;
  
        // Compare transcript vs plan BEFORE hydrating UI rows
        const actions = await compareTranscriptToPlan(pid, posType);
        const hasAdds = actions.toAdd && actions.toAdd.length > 0;
        const hasRems = actions.toRemove && actions.toRemove.length > 0;
        const hasMissing = actions.toMissing && actions.toMissing.length > 0;

        if (hasAdds || hasRems || hasMissing) {
          setRequiredActions(actions);
          setShowActions(true);
          return;
        }

        // Nothing to resolve → hydrate as usual
        setRequiredActions({ toAdd: [], toRemove: [], toMissing: [], terms: actions.terms ?? [] });
        setShowActions(false);
        hydrateForDegree(posType);
      } catch (err) {
        console.error("pre-hydrate compare failed:", err);
        // Fallback to hydrate anyway
         hydrateForDegree(posType);
      }
    })();
  }, [readyToHydrate, degreeType, areas.length, terms.length, facultyList.length, hydrateForDegree]);


  // -------------------------TRANSFER CREDITS------------------------------------------
  
  const [transferRows, setTransferRows] = useState([]); // [{id, description, creditHours, grade}]

  const addTransferRow = () => {
    if (isReadOnly) return;
    setCanSubmit(false);
    setTransferRows(prev => [...prev, { id: uid(), description: "", creditHours: 0, grade: "A" }]);
  };

  const removeTransferRow = (rowId) => {
    if (isReadOnly) return;
    setCanSubmit(false);
    setTransferRows(prev => prev.filter(r => r.id !== rowId));
  };

  const updateTransferRow = (rowId, patch) => {
    if (isReadOnly) return;
    setCanSubmit(false);
    setTransferRows(prev => prev.map(r => r.id === rowId ? { ...r, ...patch } : r));
  };

  // Sum of transfer credits
  const transferCredits = useMemo(
    () => transferRows.reduce((s, r) => s + (Number(r.creditHours) || 0), 0),
    [transferRows]
  );

  // Transfer fields helper
  function collectTransferErrors() {
    const issues = [];
    transferRows.forEach((tr, idx) => {
      const label = `Transfer Row ${idx + 1}`;
      const rowMsgs = [];
      const desc = String(tr.description || "").trim();
      const ch = Number(tr.creditHours);

      if (!desc) rowMsgs.push("Course description is required.");
      if (!Number.isFinite(ch) || ch <= 0) rowMsgs.push("Credit hours must be a positive integer.");
      const g = String(tr.grade || "").toUpperCase();
      if (!["A", "B"].includes(g)) rowMsgs.push("Grade must be A or B.");

      if (rowMsgs.length) issues.push(`${label}: ${rowMsgs.join(" ")}`);
    });
    return issues;
  }

  //--------------------CREDIT HOURS AND COUNTER-------------------------------------------------------

  // helper to set course and initialize creditHours
  const onCourseChange = (groupId, row, courseId) => {
    const list = rowCourses[row.id] || [];
    const selected = list.find((c) => String(c.course_id) === String(courseId));
    const catalog = selected ? Number(selected.credits || 0) : 0;

    // Prevent duplicate courses except allowed repeats
    const planned = getAllPlannedCourses(row.id);
    const selectedCourseObj = selected;
    const subject = selectedCourseObj?.subject_code;
    const number = String(selectedCourseObj?.course_number);
    const group = groups.find(g => g.id === groupId);
    const termId = group?.termId;
    const year = group?.year;

    // Only allow CS 5944, 5994, 7994 to repeat, but not in same term
    const isRepeatable = subject === "CS" && ["5944", "5994", "7994"].includes(number);
    const alreadyInTerm = planned.some(p => p.course === courseId && p.termId === termId && p.year === year);
    if (isRepeatable && alreadyInTerm) {
      alert("This course (" + subject + " " + number + ") is already in this term. It cannot be repeated in the same term.");
      return;
    }
    if (!isRepeatable && planned.some(p => p.course === courseId)) {
      alert("This course is already in your plan. Duplicate courses are not allowed.");
      return;
    }

    updateRow(groupId, row.id, {
      course: courseId,
      creditHours: catalog > 0 ? catalog : 0,
    });
  };

  const totalCredits = useMemo(() => {
    let sum = 0;
    for (const g of groups) {
      for (const r of g.rows) {
        const selected = getSelectedCourse(r);
        const catalog = selected ? Number(selected.credits || 0) : 0;
        sum += catalog > 0 ? catalog : Number(r.creditHours || 0);
      }
    }
    return sum;
  }, [groups, rowCourses]);

  const totalWithTransfers = useMemo(() => totalCredits + transferCredits, [totalCredits, transferCredits]);

  // Use catalog credits when fixed, else user-selected creditHours
  const getEffectiveCreditHours = (row) => {
    const selected = getSelectedCourse(row);
    const catalog = selected ? Number(selected.credits || 0) : 0;
    return catalog > 0 ? catalog : Number(row.creditHours || 0);
  };


  //--------------------SAVE/VERIFY/SUBMIT-------------------------------------------------------

  // Save Button
  // Lookup student, create if not found
  // Lookup plan of study, create if not found
  // Replace all planned courses
  // Add committee chair
  // Replace all committee members
  // Save Button
  const onSave = async () => {
    if (isReadOnly) return;
    try {
      // 1) Ensure the student exists
      const ensure = await axios.post("/api/pos/ensure-student");
      const ensuredStudent = ensure?.data?.student || {};
      const pid = ensuredStudent?.pid || ensure?.data?.pid;
      if (!pid) {
        alert("Save failed: could not resolve your PID");
        return;
      }

      // 2) Create/Update plan (MS=1, PhD=2, MSA=3; chair optional)
      const pos_type = degreeType === "MS" ? 1 : degreeType === "PhD" ? 2 : 3;
      const planPayload = {
        pid,
        pos_type,
        committee_chair: committeeChair || null,
        current_status: 1, // Saved
      };
      console.log("Sending JSON (plan):", planPayload);
      await axios.post("/api/pos/plan", planPayload);

      // 3) Build planned-course rows from groups (TERM/YEAR live on the group)
      const rowsPayload = [];
      for (const g of groups) {
        for (const r of g.rows) {
          if (!r.area || !r.course) continue; // skip incomplete
          rowsPayload.push({
            planned_course: Number(r.course),
            planned_term: Number(g.termId),
            term_year: Number(g.year),
            credit_hours: Number(getEffectiveCreditHours(r)),
            course_area: Number(r.area),
          });
        }
      }

      // 4) Bulk replace planned courses — send [] to clear all when empty
      const bulkPayload = { pid, pos_type, rows: rowsPayload };
      console.log("Sending JSON (planned courses):", bulkPayload);
      await axios.put("/api/pos/plan/courses", bulkPayload);

      // 5) Replace committee members
      const members = buildCommitteeMembersOrThrow();
      await axios.put("/api/pos/plan/committee-members", { pid, pos_type, members });


      // 6) Replace Transfer Courses
      const transferIssues = collectTransferErrors();
      if (transferIssues.length) {
        alert("Please fix the following transfer entries before saving:\n" + transferIssues.join("\n"));
        return;
      }

      await axios.put("/api/pos/plan/transfers", {
        pid,
        pos_type,
        rows: transferRows.map(r => ({
          description: String(r.description || "").trim(),
          credit_hours: Number(r.creditHours || 0),
          grade: (String(r.grade || "A").toUpperCase() === "B") ? "B" : "A",
        })),
      });

      alert("Plan saved successfully.");
    } catch (err) {
      console.error("Save failed:", err);
      alert("Save failed: please fix any invalid rows and try again.");
    }
  };

  // Verify Button
  // Verify courses: dropdowns selected, degree requirements
  // Verify Committee: Faculty Selected, Minimum Committee Members per degree type
const onVerify = () => {
  if (isReadOnly) return;

  const { perRowMessages } = validatePlanRequirements({
    groups,
    terms,
    degreeType,
    transferRows,
    rowCourses,
    committee,
    committeeChair,
  });

  setRowErrors(perRowMessages);

  const keys = Object.keys(perRowMessages);
  if (keys.length) {
    const lines = [];
    for (const k of keys) {
      const entry = perRowMessages[k];
      const msgs = entry.messages || [];
      if (String(k) === "-1") {
        for (const m of msgs) lines.push(`Plan: ${m}`);
      } else {
        const display = entry.label || k;
        for (const m of msgs) lines.push(`${display}: ${m}`);
      }
    }
    alert("Please fix the following:\n" + lines.join("\n"));
    return;
  }

  alert("Plan passes all plan validation checks.");
};


  // Submit Button: available only when plan has been validated and passed
  const onSubmit = async () => {
    if (isReadOnly) return;
    try {
      if (!canSubmit) {
        alert("Your plan still has validation issues. Please fix errors in the table and requirements checklist before submitting.");
        return;
      }

      const confirmed = window.confirm("Are you sure you want to submit your plan of study? Once submitted, you will not be able to make further changes until it is reviewed.");
      if (!confirmed) return;

      // 1) Ensure the student exists
      const ensure = await axios.post("/api/pos/ensure-student");
      const ensuredStudent = ensure?.data?.student || {};
      const pid = ensuredStudent?.pid || ensure?.data?.pid;
      if (!pid) {
        alert("Submit failed: could not resolve your PID");
        return;
      }

      // 2) Determine POS type for this degree
      const pos_type =
        degreeType === "MS" ? 1 : degreeType === "PhD" ? 2 : 3;

      // 3) First save latest plan so transcript comparison uses current courses.
      const planPayloadSaved = {
        pid,
        pos_type,
        committee_chair: committeeChair || null,
        current_status: 1, // Saved
      };
      console.log("Submitting: first save plan before compare", planPayloadSaved);
      await axios.post("/api/pos/plan", planPayloadSaved);

      // 4) Build planned-course rows from the groups
      const rowsPayload = [];
      for (const g of groups) {
        for (const r of g.rows) {
          if (!r.area || !r.course) continue;
          rowsPayload.push({
            planned_course: Number(r.course),
            planned_term: Number(g.termId),
            term_year: Number(g.year),
            credit_hours: Number(getEffectiveCreditHours(r)),
            course_area: Number(r.area),
          });
        }
      }

      // Bulk replace planned courses
      const bulkPayload = { pid, pos_type, rows: rowsPayload };
      console.log("Submitting: planned courses payload", bulkPayload);
      await axios.put("/api/pos/plan/courses", bulkPayload);

      // 5) Replace committee members
      const members = buildCommitteeMembersOrThrow();
      await axios.put("/api/pos/plan/committee-members", {
        pid,
        pos_type,
        members,
      });

      // 6) Replace Transfer Courses (with validation)
      const transferIssues = collectTransferErrors();
      if (transferIssues.length) {
        alert("Please fix the following transfer entries before submitting:\n" + transferIssues.join("\n"));
        return;
      }

      await axios.put("/api/pos/plan/transfers", {
        pid,
        pos_type,
        rows: transferRows.map((r) => ({
          description: String(r.description || "").trim(),
          credit_hours: Number(r.creditHours || 0),
          grade:
            String(r.grade || "A").toUpperCase() === "B" ? "B" : "A",
        })),
      });

      // 7) Run transcript vs plan comparison BEFORE final submission
      const actions = await compareTranscriptToPlan(pid, pos_type);
      const hasAdds = actions.toAdd && actions.toAdd.length > 0;
      const hasRems = actions.toRemove && actions.toRemove.length > 0;
      const hasMissing =
        actions.toMissing && actions.toMissing.length > 0;

      if (hasAdds || hasRems || hasMissing) {
        // Show Required Actions overlay and block submission
        setRequiredActions(actions);
        setShowActions(true);
        alert("We found differences between your transcript and your plan. Please resolve the Required Actions, then Submit again.");
        return;
      }

      // 8) No required actions - mark plan as SUBMITTED (status = 2)
      const planPayloadSubmitted = {
        pid,
        pos_type,
        committee_chair: committeeChair || null,
        current_status: 2, // Submitted
      };
      console.log("Submitting: final submit payload", planPayloadSubmitted);
      await axios.post("/api/pos/plan", planPayloadSubmitted);

      alert("Plan submitted successfully.");
      setPlanStatus(2);
    } catch (err) {
      console.error("Submit failed:", err);
      alert("Submit failed: " + (err?.message || "unknown error"));
    }
  };

// Run validation silently and update requirement flags + canSubmit
const runValidationSilent = () => {
  try {
    const {
      perRowMessages,
      flags,
    } = validatePlanRequirements({
      groups,
      terms,
      degreeType,
      transferRows,
      rowCourses,
      committee,
      committeeChair,
    });

    // 1) Always sync live row errors
    setRowErrors(perRowMessages);

    // 2) Check if any non-plan rows have messages
    const hasRowErrors = Object.keys(perRowMessages).some(
      (k) => String(k) !== "-1"
    );

    const {
      ethicsOK,
      breadthOK,
      committeeChairOK,
      committeeMembersOK,
      msTotalCreditsOK,
      phdTotalCreditsOK,
      msSeminarOK,
      msResearchRangeOK,
      msNonResearchCourseCountOK,
      msNonResearchCreditsOK,
      msCs5or6OK,
      msCs6OK,
      msCognateLimitOK,
      course4000LimitOK,
      phdSeminarOK,
      phdResearch30OK,
      phdCourseCountOK,
      phdPlannedCredits27OK,
      phdCs5or6OK,
      phdCs6OK,
      phdCognateOK,
    } = flags;


    setRequirementFlags(prev => ({
      ...prev,
      ethics: ethicsOK,
      seminar: degreeType === "PhD" ? phdSeminarOK : msSeminarOK,
      researchCredits: degreeType === "MS" ? msResearchRangeOK : true, // MSA doesn’t require
      nonResearchCourseCount: msNonResearchCourseCountOK,
      nonResearchCredits: msNonResearchCreditsOK,
      cs5or6Count: msCs5or6OK,
      cs6Count: msCs6OK,
      cognateLimit: msCognateLimitOK,
      limit4000: course4000LimitOK,
      breadth: breadthOK,
      committeeChair: committeeChairOK,
      committeeMembers: committeeMembersOK,
      totalCredits: msTotalCreditsOK,

      phd_researchCredits: phdResearch30OK,
      phd_totalCredits: phdTotalCreditsOK,
      phd_courseCount: phdCourseCountOK,
      phd_cs5or6Count: phdCs5or6OK,
      phd_cs6Count: phdCs6OK,
      phd_cognateFound: phdCognateOK,
    }));

    let allGood;
    if (degreeType === "MS") {
      allGood =
        ethicsOK &&
        msSeminarOK &&
        msResearchRangeOK &&
        msNonResearchCourseCountOK &&
        msNonResearchCreditsOK &&
        msCs5or6OK &&
        msCs6OK &&
        msCognateLimitOK &&
        course4000LimitOK &&
        breadthOK &&
        committeeChairOK &&
        committeeMembersOK &&
        msTotalCreditsOK;
    } else if (degreeType === "MSA") {
      allGood =
        ethicsOK &&
        msSeminarOK &&
        msNonResearchCourseCountOK &&
        msNonResearchCreditsOK &&
        msCs5or6OK &&
        msCs6OK &&
        msCognateLimitOK &&
        course4000LimitOK &&
        breadthOK &&
        committeeChairOK &&
        committeeMembersOK &&
        msTotalCreditsOK;
    } else {
      allGood =
        phdResearch30OK &&
        phdTotalCreditsOK &&
        phdCourseCountOK &&
        phdPlannedCredits27OK &&
        phdCs5or6OK &&
        phdCs6OK &&
        phdCognateOK &&
        course4000LimitOK &&
        phdSeminarOK &&
        breadthOK &&
        committeeChairOK &&
        committeeMembersOK;
    }

    if (hasRowErrors) allGood = false;

    setCanSubmit(Boolean(allGood));
  } catch (e) {
    console.error("Silent validation failed:", e);
    setCanSubmit(false);
  }
};

// Re-run validation automatically whenever core plan data changes
useEffect(() => {
  // Run validation on initial load and whenever groups/committee/transferRows/degreeType change
  runValidationSilent();
}, [groups, transferRows, committee, committeeChair, degreeType]);

// Term/year ordering to match ViewStudentPOSPage
// Year ascending, then Winter → Spring → Summer → Fall
// -------------------------
const termRank = (label) => {
  const s = String(label || "").toLowerCase();
  if (s.startsWith("winter")) return 0;
  if (s.startsWith("spring")) return 1;
  if (s.startsWith("summer")) return 2;
  if (s.startsWith("fall")) return 3;
  return 99;
};

const sortedGroups = [...groups].sort((a, b) => {
  const termA = terms.find((t) => String(t.term_id) === String(a.termId));
  const termB = terms.find((t) => String(t.term_id) === String(b.termId));

  const labelA = termA?.term || "Term";
  const labelB = termB?.term || "Term";

  // Sort by year first
  if (Number(a.year) !== Number(b.year)) return Number(a.year) - Number(b.year);

  // Then by term order
  return termRank(labelA) - termRank(labelB);
});


//--------------------HTML-------------------------------------------------------

return (
    <div className="page">
      {/* Title / centered description (full width) */}
      <div className="center-header">
        <h1 className="main-title">Graduate Plan of Study</h1>
        <div className="page-description">
          <p>
            This page allows you to create, edit, and submit your Graduate Plan of Study.
            Validating that all degree requirements are met is required before submitting. You can:
          </p>
          <ul>
            <li>Add and organize courses by term and year.</li>
            <li>Select your Committee Chair and Committee Members.</li>
            <li>Save, verify, and submit your plan for review.</li>
            <li>Track your plan's status throughout the review process.</li>
          </ul>
        </div>
      </div>

      <div className="pos-container">
        {/* Left side: Requirements Panel */}
        <div className="requirements-panel">
          <RequirementsPanel
            degreeType={degreeType}
            requirementFlags={requirementFlags}
          />
        </div>

        {/* Right side: Main Content */}
        <div className="main-content">
            {/* Header */}
      <header className="header">
        <div className="header-bar">
          {/* Left: Title */}
          <h2 className="title">Planned Courses</h2>

          {/* Center: MS/PhD/MSA toggle */}
          <div className="degree-toggle">
            <button
              type="button"
              className={"btn " + (degreeType === "MS" ? "btn-primary" : "btn-outline-primary")}
              onClick={() => { clearPlanForDegreeSwitch(); setDegreeType("MS"); }}
            >
              MS
            </button>
            <button
              type="button"
              className={"btn " + (degreeType === "PhD" ? "btn-primary" : "btn-outline-primary")}
              onClick={() => { clearPlanForDegreeSwitch(); setDegreeType("PhD"); }}
            >
              PhD
            </button>
            <button
              type="button"
              className={"btn " + (degreeType === "MSA" ? "btn-primary" : "btn-outline-primary")}
              onClick={() => { clearPlanForDegreeSwitch(); setDegreeType("MSA"); }}
              disabled={!phdPlanExists}
              title={phdPlanExists ? "" : "MSA requires an existing PhD plan of study"}
            >
              MSA
            </button>

          </div>

          {/* Right: History */}
          <div className="history-bar">
            <HistoryModal degreeType={degreeType} />
          </div>
        </div>
      </header>

      {/* Term Groups */}
      {sortedGroups.map((g, gi) => (
        <div key={g.id} className="table-wrap term-group">
          <div className="term-group-header">
            <h2>
              {(() => {
                const t = terms.find((x) => String(x.term_id) === String(g.termId));
                return `${t ? t.term : "Term"} ${g.year}`;
              })()}
            </h2>
            <button type="button" className="btn btn-outline-danger" onClick={() => removeTermGroup(g.id)} disabled={isReadOnly}>
              Remove Term
            </button>
          </div>

          <table className="table table-striped">
            <thead>
              <tr>
                <th>Area</th>
                <th>Course</th>
                <th>Credit Hours</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((row) => {
                const coursesForRow = rowCourses[row.id] || [];
                const selected = coursesForRow.find((c) => String(c.course_id) === String(row.course));
                const catalog = selected ? Number(selected.credits || 0) : null;
                const isFixed = catalog != null && catalog > 0;
                return (
                  <tr key={row.id}>
                    {/* Area */}
                    <td>
                      <div className="dropdown-with-error">
                        <select
                          className="form-select"
                          value={row.area}
                          onChange={(e) => onAreaChange(g.id, row, e.target.value)}
                          disabled={isReadOnly}
                        >
                          <option value="">Select Area</option>
                          {areas.map((a) => (
                            <option key={a.POS_Area} value={a.POS_Area}>
                              {a.Area_Description}
                            </option>
                          ))}
                        </select>
                        {rowErrors[row.id]?.badFields?.area && <span className="error-star">*</span>}
                      </div>
                    </td>

                    {/* Course */}
                    <td>
                      <div className="dropdown-with-error">
                        <select
                          className="form-select"
                          value={row.course}
                          onChange={(e) => onCourseChange(g.id, row, e.target.value)}
                          disabled={isReadOnly || !row.area || !coursesForRow.length}
                        >
                          <option value="">Select Course</option>
                          {(() => {
                            // Filter out duplicate courses except allowed repeats
                            const planned = getAllPlannedCourses(row.id);
                            return coursesForRow.filter((c) => {
                              const subject = c.subject_code;
                              const number = String(c.course_number);
                              const isRepeatable = subject === "CS" && ["5944", "5994", "7994"].includes(number);
                              // If not repeatable, block if already in plan
                              if (!isRepeatable && planned.some(p => p.course === c.course_id)) return false;
                              // If repeatable, block if already in this term
                              const group = groups.find(gr => gr.id === g.id);
                              if (isRepeatable && planned.some(p => p.course === c.course_id && p.termId === group?.termId && p.year === group?.year)) return false;
                              return true;
                            }).map((c) => (
                              <option key={c.course_id} value={c.course_id}>
                                {c.subject_code} {c.course_number} - {c.title}
                              </option>
                            ));
                          })()}
                        </select>
                        {rowErrors[row.id]?.badFields?.course && <span className="error-star">*</span>}
                      </div>
                    </td>

                    {/* Credit Hours */}
                    <td>
                      <div className="dropdown-with-error">
                        {!row.course ? (
                          <select className="form-select" disabled>
                            <option>—</option>
                          </select>
                        ) : isFixed ? (
                          <select className="form-select" value={catalog} disabled>
                            <option value={catalog}>{catalog}</option>
                          </select>
                        ) : (
                          <select
                            className="form-select"
                            value={row.creditHours ?? 0}
                            onChange={(e) =>
                              updateRow(g.id, row.id, { creditHours: Number(e.target.value) })
                            }
                            disabled={isReadOnly}
                          >
                            {Array.from({ length: 19 }, (_, n) => n).map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        )}
                        {rowErrors[row.id]?.badFields?.creditHours && <span className="error-star">*</span>}
                      </div>
                    </td>

                    {/* Actions */}
                    <td>
                      <button type="button" className="btn btn-danger" onClick={() => removeCourseRow(g.id, row.id)} disabled={isReadOnly}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="add-course-bar">
            <button type="button" className="btn btn-success" onClick={() => addCourseRow(g.id)} disabled={isReadOnly}>
              Add Course
            </button>
          </div>
        </div>
      ))}

      {/* Add Term controls */}
      <div className="add-term-bar">
        <select className="form-select" value={pendingTermId} onChange={(e) => setPendingTermId(e.target.value)} disabled={isReadOnly}>
          <option value="">Select Term</option>
          {terms.map((t) => (
            <option key={t.term_id} value={t.term_id}>{t.term}</option>
          ))}
        </select>

        <select className="form-select" value={pendingYear} onChange={(e) => setPendingYear(e.target.value)} disabled={isReadOnly}>
          <option value="">Select Year</option>
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <button type="button" className="btn btn-outline-success" onClick={addTermGroup} disabled={isReadOnly}>
          Add Term
        </button>
      </div>
      
      {/* -------------------- TRANSFER CREDITS -------------------- */}
      <div className="table-wrap transfer-wrap">
        <div className="term-group-header">
          <h2>Transfer Credits</h2>
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={addTransferRow}
            disabled={isReadOnly}
          >
            Add Transfer Course
          </button>
        </div>

        {transferRows.length > 0 && (
          <table className="table table-striped">
            <thead>
              <tr>
                <th>Course</th>
                <th>Credit Hours</th>
                <th>Grade</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transferRows.map((tr) => (
                <tr key={tr.id}>
                  <td>
                    <input
                      type="text"
                      className="form-control"
                      value={tr.description}
                      onChange={(e) =>
                        updateTransferRow(tr.id, { description: e.target.value })
                      }
                      disabled={isReadOnly}
                      placeholder="e.g., CS 101"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="form-control"
                      value={tr.creditHours}
                      onChange={(e) => {
                        const v = e.target.value === "" ? "" : Number(e.target.value);
                        updateTransferRow(tr.id, {
                          creditHours:
                            v === "" ? "" : Number.isNaN(v) ? 0 : Math.trunc(v),
                        });
                      }}
                      min={0}
                      step={1}
                      disabled={isReadOnly}
                    />
                  </td>
                  <td>
                    <select
                      className="form-select"
                      value={tr.grade}
                      onChange={(e) =>
                        updateTransferRow(tr.id, { grade: e.target.value })
                      }
                      disabled={isReadOnly}
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => removeTransferRow(tr.id)}
                      disabled={isReadOnly}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h3 className="credits-total">Credit Hours: {totalWithTransfers}</h3>

      {/* Footer */}
      <footer className="footer">
        <section className="committee-chair">
          <div className="committee-chair-header">
            <h2 className="committee-chair-title">CS Faculty Committee Chair/Co-Chair</h2>
            <span className="note">
              (This is the committee member who will review your plan of study)
            </span>
          </div>

          <select
            id="faculty"
            className="form-select committee-chair-select"
            value={committeeChair}
            onChange={(e) => { setCommitteeChair(e.target.value); setCanSubmit(false); }}
            disabled={isReadOnly}
          >
            <option value="">Select CS Faculty</option>
            {([...facultyList].sort((a, b) => {
              const lastA = (a.last || "").toUpperCase();
              const lastB = (b.last || "").toUpperCase();
              if (lastA < lastB) return -1;
              if (lastA > lastB) return 1;
              return 0;
            })).map((p, i) => (
              <option key={p.pid ?? i} value={p.pid}>
                {p.last}, {p.first}
              </option>
            ))}
          </select>
        </section>

        <section className="committee">
          <h2 className="committee-title">Committee Members</h2>

          {committee.map((m, i) => (
            <div className="committee-row" key={i}>
              <input
                className="form-control"
                type="text"
                placeholder="First name"
                value={m.first}
                onChange={(e) => handleCommitteeChange(i, "first", e.target.value)}
                disabled={isReadOnly}
              />
              <input
                className="form-control"
                type="text"
                placeholder="Last name"
                value={m.last}
                onChange={(e) => handleCommitteeChange(i, "last", e.target.value)}
                disabled={isReadOnly}
              />
              <input
                className="form-control"
                type="text"
                placeholder="Department"
                value={m.dept}
                onChange={(e) => handleCommitteeChange(i, "dept", e.target.value)}
                disabled={isReadOnly}
              />
              <input
                className="form-control"
                type="text"
                placeholder="Role"
                value={m.role}
                onChange={(e) => handleCommitteeChange(i, "role", e.target.value)}
                disabled={isReadOnly}
              />
              <input
                className="form-control"
                type="text"
                placeholder="Institution"
                value={m.inst}
                onChange={(e) => handleCommitteeChange(i, "inst", e.target.value)}
                disabled={isReadOnly}
              />

              <button
                type="button"
                className="btn btn-outline-danger remove-member"
                onClick={() => removeMember(i)}
                disabled={isReadOnly || committee.length === 1}
              >
                Remove
              </button>
            </div>
          ))}

          <div className="committee-actions">
            <button
              type="button"
              className="btn btn-outline-success"
              onClick={addMember}
              disabled={isReadOnly || committee.length >= maxMembers}
            >
              Add Member
            </button>
          </div>
        </section>

        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={onSave} disabled={isReadOnly}>Save</button>
          <button
            type="button"
            className="btn btn-primary submit-btn"
            onClick={onSubmit}
            disabled={isReadOnly || !canSubmit}
            title={
              isReadOnly
                ? "Plan is under review; editing and submitting are disabled."
                : !canSubmit
                  ? "Fix issues listed on the left to enable submission"
                  : ""
            }
          >
            Submit
          </button>
        </div>
      </footer>
    </div>
  </div>
      <RequiredActionsModal
        requiredActions={requiredActions}
        applying={applying}
        areas={areas}
        terms={terms}
        onAdd={async (index, addRow, areaId) => {
          try {
            setApplying(true);
            const ensure = await axios.post("/api/pos/ensure-student");
            const ensuredStudent = ensure?.data?.student || {};
            const pid = ensuredStudent?.pid || ensure?.data?.pid;
            const posType = degreeType === "MS" ? 1 : degreeType === "PhD" ? 2 : 3;

            await addPlannedFromAction(pid, posType, addRow, areaId);

            // remove the processed item
            setRequiredActions(prev => {
              const next = { ...prev, toAdd: prev.toAdd.filter((_, i) => i !== index) };
              // if both lists are now empty, finalize
              if (next.toAdd.length === 0 && next.toRemove.length === 0 && next.toMissing.length === 0) {
                // finalize asynchronously after state commit
                Promise.resolve().then(finalizeRequiredActions);
              }
              return next;
            });
          } catch (err) {
            console.error("Add failed:", err?.response?.data || err?.message || err);
            alert("Could not add course. " + (err?.response?.data?.message || err?.response?.data?.error || ""));
          } finally {
            setApplying(false);
          }
        }}

        onIgnore={async (index, addRow) => {
          try {
            setApplying(true);
            const ensure = await axios.post("/api/pos/ensure-student");
            const ensuredStudent = ensure?.data?.student || {};
            const pid = ensuredStudent?.pid || ensure?.data?.pid;
            const posType = degreeType === "MS" ? 1 : degreeType === "PhD" ? 2 : 3;
            
            await ignoreTakenFromAction(pid, posType, addRow);
            
            setRequiredActions(prev => {
              const next = { ...prev, toAdd: prev.toAdd.filter((_, i) => i !== index) };
              if ( (next.toAdd?.length ?? 0) === 0 && (next.toRemove?.length ?? 0) === 0 && (next.toMissing?.length ?? 0) === 0  ) {
                Promise.resolve().then(finalizeRequiredActions);
              }
              return next;
            });
          } catch (err) {
            console.error("Ignore failed:", err?.response?.data || err?.message || err);
            alert("Could not ignore course. " + (err?.response?.data?.message || err?.response?.data?.error || ""));
          } finally {
            setApplying(false);
          }
        }}

        onRemove={async (index, remRow) => {
          try {
            setApplying(true);
            await removePlannedFromAction(remRow);

            setRequiredActions(prev => {
              const next = { ...prev, toRemove: prev.toRemove.filter((_, i) => i !== index) };
              if (next.toAdd.length === 0 && next.toRemove.length === 0 && next.toMissing.length === 0) {
                Promise.resolve().then(finalizeRequiredActions);
              }
              return next;
            });
          } catch (err) {
            console.error("Remove failed:", err?.response?.data || err?.message || err);
            alert("Could not remove course. " + (err?.response?.data?.message || err?.response?.data?.error || ""));
          } finally {
            setApplying(false);
          }
        }}
        onMoveMissing={async (index, missRow, nextTermId, nextYear) => {
          try {
            setApplying(true);
            await updatePlannedTermYear(missRow, nextTermId, nextYear);
            setRequiredActions(prev => {
              const next = { ...prev, toMissing: prev.toMissing.filter((_, i) => i !== index) };
              if (
                (next.toAdd?.length ?? 0) === 0 &&
                (next.toRemove?.length ?? 0) === 0 &&
                (next.toMissing?.length ?? 0) === 0
              ) {
                Promise.resolve().then(finalizeRequiredActions);
              }
              return next;
            });
          } catch (err) {
            console.error("Move failed:", err?.response?.data || err?.message || err);
            alert("Could not move planned course. " + (err?.response?.data?.message || err?.response?.data?.error || ""));
          } finally {
            setApplying(false);
          }
        }}
        onDeleteMissing={async (index, missRow) => {
          try {
            setApplying(true);
            await removePlannedFromAction(missRow);
            setRequiredActions(prev => {
              const next = { ...prev, toMissing: prev.toMissing.filter((_, i) => i !== index) };
              if (
                (next.toAdd?.length ?? 0) === 0 &&
                (next.toRemove?.length ?? 0) === 0 &&
                (next.toMissing?.length ?? 0) === 0
              ) {
                Promise.resolve().then(finalizeRequiredActions);
              }
              return next;
            });
          } catch (err) {
            console.error("Delete failed:", err?.response?.data || err?.message || err);
            alert("Could not remove planned course. " + (err?.response?.data?.message || err?.response?.data?.error || ""));
          } finally {
            setApplying(false);
          }
        }}
      />
    
    </div>
  );
}
