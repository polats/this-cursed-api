import { defineWorld } from "@latticexyz/world";

import { ENTITY_TYPE_ARRAY, MACHINE_TYPE_ARRAY, MATERIAL_DIFFICULTY_ARRAY, PORT_INDEX_ARRAY } from "./enums";

const enums = {
  ENTITY_TYPE: ENTITY_TYPE_ARRAY,
  MACHINE_TYPE: MACHINE_TYPE_ARRAY,
  PORT_INDEX: PORT_INDEX_ARRAY,
  MATERIAL_DIFFICULTY: MATERIAL_DIFFICULTY_ARRAY
}

const MATERIAL_ID_TYPE = "bytes14" as const
const userTypes = {
  MaterialId: { filePath: "./src/libraries/LibMaterial.sol", type: MATERIAL_ID_TYPE },
} as const

export const config = defineWorld({
  enums: enums,
  tables: {
    MaterialMetadata: {
      key: ["materialId"],
      schema: {
        difficulty: "MATERIAL_DIFFICULTY",
        materialId: "bytes14",
        tokenAddress: "address",
        name: "string",
      },
    },
    Order: {
      key: ["orderId"],
      schema: {
        orderId: "bytes32",
        creationBlock: "uint256",
        creator: "address",
        materialId: "bytes14",
        amount: "uint256",
        expirationBlock: "uint256",
        reward: "uint256",
        maxPlayers: "uint32",
      },
    },
    // Number of players who have completed an order
    CompletedPlayers: {
      key: ["orderId"],
      schema: {
        orderId: "bytes32",
        count: "uint32",
      },
    },
    Recipe: {
      key: ["machineType", "input"],
      schema: {
        machineType: "MACHINE_TYPE",
        input: "bytes32", // Material combination id
        outputs: `${MATERIAL_ID_TYPE}[2]`
      }
    }    
  },
});
