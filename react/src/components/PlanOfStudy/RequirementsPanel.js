import React from "react";
import "../../../css/POS_Requirements.css";

// Requirements checklist based on degree type
export default function RequirementsPanel ({ degreeType, requirementFlags }) {
    if (degreeType === "MS" || degreeType === "MSA") {
        const msCoursesOK = requirementFlags.nonResearchCourseCount && requirementFlags.nonResearchCredits && requirementFlags.cs5or6Count && requirementFlags.cs6Count && requirementFlags.limit4000;
        const isMS = degreeType === "MS";
        const degreeLabel = isMS ? "M.S." : "M.S. Along the Way";
        return (
        <>
            <h3>{degreeLabel} Degree Requirements</h3>
            <div className="requirement-section">
            <h4>Core Requirements</h4>
            <ul className="requirement-list">
                <li className="requirement-item">
                {requirementFlags.ethics ? <span className="check">✓</span> : <span className="pending">○</span>}
                Comply with the Ethics Requirement (3 credits)
                </li>
                <li className="requirement-item">
                {requirementFlags.seminar ? <span className="check">✓</span> : <span className="pending">○</span>}
                Fulfill the Grad Seminar Requirement (2 credits)
                </li>
            </ul>
            </div>
            
            <div className="requirement-section">
            <h4>Research and Credits</h4>
            <ul className="requirement-list">
                {isMS && (
                <li className="requirement-item">
                    {requirementFlags.researchCredits ? <span className="check">✓</span> : <span className="pending">○</span>}
                    6-9 Research Credits (CS 5994)
                </li>
                )}
                <li className="requirement-item">
                {requirementFlags.totalCredits ? <span className="check">✓</span> : <span className="pending">○</span>}
                At least 30 credits
                </li>
                <li className="requirement-item">
                {msCoursesOK ? <span className="check">✓</span> : <span className="pending">○</span>}
                At least 7 courses (21 credits) that:
                <ul className="sub-requirements">
                    <li className="requirement-item">
                    {requirementFlags.cs5or6Count ? <span className="check">✓</span> : <span className="pending">○</span>}
                    At least 4 CS courses at 5000 or 6000 level
                    </li>

                    <li className="requirement-item">
                    {requirementFlags.cs6Count ? <span className="check">✓</span>  : <span className="pending">○</span>}
                    At least 1 CS course at 6000 level
                    </li>

                    <li className="requirement-item">
                    {requirementFlags.limit4000 ? <span className="check">✓</span> : <span className="pending">○</span>}
                    Can include at most 2 courses at 4000 level
                    </li>
                </ul>
                </li>
            </ul>
            </div>

            {/* Full-width note below Research and Credits for all degrees */}
            <div className="requirement-note" style={{marginTop: '8px', marginBottom: '8px'}}>
                <em>
                    Note: The following courses are <span style={{color: 'red', fontWeight: 'bold'}}>not eligible</span> for the Plan of Study:<br />
                    CS 5974 (Independent Study), CS5040, CS5644, CS5020, CS5044, CS5045-6
                </em>
            </div>

            <div className="requirement-section">
            <h4>Area Requirements</h4>
            <ul className="requirement-list">
                <li className="requirement-item">
                {requirementFlags.breadth ? <span className="check">✓</span> : <span className="pending">○</span>}
                Fulfill the Breadth Requirement by covering at least 4 areas (including area 0)
                </li>
                <li className="requirement-item">
                {requirementFlags.cognateLimit ? <span className="check">✓</span> : <span className="pending">○</span>}
                Can include at most 1 cognate course
                </li>
            </ul>
            </div>

            <div className="requirement-section">
            <h4>Committee Requirements</h4>
            <ul className="requirement-list">
                <li className="requirement-item">
                {requirementFlags.committeeChair ? <span className="check">✓</span> : <span className="pending">○</span>}
                Select a Committee Chair
                </li>
                <li className="requirement-item">
                {requirementFlags.committeeMembers ? <span className="check">✓</span> : <span className="pending">○</span>}
                {degreeType === "PhD" ? "At least 4 committee members (including chair)" : "At least 2 committee members (including chair)"}
                </li>
            </ul>
            </div>
        </>
        );
    } else {
        const phdCoursesOK = requirementFlags.phd_courseCount && requirementFlags.phd_cs5or6Count && requirementFlags.phd_cs6Count && requirementFlags.limit4000;
        return (
        <>
            <h3>Ph.D. Degree Requirements</h3>
            <div className="requirement-section">
            <h4>Core Requirements</h4>
            <ul className="requirement-list">
                <li className="requirement-item">
                {requirementFlags.ethics ? <span className="check">✓</span> : <span className="pending">○</span>}
                Comply with the Ethics Requirement (3 credits)
                </li>
                <li className="requirement-item">
                {requirementFlags.seminar ? <span className="check">✓</span> : <span className="pending">○</span>}
                Fulfill the Grad Seminar Requirement (2 credits)
                </li>
            </ul>
            </div>

            <div className="requirement-section">
            <h4>Research and Credits</h4>
            <ul className="requirement-list">
                <li className="requirement-item">
                {requirementFlags.phd_researchCredits ? <span className="check">✓</span> : <span className="pending">○</span>}
                At least 30 Research Credits (CS 7994)
                </li>
                <li className="requirement-item">
                {requirementFlags.phd_totalCredits ? <span className="check">✓</span> : <span className="pending">○</span>}
                At least 90 credits
                </li>
                <li className="requirement-item">
                {phdCoursesOK ? <span className="check">✓</span> : <span className="pending">○</span>}
                At least 9 courses (27 credits) that:
                <ul className="sub-requirements">
                    <li className="requirement-item">
                    {requirementFlags.phd_cs5or6Count ? <span className="check">✓</span> : <span className="pending">○</span>}
                    At least 6 CS courses at 5000 or 6000 level
                    </li>

                    <li className="requirement-item">
                    {requirementFlags.phd_cs6Count ? <span className="check">✓</span>  : <span className="pending">○</span>}
                    At least 2 CS courses at 6000 level
                    </li>

                    <li className="requirement-item">
                    {requirementFlags.limit4000 ? <span className="check">✓</span> : <span className="pending">○</span>}
                    Can include at most 2 courses at 4000 level
                    </li>
                </ul>
                </li>
            </ul>
            </div>

            {/* Full-width note below Research and Credits for all degrees */}
            <div className="requirement-note">
                <em>
                    Note: The following courses are <span style={{color: 'red', fontWeight: 'bold'}}>not eligible</span> for the Plan of Study:<br />
                    CS 5974 (Independent Study), CS5040, CS5644, CS5020, CS5044, CS5045-6
                </em>
            </div>

            <div className="requirement-section">
            <h4>Committee Requirements</h4>
            <ul className="requirement-list">
                <li className="requirement-item">
                {requirementFlags.committeeChair ? <span className="check">✓</span> : <span className="pending">○</span>}
                Select a Committee Chair
                </li>
                <li className="requirement-item">
                {requirementFlags.committeeMembers ? <span className="check">✓</span> : <span className="pending">○</span>}
                {degreeType === "PhD" ? "At least 4 committee members" : "At least 3 committee members"}
                </li>
            </ul>
            </div>
        </>
        );
    }
};