// pos.routes.js
module.exports = (app) => {
  const posController = require("./pos.controller.js");
  const { isAuthenticated } = require("../auth/auth.status.js");

  const bodyParser = require("body-parser");
  const jsonParser = bodyParser.json();

  // session/me route
  app.get("/api/pos/session/me", isAuthenticated, posController.getSessionUser);

  // dropdowns
  app.get("/api/pos/areas",   isAuthenticated, posController.getPOS_Areas);
  app.get("/api/pos/terms",   isAuthenticated, posController.getPOS_Terms);
  app.get("/api/pos/courses", isAuthenticated, posController.getPOS_Courses);
  app.get("/api/pos/faculty", isAuthenticated, posController.getPOS_Faculty);
  //Faculty Filtering by POS type
  app.get("/api/pos/types", isAuthenticated, posController.getPOS_Types);
  app.get("/api/pos/statuses", isAuthenticated, posController.getPOS_Statuses);

  // student
  app.get ("/api/pos/is-student",      isAuthenticated, posController.getPOS_IsStudent);
  app.post("/api/pos/ensure-student",  isAuthenticated, posController.ensurePOS_Student);

  // POS
  app.post("/api/pos/plan",            isAuthenticated, jsonParser, posController.createPOS_Plan);
  app.patch("/api/pos/plan/committee", isAuthenticated, jsonParser, posController.setPOS_CommitteeChair);
  app.patch("/api/pos/plan/status",    isAuthenticated, jsonParser, posController.setPOS_CurrentStatus);

  app.get("/api/pos/plan", isAuthenticated, posController.getPOS_Plan);
  app.get("/api/pos/students", isAuthenticated, posController.getPOS_Students);

  // Planned Courses
  app.get ("/api/pos/plan/courses",  isAuthenticated, posController.getPOS_PlannedCourses);
  app.put ("/api/pos/plan/courses",  isAuthenticated, jsonParser, posController.replacePOS_PlannedCourses); 
  app.post("/api/pos/plan/course",   isAuthenticated, jsonParser, posController.addPOS_PlannedCourse);
  app.put ("/api/pos/plan/course/:id", isAuthenticated, jsonParser, posController.updatePOS_PlannedCourseTermYear);
  app.delete("/api/pos/plan/course/:id", isAuthenticated, posController.deletePOS_PlannedCourse);

  // Transfer Courses
  app.get ("/api/pos/plan/transfers", isAuthenticated,  posController.getPOS_Transfers);
  app.put ("/api/pos/plan/transfers", isAuthenticated, jsonParser, posController.replacePOS_Transfers);
  app.post("/api/pos/plan/transfer",  isAuthenticated, jsonParser, posController.addPOS_Transfer);
  app.delete("/api/pos/plan/transfer/:id",  isAuthenticated,  posController.deletePOS_Transfer);

  // History
  app.get ("/api/pos/plan/history", isAuthenticated,  posController.getPOS_History);
  app.post ("/api/pos/plan/history/comment", isAuthenticated, jsonParser, posController.addPOS_Comment);
  app.post ("/api/pos/plan/update-status", isAuthenticated, jsonParser, posController.updatePOS_Status);

  // Committee members
  app.put("/api/pos/plan/committee-members", isAuthenticated, jsonParser, posController.replacePOS_CommitteeMembers);
  app.get("/api/pos/plan/committee-members", isAuthenticated, posController.getPOS_CommitteeMembers);

  // Student Transcript
  app.get("/api/pos/transcripts", isAuthenticated, posController.getPOS_TranscriptsForStudent);
  
  // Ignored transcript courses (Taken but not Planned -> Ignore)
  app.get("/api/pos/plan/ignored-courses", isAuthenticated, posController.getPOS_IgnoredCourses);
  app.post("/api/pos/plan/ignored-course", isAuthenticated, jsonParser, posController.addPOS_IgnoredCourse);

  //POS Lookup
  app.get("/api/pos/pending", isAuthenticated, posController.getPendingPOS);
};
