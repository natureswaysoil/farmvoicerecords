export type OwnerFarmMembership = { farm_id: string };

export function selectAuthorizedFarmId(
  memberships: OwnerFarmMembership[],
  requestedFarmId?: string | null
) {
  const farmIds = [...new Set(memberships.map((membership) => membership.farm_id).filter(Boolean))];

  if (!farmIds.length) {
    throw new Error("Farm owner access is required.");
  }

  if (requestedFarmId) {
    if (!farmIds.includes(requestedFarmId)) {
      throw new Error("You do not have owner access to the selected farm.");
    }
    return requestedFarmId;
  }

  if (farmIds.length === 1) {
    return farmIds[0];
  }

  throw new Error("Multiple farms are available. Select a farm before continuing.");
}
