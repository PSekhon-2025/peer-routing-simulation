/**
 * DHTpeer.js
 *
 * This module implements a Distributed Hash Table (DHT) peer node that can:
 * 1. Join an existing DHT network
 * 2. Handle incoming connections from other peers
 * 3. Maintain a routing table of known peers
 * 4. Send and receive heartbeat messages
 * 5. Exchange peer information through Hello/Welcome messages
 */

const net = require("net");
const fs = require("fs"); // Added for file writing
const Singleton = require("./Singleton");
const RoutingTable = require("./RoutingTable");
const kPTP = require("./kPTP");
const Heartbeat = require("./Heartbeat");

// ------------------------------
// Parse command-line arguments
// ------------------------------
const args = process.argv.slice(2);
let peerName = null;
let targetPeer = null; // Expected format: { ip, port }

// Parse command line arguments for peer name (-n) and target peer (-p)
for (let i = 0; i < args.length; i++) {
  if (args[i] === "-n" && i + 1 < args.length) {
    peerName = args[i + 1]; // Store the peer name from the next argument
    i++; // Skip the next argument since we've used it
  } else if (args[i] === "-p" && i + 1 < args.length) {
    // Parse the target peer address in format "ip:port"
    const parts = args[i + 1].split(":");
    if (parts.length === 2) {
      targetPeer = {
        ip: parts[0],
        port: parseInt(parts[1], 10), // Convert port string to integer
      };
    }
    i++; // Skip the next argument since we've used it
  }
}

// Validate required arguments
if (!peerName) {
  console.error("Error: Peer name (-n) is required.");
  process.exit(1);
}

// ------------------------------
// Initialize Singleton and start server
// ------------------------------
Singleton.init();

// Create TCP server for incoming connections
const server = net.createServer((socket) => {
  handleIncomingConnection(socket);
});

// Start the server on a random available port
server.listen(0, () => {
  const localIP = "127.0.0.1"; // Assumed IP for simplicity
  const address = server.address();
  const localPort = address.port; // Get the randomly assigned port

  // Generate this peer's ID using Singleton.getPeerID
  const myPeerID = Singleton.getPeerID(localIP, localPort);

  console.log(
    `This peer address is ${localIP}:${localPort} located at ${peerName} [${myPeerID}]`
  );

  // Initialize global state with this peer's information
  global.selfInfo = {
    senderName: peerName,
    ip: localIP,
    port: localPort,
    peerID: myPeerID,
  };
  // Create a new routing table with this peer's ID
  global.routingTable = new RoutingTable(myPeerID);

  // If a target peer is specified, join the network
  if (targetPeer) {
    joinNetwork(targetPeer, global.selfInfo);
  }

  // Start the heartbeat mechanism to maintain peer connections
  Heartbeat.startHeartbeat(
    global.routingTable,
    global.selfInfo,
    sendHeartbeatToPeer
  );
});

/**
 * Handles incoming connections from other peers.
 * This function sets up event handlers for:
 * 1. Data reception - processes incoming messages
 * 2. Error handling - handles socket errors
 * 3. Connection closure - handles peer disconnections
 *
 * @param {net.Socket} socket - The socket connection from the incoming peer
 */
function handleIncomingConnection(socket) {
  console.log(
    `Incoming connection from ${socket.remoteAddress}:${socket.remotePort}`
  );

  socket.on("data", (data) => {
    try {
      // Decode the incoming message using kPTP protocol
      const message = kPTP.decodeMessage(data);
      console.log(
        `Received message from ${message.senderName} (Type ${message.messageType})`
      );
      if (message.messageType === 4) {
        // Process Hello message
        // Create sender info object with fallback values from socket
        const senderInfo = {
          ip:
            (message.selfInfo && message.selfInfo.ip) ||
            socket.remoteAddress.replace("::ffff:", ""), // Remove IPv6 prefix if present
          port:
            (message.selfInfo && message.selfInfo.port) || socket.remotePort,
          peerID:
            message.selfInfo && message.selfInfo.peerID
              ? message.selfInfo.peerID
              : message.peers[0]?.peerID ||
                Singleton.getPeerID(
                  socket.remoteAddress.replace("::ffff:", ""),
                  socket.remotePort
                ),
          senderName: message.senderName,
          lastSeen: Singleton.getTimestamp(),
        };

        console.log(
          `Adding connecting peer ${senderInfo.peerID} to routing table`
        );
        // Add the sender to our routing table
        global.routingTable.pushBucket(senderInfo);

        // Send back a Welcome message with the current peer list
        const welcomeMsg = kPTP.createWelcomeMessage(
          global.selfInfo.senderName,
          getAllPeersArray()
        );
        socket.write(welcomeMsg);
        console.log("\n✅ Routing Table After Processing Hello:");
        logRoutingTable();
      } else if (message.messageType === 6) {
        // Process Heartbeat message
        console.log(`Processing Heartbeat from ${message.senderName}`);
        // Update the peer's last seen time if we have their ID
        if (message.peers && message.peers[0] && message.peers[0].peerID) {
          Heartbeat.handleHeartbeatResponse(message.peers[0].peerID);
        }
        // Send heartbeat response back to the sender
        const heartbeatResponse = kPTP.createHeartbeatResponse(
          global.selfInfo.senderName,
          global.selfInfo.ip,
          global.selfInfo.port,
          global.selfInfo.peerID
        );
        socket.write(heartbeatResponse);
      } else if (message.messageType === 8) {
        // Process Heartbeat Response message
        console.log(`Received Heartbeat Response from ${message.senderName}`);
        // Update the peer's last seen time if we have their ID
        if (message.peers && message.peers[0] && message.peers[0].peerID) {
          Heartbeat.handleHeartbeatResponse(message.peers[0].peerID);
        }
      } else {
        console.log("Unknown message type received.");
      }
    } catch (error) {
      console.error("Error handling incoming data: ", error);
    }
  });

  // Handle socket errors
  socket.on("error", (err) => {
    console.error("Socket error:", err);
  });

  // Handle peer disconnection
  socket.on("close", () => {
    console.log(
      `Connection closed from ${socket.remoteAddress}:${socket.remotePort}`
    );
  });
}

/**
 * Joins an existing network by connecting to a target peer.
 * This function:
 * 1. Creates a connection to the target peer
 * 2. Sends a Hello message with current peer information
 * 3. Processes the Welcome message response
 * 4. Initiates Hello messages to all known peers
 *
 * @param {Object} target - The target peer to connect to { ip, port }
 * @param {Object} selfInfo - This peer's information
 */
function joinNetwork(target, selfInfo) {
  const clientSocket = net.createConnection(
    { host: target.ip, port: target.port },
    () => {
      console.log(
        `Connected to target peer ${target.ip}:${
          target.port
        } at timestamp: ${Singleton.getTimestamp()}`
      );
      const helloMsg = kPTP.createHelloMessage(
        global.selfInfo.senderName,
        getAllPeersArray(), // Use the current peer list (may be empty initially)
        global.selfInfo
      );
      clientSocket.write(helloMsg);
    }
  );

  clientSocket.on("data", (data) => {
    try {
      const message = kPTP.decodeMessage(data);
      console.log(
        `Received message from ${message.senderName} (Type ${message.messageType})`
      );
      if (message.messageType === 2) {
        // Process Welcome message
        console.log(`Processing Welcome message from ${message.senderName}`);
        // Use refreshBuckets() to update the DHT with received peers,
        // but filter out our own info.
        refreshBuckets(global.routingTable, message.peers);
        console.log("\n✅ Routing Table After Welcome Message:");
        global.routingTable.printRoutingTable();
        sendHelloMessages();
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  });

  clientSocket.on("error", (err) => {
    console.error("Error joining network:", err);
  });

  clientSocket.on("close", () => {
    console.log(`Connection closed from ${target.ip}:${target.port}`);
  });
}

/**
 * Sends Hello messages to all peers in the routing table.
 * This function:
 * 1. Collects all peers from the routing table
 * 2. Creates a connection to each peer
 * 3. Sends a Hello message with current peer information
 * 4. Handles responses and errors
 */
function sendHelloMessages() {
  const peers = [];
  global.routingTable.kBuckets.forEach((bucket) => {
    bucket.forEach((peer) => peers.push(peer));
  });
  console.log(`\n📤 Sending Hello messages to ${peers.length} peers...`);
  peers.forEach((peer) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      console.log(`Connection timeout for peer ${peer.peerID}`);
    }, 5000);
    client.connect(peer.port, peer.ip, () => {
      clearTimeout(timeout);
      const helloMessage = kPTP.createHelloMessage(
        global.selfInfo.senderName,
        peers,
        global.selfInfo
      );
      client.write(helloMessage);
    });
    client.on("data", (data) => {
      try {
        const response = kPTP.decodeMessage(data);
        console.log(
          `Received ${
            response.messageType === 2 ? "Welcome" : "Unknown"
          } message from ${response.senderName}`
        );
        logRoutingTable();
      } catch (error) {
        console.error(
          `Error processing response from peer ${peer.peerID}:`,
          error
        );
      }
    });
    client.on("error", (err) => {
      clearTimeout(timeout);
      console.error(`Error sending Hello to peer ${peer.peerID}:`, err.message);
      client.destroy();
    });
    client.on("close", () => {
      clearTimeout(timeout);
      client.destroy();
    });
  });
}

/**
 * Sends a heartbeat message to a peer.
 * This function:
 * 1. Creates a connection to the target peer
 * 2. Sends a heartbeat message
 * 3. Waits for and processes the heartbeat response
 * 4. Handles timeouts and errors
 *
 * @param {Object} peer - The peer to send heartbeat to
 * @param {Buffer} message - The heartbeat message to send
 */
function sendHeartbeatToPeer(peer, message) {
  console.log(
    `Attempting to send heartbeat to peer ${peer.peerID} at ${peer.ip}:${peer.port}`
  );
  const client = new net.Socket();
  // Set a 5-second timeout for the connection
  const timeout = setTimeout(() => {
    client.destroy();
    console.log(`Connection timeout for peer ${peer.peerID}`);
  }, 5000);

  // Connect to the peer and send the heartbeat message
  client.connect(peer.port, peer.ip, () => {
    clearTimeout(timeout);
    client.write(message);
    client.end(); // This is closing the connection before receiving response
  });

  // Handle incoming heartbeat response
  client.on("data", (data) => {
    try {
      const response = kPTP.decodeMessage(data);
      console.log(`Received heartbeat response from ${response.senderName}`);
      if (response.messageType === 8) {
        // Process Heartbeat Response
        Heartbeat.handleHeartbeatResponse(response.peers[0]?.peerID);
      }
    } catch (error) {
      console.error(`Error processing heartbeat response:`, error);
    }
  });

  // Handle connection errors
  client.on("error", (err) => {
    clearTimeout(timeout);
    console.error(
      `Error sending heartbeat to peer ${peer.peerID}:`,
      err.message
    );
    client.destroy();
  });

  // Handle connection closure
  client.on("close", () => {
    clearTimeout(timeout);
    client.destroy();
  });
}

/**
 * Processes a list of received peers and updates the current DHT routing table.
 * This function:
 * 1. Filters out the peer's own information
 * 2. Ensures each peer has a lastSeen timestamp
 * 3. Adds each peer to the routing table
 *
 * @param {RoutingTable} routingTable - The current routing table instance
 * @param {Array} peers - Array of peer objects to process
 */
function refreshBuckets(routingTable, peers) {
  console.log("Refreshing DHT buckets with received peers:");
  console.log(peers);

  peers.forEach((peer) => {
    // Skip if this is our own peer info
    if (peer.peerID === global.selfInfo.peerID) {
      return;
    }
    // Set lastSeen timestamp if not present
    if (!peer.lastSeen) {
      peer.lastSeen = Singleton.getTimestamp();
    }
    // Add or update the peer in the routing table
    routingTable.pushBucket(peer);
  });

  console.log("DHT Table after refresh:");
  global.routingTable.printRoutingTable();
  // Write the updated routing table to a JSON file
  writeRoutingTableToFile();
}

/**
 * Helper function to return a flattened array of all peers from the routing table.
 * This function:
 * 1. Collects all peers from all buckets
 * 2. Returns them as a single array
 *
 * @returns {Array} Array of all peer objects
 */
function getAllPeersArray() {
  const peers = [];
  global.routingTable.kBuckets.forEach((bucket) => {
    bucket.forEach((peer) => {
      peers.push(peer);
    });
  });
  return peers;
}

/**
 * Logs the routing table details to the console and writes them to a JSON file.
 * The JSON file is named based on the peer's ID.
 */
function logRoutingTable() {
  console.log("----- ROUTING TABLE -----");
  const routingTableData = {
    peer: global.selfInfo,
    buckets: [],
  };
  // Iterate through each bucket in the routing table
  global.routingTable.kBuckets.forEach((bucket, bucketIndex) => {
    if (bucket.length === 0) {
      console.log(`Bucket ${bucketIndex}: [empty]`);
      routingTableData.buckets.push({ bucketIndex, peers: [] });
    } else {
      console.log(`Bucket ${bucketIndex}:`);
      const bucketPeers = [];
      bucket.forEach((peer) => {
        const peerInfo = {
          peerID: peer.peerID,
          ip: peer.ip,
          port: peer.port,
          lastSeen: peer.lastSeen,
        };
        console.log(
          `  PeerID: ${peer.peerID}, IP: ${peer.ip}, Port: ${peer.port}, LastSeen: ${peer.lastSeen}`
        );
        bucketPeers.push(peerInfo);
      });
      routingTableData.buckets.push({ bucketIndex, peers: bucketPeers });
    }
  });
  console.log("-------------------------");

  // Write routing table data to a JSON file
  writeRoutingTableToFile(routingTableData);
}

/**
 * Writes the given routing table data to a JSON file.
 * If no data is provided, it builds the data from the global routing table.
 *
 * The file is named using the peer's ID (e.g., routingTable_7cf2.json).
 *
 * @param {Object} [data] - Optional routing table data object.
 */
function writeRoutingTableToFile(data) {
  let routingTableData = data;
  if (!routingTableData) {
    routingTableData = {
      peer: global.selfInfo,
      buckets: [],
    };
    global.routingTable.kBuckets.forEach((bucket, bucketIndex) => {
      const bucketPeers = bucket.map((peer) => ({
        peerID: peer.peerID,
        ip: peer.ip,
        port: peer.port,
        lastSeen: peer.lastSeen,
      }));
      routingTableData.buckets.push({ bucketIndex, peers: bucketPeers });
    });
  }
  const fileName = `routingTable_${global.selfInfo.peerID}.json`;
  fs.writeFileSync(fileName, JSON.stringify(routingTableData, null, 2));
  console.log(`Routing table saved to ${fileName}`);
}
