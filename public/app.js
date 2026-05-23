import {
  COMBINATIONS,
  PLAN_META,
  calculateClaim,
  isForeigner,
  money,
  premiumForCombination,
} from "./model.js";

const state = {
  age: "",
  citizenship: "sc",
  scenarioType: "inpatient",
  setting: "privatePreferred",
  bill: 200000,
  mshlCancerLimit: 9600,
  capMode: "auto",
};

const fields = ["age", "citizenship", "scenarioType", "setting", "bill", "mshlCancerLimit", "capMode"];
const tooltip = document.getElementById("tooltip");

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readInputs() {
  for (const field of fields) {
    const el = document.getElementById(field);
    state[field] = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value;
  }
}

function tooltipLabel(label, title, body) {
  return `<span class="tooltip-label" tabindex="0" data-title="${escapeHtml(title)}" data-body="${escapeHtml(body)}">${escapeHtml(label)}</span>`;
}

function metricValue(value, title, body, className = "") {
  return `<span class="metric-value ${className}" tabindex="0" data-title="${escapeHtml(title)}" data-body="${escapeHtml(body)}">${formatMoney(value)}</span>`;
}

function claimableTooltip(row) {
  const { combo, claim } = row;
  const lines = [
    `${money(claim.bill)} bill`,
    `x ${formatRate(claim.proRate)} pro-ration for ${PLAN_META[combo.plan].short}`,
  ];
  if (claim.cancerMultiplier) {
    lines.push(`Limited to ${claim.cancerMultiplier}x MSHL cancer limit`);
  } else {
    lines.push(`Limited to annual claim limit`);
  }
  lines.push(`= ${money(claim.claimableAmount)} claimable`);
  return lines.join("\n");
}

function outOfPocketTooltip(row) {
  const { combo, claim } = row;
  const copayLabel = combo.hasRider ? "co-payment" : "co-insurance";
  const capLabel = combo.hasRider && claim.capApplies ? " capped" : "";
  return [
    `${money(claim.uncovered)} not claimable`,
    `+ ${money(claim.deductible)} deductible`,
    `+ ${money(claim.riderCopayment)} ${copayLabel}${capLabel}`,
    `= ${money(claim.policyholderPays)} out-of-pocket`,
  ].join("\n");
}

function aiaCoversTooltip(row) {
  const { claim } = row;
  return [
    `${money(claim.bill)} total bill`,
    `- ${money(claim.policyholderPays)} out-of-pocket`,
    `= ${money(claim.insurerPays)} AIA covers`,
  ].join("\n");
}

function wardTooltip(ward) {
  const descriptions = {
    "Private standard room": "Private hospital standard room entitlement. Public hospital treatment and preferred-provider claims can still be illustrated.",
    "Public A ward": "Restructured hospital Class A ward entitlement. Private hospital claims may be pro-rated before deductible and co-insurance.",
    "Public B1 ward": "Restructured hospital Class B1 ward entitlement. Public A or private claims may be pro-rated before deductible and co-insurance.",
  };
  return descriptions[ward] || "Ward entitlement used to group plan options in this table.";
}

function formatRate(value) {
  return `${Math.round(value * 100)}%`;
}

function formatMoney(value) {
  return Number(value) === 0 ? "-" : money(value);
}

function getRows() {
  if (!state.age) return [];
  return COMBINATIONS.map((combo) => {
    const premium = premiumForCombination(combo, state.age, state.citizenship);
    const claim = calculateClaim(combo, state);
    return { combo, premium, claim };
  }).filter((row) => row.premium.available);
}

function renderAgeBand(rows) {
  $("#ageBandUsed").textContent = state.age ? (rows[0]?.premium.ageBand || "Not available") : "Enter age next birthday";
}

function renderComparison(rows) {
  if (!rows.length) {
    $("#comparisonTable").innerHTML = `
      <tbody>
        <tr>
          <th>${state.age ? "Not available" : "Awaiting age"}</th>
          <td>${state.age ? "No premium table is available for this profile and age." : "Enter the client's age next birthday to generate the premium and claim comparison."}</td>
        </tr>
      </tbody>
    `;
    return;
  }

  const minOut = Math.min(...rows.map((row) => row.claim.policyholderPays));
  const maxCover = Math.max(...rows.map((row) => row.claim.insurerPays));
  const foreigner = isForeigner(state.citizenship);
  const groups = [];
  for (const row of rows) {
    const last = groups.at(-1);
    const ward = PLAN_META[row.combo.plan].ward;
    if (last?.ward === ward) last.rows.push(row);
    else groups.push({ ward, rows: [row], startIndex: groups.reduce((sum, group) => sum + group.rows.length, 0) });
  }
  const groupHead = groups.map((group) => `
    <th class="ward-group" colspan="${group.rows.length}">
      <span class="tooltip-label ward-tooltip" tabindex="0" data-title="${escapeHtml(group.ward)}" data-body="${escapeHtml(wardTooltip(group.ward))}">${escapeHtml(group.ward)}</span>
    </th>
  `).join("");
  const groupBoundaryClass = (index) => groups.some((group) => group.startIndex === index && index > 0) ? " group-start" : "";
  const subHead = rows.map(({ combo }, index) => `
    <th class="${groupBoundaryClass(index).trim()}">
      <span>${combo.hasRider ? "With rider" : "No rider"}</span>
      <small>${escapeHtml(combo.name)}</small>
    </th>
  `).join("");

  const sectionRow = (label, className) => `
    <tr class="section-row ${className}">
      <th>${escapeHtml(label)}</th>
      ${rows.map((_, index) => `<td class="${groupBoundaryClass(index).trim()}"></td>`).join("")}
    </tr>
  `;
  const rowMarkup = (label, getter, className = "") => `
    <tr class="${className}">
      <th>${label}</th>
      ${rows.map((row, index) => `<td class="${groupBoundaryClass(index).trim()}">${getter(row)}</td>`).join("")}
    </tr>
  `;

  const tableRows = [
    sectionRow("Plan", "plan-section"),
    rowMarkup("Plan name", (row) => escapeHtml(row.combo.name)),
    sectionRow("Premiums", "premium-section"),
    rowMarkup(tooltipLabel("MSL (MediSave)", "MediShield Life premium", foreigner ? "Foreigners are not integrated with MediShield Life." : "Before subsidies, rebates or additional premiums."), (row) => formatMoney(row.premium.msl), "premium-row"),
    rowMarkup(tooltipLabel("Base (MediSave)", "Base premium via MediSave", foreigner ? "For foreigner dependants, MediSave use is subject to withdrawal limits. Non-dependants are cash only." : "Additional coverage premium paid through MediSave up to the withdrawal limit."), (row) => formatMoney(row.premium.baseMedisave), "premium-row"),
    rowMarkup("Base (Cash)", (row) => formatMoney(row.premium.baseCash), "premium-row"),
    rowMarkup(tooltipLabel("Rider (Cash)", "Rider premium", "Rider premiums are paid in cash."), (row) => row.combo.hasRider ? formatMoney(row.premium.riderPremium) : "-", "premium-row"),
    rowMarkup("Total MediSave", (row) => formatMoney(row.premium.totalMedisave), "premium-total"),
    rowMarkup("Total Cash", (row) => formatMoney(row.premium.totalCash), "premium-total"),
    rowMarkup("Total Annual Premium", (row) => formatMoney(row.premium.totalAnnual), "premium-total"),
    sectionRow("Claims", "claim-section"),
    rowMarkup(tooltipLabel("Claimable Amount", "Claimable amount", "Bill after pro-ration and applicable benefit limit."), (row) => metricValue(row.claim.claimableAmount, "Claimable amount", claimableTooltip(row), row.claim.insurerPays === maxCover ? "metric-best" : ""), "claim-row"),
    rowMarkup(tooltipLabel("Out-of-pocket", "Policyholder pays", "Unclaimable amount plus deductible and co-pay/co-insurance."), (row) => metricValue(row.claim.policyholderPays, "Out-of-pocket", outOfPocketTooltip(row), row.claim.policyholderPays === minOut ? "metric-low" : ""), "claim-row"),
    rowMarkup(tooltipLabel("AIA Covers", "Claim paid by AIA", "Total bill less the policyholder's out-of-pocket amount."), (row) => metricValue(row.claim.insurerPays, "AIA covers", aiaCoversTooltip(row), row.claim.insurerPays === maxCover ? "metric-best" : ""), "claim-row"),
    sectionRow("Claim mechanics", "mechanics-section"),
    rowMarkup("Pro-ration factor", (row) => formatRate(row.claim.proRate), "mechanics-row"),
    rowMarkup("Deductible", (row) => formatMoney(row.claim.deductible), "mechanics-row"),
    rowMarkup("Co-pay / co-insurance", (row) => formatMoney(row.claim.riderCopayment), "mechanics-row"),
  ].join("");

  $("#comparisonTable").innerHTML = `
    <thead>
      <tr>
        <th rowspan="2">Item</th>
        ${groupHead}
      </tr>
      <tr>
        ${subHead}
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  `;
}

const faqs = [
  ["What does this illustrator compare?", "It compares annual premiums, MediSave/cash split, claimable amount, estimated out-of-pocket cost, and estimated AIA payout across the available HSG Max and rider combinations."],
  ["Are the premiums guaranteed?", "No. Premiums may change with age and may be reviewed by AIA from time to time."],
  ["Why are rider premiums shown as cash?", "Max VitalHealth rider premiums are not MediSave-approved, so the illustrator treats them as cash payments."],
  ["What is the age band used for?", "AIA premiums are priced by age next birthday bands. The band shown beside the inputs is the band used in the table."],
  ["What does the rider do in the claim example?", "For the modelled inpatient and day surgery claims, the rider reduces the base 10% co-insurance to a 5% co-payment, subject to the cap rules."],
  ["When does the $6,000 co-payment cap apply?", "The cap applies when treatment is by or under an AIA preferred provider, when pre-authorisation is issued, or for eligible emergency treatment referrals."],
  ["Why can a private claim under HSG Max B have a high out-of-pocket amount?", "HSG Max B is designed around public A ward entitlement. Private hospital claims may be pro-rated before deductible and co-insurance are applied."],
  ["Why is B Lite not shown for foreigners?", "AIA’s foreigner material lists HSG Max A and B variants for foreigners, not B Lite."],
  ["Does the foreigner option include MediShield Life?", "No. The foreigner HSG Max A/B variants are not integrated with MediShield Life."],
  ["Can a foreigner use MediSave?", "Foreigner dependants of SC/PR policy owners may be able to use MediSave subject to withdrawal limits. Foreigner non-dependants are treated as cash only in this tool."],
  ["What is pro-ration?", "Pro-ration is the percentage of eligible expenses recognised when treatment is outside the plan’s intended ward or provider setting."],
  ["Does deductible apply to outpatient cancer treatment?", "In this illustrator, no deductible is applied for outpatient cancer scenarios, consistent with the outpatient benefit structure."],
  ["How does the CDL cancer scenario work?", "The claimable limit is modelled from the selected MediShield Life cancer drug limit and the plan multiple before co-insurance or co-pay is applied."],
  ["How does the non-CDL cancer scenario work?", "The model applies the rider non-CDL annual limit where available, then applies the relevant co-insurance treatment."],
  ["Why are subsidies not included?", "Individual MediShield Life subsidies, premium rebates, additional premiums, underwriting loadings and personal circumstances vary by client."],
  ["Are the claim values guaranteed?", "No. They are simplified illustrations based on the selected inputs, policy limits and pro-ration logic. Actual claim assessment depends on AIA’s policy terms and claims review."],
  ["What is AQHP?", "AQHP refers to AIA Quality Healthcare Partner arrangements used in preferred-provider and co-payment cap rules."],
  ["What is CPA?", "CPA refers to certificate of pre-authorisation. The model treats CPA/pre-authorisation as satisfying the co-payment cap condition."],
  ["Why is the claimable amount not always the same as the bill?", "The bill may be reduced by pro-ration, annual limits, cancer limits, or rider-specific limits before deductible and co-insurance are applied."],
  ["Which option should a client choose?", "Use the table to frame the trade-off: richer entitlement and lower claim exposure usually come with higher cash premiums."],
];

function renderFaqs() {
  const questionMarkup = ([question, answer]) => `
    <details class="faq-entry">
      <summary>${escapeHtml(question)}</summary>
      <p>${escapeHtml(answer)}</p>
    </details>
  `;
  $("#faqList").innerHTML = `
    <div class="faq-toolbar">
      <button class="faq-toggle" type="button" data-action="toggle-faqs">Expand all</button>
    </div>
    <div class="source-links faq-links" data-faq-container>
      ${faqs.map(questionMarkup).join("")}
    </div>
  `;
}

function syncScenarioFields() {
  const isCancer = state.scenarioType === "cancerCdl";
  document.querySelector(".cancer-field").classList.toggle("muted-field", !isCancer);
  $("#mshlCancerLimit").disabled = !isCancer;
}

function render() {
  readInputs();
  syncScenarioFields();
  const rows = getRows();
  renderAgeBand(rows);
  renderComparison(rows);
  renderFaqs();
}

function showTooltip(target) {
  const title = target.dataset.title;
  const body = target.dataset.body;
  if (!title || !body) return;
  tooltip.querySelector(".info-tooltip-title").textContent = title;
  tooltip.querySelector(".info-tooltip-body").textContent = body;
  tooltip.hidden = false;
  const rect = target.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 360, Math.max(12, rect.left));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${rect.bottom + 10}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

for (const field of fields) {
  document.getElementById(field).addEventListener("input", render);
  document.getElementById(field).addEventListener("change", render);
}

document.addEventListener("mouseover", (event) => {
  const target = event.target.closest("[data-title][data-body]");
  if (target) showTooltip(target);
});
document.addEventListener("mouseout", (event) => {
  if (event.target.closest("[data-title][data-body]")) hideTooltip();
});
document.addEventListener("focusin", (event) => {
  const target = event.target.closest("[data-title][data-body]");
  if (target) showTooltip(target);
});
document.addEventListener("focusout", hideTooltip);
window.addEventListener("scroll", hideTooltip, { passive: true });

document.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-action='toggle-faqs']");
  if (!toggle) return;
  const faqItems = [...document.querySelectorAll(".faq-entry")];
  const shouldOpen = faqItems.some((item) => !item.open);
  for (const item of faqItems) item.open = shouldOpen;
  toggle.textContent = shouldOpen ? "Hide all" : "Expand all";
});

render();
