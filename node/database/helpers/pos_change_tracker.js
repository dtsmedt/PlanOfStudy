const Log = require("../database/utils/Log");
const { execFile } = require("child_process");
const path = require("path");

// Path to Python emailer
const POS_EMAILER_PATH = path.join(__dirname, "../../emailer/pos-emailer.py");

// POS STATUS VALUES
const POS_STATUS = {
    SAVED: 1,
    PENDING_GRADUATE_COORDINATOR: 2,
    PENDING_FACULTY: 3,
    AWAITING_KEY: 4,
    PENDING_GRADUATE_SCHOOL: 5,
    APPROVED: 6,
    REJECTED: 99,
};

/**
 * Call Python emailer function
 * @param {string} functionName - Name of function in pos-emailer.py
 * @param {Array} args - Arguments to pass to function
 */
const callPythonEmailer = (functionName, args) => {
    try {
        // Run Python script asynchronously in background
        // Don't wait for result - email failures shouldn't block the main process
        const pythonArgs = [POS_EMAILER_PATH, "--function", functionName, "--args", JSON.stringify(args)];
        
        execFile("python3", pythonArgs, { timeout: 10000 }, (error, stdout, stderr) => {
            if (error) {
                Log.warn(`Python emailer error for ${functionName}: ${error.message}`, "System");
            } else if (stderr) {
                Log.warn(`Python emailer stderr for ${functionName}: ${stderr}`, "System");
            }
            if (stdout) {
                Log.info(`Python emailer output: ${stdout}`, "System");
            }
        });
    } catch (err) {
        Log.warn(`Failed to invoke Python emailer: ${err.message}`, "System");
    }
};

/**
 * POS status change
 */
module.exports.onPOSStatusChange = async (
    planOfStudyID,
    studentID,
    oldStatusID,
    newStatusID,
    newStatusName,
    note = null,
    changedByPID = null,
    additionalContext = {}
) => {
    try {
        Log.info(
            `POS Status Change: Plan ${planOfStudyID}, Student ${studentID}, Status ${oldStatusID} -> ${newStatusID}`,
            changedByPID
        );
        // email notifications based on status
        switch (newStatusID) {
            case POS_STATUS.SAVED:
                // Notify advisor(s) that student submitted for review
                if (additionalContext.advisorPID) {
                    callPythonEmailer("pos_submitted_for_review_email", [
                        planOfStudyID,
                        studentID,
                        additionalContext.advisorPID
                    ]);
                }
                break;

            case POS_STATUS.PENDING_GRADUATE_COORDINATOR:
                // Pending coordinator review
                if (additionalContext.committeePIDs && additionalContext.committeePIDs.length > 0) {
                    callPythonEmailer("pos_ready_for_committee_email", [
                        planOfStudyID,
                        studentID,
                        additionalContext.committeePIDs
                    ]);
                }
                break;

            case POS_STATUS.PENDING_FACULTY:
                // Pending faculty review
                if (additionalContext.committeePIDs && additionalContext.committeePIDs.length > 0) {
                    callPythonEmailer("pos_ready_for_committee_email", [
                        planOfStudyID,
                        studentID,
                        additionalContext.committeePIDs
                    ]);
                }
                break;

            case POS_STATUS.AWAITING_KEY:
                // Awaiting key coordinator
                if (additionalContext.committeePIDs && additionalContext.committeePIDs.length > 0) {
                    callPythonEmailer("pos_ready_for_committee_email", [
                        planOfStudyID,
                        studentID,
                        additionalContext.committeePIDs
                    ]);
                }
                break;

            case POS_STATUS.PENDING_GRADUATE_SCHOOL:
                // Pending graduate school review
                if (additionalContext.committeePIDs && additionalContext.committeePIDs.length > 0) {
                    callPythonEmailer("pos_ready_for_committee_email", [
                        planOfStudyID,
                        studentID,
                        additionalContext.committeePIDs
                    ]);
                }
                break;

            case POS_STATUS.APPROVED:
                // Notify student of approval
                callPythonEmailer("pos_approved_email", [studentID, planOfStudyID]);
                
                // Notify admins
                if (additionalContext.adminPIDs && additionalContext.adminPIDs.length > 0) {
                    callPythonEmailer("pos_admin_notification_email", [
                        "approval",
                        studentID,
                        planOfStudyID,
                        additionalContext.adminPIDs
                    ]);
                }
                break;

            case POS_STATUS.REJECTED:
                // Notify student of rejection (always send, even without a note)
                const rejectionNote = note || "Your Plan of Study has been rejected. Please contact your advisor for more information.";
                callPythonEmailer("pos_requires_revision_email", [
                    studentID,
                    planOfStudyID,
                    rejectionNote,
                    changedByPID
                ]);
                // Notify admins
                if (additionalContext.adminPIDs && additionalContext.adminPIDs.length > 0) {
                    callPythonEmailer("pos_admin_notification_email", [
                        "rejection",
                        studentID,
                        planOfStudyID,
                        additionalContext.adminPIDs
                    ]);
                }
                break;

            default:
                // Generic status change notification to student
                // For default case, we have statusID but need to convert to readable format
                const statusMap = {
                    1: "Saved",
                    2: "Pending Graduate Coordinator",
                    3: "Pending Faculty",
                    4: "Awaiting Key",
                    5: "Pending Graduate School",
                    6: "Approved",
                    99: "Rejected"
                };
                const oldStatusName = statusMap[oldStatusID] || `Status ${oldStatusID}`;
                callPythonEmailer("pos_status_changed_email", [
                    studentID,
                    oldStatusName,
                    newStatusName,
                    newStatusName,
                    note
                ]);
        }

        Log.info(
            `POS Status Change notifications sent for Plan ${planOfStudyID}`,
            "System"
        );

    } catch (err) {
        Log.error(
            `Error processing POS status change for Plan ${planOfStudyID}, Student ${studentID}`,
            changedByPID || "System",
            err
        );
        // Don't throw - we don't want email failures to break the status change
    }
};

/**
 * Handle POS submission event
 * @param {number} planOfStudyID - Plan of Study ID
 * @param {number} studentID - Student ID
 * @param {string} advisorPID - Advisor to notify
 */
module.exports.onPOSSubmitted = (planOfStudyID, studentID, advisorPID) => {
    try {
        Log.info(`POS Submitted: Plan ${planOfStudyID}, Student ${studentID}`, "System");
        
        callPythonEmailer("pos_submitted_for_review_email", [planOfStudyID, studentID, advisorPID]);
        
        Log.info(`POS Submitted notification sent for Plan ${planOfStudyID}`, "System");
    } catch (err) {
        Log.error(
            `Error sending POS submission notification for Plan ${planOfStudyID}`,
            "System",
            err
        );
    }
};

/**
 * Handle advisor feedback/comments on POS
 * @param {number} planOfStudyID - Plan of Study ID
 * @param {number} studentID - Student ID
 * @param {string} feedback - Feedback text
 * @param {string} advisorPID - Advisor providing feedback
 * @param {boolean} isRevisionRequest - Whether this is a revision request
 */
module.exports.onPOSFeedback = (
    planOfStudyID,
    studentID,
    feedback,
    advisorPID,
    isRevisionRequest = false
) => {
    try {
        Log.info(
            `POS Feedback: Plan ${planOfStudyID}, Student ${studentID}, From ${advisorPID}`,
            "System"
        );

        if (isRevisionRequest) {
            // Send revision request email
            callPythonEmailer("pos_requires_revision_email", [
                studentID,
                planOfStudyID,
                feedback,
                advisorPID
            ]);
        } else {
            // Send generic feedback notification
            Log.info(`POS Feedback recorded for Plan ${planOfStudyID}`, "System");
        }

    } catch (err) {
        Log.error(
            `Error processing POS feedback for Plan ${planOfStudyID}`,
            "System",
            err
        );
    }
};

/**
 * Send summary email to faculty about pending POS reviews
 * @param {string} advisorPID - Advisor to notify
 * @param {Array} pendingPlans - Array of pending plan info
 */
module.exports.sendPendingReviewsSummary = async (advisorPID, pendingPlans = []) => {
    try {
        if (!pendingPlans || pendingPlans.length === 0) {
            return;
        }

        Log.info(
            `Sending pending reviews summary to advisor ${advisorPID}`,
            "System"
        );

        // This would send a summary email with all pending plans
        // Implementation depends on your email preference
        
    } catch (err) {
        Log.error(
            `Error sending pending reviews summary to advisor ${advisorPID}`,
            "System",
            err
        );
    }
};

/**
 * Send notification to committee about POS ready for review
 * @param {number} planOfStudyID - Plan of Study ID
 * @param {number} studentID - Student ID
 * @param {Array<string>} committeePIDs - Committee member PIDs
 */
module.exports.onPOSReadyForCommittee = (planOfStudyID, studentID, committeePIDs) => {
    try {
        Log.info(
            `POS Ready for Committee: Plan ${planOfStudyID}, Student ${studentID}`,
            "System"
        );

        callPythonEmailer("pos_ready_for_committee_email", [
            planOfStudyID,
            studentID,
            committeePIDs
        ]);

        Log.info(`Committee review notification sent for Plan ${planOfStudyID}`, "System");

    } catch (err) {
        Log.error(
            `Error sending committee notification for Plan ${planOfStudyID}`,
            "System",
            err
        );
    }
};

/**
 * Send approval confirmation to student
 * @param {number} studentID - Student ID
 * @param {number} planOfStudyID - Plan of Study ID
 */
module.exports.onPOSApproved = (studentID, planOfStudyID) => {
    try {
        Log.info(`POS Approved: Plan ${planOfStudyID}, Student ${studentID}`, "System");

        callPythonEmailer("pos_approved_email", [studentID, planOfStudyID]);

        Log.info(`Approval notification sent to student ${studentID}`, "System");

    } catch (err) {
        Log.error(
            `Error sending POS approval notification for student ${studentID}`,
            "System",
            err
        );
    }
};

module.exports.POS_STATUS = POS_STATUS;
