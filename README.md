# AIA HealthShield Gold Max Product Illustrator

A static client-facing illustrator for comparing AIA HealthShield Gold Max and Max VitalHealth Pro plan combinations.

## Local Use

```bash
npm run serve
```

Then open `http://localhost:4173`.

## Validation

```bash
npm run validate
```

## Premium Updates

Premiums live in editable CSV tables:

- `public/data/resident-premiums.csv`
- `public/data/foreigner-premiums.csv`

After replacing or editing the CSV files, run:

```bash
npm run build:premiums
npm run validate
```

The build command regenerates `public/data/premium-table.js`, which is what the website imports. The claim and presentation logic stays in `public/model.js`.
