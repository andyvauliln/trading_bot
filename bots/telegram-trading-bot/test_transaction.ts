import { createSwapTransaction } from "./transactions";

(async () => {
    const tx = await createSwapTransaction("So11111111111111111111111111111111111111112", "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN");
    console.log(tx);
})();
