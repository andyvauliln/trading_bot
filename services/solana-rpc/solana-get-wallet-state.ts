import { Connection, PublicKey } from "@solana/web3.js";
import { getTokenMetadata } from "./solana-get-token-metadata";

export interface TokenAccountInfo {
  mint: string;
  address: string;
  owner: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  uiAmountString: string;
}

export interface TokenWithMetadata extends TokenAccountInfo {
  name: string;
  symbol: string;
  isInitialized: boolean;
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

/**
 * Get all token accounts for a wallet with their balances
 * @param botName Name of the bot using this function (for logging)
 * @param connection Solana RPC connection
 * @param walletPublicKey Public key of the wallet
 * @param processRunCounter Optional counter for logging
 * @returns Array of token accounts with balance information
 */
export async function getTokenAccountsWithBalances(
  botName: string,
  walletPublicKey: PublicKey,
  connection?: Connection,
  processRunCounter: number = 0
): Promise<TokenAccountInfo[]> {
  try {
    console.log(`[${botName}]|[getTokenAccountsWithBalances]|Fetching token accounts for ${walletPublicKey.toString()}`, processRunCounter);
    if(!connection) {
      connection = new Connection(process.env.HELIUS_HTTPS_URI || "https://api.mainnet-beta.solana.com");
    }
    // Get all token accounts for the wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPublicKey,
      { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
    );
    
    // Map to a more convenient format
    const accountsWithBalances = tokenAccounts.value.map(account => {
      const parsedInfo = account.account.data.parsed.info;
      return {
        mint: parsedInfo.mint,
        address: account.pubkey.toString(),
        owner: parsedInfo.owner,
        amount: parsedInfo.tokenAmount.amount,
        decimals: parsedInfo.tokenAmount.decimals,
        uiAmount: parsedInfo.tokenAmount.uiAmount,
        uiAmountString: parsedInfo.tokenAmount.uiAmountString
      };
    });
    
    // Filter out accounts with zero balance (optional)
    const nonZeroAccounts = accountsWithBalances.filter(account => 
      BigInt(account.amount) > BigInt(0)
    );
    
    console.log(`[${botName}]|[getTokenAccountsWithBalances]|Found ${nonZeroAccounts.length} token(s) with non-zero balance`, processRunCounter);
    return nonZeroAccounts;
  } catch (error) {
    console.error(`[${botName}]|[getTokenAccountsWithBalances]|Error getting token accounts:`, processRunCounter, error);
    return [];
  }
}

/**
 * Get token accounts with their balances and metadata
 * @param botName Name of the bot using this function (for logging)
 * @param connection Solana RPC connection
 * @param walletPublicKey Public key of the wallet
 * @param processRunCounter Optional counter for logging
 * @returns Array of tokens with balance and metadata
 */
export async function getTokensWithMetadata(
  botName: string,
  walletPublicKey: PublicKey,
  connection?: Connection,
  processRunCounter: number = 0
): Promise<TokenWithMetadata[]> {
  try {
    // Get token accounts
    const tokenAccounts = await getTokenAccountsWithBalances(
      botName,
      walletPublicKey,
      connection,
      processRunCounter
    );
    
    // Get metadata for each token
    const tokensWithMetadata = await Promise.all(
      tokenAccounts.map(async (account) => {
        const metadata = await getTokenMetadata(botName, account.mint, connection, processRunCounter);
        if(!metadata) {
          return null;
        }
        
        return {
          ...account,
          name: metadata.name,
          symbol: metadata.symbol,
          isInitialized: metadata.isInitialized,
          mintAuthority: metadata.mintAuthority,
          freezeAuthority: metadata.freezeAuthority
        };
      })
    );
    
    return tokensWithMetadata.filter(token => token !== null) as TokenWithMetadata[];
  } catch (error) {
    console.error(`[${botName}]|[getTokensWithMetadata]|Error getting tokens with metadata:`, processRunCounter, error);
    return [];
  }
}

/**
 * Get specific token balance for a wallet
 * @param botName Name of the bot using this function (for logging)
 * @param connection Solana RPC connection 
 * @param walletPublicKey Public key of the wallet
 * @param mint Token mint address
 * @param processRunCounter Optional counter for logging
 * @returns Object with token balance information or null if not found
 */
export async function getTokenBalance(
  botName: string,
  connection: Connection,
  walletPublicKey: PublicKey,
  mint: string,
  processRunCounter: number = 0
): Promise<TokenAccountInfo | null> {
  try {
    console.log(`[${botName}]|[getTokenBalance]|Fetching balance for token ${mint}`, processRunCounter);
    
    // Get token accounts for the specified mint
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPublicKey,
      { mint: new PublicKey(mint) }
    );
    
    // If no accounts found, return null
    if (tokenAccounts.value.length === 0) {
      console.log(`[${botName}]|[getTokenBalance]|No token accounts found for ${mint}`, processRunCounter);
      return null;
    }
    
    // Get the first account (usually there's only one per mint)
    const account = tokenAccounts.value[0];
    const parsedInfo = account.account.data.parsed.info;
    
    return {
      mint: parsedInfo.mint,
      address: account.pubkey.toString(),
      owner: parsedInfo.owner,
      amount: parsedInfo.tokenAmount.amount,
      decimals: parsedInfo.tokenAmount.decimals,
      uiAmount: parsedInfo.tokenAmount.uiAmount,
      uiAmountString: parsedInfo.tokenAmount.uiAmountString
    };
  } catch (error) {
    console.error(`[${botName}]|[getTokenBalance]|Error getting token balance:`, processRunCounter, error);
    return null;
  }
}

/**
 * Format a token amount based on its decimals
 * @param amount Raw token amount as string
 * @param decimals Number of decimal places
 * @returns Formatted amount as string with proper decimal places
 */
