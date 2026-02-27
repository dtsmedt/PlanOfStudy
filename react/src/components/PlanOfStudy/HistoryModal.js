import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import axios from "axios";
import "../../../css/POS_HistoryModal.css";

const STATUS_LABELS = {
  1: "Saved",
  2: "Pending Graduate Coordinator",
  3: "Pending Faculty",
  4: "Awaiting Key",
  5: "Pending Graduate School",
  6: "Approved",
  99: "Rejected",
};

function getStatusLabel(code) {
  const n = Number(code);
  return STATUS_LABELS[n] || (code == null ? "—" : String(code));
}

// Fetches the students plan with degreeType
// pidOverride / posTypeOverride so faculty can view a specific student's plan history
export default function HistoryModal({ degreeType, pidOverride, posTypeOverride }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  const [sortField, setSortField] = useState("date_changed");
  const [sortDirection, setSortDirection] = useState("desc"); // newest first

  const loadHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let pid = pidOverride ?? null;
      let pos_type = posTypeOverride ?? null;

      // If no overrides provided (student view), fall back to /is-student
      if (!pid || pos_type == null) {
        const check = await axios.get("/api/pos/is-student");
        if (!check?.data?.exists) {
          setRows([]);
          return;
        }

        pid = check.data.pid;
        pos_type =
          degreeType === "MS"
            ? 1
            : degreeType === "PhD"
            ? 2
            : 3;
      }

      const { data } = await axios.get("/api/pos/plan/history", {
        params: { pid, pos_type },
      });

      const historyList = (data?.history || []).map((h) => ({
        ...h,
        date_changed: h.date_changed ? new Date(h.date_changed) : null,
      }));

      setRows(historyList);
    } catch (err) {
      console.error("Failed to load plan history:", err);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to load plan history.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [degreeType, pidOverride, posTypeOverride]);

  const handleToggle = async () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      await loadHistory();
    }
  };

  // Handle clicking on a header to sort
  const handleSort = (field) => {
    setSortField((prevField) => {
      if (prevField === field) {
        // toggle direction if same field
        setSortDirection((prevDir) =>
          prevDir === "asc" ? "desc" : "asc"
        );
        return prevField;
      } else {
        // default direction per field
        setSortDirection(field === "date_changed" ? "desc" : "asc");
        return field;
      }
    });
  };

  // Sorted rows
  const sortedRows = useMemo(() => {
    if (!rows || rows.length === 0) return rows;

    const dir = sortDirection === "asc" ? 1 : -1;

    return [...rows].sort((a, b) => {
      let av;
      let bv;

      switch (sortField) {
        case "changed_by":
          av = a.changed_by || "";
          bv = b.changed_by || "";
          return av.localeCompare(bv) * dir;

        case "history_status": {
          const aLabel = getStatusLabel(a.history_status);
          const bLabel = getStatusLabel(b.history_status);
          return aLabel.localeCompare(bLabel) * dir;
        }

        case "note":
          av = a.note || "";
          bv = b.note || "";
          return av.localeCompare(bv) * dir;

        case "date_changed":
        default:
          av = a.date_changed ? a.date_changed.getTime() : 0;
          bv = b.date_changed ? b.date_changed.getTime() : 0;
          return (av - bv) * dir;
      }
    });
  }, [rows, sortField, sortDirection]);

  // ESC key + body scroll locking
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const getAriaSort = (field) => {
    if (sortField !== field) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  };

  const renderSortIndicator = (field) => {
    if (sortField !== field) return null;
    return (
      <span className="history-sort-indicator">
        {sortDirection === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  return (
    <>
      {/* History button (drop this into your header via this component) */}
      <div className="history-bar">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleToggle}
          aria-expanded={isOpen ? "true" : "false"}
          aria-controls="pos-history-modal"
        >
          History
        </button>
      </div>

      {/* History Modal */}
      {isOpen && (
        <div
          id="pos-history-modal"
          className="history-modal__backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-modal-title"
          onMouseDown={(e) => {
            // click outside the window closes the modal
            if (e.target.classList.contains("history-modal__backdrop")) {
              setIsOpen(false);
            }
          }}
        >
          <div className="history-modal__window" role="document">
            <div className="history-modal__header">
              <h3 id="history-modal-title" className="history-modal__title">
                Plan History
              </h3>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setIsOpen(false)}
                aria-label="Close history window"
              >
                Close
              </button>
            </div>

            <div className="history-modal__body">
              {isLoading && (
                <div className="history-panel__loading">Loading…</div>
              )}
              {error && <div className="history-panel__error">{error}</div>}

              {!isLoading && !error && (
                sortedRows.length ? (
                  <div className="table-wrap history-table-wrap">
                    <table className="table table-striped">
                      <thead>
                        <tr>
                          <th
                            scope="col"
                            className="history-header--sortable"
                            aria-sort={getAriaSort("changed_by")}
                            onClick={() => handleSort("changed_by")}
                          >
                            <span>Changed By</span>
                            {renderSortIndicator("changed_by")}
                          </th>
                          <th
                            scope="col"
                            className="history-header--sortable"
                            aria-sort={getAriaSort("history_status")}
                            onClick={() => handleSort("history_status")}
                          >
                            <span>Status</span>
                            {renderSortIndicator("history_status")}
                          </th>
                          <th
                            scope="col"
                            className="history-header--sortable"
                            aria-sort={getAriaSort("note")}
                            onClick={() => handleSort("note")}
                          >
                            <span>Note</span>
                            {renderSortIndicator("note")}
                          </th>
                          <th
                            scope="col"
                            className="history-header--sortable"
                            aria-sort={getAriaSort("date_changed")}
                            onClick={() => handleSort("date_changed")}
                          >
                            <span>Date</span>
                            {renderSortIndicator("date_changed")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((h) => (
                          <tr
                            key={
                              h.history_id ??
                              `${h.date_changed?.getTime() || 0}-${
                                h.changed_by || "unk"
                              }`
                            }
                          >
                            <td>{h.changed_by || "—"}</td>
                            <td>{getStatusLabel(h.history_status)}</td>
                            <td>{h.note || "—"}</td>
                            <td>
                              {h.date_changed
                                ? h.date_changed.toLocaleString()
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="history-panel__empty">
                    No history entries yet.
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
