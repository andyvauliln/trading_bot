// ***************************TOKENS TABLE**************************

import { Database } from 'sqlite'; // Ensure correct Database type is imported
import { NewTokenRecord } from "./db.types";
import { convertTimestampToISO, getDbConnection } from "./db.utils";
import { db_config } from "./db.config";

const DEFAULT_BOT_NAME = 'db.tokens'; // Define a default bot name

// TODO: This function seems duplicated in db.utils.ts. Consider consolidating.
// It's generally better to initialize tables once at startup.
export async function createTableNewTokens(database: Database): Promise<boolean> {
  const functionName = 'createTableNewTokens';
  try {
    await database.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        time INTEGER NOT NULL,
        timeDate TEXT NOT NULL,
        name TEXT NOT NULL,
        mint TEXT NOT NULL UNIQUE, -- Added UNIQUE constraint for mint
        creator TEXT NOT NULL,
        program TEXT NOT NULL, -- Added missing program column
        supply REAL,           -- Added missing supply column
        decimals INTEGER,      -- Added missing decimals column
        rug_conditions TEXT,
        tokenReport TEXT,
        bot_name TEXT NOT NULL
      );
    `);
    console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Tokens table checked/created successfully.`);
    return true;
  } catch (error: any) {
    console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error creating tokens table`, 0, { error: error.message });
    return false;
  }
}

/**
 * Insert a new token record into the database
 * @param newToken Token details to insert
 * @param botName Name of the bot performing the action
 * @param processRunCounter Process run counter for logging
 * @returns Promise resolving when the operation is complete
 */
export async function insertNewToken(
  newToken: NewTokenRecord,
  processRunCounter: number
): Promise<void> {
  let db: Database | null = null;
  const functionName = 'insertNewToken';
  const effectiveBotName = newToken.bot_name || DEFAULT_BOT_NAME;
  const { time, name, mint, creator, program, supply, decimals, tokenReport, rug_conditions, bot_name } = newToken;

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    // Check if token already exists using the UNIQUE constraint on mint
    // This check might become redundant if the INSERT handles conflicts
    
    // Keeping this check for logging/flow control, but DB constraint is primary
    const existingToken = await db.get(
      `SELECT 1 FROM tokens WHERE mint = ? LIMIT 1;`,
      [mint]
    );
    
    if (existingToken) {
      console.warn(`[${effectiveBotName}]|[${functionName}]|Token already exists, skipping insertion`, processRunCounter, { mint });
      return; // Exit early if token exists
    }

    const timeDate = convertTimestampToISO(Number(time));

    // Use INSERT OR IGNORE to avoid errors if the mint already exists due to the UNIQUE constraint
    const result = await db.run(
      `
      INSERT OR IGNORE INTO tokens (time, timeDate, name, mint, creator, program, supply, decimals, rug_conditions, tokenReport, bot_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [Number(time), timeDate, name, mint, creator, program, supply, decimals, rug_conditions, tokenReport, bot_name]
    );
    
    // Log success based on whether a row was changed (i.e., inserted)
    // Access changes from the result object returned by run()
    if (result.changes && result.changes > 0) {
        console.log(`[${effectiveBotName}]|[${functionName}]|New token inserted successfully`, processRunCounter, { name, mint });
    } else {
        console.log(`[${effectiveBotName}]|[${functionName}]|Token already exists or insertion failed`, processRunCounter, { name, mint });
    }

  } catch (error) {
    console.error(`[${effectiveBotName}]|[${functionName}]|Error inserting new token`, processRunCounter, { error, newToken });
    throw error; // Re-throw error for upstream handling
  } finally {
    if (db) {
      await db.close();
    }
  }
}

export async function selectTokenByNameAndCreator(
  name: string,
  creator: string,
  processRunCounter: number = 0,
  botName: string = DEFAULT_BOT_NAME
): Promise<NewTokenRecord[]> {
  let db: Database | null = null;
  const functionName = 'selectTokenByNameAndCreator';
  console.log(`[${botName}]|[${functionName}]|Selecting tokens by name or creator`, processRunCounter, { name, creator });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    // Removed redundant createTableNewTokens call

    const tokens: NewTokenRecord[] = await db.all(
      `
      SELECT * 
      FROM tokens
      WHERE name = ? OR creator = ?;
    `,
      [name, creator]
    );
    
    console.log(`[${botName}]|[${functionName}]|Successfully selected ${tokens.length} tokens`, processRunCounter);
    return tokens;

  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error selecting tokens by name or creator`, processRunCounter, { error, name, creator });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// Renamed: selectTokenByMint -> getTokenByMint (singular, standard naming)
// Changed return type to Promise<NewTokenRecord | null>
export async function getTokenByMint(
  mint: string,
  processRunCounter: number = 0,
  botName: string = DEFAULT_BOT_NAME
): Promise<NewTokenRecord | null> {
  let db: Database | null = null;
  const functionName = 'getTokenByMint';
  console.log(`[${botName}]|[${functionName}]|Selecting token by mint`, processRunCounter, { mint });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    // Removed redundant createTableNewTokens call

    const token: NewTokenRecord | undefined = await db.get(
      `
      SELECT * 
      FROM tokens
      WHERE mint = ?;
      LIMIT 1;
    `,
      [mint]
    );

    if (token) {
      console.log(`[${botName}]|[${functionName}]|Successfully selected token by mint`, processRunCounter, { mint });
    } else {
      console.log(`[${botName}]|[${functionName}]|Token not found by mint`, processRunCounter, { mint });
    }
    return token || null;

  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error selecting token by mint`, processRunCounter, { error, mint });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// Renamed: selectAllTokens -> getAllTokens
export async function getAllTokens(
  botName: string = DEFAULT_BOT_NAME,
  processRunCounter: number = 0
): Promise<NewTokenRecord[]> {
  let db: Database | null = null;
  const functionName = 'getAllTokens';
  console.log(`[${botName}]|[${functionName}]|Selecting all tokens`, processRunCounter);

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    // Removed redundant createTableNewTokens call

    const tokens: NewTokenRecord[] = await db.all(`SELECT * FROM tokens;`);

    console.log(`[${botName}]|[${functionName}]|Successfully selected ${tokens.length} tokens`, processRunCounter);
    return tokens;

  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error selecting all tokens`, processRunCounter, { error });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

/**
 * Get token records with filtering options
 * @param options Filter options
 * @param botName Optional: For logging
 * @param processRunCounter Optional: For logging
 * @returns Promise resolving to filtered token records
 */
export async function getTokens(
  options?: {
    creator?: string;
    mint?: string;
    program?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  },
  processRunCounter: number = 0,
  botName: string = DEFAULT_BOT_NAME
): Promise<NewTokenRecord[]> {
  let db: Database | null = null;
  const functionName = 'getTokens';
  console.log(`[${botName}]|[${functionName}]|Fetching tokens with filters`, processRunCounter, { options });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    let query = `SELECT * FROM tokens WHERE 1=1`;
    const params: any[] = [];

    if (options?.creator) {
      query += ` AND creator = ?`;
      params.push(options.creator);
    }
    if (options?.mint) {
      query += ` AND mint = ?`;
      params.push(options.mint);
    }
    if (options?.program) {
      query += ` AND program = ?`;
      params.push(options.program);
    }
    if (options?.startTime) {
      query += ` AND time >= ?`;
      params.push(options.startTime);
    }
    if (options?.endTime) {
      query += ` AND time <= ?`;
      params.push(options.endTime);
    }

    query += ` ORDER BY time DESC`;

    if (options?.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);

      if (options?.offset) {
        query += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    const tokens: NewTokenRecord[] = await db.all(query, params);
    
    console.log(`[${botName}]|[${functionName}]|Successfully fetched ${tokens.length} tokens`, processRunCounter);
    return tokens;

  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error fetching tokens`, processRunCounter, { error, options });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

/**
 * Get tokens created by a specific address
 * @param creator Creator address to search for
 * @param limit Maximum number of tokens to return
 * @param offset Offset for pagination
 * @param botName Optional: For logging
 * @param processRunCounter Optional: For logging
 * @returns Promise resolving to token records created by the specified address
 */
export async function getTokensByCreator(
  creator: string,
  limit: number = 50,
  offset: number = 0,
  botName: string = DEFAULT_BOT_NAME,
  processRunCounter: number = 0
): Promise<NewTokenRecord[]> {
  let db: Database | null = null;
  const functionName = 'getTokensByCreator';
  console.log(`[${botName}]|[${functionName}]|Fetching tokens by creator`, processRunCounter, { creator, limit, offset });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    
    const tokens: NewTokenRecord[] = await db.all(
      `SELECT * FROM tokens WHERE creator = ? ORDER BY time DESC LIMIT ? OFFSET ?;`,
      [creator, limit, offset]
    );
  
    console.log(`[${botName}]|[${functionName}]|Successfully fetched ${tokens.length} tokens for creator`, processRunCounter, { creator });
    return tokens;

  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error fetching tokens by creator`, processRunCounter, { error, creator, limit, offset });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}