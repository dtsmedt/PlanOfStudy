const { DB, tableNames } = require('../handler');

class PlanOfStudy {
    constructor({
        pos_id,
        pid,
        pos_type,
        committee_chair = null,
        current_status = null
    }) {
        this.pos_id = pos_id;
        this.pid = pid;
        this.pos_type = pos_type;
        this.committee_chair = committee_chair;   // Faculty.pid or null
        this.current_status = current_status;     // POS_Status.status_id or null
    }
    toJSON() {
        return {
            pos_id: this.pos_id,
            pid: this.pid,
            pos_type: this.pos_type,
            committee_chair: this.committee_chair,
            current_status: this.current_status
        };
    }
}
module.exports.PlanOfStudy = PlanOfStudy;

const all_columns = [
    "pos_id",
    "pid",
    "pos_type",
    "committee_chair",
    "current_status"
];

/**
 * Creates a PlanOfStudy for (pid, pos_type).
 * If it already exists (UNIQUE pid+pos_type), returns the existing row.
 */
module.exports.createPlanOfStudy = (pid, pos_type, committee_chair = null, current_status = null) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Check for existing (pid, pos_type)
            const { result: existing } = await DB.selectOneWhere(
                tableNames.posPlanOfStudy, null, [], { pid, pos_type }, []
            );
            if (existing !== null) {
                return resolve(new PlanOfStudy(existing));
            }

            // Insert new
            const insertPayload = { pid, pos_type, committee_chair, current_status };
            await DB.insert(tableNames.posPlanOfStudy, insertPayload);

            // Fetch created row to return consistent object
            const { result: created } = await DB.selectOneWhere(
                tableNames.posPlanOfStudy, null, [], { pid, pos_type }, []
            );
            return resolve(new PlanOfStudy(created));
        } catch (err) {
            console.error(`[ERROR] createPlanOfStudy(${pid}, ${pos_type}) failed: `, err);
            return reject(err);
        }
    });
};

/**
 * Fetch a plan by (pid, pos_type)
 */
module.exports.getPlanyPidAndType = (pid, pos_type) => {
    return new Promise((resolve, reject) => {
        DB.selectOneWhere(
            tableNames.posPlanOfStudy,
            null,
            [],
            { pid, pos_type },
            []
        ).then(({ result }) => {
            if (result === null) return resolve(null);
            return resolve(new PlanOfStudy(result));
        }).catch((err) => {
            console.error(`[ERROR] getPlanyPidAndType(${pid}, ${pos_type}) failed: `, err);
            reject(err);
        });
    });
};

/**
 * Update committee chair by (pid, pos_type). Pass null to clear.
 */
module.exports.setCommitteeChairByPidAndType = (pid, pos_type, committee_chair) => {
    return new Promise((resolve, reject) => {
        DB.update(
            tableNames.posPlanOfStudy,
            { committee_chair }, [],
            { pid, pos_type }, []
        ).then((resp) => resolve(resp))
         .catch((err) => {
            console.error(`[ERROR] setCommitteeChairByPidAndType(${pid}, ${pos_type}) failed: `, err);
            reject(err);
         });
    });
};

/**
 * Update current status by (pid, pos_type). Pass null to clear.
 */
module.exports.setCurrentStatusByPidAndType = (pid, pos_type, status_id) => {
    return new Promise((resolve, reject) => {
        DB.update(
            tableNames.posPlanOfStudy,
            { current_status: status_id }, [],
            { pid, pos_type }, []
        ).then((resp) => resolve(resp))
         .catch((err) => {
            console.error(`[ERROR] setCurrentStatusByPidAndType(${pid}, ${pos_type}) failed: `, err);
            reject(err);
         });
    });
};

/**
 * Delete a plan by (pid, pos_type)
 */
module.exports.deletePlanByPidAndType = (pid, pos_type) => {
    return new Promise((resolve, reject) => {
        DB.delete(
            tableNames.posPlanOfStudy,
            { pid, pos_type }, []
        ).then((resp) => resolve(resp))
         .catch((err) => {
            console.error(`[ERROR] deletePlanByPidAndType(${pid}, ${pos_type}) failed: `, err);
            reject(err);
         });
    });
};

/**
 * List plans with filtering for faculty/status.
 */
module.exports.listPlansByFacultyAndStatus = (filter = {}, sort = ['pos_id'], sort_dir = 'DESC', limit = null, offset = null) => {
    return new Promise((resolve, reject) => {
        let q = `SELECT ${all_columns.join(', ')} FROM \`${tableNames.posPlanOfStudy}\` p`;
        const whereClauses = [];
        const params = [];

        // Build WHERE (same pattern as ForceAdd: OR inside a key, AND across keys)
        for (let key in filter) {
            if (!filter.hasOwnProperty(key)) continue;
            const values = filter[key];
            if (!Array.isArray(values) || values.length === 0) continue;

            const sub = [];
            values.forEach((val) => {
                // Exact-match filters (indexed): committee_chair, current_status, pid, pos_type
                if (['committee_chair', 'current_status', 'pid', 'pos_type'].includes(key)) {
                    sub.push(`p.${key} = ?`);
                    params.push(val);
                } else {
                    // Ignore unsupported keys quietly (or add fuzzy cases later if needed)
                }
            });
            if (sub.length > 0) whereClauses.push("(" + sub.join(" OR ") + ")");
        }

        if (whereClauses.length > 0) q += ` WHERE ${whereClauses.join(" AND ")}`;

        // ORDER BY
        if (Array.isArray(sort) && sort.length > 0) {
            // sanitize column names to safe list
            const allowed = new Set(['pos_id', 'pid', 'pos_type', 'committee_chair', 'current_status']);
            const cols = sort.filter(c => allowed.has(c));
            const dir = (sort_dir === 'ASC') ? 'ASC' : 'DESC';
            if (cols.length > 0) {
                q += ` ORDER BY ${cols.join(` ${dir}, `)} ${dir}`;
            } else {
                q += ` ORDER BY p.pos_id DESC`;
            }
        } else {
            q += ` ORDER BY p.pos_id DESC`;
        }

        // LIMIT/OFFSET
        if (Number.isInteger(limit) && limit > 0) {
            q += ` LIMIT ${limit}`;
            if (Number.isInteger(offset) && offset >= 0) {
                q += ` OFFSET ${offset}`;
            }
        }

        DB.query(q, params).then(({ result }) => {
            return resolve(result.map(r => new PlanOfStudy(r)));
        }).catch((err) => {
            console.error(`[ERROR] listPlansByFacultyAndStatus query failed: `, err);
            reject(err);
        });
    });
};

/**
 * List plans with filtering for faculty/status, with status and type labels.
 * Shows labels for pending plans on the student search page.
 */
module.exports.listPlansByFacultyAndStatusWithLabels = (filter = {}, sort = ['pos_id'], sort_dir = 'DESC', limit = null, offset = null) => {
    return new Promise((resolve, reject) => {
        let q = 
        `SELECT p.*,
        s.status AS pos_status_label,
        pt.type AS pos_type_label
        FROM \`${tableNames.posPlanOfStudy}\` p
        LEFT JOIN \`${tableNames.posStatus}\` s
            ON p.current_status = s.status_id
        LEFT JOIN \`${tableNames.posType}\` pt
            ON p.pos_type = pt.pos_type_id
        `;
        const whereClauses = [];
        const params = [];

        // Build WHERE (same pattern as ForceAdd: OR inside a key, AND across keys)
        for (let key in filter) {
            if (!filter.hasOwnProperty(key)) continue;
            const values = filter[key];
            if (!Array.isArray(values) || values.length === 0) continue;

            const sub = [];
            values.forEach((val) => {
                // Exact-match filters (indexed): committee_chair, current_status, pid, pos_type
                if (['committee_chair', 'current_status', 'pid', 'pos_type'].includes(key)) {
                    sub.push(`p.${key} = ?`);
                    params.push(val);
                } else {
                    // Ignore unsupported keys quietly (or add fuzzy cases later if needed)
                }
            });
            if (sub.length > 0) whereClauses.push("(" + sub.join(" OR ") + ")");
        }

        if (whereClauses.length > 0) q += ` WHERE ${whereClauses.join(" AND ")}`;

        // ORDER BY
        if (Array.isArray(sort) && sort.length > 0) {
            // sanitize column names to safe list
            const allowed = new Set(['pos_id', 'pid', 'pos_type', 'committee_chair', 'current_status']);
            const cols = sort.filter(c => allowed.has(c));
            const dir = (sort_dir === 'ASC') ? 'ASC' : 'DESC';
            if (cols.length > 0) {
                q += ` ORDER BY ${cols.join(` ${dir}, `)} ${dir}`;
            } else {
                q += ` ORDER BY p.pos_id DESC`;
            }
        } else {
            q += ` ORDER BY p.pos_id DESC`;
        }

        // LIMIT/OFFSET
        if (Number.isInteger(limit) && limit > 0) {
            q += ` LIMIT ${limit}`;
            if (Number.isInteger(offset) && offset >= 0) {
                q += ` OFFSET ${offset}`;
            }
        }

        //Note that this doesn't map to a POS class
        DB.query(q, params).then(({ result }) => {
            return resolve(result);
        }).catch((err) => {
            console.error(`[ERROR] listPlansByFacultyAndStatus query failed: `, err);
            reject(err);
        });
    });
};