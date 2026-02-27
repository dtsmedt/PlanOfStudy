export function validatePlanRequirements({
  groups,
  terms,
  degreeType,
  transferRows,
  rowCourses,
  committee,
  committeeChair,
}) {
  // Local helpers using rowCourses
  const getSelectedCourse = (row) => {
    const list = rowCourses?.[row.id] || [];
    return list.find((c) => String(c.course_id) === String(row.course)) || null;
  };

  const getEffectiveCreditHours = (row) => {
    const selected = getSelectedCourse(row);
    const catalog = selected ? Number(selected.credits || 0) : 0;
    return catalog > 0 ? catalog : Number(row.creditHours || 0);
  };

  const perRowMessages = {};
  const plannedCourses = [];

  const flags = {
    // shared
    ethicsOK: true,
    breadthOK: true,
    committeeChairOK: true,
    committeeMembersOK: true,

    // totals
    msTotalCreditsOK: true,   // includes MSA
    phdTotalCreditsOK: true,

    course4000LimitOK: true,

    // MS/MSA
    msSeminarOK: true,
    msResearchRangeOK: true,          // 6–9 CS 5994 (MS only)
    msNonResearchCourseCountOK: true, // ≥ 7
    msNonResearchCreditsOK: true,     // ≥ 21
    msCs5or6OK: true,
    msCs6OK: true,
    msCognateLimitOK: true,

    // PhD
    phdSeminarOK: true,
    phdResearch30OK: true,
    phdCourseCountOK: true,
    phdPlannedCredits27OK: true,
    phdCs5or6OK: true,
    phdCs6OK: true,
    phdCognateOK: true,
  };

  // validate per row and collect metadata
  groups.forEach((g) => {
    g.rows.forEach((r, ri) => {
      const termName =
        terms.find((x) => String(x.term_id) === String(g.termId))?.term ||
        "Term";
      const label = `${termName} ${g.year} — Row ${ri + 1}`;

      const msgs = [];
      const badFields = {};

      if (!r.area) {
        msgs.push("Area is required.");
        badFields.area = true;
      }
      if (!r.course) {
        msgs.push("Course is required.");
        badFields.course = true;
      }
      if (!g.termId) {
        msgs.push("Term is required (select on Add Term).");
        badFields.term = true;
      }
      if (!g.year) {
        msgs.push("Year is required (select on Add Term).");
        badFields.year = true;
      }

      if (r.course) {
        const hours = getEffectiveCreditHours(r);
        if (!hours || hours <= 0) {
          msgs.push("Credit hours must be greater than 0.");
          badFields.creditHours = true;
        }
      }

      if (msgs.length) {
        perRowMessages[r.id] = { label, messages: msgs, badFields };
      } else {
        const selected = getSelectedCourse(r);
        plannedCourses.push({
          area: r.area,
          courseId: Number(r.course),
          creditHours: getEffectiveCreditHours(r),
          term: g.termId,
          year: Number(g.year),
          subject_code: selected ? selected.subject_code : null,
          course_number: selected ? selected.course_number : null,
          title: selected ? selected.title : null,
          areas: selected ? selected.areas || [] : [],
          selectedArea: Number(r.area),
        });
      }
    });
  });

  // Sum planned VT course credits (excludes transfers)
  const plannedTotal = plannedCourses.reduce(
    (s, pc) => s + (Number(pc.creditHours) || 0),
    0
  );

  // total credits including transfer credits
  const transferTotal = transferRows.reduce(
    (s, r) => s + (Number(r.creditHours) || 0),
    0
  );
  const totalWithTransfer = plannedTotal + transferTotal;

  // -------------------- TOTAL CREDIT REQUIREMENTS --------------------

  if ((degreeType === "MS" || degreeType === "MSA") && totalWithTransfer < 30) {
    flags.msTotalCreditsOK = false;
    perRowMessages[-1] = {
      messages: [
        `${degreeType} students must have at least 30 total credit hours (including transfer).`,
      ],
    };
  }
  if (degreeType === "PhD" && totalWithTransfer < 90) {
    flags.phdTotalCreditsOK = false;
    const prev = perRowMessages[-1]?.messages || [];
    perRowMessages[-1] = {
      messages: [
        ...prev,
        "PhD students must have at least 90 total credit hours (including transfer).",
      ],
    };
  }

  // -------------------- RESEARCH CREDIT REQUIREMENTS --------------------

  if (degreeType === "MS") {
    const msResearchCredits = plannedCourses.reduce((s, pc) => {
      if (pc.subject_code === "CS" && String(pc.course_number) === "5994") {
        return s + (Number(pc.creditHours) || 0);
      }
      return s;
    }, 0);

    if (msResearchCredits < 6 || msResearchCredits > 9) {
      flags.msResearchRangeOK = false;
    }
    if (msResearchCredits < 6) {
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `MS requires at least 6 research credits (CS 5994). Currently ${msResearchCredits}.`,
        ],
      };
    }
    if (msResearchCredits > 9) {
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `MS allows at most 9 research credits (CS 5994). Currently ${msResearchCredits}.`,
        ],
      };
    }
  }

  // -------------------- SEMINAR (CS 5944) --------------------
  const seminarCount = plannedCourses.reduce((s, pc) => {
    if (pc.subject_code === "CS" && String(pc.course_number) === "5944") {
      return s + 1;
    }
    return s;
  }, 0);

  if (seminarCount < 2) {
    if (degreeType === "MS" || degreeType === "MSA")
      flags.msSeminarOK = false;
    else if (degreeType === "PhD")
      flags.phdSeminarOK = false;
    const prev = perRowMessages[-1]?.messages || [];
    perRowMessages[-1] = {
      messages: [
        ...prev,
        `${degreeType} requires the graduate seminar (CS 5944) to be taken twice. Currently ${seminarCount}.`,
      ],
    };
  }

  // -------------------- AREA 0 REQUIREMENT (MS / MSA) --------------------

  if (degreeType === "MS" || degreeType === "MSA") {
    let hasArea0 = false;
    for (const pc of plannedCourses) {
      if (Array.isArray(pc.areas) && pc.areas.includes(0)) {
        hasArea0 = true;
        break;
      }
    }
    if (!hasArea0) {
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `${degreeType} requires at least one course from Area 0.`,
        ],
      };
    }
  }

  // -------------------- NON-RESEARCH COURSE REQUIREMENTS (MS / MSA) --------------------

  if (degreeType === "MS" || degreeType === "MSA") {
    const nonResearchCourses = plannedCourses.filter(
      (pc) =>
        !(
          pc.subject_code === "CS" && String(pc.course_number) === "5994"
        ) // exclude MS research
    );

    const nonResearchCount = nonResearchCourses.length;
    const nonResearchCredits = nonResearchCourses.reduce(
      (s, pc) => s + (Number(pc.creditHours) || 0),
      0
    );

    if (nonResearchCount < 7) {
      flags.msNonResearchCourseCountOK = false;
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `${degreeType} requires at least 7 courses (excluding CS 5994). Currently ${nonResearchCount}.`,
        ],
      };
    }
    if (nonResearchCredits < 21) {
      flags.msNonResearchCreditsOK = false;
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `${degreeType} requires at least 21 credits from non-research courses. Currently ${nonResearchCredits}.`,
        ],
      };
    }

    // Course level / cognate limits
    let ms_cs5or6_count = 0;
    let ms_cs6_count = 0;
    let ms_4000_count = 0;
    let ms_cognate_count = 0;

    for (const pc of nonResearchCourses) {
      const subj = (pc.subject_code || "").toString();
      const num = pc.course_number;
      if (!subj || !num) continue;

      const first = parseInt(String(num)[0], 10);
      if (subj === "CS" && !Number.isNaN(first)) {
        if (first === 5 || first === 6) {
          if (String(num) !== "5974") ms_cs5or6_count += 1;
        }
        if (first === 6) ms_cs6_count += 1;
        if (first === 4) ms_4000_count += 1;
      } else if (!Number.isNaN(first) && first === 4) {
        ms_4000_count += 1;
      }

      const pcAreas = Array.isArray(pc.areas) ? pc.areas : [];
      const selArea = Number(pc.selectedArea);
      if (pcAreas.includes(9999) || (!Number.isNaN(selArea) && selArea === 9999)) {
        ms_cognate_count += 1;
      }
    }

    if (ms_cs5or6_count < 4) {
      flags.msCs5or6OK = false;
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `${degreeType} requires at least 4 CS courses at 5000/6000 level (excluding CS 5974). Currently ${ms_cs5or6_count}.`,
        ],
      };
    }
    if (ms_cs6_count < 1) {
      flags.msCs6OK = false;
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `${degreeType} requires at least 1 CS course at 6000 level. Currently ${ms_cs6_count}.`,
        ],
      };
    }
    if (ms_cognate_count > 1) {
      flags.msCognateLimitOK = false;
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `${degreeType} allows at most 1 cognate course. Currently ${ms_cognate_count}.`,
        ],
      };
    }
    if (ms_4000_count > 2) {
      flags.course4000LimitOK = false;
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `${degreeType} allows at most 2 courses at 4000 level. Currently ${ms_4000_count}.`,
        ],
      };
    }
  }

  // -------------------- PhD RESEARCH / COURSE COUNT / COGNATE --------------------

  if (degreeType === "PhD") {
    const researchCredits = plannedCourses.reduce((s, pc) => {
      if (pc.subject_code === "CS" && String(pc.course_number) === "7994") {
        return s + (Number(pc.creditHours) || 0);
      }
      return s;
    }, 0);
    if (researchCredits < 30) {
      flags.phdResearch30OK = false;
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `PhD requires at least 30 research credits (CS 7994). Currently ${researchCredits}.`,
        ],
      };
    }

    const courseCount = plannedCourses.length;
    if (courseCount < 9) {
      flags.phdCourseCountOK = false;
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `PhD requires at least 9 planned courses. Currently ${courseCount}.`,
        ],
      };
    }

    if (plannedTotal < 27) {
      flags.phdPlannedCredits27OK = false;
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `PhD requires at least 27 credits (9 courses). Currently ${plannedTotal} credits.`,
        ],
      };
    }

    let cs5or6_count = 0;
    let cs6_count = 0;
    let phd_4000_count = 0;

    for (const pc of plannedCourses) {
      const subj = (pc.subject_code || "").toString();
      const num = pc.course_number;
      if (!subj || !num) continue;
      const first = parseInt(String(num)[0], 10);
      if (subj === "CS" && !Number.isNaN(first)) {
        if (first === 5 || first === 6) cs5or6_count += 1;
        if (first === 6) cs6_count += 1;
      } else if (!Number.isNaN(first) && first === 4) {
        phd_4000_count += 1;
      }
    }

    if (cs5or6_count < 6) {
      flags.phdCs5or6OK = false;
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `PhD requires at least 6 CS courses at the 5000 or 6000 level. Currently ${cs5or6_count}.`,
        ],
      };
    }

    if (cs6_count < 2) {
      flags.phdCs6OK = false;
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `PhD requires at least 2 CS courses at the 6000 level. Currently ${cs6_count}.`,
        ],
      };
    }

    let cognateFound = false;
    for (const pc of plannedCourses) {
      const pcAreas = Array.isArray(pc.areas) ? pc.areas : [];
      const selArea = Number(pc.selectedArea);
      if (pcAreas.includes(9999) || (!Number.isNaN(selArea) && selArea === 9999)) {
        cognateFound = true;
        break;
      }
    }
    if (!cognateFound) {
      flags.phdCognateOK = false;
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          "PhD requires at least 1 approved cognate course (cognates should be marked with area 9999).",
        ],
      };
    }

    if (phd_4000_count > 2) {
      flags.course4000LimitOK = false;
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [
          ...prev,
          `${degreeType} allows at most 2 courses at 4000 level. Currently ${phd_4000_count}.`,
        ],
      };
    }
  }

  // -------------------- BREADTH REQUIREMENT --------------------

  {
    const areasCovered = new Set();
    let anyAreaMetadata = false;
    for (const pc of plannedCourses) {
      const arr = pc.areas || [];
      if (arr.length) anyAreaMetadata = true;
      arr.forEach((a) => {
        const n = Number(a);
        if (!Number.isNaN(n) && n >= 0 && n <= 10) areasCovered.add(n);
      });
    }

    const hasArea0 = areasCovered.has(0);
    const breadthOK = hasArea0 && areasCovered.size >= 4;
    flags.ethicsOK = hasArea0;
    flags.breadthOK = breadthOK;

    if (anyAreaMetadata) {
      if (!areasCovered.has(0)) {
        const prev = perRowMessages[-1]?.messages || [];
        perRowMessages[-1] = {
          messages: [
            ...prev,
            "Breadth requirement: at least one course must be from Area 0.",
          ],
        };
      }
      if (areasCovered.size < 4) {
        const prev = perRowMessages[-1]?.messages || [];
        perRowMessages[-1] = {
          messages: [
            ...prev,
            `Breadth requirement: at least 4 unique POS areas (0–10) must be covered. Currently ${areasCovered.size}.`,
          ],
        };
      }
    }
  }

  // -------------------- DUPLICATE TERM AND COURSE CHECK --------------------

  // Check for duplicate terms
  {
    const termSet = new Set();
    for (const g of groups) {
      const key = `${g.termId}-${g.year}`;
      if (termSet.has(key)) {
        const prev = perRowMessages[-1]?.messages || [];
        perRowMessages[-1] = {
          messages: [...prev, `Duplicate term detected: ${key.replace('-', ' ')}. You cannot have the same term and year twice.`],
        };
      }
      termSet.add(key);
    }
  }

  // Check for duplicate courses (except allowed repeats)
  {
    // Map: course_key -> [ {term, year} ]
    const courseMap = new Map();
    for (const pc of plannedCourses) {
      const key = `${pc.subject_code || ""}_${pc.course_number || ""}`;
      const isRepeatable = pc.subject_code === "CS" && ["5944", "5994", "7994"].includes(String(pc.course_number));
      if (!courseMap.has(key)) courseMap.set(key, []);
      courseMap.get(key).push({ term: pc.term, year: pc.year });
    }
    const dupMsgs = [];
    for (const [key, arr] of courseMap.entries()) {
      const [subject, number] = key.split("_");
      const isRepeatable = subject === "CS" && ["5944", "5994", "7994"].includes(number);
      if (!isRepeatable && arr.length > 1) {
        dupMsgs.push(`Duplicate planned course: ${subject} ${number} appears ${arr.length} times.`);
      }
      if (isRepeatable) {
        // For repeatable courses, check for duplicates in the same term
        const termYearSet = new Set();
        for (const { term, year } of arr) {
          const key2 = `${term}-${year}`;
          if (termYearSet.has(key2)) {
            dupMsgs.push(`Course ${subject} ${number} appears more than once in term ${key2.replace('-', ' ')}. Only one per term allowed.`);
          }
          termYearSet.add(key2);
        }
      }
    }
    if (dupMsgs.length) {
      const prev = perRowMessages[-1]?.messages || [];
      perRowMessages[-1] = {
        messages: [...prev, ...dupMsgs],
      };
    }
  }

  // -------------------- COMMITTEE VALIDATION --------------------

  // Count chair as a member
  const nonBlankCommitteeCount = () => {
    let count = 0;
    // Count valid committee members
    count += (committee || []).filter((m) => {
      const first = (m.first || "").trim();
      const last = (m.last || "").trim();
      const dept = (m.dept || "").trim();
      const role = (m.role || "").trim();
      const inst = (m.inst || "").trim();
      return first && last && dept && role && inst;
    }).length;
    // Count chair if selected
    if (committeeChair && String(committeeChair).trim() !== "") {
      count += 1;
    }
    return count;
  };

  // MS/MSA: 2 total (chair + 1), PhD: 4 total (chair + 3)
  const minCommittee = (degreeType === "PhD") ? 4 : 2;

  if (!committeeChair || String(committeeChair).trim() === "") {
    flags.committeeChairOK = false;
    const prev = perRowMessages[-1]?.messages || [];
    perRowMessages[-1] = {
      messages: [...prev, "A committee chair must be selected."],
    };
  }

  if (nonBlankCommitteeCount() < minCommittee) {
    flags.committeeMembersOK = false;
    const prev = perRowMessages[-1]?.messages || [];
    perRowMessages[-1] = {
      messages: [
        ...prev,
        `Committee must have at least ${minCommittee} members (including chair).`,
      ],
    };
  }

  // Final result
  return {
    perRowMessages,
    plannedCourses,
    totalCredits: plannedTotal,
    totalWithTransfer,
    flags
  };
}
