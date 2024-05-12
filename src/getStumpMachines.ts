import { config } from "./mud.config.js";
import { fetchRecords } from "./fetchRecords.js";

export async function getStumpMachines(address) {

  // pod key is address to bytes32
  const key = "0x000000000000000000000000" + address.slice(2).toLowerCase();

  const podRecords = (await fetchRecords([config.tables.CarriedBy])).records;
  const podId = podRecords.find(
    (r) => r.fields.id === key)?.fields.value;

  const machinesInPodRecords = (await fetchRecords([config.tables.MachinesInPod])).records;
  const machinesInPod = machinesInPodRecords.find(
    (r) => r.fields.id === podId)?.fields.value;

  const machineTypeRecords = (await fetchRecords([config.tables.MachineType])).records;

  for (let i = 0; i < machinesInPod.length; i++) {
    const machine = machineTypeRecords.find(
      (r) => r.fields.id === machinesInPod[i]);
    
    const index = Number(machine?.value?.machine);

    machinesInPod[i] = config.enums.machineType[index];
  }

  return {
    address,
    podId,
    machinesInPod
  };
}