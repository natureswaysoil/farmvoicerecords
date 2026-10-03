# John Deere application-rate mapping

FarmVoice maps John Deere field-operation measurements into the existing
`equipment_records` import path.

For an application operation, FarmVoice intentionally prefers
`ApplicationRateResult` over `ApplicationRateTarget` because the result
represents what the machine actually recorded as applied.

## Mapping

- Deere field operation id -> `source_record_id`
- `ApplicationRateResult.applicationProductTotals[].productTotals[].name`
  -> product
- `averageMaterial.value` -> application rate
- `averageMaterial.unitId` -> application-rate unit
- `appliedArea.value` (fallback: `area.value`) -> treated area
- machine VIN (fallback GUID/ERID) -> machine
- field-operation start/end -> timestamps

Tank mixes are expanded to one FarmVoice equipment row per product total so
different products/rates are not collapsed into one ambiguous record.

The sync should request the Deere field-operation resource with embedded
measurement totals when supported. If only measurement links are returned,
fetch:

`/fieldOperations/{operationId}/measurementTypes/ApplicationRateResult`

before calling `deereApplicationRateResultToEquipmentRows`.

Do not substitute `ApplicationRateTarget` when the result is absent. A target
is a planned rate, not proof of what the machine actually applied.
