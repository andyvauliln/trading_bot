import { Connection, PublicKey } from "@solana/web3.js";
import { getAllHoldings, updateHoldingByToken } from "../db/db.holding";
import { getTokenAccountsWithBalances, TokenAccountInfo } from "../services/solana-rpc/solana-get-wallet-state";
import { getTokenMetadata } from "../services/solana-rpc/solana-get-token-metadata";
import * as dotenv from "dotenv";

// Initialize environment variables
dotenv.config();

// Constants
const BOT_NAME = "check-holding-balances";
const SOLANA_RPC_URL = process.env.HELIUS_HTTPS_URI || "https://api.mainnet-beta.solana.com";

// Command line arguments
const shouldUpdate = true;

// Types for comparison results
interface TokenBalanceMismatch {
  holdingId: number;
  token: string;
  tokenName: string;
  walletPublicKey: string;
  dbBalance: number;
  actualBalance: number;
  decimals: number;
}

interface MissingToken {
  token: string;
  tokenName: string;
  walletPublicKey: string;
  actualBalance: number;
  decimals: number;
}

/**
 * Truncate an address to first N characters
 */
function truncateAddress(address: string, length: number = 5): string {
  if (!address) return '';
  if (address.length <= length) return address;
  return `${address.substring(0, length)}...`;
}

async function main() {
  const processRunCounter = 0;
  console.log(`[${BOT_NAME}]|[main]|Starting account balance verification`, processRunCounter, {
    shouldUpdate,
  });

  try {
    // Initialize Solana connection
    const connection = new Connection(SOLANA_RPC_URL);
    
    // Get all holdings from database
    const holdings = await getAllHoldings("all");
    
    console.log(`[${BOT_NAME}]|[main]|Retrieved ${holdings.length} holdings from database`, processRunCounter);
    
    // Group holdings by wallet for more efficient checking
    const holdingsByWallet: { [key: string]: typeof holdings } = {};
    for (const holding of holdings) {
      if (!holdingsByWallet[holding.WalletPublicKey]) {
        holdingsByWallet[holding.WalletPublicKey] = [];
      }
      holdingsByWallet[holding.WalletPublicKey].push(holding);
    }
    
    // Create maps to track tokens by mint address for each wallet
    const tokensByWallet: { [wallet: string]: { [token: string]: boolean } } = {};
    for (const [wallet, walletHoldings] of Object.entries(holdingsByWallet)) {
      tokensByWallet[wallet] = {};
      for (const holding of walletHoldings) {
        tokensByWallet[wallet][holding.Token] = true;
      }
    }
    
    // Store mismatches for reporting
    const mismatches: TokenBalanceMismatch[] = [];
    const missingFromDb: MissingToken[] = [];
    
    // Process each wallet
    for (const [walletAddress, walletHoldings] of Object.entries(holdingsByWallet)) {
      console.log(`[${BOT_NAME}]|[main]|Checking wallet ${truncateAddress(walletAddress)} with ${walletHoldings.length} holdings`, processRunCounter);
      
      try {
        // Get all token balances for this wallet
        const walletPublicKey = new PublicKey(walletAddress);
        const tokenAccounts = await getTokenAccountsWithBalances(
          BOT_NAME,
          walletPublicKey,
          connection,
          processRunCounter
        );
        
        // Create a map of token mint -> token account for easier lookup
        const tokenAccountsByMint: { [mint: string]: TokenAccountInfo } = {};
        for (const account of tokenAccounts) {
          tokenAccountsByMint[account.mint] = account;
          
          // Check if token exists in the database for this wallet
          if (!tokensByWallet[walletAddress][account.mint]) {
            // Get token metadata to include the name
            const tokenMetadata = await getTokenMetadata(
              BOT_NAME,
              account.mint,
              connection,
              processRunCounter
            );
            
            missingFromDb.push({
              token: account.mint,
              tokenName: tokenMetadata?.name || "Unknown",
              walletPublicKey: walletAddress,
              actualBalance: Number(account.uiAmountString),
              decimals: account.decimals
            });
          }
        }
        
        // Compare each holding with actual balance
        for (const holding of walletHoldings) {
          const tokenAccount = tokenAccountsByMint[holding.Token];
          
          // If token exists in wallet
          if (tokenAccount) {
            const dbBalance = holding.Balance;
            const actualBalance = Number(tokenAccount.uiAmountString);
            
            // Check if balances don't match (using a small epsilon for floating point comparison)
            if (Math.abs(dbBalance - actualBalance) > 0.000001) {
              mismatches.push({
                holdingId: holding.id!,
                token: holding.Token,
                tokenName: holding.TokenName,
                walletPublicKey: holding.WalletPublicKey,
                dbBalance,
                actualBalance,
                decimals: tokenAccount.decimals
              });
              
              // Update the database if requested
              if (shouldUpdate) {
                await updateHoldingByToken(
                  holding.Token,
                  holding.WalletPublicKey,
                  {
                    Balance: actualBalance,
                    LamportsBalance: tokenAccount.amount,
                    Decimals: tokenAccount.decimals
                  },
                  BOT_NAME,
                  processRunCounter
                );
                console.log(`[${BOT_NAME}]|[main]|Updated holding for ${holding.TokenName}`, processRunCounter, {
                  token: truncateAddress(holding.Token),
                  oldBalance: dbBalance,
                  newBalance: actualBalance
                });
              }
            }
          } else {
            // Token not found in wallet - might have been transferred out
            console.warn(`[${BOT_NAME}]|[main]|Token in database but not found in wallet`, processRunCounter, {
              token: truncateAddress(holding.Token),
              tokenName: holding.TokenName,
              walletPublicKey: truncateAddress(holding.WalletPublicKey)
            });
            
            mismatches.push({
              holdingId: holding.id!,
              token: holding.Token,
              tokenName: holding.TokenName,
              walletPublicKey: holding.WalletPublicKey,
              dbBalance: holding.Balance,
              actualBalance: 0,
              decimals: holding.Decimals
            });
            
            // Update the database if requested (set balance to 0)
            if (shouldUpdate) {
              await updateHoldingByToken(
                holding.Token,
                holding.WalletPublicKey,
                {
                  Balance: 0,
                  LamportsBalance: "0"
                },
                BOT_NAME,
                processRunCounter
              );
              console.log(`[${BOT_NAME}]|[main]|Updated missing token holding to zero balance`, processRunCounter, {
                token: truncateAddress(holding.Token),
                tokenName: holding.TokenName
              });
            }
          }
        }
      } catch (error) {
        console.error(`[${BOT_NAME}]|[main]|Error processing wallet ${truncateAddress(walletAddress)}`, processRunCounter, { error });
      }
    }
    
    // Print summary for mismatches
    console.log(`[${BOT_NAME}]|[main]|Verification complete. Found ${mismatches.length} mismatches.`, processRunCounter);
    
    if (mismatches.length > 0) {
      console.log(`[${BOT_NAME}]|[main]|Mismatch summary:`, processRunCounter);
      
      // Format the mismatches for better console output
      const formattedMismatches = mismatches.map(m => ({
        id: m.holdingId,
        token: truncateAddress(m.token),
        name: m.tokenName,
        wallet: truncateAddress(m.walletPublicKey),
        dbBalance: m.dbBalance,
        actualBalance: m.actualBalance,
        difference: m.actualBalance - m.dbBalance,
        updated: shouldUpdate ? "Yes" : "No"
      }));
      
      console.table(formattedMismatches);
    }
    
    // Print summary for tokens missing from database
    if (missingFromDb.length > 0) {
      console.log(`[${BOT_NAME}]|[main]|Found ${missingFromDb.length} tokens in wallets that are not in the holdings table:`, processRunCounter);
      
      // Format the missing tokens for better console output
      const formattedMissingTokens = missingFromDb.map(m => ({
        token: truncateAddress(m.token),
        name: m.tokenName,
        wallet: truncateAddress(m.walletPublicKey),
        actualBalance: m.actualBalance,
        decimals: m.decimals
      }));
      
      console.table(formattedMissingTokens);
    }
    
    if (shouldUpdate) {
      console.log(`[${BOT_NAME}]|[main]|Updated ${mismatches.length} holdings in the database`, processRunCounter);
    } else if (mismatches.length > 0) {
      console.log(`[${BOT_NAME}]|[main]|Run with --update flag to update the database`, processRunCounter);
    }
    
  } catch (error) {
    console.error(`[${BOT_NAME}]|[main]|Error in script execution`, processRunCounter, { error });
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`[${BOT_NAME}]|[main]|Fatal error`, 0, { error });
    process.exit(1);
  }); 