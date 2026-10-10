/**
 * Vehicle Minder — Custom Lovelace Panel
 *
 * Layout mirrors the Appliances UI pattern from the reference screenshots:
 *   - Fleet view: full-width list of vehicles with action buttons
 *   - Detail view: sidebar list + main pane with tabs (Service Records / Maintenance)
 */

const DOMAIN = "vehicle_minder";

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function fmt(n) {
  return n != null ? Number(n).toLocaleString() : "—";
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function lastServicedDate(vehicle, itemName) {
  const records = Object.values(vehicle.service_records || {});
  const matches = records
    .filter((r) => r.service_type && r.service_type.toLowerCase() === itemName.toLowerCase())
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return matches.length ? matches[0].date : null;
}

// Find the pre-computed status entry for a maintenance item by name.
// Falls back to a simple local calculation if maintenance_status is absent
// (e.g. before the sensor attribute propagates).
function getItemStatus(vehicle, itemName) {
  const statuses = vehicle.maintenance_status || [];
  return statuses.find((s) => s.name.toLowerCase() === itemName.toLowerCase()) || null;
}

function fmtOverdueBy(status) {
  if (!status || !status.overdue) return null;
  const type = status.interval_type;
  const by = status.overdue_by;
  if (type === "distance") return `${fmt(by)} mi overdue`;
  if (type === "hours")    return `${fmt(by)} hrs overdue`;
  if (type === "months")   return `${by} day${by !== 1 ? "s" : ""} overdue`;
  return "overdue";
}

// ---------------------------------------------------------------------------
// Styles — uses HA CSS variables so it blends with any theme
// ---------------------------------------------------------------------------

const STYLES = `
  :host {
    display: block;
    height: 100%;
    font-family: var(--primary-font-family, Roboto, sans-serif);
    color: var(--primary-text-color);
    background: var(--lovelace-background, var(--primary-background-color));
  }

  /* ── Top toolbar ── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    background: var(--app-header-background-color, var(--primary-color));
    color: var(--app-header-text-color, #fff);
    box-shadow: 0 2px 4px rgba(0,0,0,.2);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .toolbar img.logo {
    width: 32px;
    height: 32px;
    object-fit: contain;
    filter: brightness(0) invert(1);
  }
  .toolbar h1 {
    flex: 1;
    margin: 0;
    font-size: 1.1rem;
    font-weight: 500;
    letter-spacing: .02em;
  }

  /* ── Buttons ── */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    border-radius: 20px;
    border: none;
    cursor: pointer;
    font-size: .85rem;
    font-weight: 500;
    transition: filter .15s, opacity .15s;
  }
  .btn:hover { filter: brightness(.92); }
  .btn:active { opacity: .8; }
  .btn-primary {
    background: var(--primary-color);
    color: #fff;
  }
  .btn-secondary {
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
    border: 1px solid var(--divider-color);
  }
  .btn-danger {
    background: transparent;
    color: var(--error-color, #db4437);
    border: 1px solid var(--error-color, #db4437);
  }
  .btn-sm {
    padding: 4px 11px;
    font-size: .78rem;
  }
  .btn svg { flex-shrink: 0; }

  /* ── Fleet (list) view ── */
  .fleet-view {
    padding: 20px;
  }
  .fleet-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .search-box {
    flex: 1;
    min-width: 140px;
    max-width: 300px;
    padding: 7px 12px;
    border-radius: 20px;
    border: 1px solid var(--divider-color);
    background: var(--card-background-color);
    color: var(--primary-text-color);
    font-size: .88rem;
    outline: none;
  }
  .search-box:focus { border-color: var(--primary-color); }

  /* Vehicle list rows */
  .vehicle-list {
    border: 1px solid var(--divider-color);
    border-radius: 8px;
    overflow: hidden;
    background: var(--card-background-color);
  }
  .vehicle-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--divider-color);
    cursor: pointer;
    transition: background .12s;
  }
  .vehicle-row:last-child { border-bottom: none; }
  .vehicle-row:hover { background: var(--secondary-background-color); }
  .vehicle-row.selected { background: color-mix(in srgb, var(--primary-color) 10%, transparent); }
  .vehicle-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--primary-color) 15%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--primary-color);
  }
  .vehicle-info { flex: 1; min-width: 0; }
  .vehicle-name { font-weight: 500; font-size: .95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vehicle-sub { font-size: .8rem; color: var(--secondary-text-color); margin-top: 2px; }
  .vehicle-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
  .vehicle-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 12px;
    border: 1px solid var(--divider-color);
    font-size: .75rem;
    color: var(--secondary-text-color);
    cursor: pointer;
    transition: background .12s;
    white-space: nowrap;
  }
  .vehicle-badge:hover { background: var(--secondary-background-color); }

  .empty-state {
    padding: 40px;
    text-align: center;
    color: var(--secondary-text-color);
    font-size: .9rem;
  }
  .empty-state svg { display: block; margin: 0 auto 12px; opacity: .4; }

  /* ── Detail view (sidebar + main) ── */
  .detail-view {
    display: flex;
    height: calc(100vh - 57px);
    overflow: hidden;
  }

  /* Sidebar */
  .sidebar {
    width: 280px;
    flex-shrink: 0;
    border-right: 1px solid var(--divider-color);
    background: var(--card-background-color);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .sidebar-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--divider-color);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sidebar-back {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--primary-color);
    font-size: .85rem;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 0;
  }
  .sidebar-back:hover { text-decoration: underline; }
  .sidebar-list { flex: 1; overflow-y: auto; }
  .sidebar-item {
    padding: 12px 16px;
    cursor: pointer;
    border-bottom: 1px solid var(--divider-color);
    transition: background .12s;
    border-left: 3px solid transparent;
  }
  .sidebar-item:hover { background: var(--secondary-background-color); }
  .sidebar-item.active {
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    border-left-color: var(--primary-color);
  }
  .sidebar-item-name { font-weight: 500; font-size: .9rem; }
  .sidebar-item-sub { font-size: .78rem; color: var(--secondary-text-color); margin-top: 2px; }
  .sidebar-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--divider-color);
  }

  /* Main pane */
  .main-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--lovelace-background, var(--primary-background-color));
  }
  .main-header {
    padding: 20px 24px 0;
    border-bottom: 1px solid var(--divider-color);
    background: var(--card-background-color);
  }
  .main-title { font-size: 1.3rem; font-weight: 600; margin: 0 0 4px; }
  .main-sub { font-size: .83rem; color: var(--secondary-text-color); margin-bottom: 14px; }
  .main-actions { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: none;
    margin-top: 4px;
  }
  .tab {
    padding: 10px 20px;
    cursor: pointer;
    font-size: .88rem;
    font-weight: 500;
    color: var(--secondary-text-color);
    border-bottom: 3px solid transparent;
    transition: color .15s, border-color .15s;
    white-space: nowrap;
  }
  .tab:hover { color: var(--primary-text-color); }
  .tab.active {
    color: var(--primary-color);
    border-bottom-color: var(--primary-color);
  }

  /* Tab content */
  .tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
  }
  .section-label {
    font-size: .75rem;
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--secondary-text-color);
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  /* Table */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: .86rem;
  }
  .data-table th {
    text-align: left;
    padding: 8px 12px;
    font-size: .75rem;
    font-weight: 600;
    letter-spacing: .05em;
    text-transform: uppercase;
    color: var(--secondary-text-color);
    border-bottom: 2px solid var(--divider-color);
  }
  .data-table td {
    padding: 11px 12px;
    border-bottom: 1px solid var(--divider-color);
    vertical-align: middle;
  }
  .data-table tbody tr:last-child td { border-bottom: none; }
  .data-table tbody tr:hover { background: var(--secondary-background-color); }

  .info-box {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--info-color, #4fc3f7) 10%, transparent);
    color: var(--primary-text-color);
    font-size: .86rem;
  }
  .info-box svg { color: var(--info-color, #4fc3f7); flex-shrink: 0; }

  /* ── Modal ── */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.45);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .modal {
    background: var(--card-background-color);
    border-radius: 12px;
    width: 100%;
    max-width: 480px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,.25);
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px 12px;
    border-bottom: 1px solid var(--divider-color);
  }
  .modal-title { font-size: 1rem; font-weight: 600; margin: 0; }
  .modal-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--secondary-text-color);
    padding: 4px;
    line-height: 1;
    font-size: 1.2rem;
  }
  .modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 20px 18px;
    border-top: 1px solid var(--divider-color);
  }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-label { font-size: .82rem; font-weight: 500; color: var(--secondary-text-color); }
  .form-input, .form-select, .form-textarea {
    padding: 8px 12px;
    border: 1px solid var(--divider-color);
    border-radius: 6px;
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
    font-size: .9rem;
    font-family: inherit;
    outline: none;
    transition: border-color .15s;
  }
  .form-input:focus, .form-select:focus, .form-textarea:focus {
    border-color: var(--primary-color);
  }
  .form-textarea { resize: vertical; min-height: 70px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-hint { font-size: .75rem; color: var(--secondary-text-color); margin-top: 2px; }
  .interval-toggle { display: flex; gap: 0; border: 1px solid var(--divider-color); border-radius: 6px; overflow: hidden; }
  .interval-toggle label {
    flex: 1;
    text-align: center;
    padding: 7px 4px;
    cursor: pointer;
    font-size: .82rem;
    transition: background .12s, color .12s;
  }
  .interval-toggle input[type=radio] { display: none; }
  .interval-toggle input[type=radio]:checked + label {
    background: var(--primary-color);
    color: #fff;
  }

  /* ── Overdue warning badge (inline in vehicle name) ── */
  .overdue-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--error-color, #db4437) 15%, transparent);
    color: var(--error-color, #db4437);
    font-size: .75rem;
    font-weight: 600;
    vertical-align: middle;
  }

  /* Alert state for the vehicle icon circle */
  .vehicle-icon--alert {
    background: color-mix(in srgb, var(--error-color, #db4437) 15%, transparent);
    color: var(--error-color, #db4437);
  }

  /* ── Status chips in maintenance table ── */
  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px 9px;
    border-radius: 10px;
    font-size: .76rem;
    font-weight: 500;
    white-space: nowrap;
  }
  .status-chip--overdue {
    background: color-mix(in srgb, var(--error-color, #db4437) 15%, transparent);
    color: var(--error-color, #db4437);
  }
  .status-chip--ok {
    background: color-mix(in srgb, var(--success-color, #4caf50) 15%, transparent);
    color: var(--success-color, #4caf50);
  }
  .status-chip--unknown {
    color: var(--secondary-text-color);
  }

  /* Highlight overdue rows in the maintenance table */
  .row-overdue td:first-child {
    border-left: 3px solid var(--error-color, #db4437);
    padding-left: 9px;
  }
`;

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------

const ICON = {
  car: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
  back: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
  wrench: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>`,
  history: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>`,
  speedometer: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v-6h-2v6zm0-8h2V7h-2v2z"/></svg>`,
  close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`,
  warning: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
};

// ---------------------------------------------------------------------------
// Main panel element
// ---------------------------------------------------------------------------

class VehicleMinderPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._view = "fleet"; // "fleet" | "detail"
    this._selectedId = null;
    this._activeTab = "service";
    this._search = "";
    this._modal = null; // "add_vehicle" | "add_service" | "add_maintenance" | "update_mileage"
    this._fleet = {};
  }

  set hass(hass) {
    this._hass = hass;
    this._syncFleet();
    this._render();
  }

  // Pull vehicle data from sensor state attributes
  _syncFleet() {
    if (!this._hass) return;
    const fleet = {};
    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if (!entityId.startsWith(`sensor.${DOMAIN}_`) && !entityId.startsWith(`sensor.`)) continue;
      const attrs = state.attributes || {};
      if (!attrs.vehicle_id) continue;
      fleet[attrs.vehicle_id] = {
        vehicle_id: attrs.vehicle_id,
        name: attrs.friendly_name || entityId,
        make: attrs.make || "",
        model: attrs.model || "",
        year: attrs.year || "",
        vehicle_type: attrs.vehicle_type || "car",
        vin: attrs.vin || null,
        current_mileage: Number(state.state) || attrs.current_mileage || 0,
        current_hours: attrs.current_hours || 0,
        overdue_count: attrs.overdue_count || 0,
        maintenance_status: attrs.maintenance_status || [],
        maintenance_items: this._indexById(attrs.maintenance_items || [], "item_id"),
        service_records: this._indexById(attrs.service_records || [], "record_id"),
      };
    }
    this._fleet = fleet;
    // If selected vehicle was deleted, go back to fleet
    if (this._selectedId && !fleet[this._selectedId]) {
      this._view = "fleet";
      this._selectedId = null;
    }
  }

  _indexById(arr, key) {
    if (Array.isArray(arr)) {
      return arr.reduce((acc, item) => { acc[item[key]] = item; return acc; }, {});
    }
    return arr || {};
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  _render() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>${STYLES}</style>${this._renderToolbar()}${this._renderBody()}${this._renderModal()}`;
    this._bindEvents();
  }

  _renderToolbar() {
    return `
      <div class="toolbar">
        <img class="logo" src="/local/vehicle-minder/icon.png" alt="VM" onerror="this.style.display='none'">
        <h1>Vehicle Minder</h1>
        <button class="btn btn-primary" data-action="open-modal" data-modal="add_vehicle">
          ${ICON.plus} Add Vehicle
        </button>
      </div>`;
  }

  _renderBody() {
    if (this._view === "detail" && this._selectedId) {
      return this._renderDetailView();
    }
    return this._renderFleetView();
  }

  // ── Fleet view ─────────────────────────────────────────────────────────────

  _renderFleetView() {
    const vehicles = Object.values(this._fleet).filter((v) => {
      if (!this._search) return true;
      const q = this._search.toLowerCase();
      return (
        v.name.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        String(v.year).includes(q)
      );
    });

    const rows = vehicles.length
      ? vehicles.map((v) => this._renderVehicleRow(v)).join("")
      : `<div class="empty-state">
          ${ICON.car.replace('width="20" height="20"', 'width="48" height="48"')}
          No vehicles yet. Click <strong>Add Vehicle</strong> to get started.
        </div>`;

    return `
      <div class="fleet-view">
        <div class="fleet-controls">
          <input class="search-box" type="search" placeholder="Search vehicles…" value="${this._escape(this._search)}" data-action="search">
        </div>
        <div class="vehicle-list">${rows}</div>
      </div>`;
  }

  _renderVehicleRow(v) {
    const sub = [v.year, v.make, v.model].filter(Boolean).join(" ");
    const mileage = `${fmt(v.current_mileage)} mi`;
    const maintCount = Object.keys(v.maintenance_items).length;
    const svcCount = Object.keys(v.service_records).length;
    const overdueCount = v.overdue_count || 0;
    const overdueWarning = overdueCount > 0
      ? `<span class="overdue-badge" title="${overdueCount} maintenance item${overdueCount !== 1 ? "s" : ""} overdue">
           ${ICON.warning} ${overdueCount} overdue
         </span>`
      : "";

    return `
      <div class="vehicle-row" data-action="select-vehicle" data-id="${v.vehicle_id}">
        <div class="vehicle-icon${overdueCount > 0 ? " vehicle-icon--alert" : ""}">${ICON.car}</div>
        <div class="vehicle-info">
          <div class="vehicle-name">${this._escape(v.name)} ${overdueWarning}</div>
          <div class="vehicle-sub">${this._escape(sub)}${v.vin ? ` · ${v.vin}` : ""}</div>
        </div>
        <div class="vehicle-actions" data-stop-propagation="1">
          <span class="vehicle-badge" data-action="open-modal" data-modal="update_mileage" data-id="${v.vehicle_id}" title="Update mileage">
            ${ICON.speedometer} ${mileage}
          </span>
          <span class="vehicle-badge" data-action="open-modal" data-modal="add_maintenance" data-id="${v.vehicle_id}" title="Add maintenance item">
            ${ICON.wrench} ${maintCount} item${maintCount !== 1 ? "s" : ""}
          </span>
          <span class="vehicle-badge" data-action="open-modal" data-modal="add_service" data-id="${v.vehicle_id}" title="Add service record">
            ${ICON.history} ${svcCount} record${svcCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>`;
  }

  // ── Detail view ────────────────────────────────────────────────────────────

  _renderDetailView() {
    const vehicle = this._fleet[this._selectedId];
    if (!vehicle) return this._renderFleetView();

    const sidebarItems = Object.values(this._fleet)
      .map((v) => {
        const sub = [v.year, v.make, v.model].filter(Boolean).join(" ");
        const active = v.vehicle_id === this._selectedId ? " active" : "";
        return `
          <div class="sidebar-item${active}" data-action="select-vehicle" data-id="${v.vehicle_id}">
            <div class="sidebar-item-name">${this._escape(v.name)}</div>
            <div class="sidebar-item-sub">${this._escape(sub)}</div>
          </div>`;
      })
      .join("");

    const tabContent =
      this._activeTab === "service"
        ? this._renderServiceTab(vehicle)
        : this._renderMaintenanceTab(vehicle);

    const sub = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
    return `
      <div class="detail-view">
        <div class="sidebar">
          <div class="sidebar-header">
            <button class="sidebar-back" data-action="back">
              ${ICON.back} Back
            </button>
          </div>
          <div class="sidebar-list">${sidebarItems}</div>
          <div class="sidebar-footer">
            <button class="btn btn-primary" style="width:100%;justify-content:center" data-action="open-modal" data-modal="add_vehicle">
              ${ICON.plus} Add Vehicle
            </button>
          </div>
        </div>

        <div class="main-pane">
          <div class="main-header">
            <div class="main-title">${this._escape(vehicle.name)}</div>
            <div class="main-sub">${this._escape(sub)}${vehicle.vin ? ` · VIN: ${vehicle.vin}` : ""} · ${fmt(vehicle.current_mileage)} mi</div>
            <div class="main-actions">
              <button class="btn btn-primary btn-sm" data-action="open-modal" data-modal="add_service" data-id="${vehicle.vehicle_id}">
                ${ICON.plus} Add Service Record
              </button>
              <button class="btn btn-secondary btn-sm" data-action="open-modal" data-modal="add_maintenance" data-id="${vehicle.vehicle_id}">
                ${ICON.plus} Add Maintenance Item
              </button>
              <button class="btn btn-secondary btn-sm" data-action="open-modal" data-modal="update_mileage" data-id="${vehicle.vehicle_id}">
                ${ICON.speedometer} Update Mileage
              </button>
               <button class="btn btn-danger btn-sm" data-action="open-modal" data-modal="delete_vehicle" data-id="${vehicle.vehicle_id}" style="background-color: #dc3545; color: white;">
              Delete Vehicle
              </button>
            </div>
            <div class="tabs">
              <div class="tab${this._activeTab === "service" ? " active" : ""}" data-action="tab" data-tab="service">Service Records</div>
              <div class="tab${this._activeTab === "maintenance" ? " active" : ""}" data-action="tab" data-tab="maintenance">Maintenance Items</div>
            </div>
          </div>
          <div class="tab-content">${tabContent}</div>
        </div>
      </div>`;
  }

  _renderServiceTab(vehicle) {
    const records = Object.values(vehicle.service_records).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    if (!records.length) {
      return `
        <div class="section-label">
          <span>SERVICE RECORDS</span>
          <button class="btn btn-primary btn-sm" data-action="open-modal" data-modal="add_service" data-id="${vehicle.vehicle_id}">${ICON.plus} Add Record</button>
        </div>
        <div class="info-box">${ICON.info} No service records yet. Click <strong>&nbsp;+ Add Service Record&nbsp;</strong> to log the first one.</div>`;
    }

    const rows = records
      .map(
        (r) => `
      <tr>
        <td>${fmtDate(r.date)}</td>
        <td>${this._escape(r.service_type)}</td>
        <td>${fmt(r.mileage)} mi</td>
        <td>$${Number(r.cost).toFixed(2)}</td>
        <td style="color:var(--secondary-text-color)">${this._escape(r.notes || "")}</td>
      </tr>`
      )
      .join("");

    return `
      <div class="section-label">
        <span>SERVICE RECORDS</span>
        <button class="btn btn-primary btn-sm" data-action="open-modal" data-modal="add_service" data-id="${vehicle.vehicle_id}">${ICON.plus} Add Record</button>
      </div>
      <table class="data-table">
        <thead><tr>
          <th>Date</th><th>Service Type</th><th>Mileage</th><th>Cost</th><th>Notes</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  _renderMaintenanceTab(vehicle) {
    const items = Object.values(vehicle.maintenance_items);

    if (!items.length) {
      return `
        <div class="section-label">
          <span>MAINTENANCE ITEMS</span>
          <button class="btn btn-primary btn-sm" data-action="open-modal" data-modal="add_maintenance" data-id="${vehicle.vehicle_id}">${ICON.plus} Add Item</button>
        </div>
        <div class="info-box">${ICON.info} No maintenance items yet. Click <strong>&nbsp;+ Add Maintenance Item&nbsp;</strong> to define what needs tracking.</div>`;
    }

    const rows = items
      .map((item) => {
        let interval;
        if (item.interval_distance) interval = `Every ${fmt(item.interval_distance)} mi`;
        else if (item.interval_hours) interval = `Every ${fmt(item.interval_hours)} hrs`;
        else if (item.interval_months) interval = `Every ${fmt(item.interval_months)} month${item.interval_months !== 1 ? "s" : ""}`;
        else interval = "—";

        const status = getItemStatus(vehicle, item.name);
        const lastDate = status ? status.last_service_date : lastServicedDate(vehicle, item.name);
        const overdue = status && status.overdue;
        const overdueLabel = overdue
          ? `<span class="status-chip status-chip--overdue">${ICON.warning} ${fmtOverdueBy(status)}</span>`
          : status && status.last_service_date
            ? `<span class="status-chip status-chip--ok">${ICON.check} OK</span>`
            : `<span class="status-chip status-chip--unknown">—</span>`;

        return `
        <tr class="${overdue ? "row-overdue" : ""}">
          <td>${this._escape(item.name)}</td>
          <td>${interval}</td>
          <td>${lastDate ? fmtDate(lastDate) : '<span style="color:var(--secondary-text-color)">Never</span>'}</td>
          <td>${overdueLabel}</td>
        </tr>`;
      })
      .join("");

    return `
      <div class="section-label">
        <span>MAINTENANCE ITEMS</span>
        <button class="btn btn-primary btn-sm" data-action="open-modal" data-modal="add_maintenance" data-id="${vehicle.vehicle_id}">${ICON.plus} Add Item</button>
      </div>
      <table class="data-table">
        <thead><tr>
          <th>Item</th><th>Interval</th><th>Last Serviced</th><th>Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── Modals ─────────────────────────────────────────────────────────────────

  _renderModal() {
    if (!this._modal) return "";
    const { type, vehicleId } = this._modal;
    switch (type) {
      case "add_vehicle":     return this._modalAddVehicle();
      case "add_service":     return this._modalAddService(vehicleId);
      case "add_maintenance": return this._modalAddMaintenance(vehicleId);
      case "update_mileage":  return this._modalUpdateMileage(vehicleId);
      case "delete_vehicle":  return this._modalDeleteVehicle(vehicleId);
      default: return "";
    }
  }

  _modalWrap(title, body, submitLabel = "Save") {
    return `
      <div class="modal-overlay" data-action="close-modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close" data-action="close-modal">${ICON.close}</button>
          </div>
          <div class="modal-body">${body}</div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" data-action="submit-modal">${submitLabel}</button>
          </div>
        </div>
      </div>`;
  }

  _modalAddVehicle() {
    return this._modalWrap("Add Vehicle", `
      <div class="form-group">
        <label class="form-label">Display Name *</label>
        <input class="form-input" id="vm-name" placeholder="e.g. Family SUV">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Make *</label>
          <input class="form-input" id="vm-make" placeholder="e.g. Honda">
        </div>
        <div class="form-group">
          <label class="form-label">Model *</label>
          <input class="form-input" id="vm-model" placeholder="e.g. Civic">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Year *</label>
          <input class="form-input" id="vm-year" type="number" placeholder="${new Date().getFullYear()}" min="1900" max="${new Date().getFullYear() + 2}">
        </div>
        <div class="form-group">
          <label class="form-label">Current Mileage</label>
          <input class="form-input" id="vm-mileage" type="number" placeholder="0" min="0">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">VIN (optional)</label>
        <input class="form-input" id="vm-vin" placeholder="17-character VIN" maxlength="17">
      </div>
      <input type="hidden" id="vm-vehicle-type" value="car">
    `, "Add Vehicle");
  }

  _modalAddService(vehicleId) {
    const vehicle = this._fleet[vehicleId];
    // Build options from existing maintenance items for convenience
    const items = vehicle ? Object.values(vehicle.maintenance_items) : [];
    const datalist = items.length
      ? `<datalist id="vm-service-types">${items.map((i) => `<option value="${this._escape(i.name)}">`).join("")}</datalist>`
      : "";

    return this._modalWrap("Add Service Record", `
      ${datalist}
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Date *</label>
          <input class="form-input" id="vm-date" type="date" value="${new Date().toISOString().slice(0, 10)}">
        </div>
        <div class="form-group">
          <label class="form-label">Mileage at Service *</label>
          <input class="form-input" id="vm-svc-mileage" type="number" placeholder="${vehicle ? vehicle.current_mileage : 0}" min="0">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Service Type *</label>
        <input class="form-input" id="vm-service-type" placeholder="e.g. Oil Change" list="vm-service-types">
        <span class="form-hint">Tip: matching a maintenance item name links it for "Last Serviced" tracking</span>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Cost ($)</label>
          <input class="form-input" id="vm-cost" type="number" placeholder="0.00" min="0" step="0.01">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="vm-notes" placeholder="Any additional details…"></textarea>
      </div>
      <input type="hidden" id="vm-vehicle-id" value="${vehicleId}">
    `, "Save Record");
  }

  _modalAddMaintenance(vehicleId) {
    return this._modalWrap("Add Maintenance Item", `
      <div class="form-group">
        <label class="form-label">Item Name *</label>
        <input class="form-input" id="vm-item-name" placeholder="e.g. Oil Change, Air Filter, Transmission Fluid">
      </div>
      <div class="form-group">
        <label class="form-label">Interval Type *</label>
        <div class="interval-toggle">
          <input type="radio" name="vm-interval-type" id="vm-int-dist" value="distance" checked>
          <label for="vm-int-dist">By Miles</label>
          <input type="radio" name="vm-interval-type" id="vm-int-hrs" value="hours">
          <label for="vm-int-hrs">By Hours</label>
          <input type="radio" name="vm-interval-type" id="vm-int-months" value="months">
          <label for="vm-int-months">By Months</label>
        </div>
      </div>
      <div class="form-group" id="vm-dist-group">
        <label class="form-label">Every (miles) *</label>
        <input class="form-input" id="vm-interval-distance" type="number" placeholder="5000" min="1">
      </div>
      <div class="form-group" id="vm-hrs-group" style="display:none">
        <label class="form-label">Every (hours) *</label>
        <input class="form-input" id="vm-interval-hours" type="number" placeholder="100" min="1">
      </div>
      <div class="form-group" id="vm-months-group" style="display:none">
        <label class="form-label">Every (months) *</label>
        <input class="form-input" id="vm-interval-months" type="number" placeholder="12" min="1">
      </div>
      <input type="hidden" id="vm-vehicle-id" value="${vehicleId}">
    `, "Add Item");
  }

  _modalUpdateMileage(vehicleId) {
    const vehicle = this._fleet[vehicleId];
    const current = vehicle ? vehicle.current_mileage : 0;
    return this._modalWrap("Update Mileage", `
      <div class="form-group">
        <label class="form-label">Current Mileage *</label>
        <input class="form-input" id="vm-new-mileage" type="number" value="${current}" min="0">
      </div>
      <p style="font-size:.83rem;color:var(--secondary-text-color);margin:0">
        Current recorded mileage: <strong>${fmt(current)} mi</strong>
      </p>
      <input type="hidden" id="vm-vehicle-id" value="${vehicleId}">
    `, "Update");
  }

  _modalDeleteVehicle(vehicleId) {
    const vehicle = this._fleet[vehicleId];
    const name = vehicle ? vehicle.name : vehicleId;
    return this._modalWrap("Delete Vehicle", `
      <p style="margin:0;line-height:1.6">
        Are you sure you want to delete <strong>${this._escape(name)}</strong>?
      </p>
      <p style="margin:8px 0 0;font-size:.85rem;color:var(--error-color,#db4437)">
        This will permanently remove the vehicle and all its service records
        and maintenance items. This cannot be undone.
      </p>
      <input type="hidden" id="vm-vehicle-id" value="${vehicleId}">
    `, "Delete");
  }

  // ── Event binding ──────────────────────────────────────────────────────────

  _bindEvents() {
    const root = this.shadowRoot;

    root.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el) return;

      // Prevent vehicle row click when clicking action badges
      if (e.target.closest("[data-stop-propagation]")) {
        e.stopPropagation();
      }

      const action = el.dataset.action;
      const id = el.dataset.id;

      switch (action) {
        case "select-vehicle":
          this._selectedId = id;
          this._view = "detail";
          this._render();
          break;
        case "back":
          this._view = "fleet";
          this._selectedId = null;
          this._render();
          break;
        case "tab":
          this._activeTab = el.dataset.tab;
          this._render();
          break;
        case "open-modal":
          this._modal = { type: el.dataset.modal, vehicleId: id };
          this._render();
          break;
        case "close-modal":
          this._modal = null;
          this._render();
          break;
        case "close-modal-overlay":
          if (e.target === el) { this._modal = null; this._render(); }
          break;
        case "submit-modal":
          this._submitModal();
          break;
      }
    });

    // Interval type toggle in add-maintenance modal
    root.addEventListener("change", (e) => {
      if (e.target.name === "vm-interval-type") {
        const dist   = root.getElementById("vm-dist-group");
        const hrs    = root.getElementById("vm-hrs-group");
        const months = root.getElementById("vm-months-group");
        if (dist) dist.style.display   = e.target.value === "distance" ? "" : "none";
        if (hrs)  hrs.style.display    = e.target.value === "hours"    ? "" : "none";
        if (months) months.style.display = e.target.value === "months" ? "" : "none";
      }
    });

    // Search input
    const searchEl = root.querySelector("[data-action=search]");
    if (searchEl) {
      searchEl.addEventListener("input", (e) => {
        this._search = e.target.value;
        this._render();
      });
    }
  }

  // ── Service calls ──────────────────────────────────────────────────────────

  _submitModal() {
    if (!this._modal) return;
    const { type } = this._modal;
    const root = this.shadowRoot;

    const val = (id) => { const el = root.getElementById(id); return el ? el.value.trim() : ""; };

    try {
      switch (type) {
        case "add_vehicle": {
          const name = val("vm-name");
          const make = val("vm-make");
          const model = val("vm-model");
          const year = parseInt(val("vm-year"), 10);
          const mileage = parseInt(val("vm-mileage") || "0", 10);
          const vin = val("vm-vin");
          if (!name || !make || !model || !year) { alert("Please fill in all required fields."); return; }
          this._callService("add_vehicle", {
            name, make, model, year,
            vehicle_type: "car",
            current_mileage: mileage,
            ...(vin ? { vin } : {}),
          });
          break;
        }
        case "add_service": {
          const vehicle_id = val("vm-vehicle-id");
          const date = val("vm-date");
          const mileage = parseInt(val("vm-svc-mileage") || "0", 10);
          const service_type = val("vm-service-type");
          const cost = parseFloat(val("vm-cost") || "0");
          const notes = val("vm-notes");
          if (!date || !service_type) { alert("Please fill in all required fields."); return; }
          this._callService("add_service_record", { vehicle_id, date, mileage, service_type, cost, notes });
          break;
        }
        case "add_maintenance": {
          const vehicle_id = val("vm-vehicle-id");
          const name = val("vm-item-name");
          const typeEl = root.querySelector("input[name=vm-interval-type]:checked");
          const intervalType = typeEl ? typeEl.value : "distance";
          if (!name) { alert("Please enter an item name."); return; }
          const serviceData = { vehicle_id, name };
          if (intervalType === "distance") {
            const d = parseInt(val("vm-interval-distance"), 10);
            if (!d) { alert("Please enter a valid mileage interval."); return; }
            serviceData.interval_distance = d;
          } else if (intervalType === "hours") {
            const h = parseInt(val("vm-interval-hours"), 10);
            if (!h) { alert("Please enter a valid hours interval."); return; }
            serviceData.interval_hours = h;
          } else if (intervalType === "months") {
            const m = parseInt(val("vm-interval-months"), 10);
            if (!m) { alert("Please enter a valid months interval."); return; }
            serviceData.interval_months = m;
          }
          this._callService("add_maintenance_item", serviceData);
          break;
        }
        case "update_mileage": {
          const vehicle_id = val("vm-vehicle-id");
          const mileage = parseInt(val("vm-new-mileage"), 10);
          if (isNaN(mileage)) { alert("Please enter a valid mileage."); return; }
          this._callService("set_mileage", { vehicle_id, mileage });
          break;
        }
        case "delete_vehicle": {
          const vehicle_id = val("vm-vehicle-id");
          this._callService("delete_vehicle", { vehicle_id });
          // Return to fleet view — the vehicle is gone
          this._view = "fleet";
          this._selectedId = null;
          break;
        }
      }
    } catch (err) {
      console.error("[VehicleMinder]", err);
      alert(`Error: ${err.message}`);
      return;
    }

    this._modal = null;
    this._render();
  }

  _callService(service, data) {
    if (!this._hass) return;
    this._hass.callService(DOMAIN, service, data).catch((err) => {
      console.error(`[VehicleMinder] callService ${service} failed:`, err);
    });
  }

  _escape(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

customElements.define("vehicle-minder-panel", VehicleMinderPanel);
