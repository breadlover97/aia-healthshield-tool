import { COMBINATIONS, calculateClaim, premiumForCombination } from "../public/model.js";

const byId = Object.fromEntries(COMBINATIONS.map((combo) => [combo.id, combo]));
const inputs = {
  age: 61,
  citizenship: "sc",
  scenarioType: "inpatient",
  setting: "privatePreferred",
  bill: 200000,
  capMode: "auto",
  mshlCancerLimit: 9600,
};

const cases = [
  ["Screenshot 1: HSG Max A + rider, preferred", "A_R", { setting: "privatePreferred" }, 200000, 9500, 190500],
  ["Screenshot 1: HSG Max A + rider, non-AQHP", "A_R", { setting: "privateNonPreferred" }, 200000, 13325, 186675],
  ["Screenshot 2: HSG Max A no rider", "A_N", { setting: "privatePreferred" }, 200000, 23150, 176850],
  ["Screenshot 3: HSG Max B + rider, public", "B_R", { setting: "publicA" }, 200000, 9500, 190500],
  ["Screenshot 3: HSG Max B + rider, private CPA", "B_R", { setting: "privatePreferred" }, 140000, 69500, 130500],
  ["Screenshot 3: HSG Max B + rider, private non-AQHP", "B_R", { setting: "privateNonPreferred" }, 140000, 70325, 129675],
];

let failures = 0;

for (const [name, comboId, overrides, expectedClaimable, expectedOutOfPocket, expectedCovered] of cases) {
  const result = calculateClaim(byId[comboId], { ...inputs, ...overrides });
  const actual = [
    Math.round(result.claimableAmount),
    Math.round(result.policyholderPays),
    Math.round(result.insurerPays),
  ];
  const expected = [expectedClaimable, expectedOutOfPocket, expectedCovered];
  const ok = actual.every((value, index) => value === expected[index]);
  console.log(`${ok ? "OK" : "FAIL"} ${name}: ${actual.join(" / ")}`);
  if (!ok) {
    console.log(`  expected: ${expected.join(" / ")}`);
    failures += 1;
  }
}

if (failures) process.exit(1);

const premiumCases = [
  ["Sheet example ANB 61: A + rider", "A_R", 61, 1731, 5339],
  ["Sheet example ANB 61: B + rider", "B_R", 61, 1731, 1017],
  ["Sheet example ANB 61: Lite + rider", "LITE_R", 61, 1497.72, 481.3],
  ["Sheet example ANB 57: A + rider", "A_R", 57, 1503, 3803],
  ["Sheet example ANB 57: B + rider", "B_R", 57, 1490, 527],
  ["Sheet example ANB 57: Lite + rider", "LITE_R", 57, 1145.44, 282.3],
];

for (const [name, comboId, age, expectedMedisave, expectedCash] of premiumCases) {
  const premium = premiumForCombination(byId[comboId], age, "sc");
  const actual = [Number(premium.totalMedisave.toFixed(2)), Number(premium.totalCash.toFixed(2))];
  const expected = [expectedMedisave, expectedCash];
  const ok = actual.every((value, index) => value === expected[index]);
  console.log(`${ok ? "OK" : "FAIL"} ${name}: MediSave ${actual[0]} / Cash ${actual[1]}`);
  if (!ok) {
    console.log(`  expected: MediSave ${expected[0]} / Cash ${expected[1]}`);
    failures += 1;
  }
}

const foreignerPremiumCases = [
  ["Foreigner non-dependant ANB 61: A + rider", "A_R", 61, "foreignerNonDependent", 0, 7370],
  ["Foreigner non-dependant ANB 61: B + rider", "B_R", 61, "foreignerNonDependent", 0, 2904],
  ["Foreigner dependant ANB 61: A + rider", "A_R", 61, "foreignerDependent", 1731, 5339],
  ["Foreigner dependant ANB 61: B + rider", "B_R", 61, "foreignerDependent", 1731, 1017],
  ["Foreigner ANB 61: B Lite unavailable", "LITE_R", 61, "foreignerNonDependent", 0, 0, false],
];

for (const [name, comboId, age, citizenship, expectedMedisave, expectedCash, expectedAvailable = true] of foreignerPremiumCases) {
  const premium = premiumForCombination(byId[comboId], age, citizenship);
  const actual = [
    premium.available,
    Number(premium.totalMedisave.toFixed(2)),
    Number(premium.totalCash.toFixed(2)),
  ];
  const expected = [expectedAvailable, expectedMedisave, expectedCash];
  const ok = actual.every((value, index) => value === expected[index]);
  console.log(`${ok ? "OK" : "FAIL"} ${name}: available ${actual[0]} / MediSave ${actual[1]} / Cash ${actual[2]}`);
  if (!ok) {
    console.log(`  expected: available ${expected[0]} / MediSave ${expected[1]} / Cash ${expected[2]}`);
    failures += 1;
  }
}

if (failures) process.exit(1);
