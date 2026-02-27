const fs = require("fs");
const { getCurrentUser } = require("../helpers");
const { DB } = require("../../database/handler");
const Log = require("../../database/utils/Log");
const { worker } = require("./pos_transcripts.import-worker");

const fileTypes = ["XLSX"];
module.exports.uploadPath = "/tmp/pos-tool/uploads-transcripts";
fs.mkdirSync(module.exports.uploadPath, { recursive: true });


let importInfo = null;

module.exports.getImportStatus = (req, res) => {
    const currentUserPID = getCurrentUser(res)?.pid;
    const isProcessing = DB.isLocked();

    res.on("finish", () => {
    if (currentUserPID === importInfo?.details?.initiatingUser && !isProcessing) {
        importInfo = null;
    }
    });

    return res.status(200).send({isProcessing, info: importInfo?.details || null,});
};

module.exports.import = async (req, res) => {
    const currentUserPID = getCurrentUser(res)?.pid;
    Log.info(`Received request to import POS_Transcripts.`, currentUserPID);

    if (!DB.attemptLock()) {
        Log.info(`POS_Transcripts import: Abort: lock held.`, currentUserPID);
        return res.status(400).send({ message: "A submission is currently being processed. Please try again in a moment." });
    }

    const ptdFile = req.file;

    if (!ptdFile) {
        DB.unlock();
        Log.info(`POS_Transcripts import: Abort: No input file.`, currentUserPID);
        return res.status(400).send({ message: "Must supply an input file" });
    } else if (!fileTypes.includes(ptdFile.originalname.split(".").pop().toUpperCase())) {
        DB.unlock();
        Log.info(`POS_Transcripts import: Abort: Not XLSX.`, currentUserPID);
        return res.status(400).send({ message: "File uploaded was not XLSX." });
    }

    importInfo = {
        details: {
            initiatingUser: currentUserPID,
            errorMessage: null,
            progressMsg: "Connecting to the database...",
        },
        ptdFile,
    };

    try {
        await worker(importInfo);
    } catch (err) {
        DB.unlock();
        return res.status(400).send({ message: err.message });
    }

    DB.unlock();
    return res.status(204).send();
};
