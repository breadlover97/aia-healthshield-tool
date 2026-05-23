import { AGE_BANDS, FOREIGNER_BANDS } from "./data/premium-table.js";

export { AGE_BANDS, FOREIGNER_BANDS };

export const PLAN_META = {
  A: {
    short: "HSG Max A",
    rider: "VitalHealth Pro A",
    ward: "Private standard room",
    annualLimit: 1000000,
    preferredAnnualLimit: 2000000,
    nonCdlLimit: 200000,
    color: "#d31145",
  },
  B: {
    short: "HSG Max B",
    rider: "VitalHealth Pro B",
    ward: "Public A ward",
    annualLimit: 1000000,
    preferredAnnualLimit: 1200000,
    nonCdlLimit: 100000,
    color: "#2563eb",
  },
  LITE: {
    short: "HSG Max B Lite",
    rider: "VitalHealth Pro B Lite",
    ward: "Public B1 ward",
    annualLimit: 300000,
    preferredAnnualLimit: 300000,
    nonCdlLimit: 100000,
    color: "#0f766e",
  },
};

export const COMBINATIONS = [
  { id: "A_R", plan: "A", hasRider: true, label: "Private 5% Co-Pay", name: "HSG Max A + VHP A" },
  { id: "A_N", plan: "A", hasRider: false, label: "Private No Rider", name: "HSG Max A" },
  { id: "B_R", plan: "B", hasRider: true, label: "Gov A 5% Co-Pay", name: "HSG Max B + VHP B" },
  { id: "B_N", plan: "B", hasRider: false, label: "Gov A No Rider", name: "HSG Max B" },
  { id: "LITE_R", plan: "LITE", hasRider: true, label: "Gov B1 5% Co-Pay", name: "HSG Max B Lite + VHP B Lite" },
  { id: "LITE_N", plan: "LITE", hasRider: false, label: "Gov B1 No Rider", name: "HSG Max B Lite" },
];

export const SETTINGS = {
  privatePreferred: { label: "Private / AQHP / CPA", private: true, capApplies: true },
  privateNonPreferred: { label: "Private non-AQHP without CPA", private: true, capApplies: false },
  publicA: { label: "Public A ward", ward: "A", capApplies: true },
  publicB1: { label: "Public B1 ward", ward: "B1", capApplies: true },
  publicB2: { label: "Public B2/C ward", ward: "B2", capApplies: true },
};

export function findAgeBand(age) {
  return AGE_BANDS.find((band) => age >= band.min && age <= band.max) || AGE_BANDS.at(-1);
}

export function findForeignerAgeBand(age) {
  return FOREIGNER_BANDS.find((band) => age >= band.min && age <= band.max);
}

export function isForeigner(citizenship) {
  return citizenship === "foreignerDependent" || citizenship === "foreignerNonDependent";
}

export function premiumForCombination(combo, age, citizenship = "sc") {
  if (isForeigner(citizenship)) {
    const band = findForeignerAgeBand(age);
    if (!band || combo.plan === "LITE") {
      return {
        available: false,
        ageBand: band?.label || "Not available",
        msl: 0,
        awl: band?.awl || 0,
        basePremium: 0,
        baseMedisave: 0,
        baseCash: 0,
        riderPremium: 0,
        totalMedisave: 0,
        totalCash: 0,
        totalAnnual: 0,
      };
    }

    const type = citizenship === "foreignerDependent" ? "dependent" : "nonDependent";
    const baseSource = band[combo.plan][type];
    const basePremium = Array.isArray(baseSource) ? baseSource[0] : baseSource;
    const baseCash = Array.isArray(baseSource) ? baseSource[1] : basePremium;
    const baseMedisave = basePremium - baseCash;
    const riderPremium = combo.hasRider ? (combo.plan === "A" ? band.vhpA[type] : band.vhpB[type]) : 0;

    return {
      available: true,
      ageBand: band.label,
      msl: 0,
      awl: band.awl,
      basePremium,
      baseMedisave,
      baseCash,
      riderPremium,
      totalMedisave: baseMedisave,
      totalCash: baseCash + riderPremium,
      totalAnnual: basePremium + riderPremium,
    };
  }

  const band = findAgeBand(age);
  const [basePremium, baseCash] = band[combo.plan];
  const baseMedisave = basePremium - baseCash;
  const riderPremium = combo.hasRider ? {
    A: band.vhpA,
    B: band.vhpB,
    LITE: band.vhpLite,
  }[combo.plan] : 0;

  return {
    available: true,
    ageBand: band.label,
    msl: band.msl,
    awl: band.awl,
    basePremium,
    baseMedisave,
    baseCash,
    riderPremium,
    totalMedisave: band.msl + baseMedisave,
    totalCash: baseCash + riderPremium,
    totalAnnual: band.msl + basePremium + riderPremium,
  };
}

function proRateFor(plan, scenarioType, settingKey, citizenship) {
  if (plan === "A") return 1;
  const setting = SETTINGS[settingKey];
  const isDay = scenarioType === "daySurgery";
  const isOutpatient = scenarioType === "cancerCdl" || scenarioType === "cancerNonCdl";

  if (setting.private) {
    if (plan === "B") return 0.7;
    if (plan === "LITE") return isDay || isOutpatient ? 0.65 : 0.5;
  }
  if (plan === "LITE" && setting.ward === "A") return 0.8;
  if (plan === "LITE" && setting.ward === "B1" && citizenship === "pr") return 0.9;
  return 1;
}

function deductibleFor(plan, scenarioType, settingKey, age) {
  if (scenarioType === "cancerCdl" || scenarioType === "cancerNonCdl") return 0;
  if (scenarioType === "daySurgery") return 2000;

  const older = age >= 82;
  const setting = SETTINGS[settingKey];
  if (setting.private || setting.ward === "A") return older ? 4500 : 3500;
  if (setting.ward === "B1") return older ? (plan === "A" ? 3500 : 3000) : 2500;
  return older ? 2250 : 2000;
}

function capAppliesFor(settingKey, capMode) {
  if (capMode === "yes") return true;
  if (capMode === "no") return false;
  return SETTINGS[settingKey].capApplies;
}

export function calculateClaim(combo, inputs) {
  const bill = Math.max(0, Number(inputs.bill) || 0);
  const age = Math.max(1, Number(inputs.age) || 1);
  const planMeta = PLAN_META[combo.plan];
  const rate = proRateFor(combo.plan, inputs.scenarioType, inputs.setting, inputs.citizenship);
  const deductible = deductibleFor(combo.plan, inputs.scenarioType, inputs.setting, age);
  const capApplies = capAppliesFor(inputs.setting, inputs.capMode);
  const annualLimit = capApplies ? planMeta.preferredAnnualLimit : planMeta.annualLimit;

  let claimableBeforeDeductible;
  let benefitLimit = annualLimit;
  let coinsuranceRate = 0.1;
  let riderCopayRate = 0.05;
  let riderCap = capApplies ? 6000 : Infinity;
  let cancerMultiplier = null;

  if (inputs.scenarioType === "cancerCdl") {
    const mshlLimit = Math.max(0, Number(inputs.mshlCancerLimit) || 0);
    cancerMultiplier = combo.hasRider ? 21 : 5;
    benefitLimit = cancerMultiplier * mshlLimit;
    claimableBeforeDeductible = Math.min(bill * rate, benefitLimit);
  } else if (inputs.scenarioType === "cancerNonCdl") {
    benefitLimit = combo.hasRider ? planMeta.nonCdlLimit : 0;
    claimableBeforeDeductible = Math.min(bill * rate, benefitLimit);
    riderCopayRate = 0.1;
    riderCap = Infinity;
  } else {
    claimableBeforeDeductible = Math.min(bill * rate, annualLimit);
  }

  const uncovered = Math.max(0, bill - claimableBeforeDeductible);
  const deductiblePaid = Math.min(deductible, claimableBeforeDeductible);
  const amountAfterDeductible = Math.max(0, claimableBeforeDeductible - deductiblePaid);
  const baseCoinsurance = amountAfterDeductible * coinsuranceRate;
  const riderCopayment = combo.hasRider
    ? Math.min(amountAfterDeductible * riderCopayRate, riderCap)
    : baseCoinsurance;
  const policyholderPays = uncovered + deductiblePaid + riderCopayment;
  const insurerPays = Math.max(0, bill - policyholderPays);

  return {
    bill,
    proRate: rate,
    benefitLimit,
    annualLimit,
    cancerMultiplier,
    claimableAmount: claimableBeforeDeductible,
    uncovered,
    deductible: deductiblePaid,
    amountAfterDeductible,
    baseCoinsurance,
    riderCopayment,
    capApplies,
    policyholderPays,
    insurerPays,
  };
}

export function claimTooltip(combo, claim) {
  const lines = [
    `Bill ${money(claim.bill)} x ${(claim.proRate * 100).toFixed(0)}% = ${money(claim.claimableAmount)}`,
  ];
  if (claim.cancerMultiplier) lines.push(`Cancer cap: ${claim.cancerMultiplier}x MSHL = ${money(claim.benefitLimit)}`);
  else lines.push(`Annual cap used: ${money(claim.annualLimit)}`);
  if (claim.uncovered > 0) lines.push(`Uncovered: ${money(claim.uncovered)}`);
  if (claim.deductible > 0) lines.push(`Deductible: ${money(claim.deductible)}`);
  if (combo.hasRider) {
    lines.push(`Co-pay: ${money(claim.riderCopayment)}${claim.capApplies ? " (capped)" : ""}`);
  } else {
    lines.push(`Co-insurance: ${money(claim.baseCoinsurance)}`);
  }
  lines.push(`You pay: ${money(claim.policyholderPays)}`);
  lines.push(`AIA covers: ${money(claim.insurerPays)}`);
  return lines.join("\n");
}

export function money(value) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value || 0);
}
