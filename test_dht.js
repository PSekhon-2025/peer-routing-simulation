/**
 * test_dht.js
 *
 * This script automates testing of the DHT P2P application.
 * It spawns the server and client peers, then listens to their output to verify:
 *  - Server initialization and correct output formatting
 *  - Client connection to the server and processing of Welcome messages
 *  - Heartbeat cycles are initiated by the server
 *  - Unresponsive peers (simulated by killing a client) are removed from the DHT
 *  - Multiple peers connect simultaneously and update the DHT accordingly
 *
 * Usage: node test_dht.js
 */

const { spawn } = require("child_process");
const assert = require("assert");

// Helper function: waits for a specific substring in the child process stdout
function waitForOutput(child, substring, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for output: "${substring}"`));
    }, timeout);
    child.stdout.on("data", (data) => {
      const text = data.toString();
      // Uncomment the next line to log all output during testing.
      // process.stdout.write(text);
      if (text.includes(substring)) {
        clearTimeout(timer);
        resolve(text);
      }
    });
  });
}

async function runTests() {
  console.log("Starting tests for DHT P2P Application\n");

  // ----- Test 1: Server Initialization -----
  console.log("Test 1: Server Initialization");
  // Spawn the server process with peer name "server"
  let server = spawn("node", ["DHTPeer.js", "-n", "server"]);
  server.stdout.setEncoding("utf8");
  server.stderr.setEncoding("utf8");

  // Wait for the server's startup output that includes the ephemeral port.
  let serverOutput = await waitForOutput(server, "This peer address is", 10000);
  console.log("Server output:\n", serverOutput);

  // Extract ephemeral port using a regular expression.
  let match = serverOutput.match(/127\.0\.0\.1:(\d+)/);
  assert(match, "Failed to extract ephemeral port from server output");
  let serverPort = match[1];
  console.log("Extracted server port:", serverPort, "\n");

  // ----- Test 2: Client Connection and Welcome Message -----
  console.log("Test 2: Client Connection and Welcome Message");
  // Spawn a client process connecting to the server
  let client = spawn("node", [
    "DHTPeer.js",
    "-n",
    "peer2",
    "-p",
    `127.0.0.1:${serverPort}`,
  ]);
  client.stdout.setEncoding("utf8");
  client.stderr.setEncoding("utf8");

  // Wait for output confirming connection from the client.
  let clientOutput = await waitForOutput(
    client,
    "Connected to target peer",
    10000
  );
  console.log("Client connection output:\n", clientOutput);

  // Verify that the client processes the Welcome message.
  let welcomeOutput = await waitForOutput(
    client,
    "Processing Welcome message",
    10000
  );
  assert(
    welcomeOutput.includes("Processing Welcome message"),
    "Welcome message was not processed by the client"
  );
  console.log("Client processed Welcome message successfully.\n");

  // ----- Test 3: Heartbeat Mechanism -----
  console.log("Test 3: Heartbeat Mechanism");
  // Wait for the server to log a heartbeat cycle.
  let heartbeatOutput = await waitForOutput(
    server,
    "Heartbeat cycle at timestamp",
    25000
  );
  assert(
    heartbeatOutput.includes("Heartbeat cycle at timestamp"),
    "Heartbeat cycle not detected in server output"
  );
  console.log("Heartbeat cycle detected in server output.\n");

  // ----- Test 4: Removal of Unresponsive Peer -----
  console.log("Test 4: Removal of Unresponsive Peer");
  // Simulate an unresponsive peer by killing the client process.
  client.kill();
  console.log("Client process killed to simulate unresponsiveness.");

  // Wait for the server to log removal of the unresponsive peer.
  // (The server removes a peer after 3 consecutive missed heartbeats; timeout adjusted accordingly.)
  let removalOutput = await waitForOutput(server, "Removing peer", 80000);
  assert(
    removalOutput.includes("Removing peer"),
    "Unresponsive peer was not removed as expected"
  );
  console.log("Unresponsive peer removal logged:\n", removalOutput, "\n");

  // Kill the server process from Tests 1-4.
  server.kill();

  // ----- Test 5: Multiple Peer Connection and DHT Update -----
  console.log("Test 5: Multiple Peer Connection and DHT Update");
  // Spawn a new server process (for a fresh DHT) with peer name "server2"
  let server2 = spawn("node", ["DHTPeer.js", "-n", "server2"]);
  server2.stdout.setEncoding("utf8");
  server2.stderr.setEncoding("utf8");

  // Wait for the server2 startup output that includes the ephemeral port.
  let server2Output = await waitForOutput(
    server2,
    "This peer address is",
    10000
  );
  console.log("New server output:\n", server2Output);

  // Extract ephemeral port from server2 output.
  let match2 = server2Output.match(/127\.0\.0\.1:(\d+)/);
  assert(match2, "Failed to extract ephemeral port from new server output");
  let server2Port = match2[1];
  console.log("Extracted new server port:", server2Port, "\n");

  // Define multiple client names.
  const multipleClientNames = ["peer3", "peer4", "peer5"];

  // Spawn all clients concurrently, connecting to the new server.
  let clients = multipleClientNames.map((name) =>
    spawn("node", ["DHTPeer.js", "-n", name, "-p", `127.0.0.1:${server2Port}`])
  );
  clients.forEach((client) => {
    client.stdout.setEncoding("utf8");
    client.stderr.setEncoding("utf8");
  });

  // Wait for server2 to log incoming connection messages for each new peer.
  for (let i = 0; i < multipleClientNames.length; i++) {
    let multiConnOutput = await waitForOutput(
      server2,
      "Incoming connection from",
      15000
    );
    console.log(
      `Connection log from server2 for one of the peers:\n`,
      multiConnOutput
    );
  }

  // Optionally, wait for a DHT update log from server2 (e.g., print of the updated Routing Table)
  let dhtUpdateOutput = await waitForOutput(server2, "Routing Table:", 15000);
  console.log("Server2 Routing Table update log:\n", dhtUpdateOutput);

  // Cleanup: kill all client processes spawned in Test 5.
  clients.forEach((client) => client.kill());
  server2.kill();

  console.log("All tests passed successfully.");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
