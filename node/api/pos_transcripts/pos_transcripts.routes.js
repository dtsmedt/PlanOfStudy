const { uniqueSuffix } = require("../helpers.js");

module.exports = (app) => {
    const controller = require("./pos_transcripts.controller.js");
    const { isAuthenticated } = require("../auth/auth.status.js");
    const multer = require("multer");
    const storage = multer.diskStorage({
        destination: controller.uploadPath,
        filename: (req, file, cb) => cb(null, file.fieldname + "-" + uniqueSuffix()),
    });
    const upload = multer({ storage, preservePath: true });

    // Status
    app.get("/api/pos_transcripts/info", isAuthenticated, controller.getImportStatus);

    // Import PTD
    app.post("/api/pos_transcripts", isAuthenticated, upload.single("files"), controller.import);
};
