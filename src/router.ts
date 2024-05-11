import { ethers, solidityPacked, solidityPackedKeccak256 } from "ethers";
import { AutoRouter, createResponse } from "itty-router";
import { createIndexerClient } from "@latticexyz/store-sync/indexer-client";
import { unwrap } from "@latticexyz/common";
import { flattenSchema } from "./flattenSchema.js";
import {
  decodeKey,
  decodeValueArgs,
  getKeySchema,
  getValueSchema,
  KeySchema,
} from "@latticexyz/protocol-parser/internal";
import { isDefined } from "@latticexyz/common/utils";
import { config } from "./mud.config.js";
import materials from "./materials.json";
import { Typed } from "ethers";

const tables = Object.values(config.tables);

const indexerClient = createIndexerClient({
  url: "https://indexer.mud.redstonechain.com",
});

const router = AutoRouter({
  format: createResponse("application/json; charset=utf-8", (data) =>
    JSON.stringify(
      data,
      (key: string, value: any) =>
        typeof value === "bigint" ? value.toString() : value,
      2
    )
  ),
});


const getResults = async () => {
  return unwrap(
    await indexerClient.getLogs({
      chainId: 690,
      address: "0x4ab7e8b94347cb0236e3de126db9c50599f7db2d",
      filters: tables.map((table) => ({
        tableId: table.tableId,
      })),
    })
  );  
}

const getRecords = async () => {
  const results = await getResults();
  const records = results.logs
    .map((log) => {
      if (log.eventName !== "Store_SetRecord") {
        throw new Error(`Unexpected log type from indexer: ${log.eventName}`);
      }

      const table = tables.find((table) => table.tableId === log.args.tableId);
      if (!table) return;

      // config.tables.Order;

      const keySchema = flattenSchema(getKeySchema(table));
      const key = decodeKey(keySchema as KeySchema, log.args.keyTuple);
      const value = decodeValueArgs(
        flattenSchema(getValueSchema(table)),
        log.args
      );

      return {
        table,
        keyTuple: log.args.keyTuple,
        primaryKey: Object.values(key),
        key,
        value,
        fields: { ...key, ...value },
      };
    })
    .filter(isDefined);

    return {
      latestBlock: results.blockNumber,
      records
    }
}

const getMaterials = async (records) => {
  const materials = records
    .filter((record) => record.table.tableId === config.tables.MaterialMetadata.tableId)
    .map((record) => record.fields);

    materials.forEach((material) => {
      material.combinationId = solidityPackedKeccak256(
        ["bytes14"],
        [Typed.bytes14(material.materialId).value]
      );
    });
        
  return materials;

}

const getCombinedMaterialIds = async (materials) => {

  // for each material, combine with each other material and get the combination id by keccac256
  const combinedMaterialIds = materials.flatMap((material, i) =>
    materials.slice(i + 1).map((otherMaterial) => {

      // check greater than to avoid duplicate combinations
      let A, B;

      if (Typed.bytes14(material.materialId).value < Typed.bytes14(otherMaterial.materialId).value) {
        A = material;
        B = otherMaterial;
      }
      else
      {
        A = otherMaterial;
        B = material;
      }

      return {
      A: material.name,
      B: otherMaterial.name,
      combinationid: solidityPackedKeccak256(
        ["bytes14", "bytes14"],
        [Typed.bytes14(A.materialId).value, Typed.bytes14(B.materialId).value]
      )
      }
    }
    )
  );
  

  return combinedMaterialIds;
}

router.get("/", () => ({ message: "Have you eaten your $BUGS today?" }));

router.get("/materials", async () => {
  const { latestBlock, records} = await getRecords();

  return getMaterials(records);

});

router.get("/recipes", async () => {
  const { latestBlock, records} = await getRecords();

  const materials = await getMaterials(records);
  const combinedMaterialIds = await getCombinedMaterialIds(materials);

  const recipes = records
  .filter((record) => record.table.tableId === config.tables.Recipe.tableId)
  .map((record) => record.fields);

  // replace machineType with corresponding enum string
  recipes.forEach((recipe) => {
    recipe.machineType = config.enums.MACHINE_TYPE[recipe.machineType];
  });

  // replace outputs with corresponding material string
  recipes.forEach((recipe) => {
    recipe.outputs = recipe.outputs.map((output) => {
      const material = materials.find((row) => row.materialId === output);
      return material ? material.name : output;
    });
  });

  // replace input with name if found as a combination id in materials list
  recipes.forEach((recipe) => {
    const material = materials.find((row) => row.combinationId === recipe.input);

    if (material) {
      recipe.input = material.name;
    }

  // replace input with name if found as a combination id in combinedMaterialIds list
    else {
      const material = combinedMaterialIds.find((row) => row.combinationid === recipe.input);
        if (material) {
          recipe.input = `${material.A} + ${material.B}`;
        }
    }

  });

  return recipes;
});


router.get("/orders", async () => {
  const { latestBlock, records} = await getRecords();

  const orders = records
    .filter((record) => record.table.tableId === config.tables.Order.tableId)
    .map((record) => {
      const order = record.fields;

      const material = records.find(
        (r) =>
          r.table.tableId === config.tables.MaterialMetadata.tableId &&
          r.fields.materialId === record.fields.materialId
      )?.fields;

      const materialData = material
        ? materials.find((row) => row.id === material.name)
        : undefined;

      const completed = records.find(
        (r) =>
          r.table.tableId === config.tables.CompletedPlayers.tableId &&
          r.fields.orderId === record.fields.orderId
      )?.fields;

      return {
        ...order,
        orderNumber: parseInt(order.orderId.replace(/^0x/, ""), 16),
        material: material
          ? {
              ...material,
              label: materialData?.name,
            }
          : undefined,
        completed: completed?.count,
        remaining: completed
          ? Math.max(0, order.maxPlayers - completed.count)
          : undefined,
      };
    })
    .filter(
      (order) =>
        order.remaining > 0 && order.expirationBlock > latestBlock
    );

  return orders;
});

export default router;
