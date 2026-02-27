const { DB, tableNames } = require('../handler');

class Area {
  constructor({ POS_Area, Area_Description }) {
    this.area_id = POS_Area;
    this.area_description = Area_Description;
  }
  toJSON() {
    return {
      POS_Area: this.area_id,
      Area_Description: this.area_description,
    };
  }
}
module.exports.Area = Area;

// normalize DB.query result (array vs { result: array })
function normalizeRows(execResult) {
  return Array.isArray(execResult) ? execResult : (execResult && execResult.result) || [];
}

/** Get one area by id. Returns null if not found. */
module.exports.getAreaById = (areaId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT POS_Area, Area_Description
      FROM ${tableNames.posAreas}
      WHERE POS_Area = ?
      LIMIT 1
    `;
    DB.query(sql, [areaId])
      .then((res) => {
        const rows = normalizeRows(res);
        if (rows.length) return resolve(new Area(rows[0]));
        return resolve(null);
      })
      .catch(reject);
  });
};

/** List all areas ordered by id. */
module.exports.listAllAreas = () => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT POS_Area, Area_Description
      FROM ${tableNames.posAreas}
      ORDER BY POS_Area ASC
    `;
    DB.query(sql, [])
      .then((res) => {
        const rows = normalizeRows(res);
        console.log('listAllAreas: results', { count: rows.length });
        resolve(rows.map((r) => new Area(r)));
      })
      .catch(reject);
  });
};

/** For dropdowns: returns { value, label } pairs */
module.exports.listAreaAndDesc = () => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT POS_Area, Area_Description
      FROM ${tableNames.posAreas}
      ORDER BY POS_Area ASC
    `;
    DB.query(sql, [])
      .then((res) => {
        const rows = normalizeRows(res);
        const opts = rows.map((r) => ({ value: r.POS_Area, label: r.Area_Description }));
        console.log('listAreaOptions: results', { count: opts.length });
        resolve(opts);
      })
      .catch(reject);
  });
};
