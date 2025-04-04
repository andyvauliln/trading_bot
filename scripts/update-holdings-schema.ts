import { updateHoldingsSchema } from "../db/db.holding";
import dotenv from "dotenv";

dotenv.config();

/**
 * Script to update the holdings table schema
 * Adds missing columns like LamportsBalance and Decimals if they don't exist
 */
async function main() {
  console.log("Starting holdings schema update...");
  
  try {
    const result = await updateHoldingsSchema("update-schema-script", 0);
    
    if (result) {
      console.log("Schema update completed successfully!");
    } else {
      console.log("Schema update failed.");
    }
  } catch (error) {
    console.error("Error during schema update:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  }); 