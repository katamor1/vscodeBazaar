const tests = require('./extension.test');

async function run() {
  let failures = 0;

  console.log('Bazaar extension integration');
  for (const [name, test] of Object.entries(tests)) {
    try {
      await test();
      console.log(`  ok ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`  failed ${name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    throw new Error(`${failures} integration test(s) failed.`);
  }
}

module.exports = { run };
