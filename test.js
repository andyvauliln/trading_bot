async function main() {
    while (true) {
        console.log('Hello World');
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

(async () => {
    await main();
})();