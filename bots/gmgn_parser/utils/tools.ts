import * as fs from "fs";
import * as path from "path";

function ensureDirectoryExistence(filePath: string) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    console.log("not exists ", dirname);
    fs.mkdirSync(dirname, { recursive: true });
  }
}

export const readJsonFile = async <T>(filePath: string): Promise<T[]> => {
  ensureDirectoryExistence(filePath);
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const data = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading JSON file ${filePath}:`, error);
    return [];
  }
};

export async function saveJsonFile<T>(
  filePath: string,
  records: T[],
  append = false
) {
  ensureDirectoryExistence(filePath);

  try {
    let existingData: T[] = [];
    if (append && fs.existsSync(filePath)) {
      existingData = await readJsonFile<T>(filePath);
    }

    const dataToWrite = append ? [...existingData, ...records] : records;
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(dataToWrite, null, 2),
      'utf8'
    );
    console.log(`JSON file written successfully to ${filePath}`);
  } catch (error) {
    console.error(`Error writing JSON file ${filePath}:`, error);
    throw error;
  }
}

export function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

export function convertTags(tags: string[]): string[] {
  const tagDescriptions: { [key: string]: string } = {
    smart_degen: "Smart Money",
    pump_smart: "Pump Smart Money",
    fresh_wallet: "New Wallet",
    snipe_bot: "Sniper",
  };

  return tags.map((tag) => tagDescriptions[tag] || tag);
}

export const chainIdMap: { [key: number]: string } = {
  501: "sol",
  1: "eth",
};

export const formattedDate = (): string => {
  const now = new Date();
  const formattedDate = `${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")} ${String(
    now.getHours()
  ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return formattedDate;
};

