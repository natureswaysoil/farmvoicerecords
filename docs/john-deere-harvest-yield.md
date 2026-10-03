# John Deere harvest-yield mapping

FarmVoice maps John Deere `HarvestYieldResult` measurements into the
existing `equipment_records` import path.

For U.S. farms the live Deere client should request `Accept-UOM-System:
ENGLISH` where the Deere endpoint supports that header. When Deere returns a
bushel-per-acre unit, FarmVoice stores it as `bu/ac`.

FarmVoice does not invent a bushel conversion from metric mass or volume. If
Deere returns metric units, the native Deere value/unit is preserved.

## Mapping

- Deere field operation id -> `source_record_id`
- machine VIN (fallback GUID/ERID) -> machine
- field-operation start/end -> timestamps
- first variety name (fallback crop name) -> product/crop label
- `HarvestYieldResult.area` -> harvested area
- `HarvestYieldResult.averageYield` -> yield
- fallback `averageWetMass` -> yield when averageYield is absent
- `HarvestYieldResult.averageMoisture` -> moisture percent

If field-operation embedding does not include the measurement values, fetch:

`/fieldOperations/{operationId}/measurementTypes/HarvestYieldResult`

and normalize the returned measurement before importing it into FarmVoice.
