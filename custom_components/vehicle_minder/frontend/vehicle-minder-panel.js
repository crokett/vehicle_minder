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

function lastServicedInterval(vehicle,itemName) {

  const records = Object.values(vehicle.service_records || {});
  const matches = records
    .filter((r) => r.service_type && r.service_type.toLowerCase() === itemName.toLowerCase())
    .sort((a, b) => new Date(b.date) - new Date(a.date));
    return matches.length && matches[0].mileage != null
      ? matches[0].mileage
      : "-";

}

// Find the pre-computed status entry for a maintenance item by name.
// Falls back to a simple local calculation if maintenance_status is absent
// (e.g. before the sensor attribute propagates).
function getItemStatus(vehicle, itemName) {
  const statuses = vehicle.maintenance_status || [];
  return statuses.find((s) => s.name.toLowerCase() === itemName.toLowerCase()) || null;
}

function fmtOverdueBy(status) {
  if (!status || status.not_tracked || !status.overdue) return null;
  const type = status.interval_type;
  const by = status.overdue_by;
  if (type === "distance") return `${fmt(by)} ${this._distanceLabelAbrv} overdue`;
  if (type === "hours")    return `${fmt(by)} hrs overdue`;
  if (type === "months")   return `${by} day${by !== 1 ? "s" : ""} overdue`;
  return "overdue";
}

function fmtDueSoonBy(status){
  //if (!status || status.due_soon) return null;
  if (!status || status.not_tracked || !status.due_soon) return null;
  const type = status.interval_type;
  const remain = status.remaining;
  if (type === "distance") return `Due in: ${fmt(remain)} ${this._distanceLabelAbrv}`;
  if (type === "hours")    return `Due in: ${fmt(remain)} hrs overdue`;
  if (type === "months")   return `Due in: ${remain} day${remain !== 1 ? "s" : ""}`;
  return "due soon"
}
// ---------------------------------------------------------------------------
// Styles — uses HA CSS variables so it blends with any theme
// ---------------------------------------------------------------------------
let STYLES = "";
let stylesLoaded = false;
let stylesFailed = false;

const stylesPromise = fetch("/vehicle_minder_assets/panel.css")
  .then(response => {
    if (!response.ok) throw new Error(`Failed to load panel.css: ${response.status}`);
    return response.text();
  })
  .then(css => {
    STYLES = css;
    stylesLoaded = true;
  })
  .catch(error => {
    console.error("Vehicle Minder: Failed to load styles", error);
    stylesFailed = true;
  });

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
    this._useHours = false;
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

  // Load configuration once.
  if (!this._configLoaded) {
    this._configLoaded = true;

    hass.callWS({
      type: "vehicle_minder/get_config",
    })
      .then((result) => {
        this._distanceUnit = result.distance_unit;

        this._distanceLabel =
          this._distanceUnit === "km" ? "Kilometers" : "Miles";

        this._distanceLabelAbrv =
          this._distanceUnit === "km" ? "km" : "mi";

        this._syncFleet();
        this._render();
      })
      .catch((err) => {
        this._configLoaded = false;
        console.error("WebSocket error:", err);
      });

    return;
  }

  this._syncFleet();

  // Preserve unsaved form values while a modal is open.
  if (!this._modal) {
    this._render();
  }
}

  // Pull vehicle data from sensor state attributes
  _syncFleet() {
    if (!this._hass) return;
    const fleet = {};
    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if (!entityId.startsWith(`sensor.${DOMAIN}_`) && !entityId.startsWith(`sensor.`)) continue;
      const attrs = state.attributes || {};
     //  const isHoursTracked = Boolean(attrs.use_hours);

      if (!attrs.vehicle_id) continue;
      fleet[attrs.vehicle_id] = {
        vehicle_id: attrs.vehicle_id,
        name: attrs.friendly_name || entityId,
        make: attrs.make || "",
        model: attrs.model || "",
        year: attrs.year || "",
        vehicle_type: attrs.vehicle_type || "Car",
        vin: attrs.vin || null,
        current_mileage: Number(state.state) || attrs.current_mileage || 0,
        current_hours: attrs.current_hours || 0,
        use_hours: Boolean(state.attributes.use_hours),
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

    // If styles are still loading, render once without them and queue a re-render
    if (!stylesLoaded && !stylesFailed) {
      root.innerHTML = `<style></style>${this._renderToolbar()}${this._renderBody()}${this._renderModal()}`;
      this._bindEvents();

      stylesPromise.then(() => {
        if (stylesLoaded) {
          this._render(); // Re-render automatically once CSS arrives
        }
      });
      return;
    }

    // Normal render with fully loaded styles (or fallback if it failed)
    root.innerHTML = `<style>${STYLES}</style>${this._renderToolbar()}${this._renderBody()}${this._renderModal()}`;
    this._bindEvents();
  }
  _renderToolbar() {
    return `
      <div class="toolbar">

        <img class="logo" src="/vehicle_minder_static/icon.png" alt="VM">

      
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
    const sub = [v.year, v.make, v.model, v.vehicle_type].filter(Boolean).join(" ");
    // Check if this vehicle has any overdue items
    const hasOverdue = v.maintenance_items 
    ? Object.values(v.maintenance_items).some((item) => {
        const status = getItemStatus(v, item.name);
        return status && status.overdue;
      }) 
    : false;
     
    const hasDueSoon =  v.maintenance_items 
    ? Object.values(v.maintenance_items).some((item) => {
        const status = getItemStatus(v, item.name);
        return status && status.due_soon
      }) 
    : false;

    const overdueBadge = hasOverdue 
    ? `<span class="status-chip status-chip--overdue" style="margin-left: 8px; font-size: 0.8em;">Overdue Maintenance</span>` 
    : '';
     
    const dueSoonBadge = hasDueSoon 
    ? `<span class="status-chip status-chip--due-soon" style="margin-left: 8px; font-size: 0.8em;">Maintenance Due Soon</span>` 
    : '';

    // PURE BOOLEAN CHECK ONLY
    const usesHours = v.use_hours === true;
    
    const metricValue = usesHours ? `${v.current_hours || 0} hrs` : `${fmt(v.current_mileage || 0)} ${this._distanceLabelAbrv}`;
    const modalTarget = usesHours ? "update_hours" : "update_mileage";
    const titleText = usesHours ? "Update hours" : "Update mileage";
    
    const maintCount = Object.keys(v.maintenance_items || {}).length;
    const svcCount = Object.keys(v.service_records || {}).length;
    const overdueWarning = (v.overdue_count || 0) > 0;
  
   // style vehicle row in fleet view
return `
  <div class="vehicle-row${hasOverdue ? " overdue" : ""}" data-action="select-vehicle" data-id="${v.vehicle_id}">
    <div class="vehicle-info">
      <!-- Flex container keeps name and badge on the same line, vertically centered -->
      <div class="vehicle-name" style="display: flex; align-items: center; flex-wrap: wrap;">
        ${this._escape(v.name)}
        ${overdueBadge}
        ${dueSoonBadge}
      </div>
      <div class="vehicle-sub">${this._escape(sub)}</div>
    </div>
    
    <div class="vehicle-actions" data-stop-propagation="1">
      <span class="vehicle-badge" data-action="open-modal" data-modal="${modalTarget}" data-id="${v.vehicle_id}" title="${titleText}">
        ${ICON.speedometer} ${metricValue}
      </span>
      <span class="vehicle-badge" data-action="open-modal" data-modal="add_maintenance" data-id="${v.vehicle_id}" title="Add maintenance item">
        ${ICON.wrench} ${maintCount} item${maintCount !== 1 ? "s" : ""}
      </span>
      <span class="vehicle-badge" data-action="open-modal" data-modal="add_service" data-id="${v.vehicle_id}" title="Add service record">
        ${ICON.history} ${svcCount} record${svcCount !== 1 ? "s" : ""}
      </span>
    </div>
  </div>
`;
  }

  // ── Detail view ────────────────────────────────────────────────────────────

_renderDetailView() {
    const vehicle = this._fleet[this._selectedId];
    if (!vehicle) return this._renderFleetView();

    // Check if the currently active vehicle has any overdue items
    const hasOverdueItems = vehicle.maintenance_items ? Object.values(vehicle.maintenance_items).some((item) => {
      const status = getItemStatus(vehicle, item.name);
      return status && status.overdue;
    }) : false;
    
    const hasDueSoonItems = vehicle.maintenance_items ? Object.values(vehicle.maintenance_items).some((item) => {
      const status = getItemStatus(vehicle, item.name);
      return status && status.due_soon;
    }) : false;

    const sidebarItems = Object.values(this._fleet)
      .map((v) => {
        const sub = [v.year, v.make, v.model].filter(Boolean).join(" ");
        const active = v.vehicle_id === this._selectedId ? " active" : "";
        
        // Check if this sidebar vehicle has any overdue items
        const vHasOverdue = v.maintenance_items ? Object.values(v.maintenance_items).some((item) => {
          const status = getItemStatus(v, item.name);
          return status && status.overdue;
        }) : false;

        const vHasDueSoon = v.maintenance_items ? Object.values(v.maintenance_items).some((item) => {
          const status = getItemStatus(v, item.name);
          return status && status.due_soon;
        }) : false;

        const overDueSidebarBadge = vHasOverdue 
          ? `<ha-icon icon="mdi:alert-circle" style="color: var(--error-color, #db4437); width: 16px; height: 16px;  flex-shrink: 0;"></ha-icon>` 
          : '';

        const dueSoonSidebarBadge = vHasDueSoon
        ? `<ha-icon icon="mdi:alert-circle" style="color: var(--warning-color,  #ebda18); width: 16px; height: 16px;  flex-shrink: 0;"></ha-icon>` 
          : '';

        return `
          <div class="sidebar-item${active}" data-action="select-vehicle" data-id="${v.vehicle_id}" style="display: flex; align-items: center;">
            <div style="overflow: hidden;">
              <div class="sidebar-item-name">${this._escape(v.name)}</div>
              <div class="sidebar-item-sub">${this._escape(sub)}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 4px; margin-left: auto;">
              
              ${overDueSidebarBadge}
              ${dueSoonSidebarBadge}
            </div>
          </div>`;
      })
      .join("");

    const tabContent =
      this._activeTab === "service"
        ? this._renderServiceTab(vehicle)
        : this._renderMaintenanceTab(vehicle);

    const sub = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
    
    // STRICT BOOLEAN CHECK: Only true if use_hours is explicitly true
    const usesHours = !!vehicle.use_hours;
    
    const metricDisplay = usesHours 
      ? `${vehicle.current_hours || 0} hrs` 
      : `${fmt(vehicle.current_mileage || 0)} ${this._distanceLabelAbrv}`;
    
      // check for overdue maintenance items, return either nothing or overdue items
    const overDueHeaderBadge = hasOverdueItems 
      ? `<span class="status-chip status-chip--overdue" style="margin-left: 12px; font-size: 0.85em; display: inline-flex; align-items: center; gap: 4px;">${ICON.warning} Overdue Maintenance</span>` 
      : '';
    
    const dueSoonHeaderBadge = hasDueSoonItems
      ? `<span class="status-chip status-chip--due-soon" style="margin-left: 12px; font-size: 0.85em; display: inline-flex; align-items: center; gap: 4px;">${ICON.warning} Maintenance Due Soon</span>` 
      : '';

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
            <div class="main-title" style="display: flex; align-items: center; flex-wrap: wrap;">
              ${this._escape(vehicle.name)}
              ${overDueHeaderBadge}
              ${dueSoonHeaderBadge}
            </div>
            <div class="main-sub">${this._escape(sub)}${vehicle.vin ? ` · VIN: ${vehicle.vin}` : ""} · ${metricDisplay}</div>
            <div class="main-actions">
              <button class="btn btn-primary btn-sm" data-action="open-modal" data-modal="add_service" data-id="${vehicle.vehicle_id}">
                ${ICON.plus} Add Service Record
              </button>
              <button class="btn btn-secondary btn-sm" data-action="open-modal" data-modal="add_maintenance" data-id="${vehicle.vehicle_id}">
                ${ICON.plus} Add Maintenance Item
              </button>
              
              <!-- Conditional Update Button -->
              ${usesHours ? `
                <button class="btn btn-secondary btn-sm" data-action="open-modal" data-modal="update_hours" data-id="${vehicle.vehicle_id}">
                  ${ICON.speedometer || ''} Update Hours
                </button>
              ` : `
                <button class="btn btn-secondary btn-sm" data-action="open-modal" data-modal="update_mileage" data-id="${vehicle.vehicle_id}">
                  ${ICON.speedometer || ''} Update ${this._distanceLabel}
                </button>
              `}

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
    const useHours = vehicle.use_hours === true;
    const intervalLabel = useHours ? "Hours" : this._distanceLabel;
    const intervalLabelAbrv = useHours ? "Hrs" : this._distanceLabelAbrv;
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
        <td>${fmt(r.mileage)} ${intervalLabelAbrv}</td>
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
          <th>Date</th><th>Service Type</th><th>${intervalLabel}</th><th>Cost</th><th>Notes</th>
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
        let intervalLabelAbrv = ""
        if (item.interval_distance){ interval = `Every ${fmt(item.interval_distance)} ${this._distanceLabelAbrv}`;
            intervalLabelAbrv = this._distanceLabelAbrv;
          }
        else if (item.interval_hours){ interval = `Every ${fmt(item.interval_hours)} hrs`;
              intervalLabelAbrv = "hrs"
        }
        else if (item.interval_months){ interval = `Every ${fmt(item.interval_months)} month${item.interval_months !== 1 ? "s" : ""}`;
               intervalLabelAbrv = "mos"
      }
        else interval = "—";

        const status = getItemStatus(vehicle, item.name);
        const lastDate = status ? status.last_service_date : lastServicedDate(vehicle, item.name);
        const lastInterval = lastServicedInterval(vehicle, item.name);
        const overdue = status && status.overdue;
        const due_soon = status && status.due_soon;
        const overdueLabel = overdue
        const due_soonLabel = due_soon
        

        status && status.overdue
          ? `<span class="status-chip status-chip--overdue">${ICON.warning} ${fmtOverdueBy(status)}</span>`
          : status && status.due_soon
            ? `<span class="status-chip status-chip--due-soon">${ICON.warning} ${fmtDueSoonBy(status)}</span>`
            : status && status.last_service_date
              ? `<span class="status-chip status-chip--ok">${ICON.check} OK</span>`
              : `<span class="status-chip status-chip--unknown">—</span>`;
          
          
      return `
      <tr class="${overdue ? "row-overdue" : due_soon ? "row-due-soon" : ""}">
        <td>${this._escape(item.name)}</td>
        <td>${interval}</td>
        <td>${lastDate ? fmtDate(lastDate) : '<span style="color:var(--secondary-text-color)">Never</span>'}</td>
        <td>${lastInterval} ${intervalLabelAbrv}</td>
        <td>${this._escape(item.due_soon_threshold)}</td>
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
          <th>Item</th><th>Interval</th><th>Date Last Serviced</th><th>Interval Last Serviced</th><th>Threshold Due</th>
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
      case "update_hours":    return this._modalUpdateHours(vehicleId);
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
    return this._modalWrap(`
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
      </div>

      <!-- Metric Type Selection Toggle -->
      <div class="form-group" style="margin: 12px 0;">
        <label class="form-label">Tracking Metric *</label>
        <div class="metric-toggle-group" style="display: flex; gap: 20px; align-items: center; margin-top: 6px;">
          <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
            <input type="radio" name="modalMetricType" value="mileage" checked class="modal-metric-radio" /> ${this._distanceLabel} (${this._distanceLabelAbrv})
          </label>
          <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
            <input type="radio" name="modalMetricType" value="hours" class="modal-metric-radio" /> Hours (hrs)
          </label>
        </div>
      </div>

      <!-- Mileage Field (Visible by default) -->
      <div class="form-group" id="modal-mileage-wrap">
        <label class="form-label">Current ${this._distanceLabel}</label>
        <input class="form-input" id="vm-mileage" type="number" step="1" placeholder="0" min="1">
      </div>

      <!-- Hours Field (Hidden by default) -->
      <div class="form-group" id="modal-hours-wrap" style="display: none;">
        <label class="form-label">Current Hours</label>
        <input class="form-input" id="vm-hours" type="number" step="1" placeholder="0" min="1">
      </div>

      <div class="form-group">
        <label class="form-label">VIN (optional)</label>
        <input class="form-input" id="vm-vin" placeholder="17-character VIN" maxlength="17">
      </div>
      <div class="form-group">
        <label class="form-label">Vehicle Type *</label>
        <input class="form-input" id="vm-vehicle-type" placeholder="e.g. car, mower, boat" value="car">
      </div>
    `, "Add Vehicle");
  }

  _modalAddService(vehicleId) {
    
    const vehicle = this._fleet[vehicleId];
    const currentValue = vehicle
      ? vehicle.use_hours
        ? vehicle.current_hours
        : vehicle.current_mileage
      : null;


   
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
          <label class="form-label">${vehicle && vehicle.use_hours ? "Hours at Service (defaults to current vehicle hours)" :
                  `${this._distanceLabel} at Service (defaults to current vehicle ${this._distanceLabel}) `}</label>
          <input class="form-input" id="vm-svc-mileage" type="number" value="${currentValue ?? ""}" min="1">
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
   const showServiceMessage =
  this._modal?.fromAddService === true;

  return this._modalWrap("Add Maintenance Item", `
    ${showServiceMessage ? `
    <div class="info-box">
      ${ICON.info}
      You have no maintenance items for this vehicle.
      Add a maintenance item before creating a service record. 
      Service records must be tied to a maintenance item.
    </div>
  ` : ""}
    <div class="form-group">
      <label class="form-label">Item Name *</label>
      <input class="form-input" id="vm-item-name" placeholder="e.g. Oil Change, Air Filter, Transmission Fluid">
    </div>
    <div class="form-group">
      <label class="form-label">Interval Type *</label>
      <div class="interval-toggle">
        <input type="radio" name="vm-interval-type" id="vm-int-dist" value="distance" checked>
        <label for="vm-int-dist">By ${this._distanceLabel}</label>
        <input type="radio" name="vm-interval-type" id="vm-int-hrs" value="hours">
        <label for="vm-int-hrs">By Hours</label>
        <input type="radio" name="vm-interval-type" id="vm-int-months" value="months">
        <label for="vm-int-months">By Months</label>
      </div>
    </div>
    <div class="form-group" id="vm-dist-group">
      <label class="form-label">Every (${this._distanceLabel}) *</label>
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
    <!-- FIXED: Removed style="display:none" and fixed missing quote on class -->
    <div class="form-group" id="due-soon-group">
      <label class="form-label">Upcoming Maintenance Warning Threshold</label>
      <label class="form-label" style="font-size:0.85em; opacity:0.8;">
        Measured in same interval selected above (e.g. if months is selected, enter months). Leave at 0 for no warning.
      </label>
      <input class="form-input" id="vm-due-soon-threshold" type="number" placeholder="0" min="0">
    </div>
    <input type="hidden" id="vm-vehicle-id" value="${vehicleId}">
  `, "Add Item");
}

_modalUpdateHours(vehicleId) {
    const vehicle = this._fleet[vehicleId];
    const currentHours = vehicle ? (vehicle.current_hours || 0) : 0;
    
    return this._modalWrap("Update Hours", `
      <div class="form-group">
        <label class="form-label">Current Operating Hours *</label>
        <input class="form-input" id="vm-new-hours" type="number" step="0.1" value="${currentHours}" min="0">
      </div>
      <p style="font-size:.83rem;color:var(--secondary-text-color);margin:0">
        Current recorded hours: <strong>${currentHours} hrs</strong>
      </p>
      <input type="hidden" id="vm-vehicle-id" value="${vehicleId}">
    `, "Update");
  }

  _modalUpdateMileage(vehicleId) {
    const vehicle = this._fleet[vehicleId];
    const current = vehicle ? vehicle.current_mileage : 0;
    return this._modalWrap(`Update ${this._distanceLabel}`, `
      <div class="form-group">
        <label class="form-label">Current ${this._distanceLabel}*</label>
        <input class="form-input" id="vm-new-mileage" type="number" value="${current}" min="0">
      </div>
      <p style="font-size:.83rem;color:var(--secondary-text-color);margin:0">
        Current recorded ${this._distanceLabel}: <strong>${fmt(current)} ${this._distanceLabelAbrv}</strong>
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
    // check for already bound events:
     if (this._eventsBound) return;
       this._eventsBound = true;

    const root = this.shadowRoot;
    // Listen for changes on the metric radio buttons to toggle visibility
    root.addEventListener("change", (e) => {
      if (e.target.classList.contains("modal-metric-radio")) {
        const isHours = e.target.value === "hours";
        this._useHours = isHours; // Update instance state
        
        const mileageWrap = root.getElementById("modal-mileage-wrap");
        const hoursWrap = root.getElementById("modal-hours-wrap");
        if (mileageWrap && hoursWrap) {
          mileageWrap.style.display = isHours ? "none" : "block";
          hoursWrap.style.display = isHours ? "block" : "none";
        }
      }
    });

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
          const modalType = el.dataset.modal;
          this._modal = { type: el.dataset.modal, vehicleId: id };
          
          // check for no maintenace items while adding a service record
          // service record must be tied to maintenace item
          if (modalType === "add_service") {
          const vehicle = this._fleet[id];
          const items = vehicle
             ? Object.values(vehicle.maintenance_items || {})
            : [];

        if (items.length === 0) {
           this._modal = { type: "add_maintenance", vehicleId: id,  fromAddService: true,};
           this._render();
           break;
          }
        }
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
          const vin = val("vm-vin");
          const vehicleType = val("vm-vehicle-type");
          if (!name || !make || !model || !year) { alert("Please fill in all required fields."); return; }
          
          // Directly inspect the radio button state at submission time
          const selectedRadio = root.querySelector('input[name="modalMetricType"]:checked');
          const useHours = selectedRadio ? selectedRadio.value === "hours" : false;

          const mileage = root.getElementById("vm-mileage")?.value;
          const hours = root.getElementById("vm-hours")?.value;

          // Validate the usage metric that applies to this vehicle.
        
          if (useHours) {
         if (hours === "" || hours == null || !Number.isFinite(Number(hours)) || Number(hours) <= 0) {
            console.count("Hours validation alert");
            alert("Hours must be greater than zero.");
            return;
         }
         } else {
          if (mileage === "" || mileage == null || !Number.isFinite(Number(mileage)) || Number(mileage) <= 0) {
              console.count("Miles validation alert");
              alert("Mileage must be greater than zero.");
              return;
          }
          }

// Construct the payload for the applicable usage metric.
const usageMetric = useHours
  ? { current_hours: parseFloat(hours) }
  : { current_mileage: parseInt(mileage, 10) };
          this._callService("add_vehicle", {
            name, make, model, year,
            vehicle_type: vehicleType,
            use_hours: useHours,
            ...(vin ? { vin } : {}),
            ...usageMetric,
          });
          break;
        }
        
        case "add_service": {
        const usageValue = val("vm-svc-mileage");

          if (
            usageValue === "" ||
            usageValue == null ||
            !Number.isFinite(Number(usageValue)) ||
            Number(usageValue) <= 0
          ) {
            alert("Service hours or mileage must be greater than zero.");
            return;
          }
            
          const vehicle_id = val("vm-vehicle-id");
          const date = val("vm-date");
          
          const service_type = val("vm-service-type");
          const cost = parseFloat(val("vm-cost") || "0");
          const notes = val("vm-notes");
          if (!date || !service_type) { alert("Please fill in all required fields."); return; }
          this._callService("add_service_record", { vehicle_id, date,   mileage: Number(usageValue), service_type, cost, notes });
          break;
        }
        case "add_maintenance": {
          const vehicle_id = val("vm-vehicle-id");
          const name = val("vm-item-name");
          const typeEl = root.querySelector("input[name=vm-interval-type]:checked");
          const intervalType = typeEl ? typeEl.value : "distance";

          // default empty threshold value to 0
          const rawThreshold = val("vm-due-soon-threshold");
          const due_soon_threshold = rawThreshold !== "" ? parseFloat(rawThreshold) : 0;

          // validate threshold is non-negative and a number
          if (isNaN(due_soon_threshold) || due_soon_threshold < 0) {
            alert("Please enter a valid warning threshold (0 or greater).");
            return;
          }

          if (!name) { alert("Please enter an item name."); return; }
          const serviceData = { vehicle_id,
                                name,
                                due_soon_threshold // send to backend
                              };
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

        case "update_hours": {
          const vehicle_id = val("vm-vehicle-id");
          const hours = parseFloat(val("vm-new-hours"), 10);
          if (isNaN(hours)) { alert("Please enter a valid number of hours."); return; }
          this._callService("set_hours", { vehicle_id, current_hours: hours});
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

    alert(err.message || "The service call failed. Please try again.");
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
