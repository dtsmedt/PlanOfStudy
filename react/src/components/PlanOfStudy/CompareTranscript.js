//  compareTranscriptToPlan(pid, posType) that fetches its own data and returns actionable diff
//  RequiredActionsModal component to render "Required Actions" overlay on the Student page

import React from "react";
import axios from "axios";
import "../../../css/CompareTranscript.css";

// Passing grades for graduate POS credit
const PASSING = new Set(["A", "B", "C"]);

// Build "CS 5114" style course code
function codeFromParts(subject, number) {
  const s = String(subject || "").toUpperCase().trim();
  const n = String(number || "").trim();
  return [s, n].filter(Boolean).join(" ");
}

// 202608 -> { year: 2026, suffix: "08" }
function parseTermTaken(termTaken) {
  const raw = String(termTaken ?? "");
  if (raw.length < 6) return null;
  const year = Number(raw.slice(0, 4));
  const suffix = raw.slice(4, 6); // e.g., "08" for Fall
  if (!Number.isFinite(year)) return null;
  return { year, suffix };
}

/**
 * Map a SIS term suffix to POS_Terms term_id.
 * POS_Terms:
 *  1=Fall, 2=Winter, 3=Spring, 4=Summer 1, 5=Summer 2, 6=Summer 3
 *
 * Known SIS suffixes commonly seen:
 *  08 -> Fall (1)
 *  01 -> Spring (3)
 *  12 -> Winter (2)
 *  07 -> Summer 2 (5)
 *  05 -> ambiguous summer – can be Summer1(4) or Summer3(6) depending on source.
 */
function suffixToTermIds(suffix) {
  switch (suffix) {
    case "08":
      return new Set([1]); // Fall
    case "01":
      return new Set([3]); // Spring
    case "12":
      return new Set([2]); // Winter
    case "07":
      return new Set([5]); // Summer 2
    case "05":
      return new Set([4, 6]); // ambiguous summer bucket
    default:
      return new Set();
  }
}

/* ----------------------------
Transcript to Plan Comparison
-----------------------------*/

/**
 * compareTranscriptToPlan(pid, posType)
 * Fetches transcripts and planned courses, compares them, and returns:
 *    toAdd: transcript courses (A/B/C) not yet planned in the same year, term
 *    toRemove: planned courses that have a non-passing grade for the same year, term
 *    terms: term list (id/name) for display if you want
 *
 *  @Return
 *    toAdd:    [{ year, termId, code, grade: "A/B/C", course_id }],
 *    toRemove: [{ planned_course_id, code, year, termId, grade }],
 *    terms:    [{ term_id, term }, ...]
 */
export async function compareTranscriptToPlan(pid, posType) {
  const [termsResS, planResS, txResS] = await Promise.allSettled([
    axios.get("/api/pos/terms"),
    axios.get("/api/pos/plan/courses", { params: { pid, pos_type: posType } }),
    axios.get("/api/pos/transcripts"),
  ]);

  const termsRes = termsResS.status === "fulfilled" ? termsResS.value.data : {};
  const planRes = planResS.status === "fulfilled" ? planResS.value.data  : {};
  const txRes = txResS.status === "fulfilled" ? txResS.value.data    : {};

  const terms = Array.isArray(termsRes?.terms) ? termsRes.terms : [];
  const planned = Array.isArray(planRes?.planned_courses) ? planRes.planned_courses : [];
  const transcripts = Array.isArray(txRes?.transcripts) ? txRes.transcripts : [];

  // Get ignored taken courses
  let ignored = [];
  try {
    const { data: igRes } = await axios.get("/api/pos/plan/ignored-courses", {
      params: { pid, pos_type: posType },
    });
    ignored = Array.isArray(igRes?.ignored) ? igRes.ignored : [];
  } catch (e) {
    console.warn("ignored-courses fetch failed, continuing without ignores:", e);
  }

  const ignoredKey = new Set(
    ignored.map(
      r =>
        `${r.term_year}|${r.planned_term}|${String(r.course_code || "")
          .toUpperCase()
          .trim()}`
    )
  );

  // Build planned maps
  
  // key = "YYYY|termId" -> Set("CS 5114", ...)
  const plannedByKey = new Map();
  // key = "YYYY|termId|CS 5114" -> plannedRow (to grab planned_course_id on delete)
  const plannedRowKey = new Map();
  // All planned course codes regardless of term/year
  const plannedAnywhere = new Set();

  for (const r of planned) {
    const year = Number(r.term_year);
    const termId = Number(r.planned_term);
    if (!Number.isFinite(year) || !Number.isFinite(termId)) continue;

    const code = codeFromParts(r.subject_code, r.course_number);
    if (!code) continue;

    plannedAnywhere.add(code);

    const key = `${year}|${termId}`;
    if (!plannedByKey.has(key)) plannedByKey.set(key, new Set());
    plannedByKey.get(key).add(code);

    plannedRowKey.set(`${key}|${code}`, r);
  }

  // Bucket transcript rows two ways:
  //  - txAll: key -> [{ code, grade }]
  //  - txPass: key -> Set(code) for passing grades
  const txAll = new Map();
  const txPass = new Map();

  // Passing transcript courses that have no usable term/year mapping
  const txFallbackPass = new Set();

  for (const row of transcripts) {
    const code = codeFromParts(row.subj_expanded, row.crse_numb);
    if (!code) continue;

    const grade = String(row.grade || "").toUpperCase().trim();

    const parsed = parseTermTaken(row.term_taken);
    if (!parsed) {
      if (PASSING.has(grade)) txFallbackPass.add(code);
      continue;
    }

    const { year, suffix } = parsed;
    const termIds = suffixToTermIds(suffix);

    // If suffix doesn't map to POS terms, still keep it as fallback
    if (!Number.isFinite(year) || termIds.size === 0) {
      if (PASSING.has(grade)) txFallbackPass.add(code);
      continue;
    }

    for (const termId of termIds) {
      const key = `${year}|${termId}`;
      if (!txAll.has(key)) txAll.set(key, []);
      txAll.get(key).push({ code, grade });

      if (PASSING.has(grade)) {
        if (!txPass.has(key)) txPass.set(key, new Set());
        txPass.get(key).add(code);
      }
    }
  }

  const toAdd = [];    // { year, termId, code, grade: "A/B/C", course_id }
  const toRemove = []; // { planned_course_id, code, year, termId, grade }
  const toIgnore = []; // { year, termId, code, grade }
  const toMissing = []; // { planned_course_id, code, year, termId }

  // (a) Add anything transcript shows as A/B/C in a key not already planned
  for (const [key, passSet] of txPass.entries()) {
    const plannedSet = plannedByKey.get(key) || new Set();
    for (const code of passSet) {
      if (!plannedSet.has(code)) {
        const [yearStr, termStr] = key.split("|");

        const ignoreLookup = `${yearStr}|${termStr}|${code.toUpperCase()}`;
        if (ignoredKey.has(ignoreLookup)) continue;

        toAdd.push({
          year: Number(yearStr),
          termId: Number(termStr),
          code,
          grade: "A/B/C",
        });
      }
    }
  }

  // (b) Add passing transcript courses even when term/year is not saved in plan
  for (const code of txFallbackPass) {
    if (plannedAnywhere.has(code)) continue; // already planned somewhere

    toAdd.push({
      year: null,
      termId: null,
      code,
      grade: "A/B/C",
      missingTerm: true,
    });
  }

  // (c) Remove anything planned that the transcript shows with a non-passing grade
  for (const [key, rows] of txAll.entries()) {
    const plannedSet = plannedByKey.get(key) || new Set();
    for (const { code, grade } of rows) {
      if (plannedSet.has(code) && !PASSING.has(grade)) {
        const plannedRow = plannedRowKey.get(`${key}|${code}`);
        if (plannedRow?.planned_course_id) {
          const [yearStr, termStr] = key.split("|");
          toRemove.push({
            planned_course_id: Number(plannedRow.planned_course_id),
            code,
            year: Number(yearStr),
            termId: Number(termStr),
            grade,
          });
        }
      }
    }
  }

    // (d) Planned but not on transcript (only if that term+year has transcript rows)
  for (const [key, plannedSet] of plannedByKey.entries()) {
    if (!txAll.has(key)) continue; // no transcript rows that term+year → skip
    const txCodes = new Set((txAll.get(key) || []).map(r => r.code));
    for (const code of plannedSet) {
      if (!txCodes.has(code)) {
        const [yearStr, termStr] = key.split("|");
        const plannedRow = plannedRowKey.get(`${key}|${code}`);
        if (plannedRow?.planned_course_id) {
          toMissing.push({
            planned_course_id: Number(plannedRow.planned_course_id),
            code,
            year: Number(yearStr),
            termId: Number(termStr),
          });
        }
      }
    }
  }

  // Resolve course_id for "toAdd" (backend resolves credits/area automatically)
  if (toAdd.length) {
    const { data: courseRes } = await axios.get("/api/pos/courses", { params: { area: "" } });
    const all = Array.isArray(courseRes?.courses) ? courseRes.courses : [];
    const byCode = new Map(
      all.map((c) => [
        codeFromParts(c.subject_code, c.course_number).toUpperCase(),
        c,
      ])
    );

    for (const a of toAdd) {
      const match = byCode.get(String(a.code || "").toUpperCase().trim());
      if (match) {
        a.course_id = Number(match.course_id);
        const arr = Array.isArray(match?.areas) ? match.areas : [];
        a.areas = arr.map((n) => Number(n)).filter((n) => Number.isFinite(n));
      } else {
        // Not in CS POS_Courses -> show in "ignored" list with explanation
        toIgnore.push({
          year: a.year ?? null,
          termId: a.termId ?? null,
          code: a.code,
          grade: a.grade,
        });
      }
    }

    // Keep only resolvable adds (those that have a course_id)
    for (let i = toAdd.length - 1; i >= 0; i--) {
      if (!toAdd[i].course_id) toAdd.splice(i, 1);
    }
  }

  return { toAdd, toRemove, toMissing, terms, toIgnore };
}

/* ----------------------------
   UI: Required Actions Modal
-----------------------------*/

/**
 * RequiredActionsModal
 *    requiredActions: { toAdd: [...], toRemove: [...] }
 *    applying: boolean (disable buttons while applying)
 *    onAdd(index, addRow)
 *    onRemove(index, removeRow)
 */
export function RequiredActionsModal({
  requiredActions,
  applying = false,
  onAdd,
  onIgnore,
  onRemove,
  onMoveMissing,
  onDeleteMissing,
  areas = [],
}) {
  const [areaChoice, setAreaChoice] = React.useState({});
  const [moveChoice, setMoveChoice] = React.useState({});

  const [addTermYearChoice, setAddTermYearChoice] = React.useState({});
  function needsTermYear(a) {
    return !Number.isFinite(Number(a?.termId)) || !Number.isFinite(Number(a?.year));
  }
  
  const toAdd = Array.isArray(requiredActions?.toAdd) ? requiredActions.toAdd : [];
  const toMissing = Array.isArray(requiredActions?.toMissing) ? requiredActions.toMissing : [];
  const toRemove = Array.isArray(requiredActions?.toRemove) ? requiredActions.toRemove : [];
  const toIgnore = Array.isArray(requiredActions?.toIgnore) ? requiredActions.toIgnore : [];

  const terms = Array.isArray(requiredActions?.terms) ? requiredActions.terms : [];
  const termNameById = React.useMemo(() => {
    const m = new Map();
    for (const t of terms) {
      m.set(Number(t.term_id), String(t.term));
    }
    return m;
  }, [terms]);

  const currentYear = new Date().getFullYear();
  const YEAR_OPTIONS = React.useMemo(
    () => Array.from({ length: 14 }, (_, i) => currentYear - 8 + i),
    [currentYear]
  );

  const areaLabelById = React.useMemo(() => {
    const m = new Map();
    for (const a of areas || []) {
      const id = Number(a.POS_Area);
      if (Number.isFinite(id)) {
        m.set(id, String(a.Area_Description || a.POS_Area));
      }
    }
    return m;
  }, [areas]);


  // If there are no actions, render nothing so the overlay disappears.
  if (toAdd.length === 0 && toRemove.length === 0 && toMissing.length === 0) {
    return null;
  }

  function needsChoice(a) {
    return Array.isArray(a?.areas) && a.areas.length > 1;
  }
  function singleArea(a) {
    return Array.isArray(a?.areas) && a.areas.length === 1 ? a.areas[0] : undefined;
  }


  return (
    <div className="ct-overlay" role="dialog" aria-modal="true">
      <div className="ct-window" /* no close button; user must finish actions */>
        <h1 className="ct-title">Required Actions</h1>

        {/* TAKEN BUT NOT PLANNED */}
        <section className="ct-section">
          <h2 className="ct-subtitle">Taken but Not Planned</h2>
          {toAdd.length === 0 ? (
            <p className="ct-empty">None.</p>
          ) : (
            <ul className="ct-list">
              {toAdd.map((a, i) => {
                const mustChoose = needsChoice(a);
                const oneArea = singleArea(a);
                const selected = areaChoice[i];

                const needsTY = needsTermYear(a);
                const chosenTY = addTermYearChoice[i] || {};
                const validTY =
                  !needsTY ||
                  (Number.isFinite(Number(chosenTY.termId)) &&
                    Number.isFinite(Number(chosenTY.year)));

                return (
                  <li className="ct-list-item" key={`add-${i}`}>
                    <span className="ct-item-text">
                      <b>{a.code}</b>{" "}
                      {needsTermYear(a) ? (
                        <>
                          — <i>term/year unknown</i>

                          <label className="ct-area-picker" style={{ marginLeft: 8 }}>
                            Term:&nbsp;
                            <select
                              className="ct-select"
                              value={addTermYearChoice[i]?.termId ?? ""}
                              onChange={(e) => {
                                const v = e.target.value === "" ? undefined : Number(e.target.value);
                                setAddTermYearChoice((prev) => ({
                                  ...prev,
                                  [i]: { ...prev[i], termId: v },
                                }));
                              }}
                            >
                              <option value="">select…</option>
                              {terms.map((t) => (
                                <option key={t.term_id} value={t.term_id}>
                                  {t.term}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="ct-area-picker" style={{ marginLeft: 8 }}>
                            Year:&nbsp;
                            <select
                              className="ct-select"
                              value={addTermYearChoice[i]?.year ?? ""}
                              onChange={(e) => {
                                const v = e.target.value === "" ? undefined : Number(e.target.value);
                                setAddTermYearChoice((prev) => ({
                                  ...prev,
                                  [i]: { ...prev[i], year: v },
                                }));
                              }}
                            >
                              <option value="">select…</option>
                              {YEAR_OPTIONS.map((year) => (
                                <option key={year} value={year}>{year}</option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : (
                        <>— {termNameById.get(Number(a.termId)) || `Term ${a.termId}`} {a.year}</>
                      )}
                      {Array.isArray(a.areas) && a.areas.length > 0 && (
                        <>
                          {" "}
                          {mustChoose ? (
                            <label className="ct-area-picker">
                              Area:&nbsp;
                              <select
                                className="ct-select"
                                value={selected ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value === "" ? undefined : Number(e.target.value);
                                  setAreaChoice((prev) => ({ ...prev, [i]: v }));
                                }}
                              >
                                <option value="">select…</option>
                                {a.areas.map((id) => {
                                  const n = Number(id);
                                  return (
                                    <option key={id} value={id}>
                                      {areaLabelById.get(n) || id}
                                    </option>
                                  );
                                })}
                              </select>
                            </label>
                          ) : (
                            <span className="ct-area-chip">
                              Course Area: {areaLabelById.get(Number(oneArea)) || oneArea}
                            </span>
                          )}
                        </>
                      )}
                    </span>

                    <div className="ct-btn-group">
                      <button
                        type="button"
                        className="ct-btn btn btn-success"
                        disabled={
                          applying ||
                          (mustChoose && (selected === undefined || Number.isNaN(selected))) ||
                          !validTY
                        }
                        onClick={() => {
                          const areaId = mustChoose ? selected : oneArea;

                          const addRow = needsTY
                            ? { ...a, termId: chosenTY.termId, year: chosenTY.year }
                            : a;

                          onAdd?.(i, addRow, areaId);
                        }}
                      >
                        Add
                      </button>

                      <button
                        type="button"
                        className="ct-btn btn btn-outline-secondary"
                        disabled={applying || !validTY}
                        onClick={() => onIgnore?.(i, a)}
                        aria-label={`Ignore ${a.code}`}
                      >
                        Ignore
                      </button>
                    </div>

                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* PLANNED BUT NOT TAKEN */}
        <section className="ct-section">
          <h2 className="ct-subtitle">Planned but Not Taken</h2>
          {toMissing.length === 0 ? (
            <p className="ct-empty">None.</p>
          ) : (
            <ul className="ct-list">
              {toMissing.map((m, i) => {
                const sel = moveChoice[i] || {};
                const valid = Number.isFinite(Number(sel.termId)) && Number.isFinite(Number(sel.year));
                return (
                  <li className="ct-list-item" key={`miss-${i}`}>
                    <span className="ct-item-text">
                      <b>{m.code}</b> — {termNameById.get(Number(m.termId)) || `Term ${m.termId}`} {m.year}
                    </span>

                    <label className="ct-area-picker" style={{ marginLeft: 8 }}>
                      New Term:&nbsp;
                      <select
                        className="ct-select"
                        value={sel.termId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? undefined : Number(e.target.value);
                          setMoveChoice(prev => ({ ...prev, [i]: { ...prev[i], termId: v } }));
                        }}
                      >
                        <option value="">select…</option>
                        {terms.map(t => (
                          <option key={t.term_id} value={t.term_id}>{t.term}</option>
                        ))}
                      </select>
                    </label>

                    <label className="ct-area-picker" style={{ marginLeft: 8 }}>
                      Year:&nbsp;
                      <select
                        className="ct-select"
                        value={sel.year ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? undefined : Number(e.target.value);
                          setMoveChoice(prev => ({
                            ...prev,
                            [i]: { ...prev[i], year: v }
                          }));
                        }}
                      >
                        <option value="">select…</option>
                        {YEAR_OPTIONS.map((year) => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      className="ct-btn btn btn-primary"
                      disabled={applying || !valid}
                      onClick={() => onMoveMissing?.(i, m, sel.termId, sel.year)}
                      aria-label={`Move ${m.code} to a different term/year`}
                      style={{ marginLeft: 8 }}
                    >
                      Move
                    </button>

                    <button
                      type="button"
                      className="ct-btn ct-btn-danger"
                      disabled={applying}
                      onClick={() => onDeleteMissing?.(i, m)}
                      aria-label={`Remove ${m.code} from plan`}
                      style={{ marginLeft: 8 }}
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* NON-PASSING GRADE */}
        <section className="ct-section">
          <h2 className="ct-subtitle">Planned and Taken but Non-Passing Grade on Transcript</h2>
          {toRemove.length === 0 ? (
            <p className="ct-empty">None.</p>
          ) : (
            <ul className="ct-list">
              {toRemove.map((r, i) => (
                <li className="ct-list-item" key={`rem-${i}`}>
                  <span className="ct-item-text">
                    <b>{r.code}</b> — {termNameById.get(Number(r.termId)) || `Term ${r.termId}`} {r.year} — grade: {r.grade}
                  </span>
                  <button
                    className="ct-btn ct-btn-danger"
                    disabled={applying}
                    onClick={() => onRemove?.(i, r)}
                    aria-label={`Remove ${r.code} from plan`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {toIgnore.length > 0 && (
          <section className="ct-section">
            <h2 className="ct-subtitle">On Transcript but Ignored</h2>
            <p className="ct-note">
              The following course(s) are on your transcript but are <b>not in the CS catalog</b> for this degree.
              They will be <b>ignored</b> since they are not required for your degree.
            </p>
            <ul className="ct-list">
              {toIgnore.map((ig, i) => (
                <li className="ct-list-item" key={`ig-${i}`}>
                  <span className="ct-item-text">
                    <b>{ig.code}</b> — {termNameById.get(Number(ig.termId)) || `Term ${ig.termId}`} {ig.year}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* User must clear the lists to continue */}
        <p className="ct-blocker-note">
          Complete all actions above to continue.
        </p>
      </div>
    </div>
  );
}

/* ----------------------------
          HELPERS
-----------------------------*/


// Ensure a POS plan exists for a (pid, posType)
export async function ensurePlan(pid, posType) {
  await axios.post("/api/pos/plan", { pid, pos_type: posType });
}

/*
 * Add a planned course row from a `toAdd` item 
 */
export async function addPlannedFromAction(pid, posType, a, chosenAreaId) {
  await ensurePlan(pid, posType);

  let course_area = chosenAreaId;
  if (course_area === undefined && Array.isArray(a.areas) && a.areas.length === 1) {
    course_area = Number(a.areas[0]);
  }

  await axios.post("/api/pos/plan/course", {
    pid,
    pos_type: posType,
    planned_course: Number(a.course_id),
    planned_term: Number(a.termId),
    term_year: Number(a.year),
    ...(course_area !== undefined ? { course_area: Number(course_area) } : {}),
  });
}

/*
 * Remove a planned course row from a `toRemove` item
 */
export async function removePlannedFromAction(remRow) {
  await axios.delete(`/api/pos/plan/course/${Number(remRow.planned_course_id)}`);
}

/*
 * Update a planned course row's term/year
 */
export async function updatePlannedTermYear(row, nextTermId, nextYear) {
  const id = Number(row.planned_course_id);
  await axios.put(`/api/pos/plan/course/${id}`, {
    planned_term: Number(nextTermId),
    term_year: Number(nextYear),
  });
}

/*
 * Ignore a transcript "taken but not planned" course
 */
export async function ignoreTakenFromAction(pid, posType, a) {
  await axios.post("/api/pos/plan/ignored-course", {
    pid,
    pos_type: posType,
    course_code: a.code,
    planned_term: Number(a.termId),
    term_year: Number(a.year),
  });
}