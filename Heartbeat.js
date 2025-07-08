/**
 * Heartbeat.js
 *
 * This module implements a heartbeat mechanism for the DHT network that:
 * 1. Periodically sends heartbeat messages to all peers
 * 2. Tracks missed heartbeats for each peer
 * 3. Removes peers that miss too many heartbeats
 * 4. Updates peer lastSeen timestamps on successful responses
 */

const kPTP = require("./kPTP");
const singleton = require("./Singleton");

// Object to keep track of missed heartbeat counts for each peer (keyed by peerID)
// Used to detect and remove inactive peers from the network
let missedCounts = {};

/**
 * Extracts all peers from the routing table.
 * This function flattens the k-bucket structure into a single array of peers.
 *
 * @param {Object} routingTable - The routing table instance containing k-buckets
 * @returns {Array} - Flattened list of all peer objects from all buckets
 */
function getAllPeers(routingTable) {
  let allPeers = [];
  // Iterate through each k-bucket
  routingTable.kBuckets.forEach((bucket) => {
    // Add each peer from the bucket to the result array
    bucket.forEach((peer) => {
      allPeers.push(peer);
    });
  });
  return allPeers;
}

/**
 * Starts the heartbeat process.
 * This function:
 * 1. Sets up an interval to send heartbeats every 20 seconds
 * 2. Sends heartbeat messages to all peers in the routing table
 * 3. Tracks missed heartbeats for each peer
 * 4. Removes peers that miss 3 consecutive heartbeats
 *
 * @param {Object} routingTable - Your routing table instance
 * @param {Object} selfInfo - An object containing sender information:
 *                            { senderName, ip, port, peerID }
 * @param {Function} sendFunction - A callback to send a message to a peer.
 *                                  Should be called as: sendFunction(peer, message)
 */
function startHeartbeat(routingTable, selfInfo, sendFunction) {
  // Set up interval to run heartbeat cycle every 20 seconds
  setInterval(() => {
    console.log(`\nHeartbeat cycle at timestamp: ${singleton.getTimestamp()}`);
    // Get all peers from the routing table
    const peers = getAllPeers(routingTable);
    peers.forEach((peer) => {
      // Create a heartbeat message (Message Type 6)
      const heartbeatMsg = kPTP.createHeartbeatMessage(
        selfInfo.senderName,
        selfInfo.ip,
        selfInfo.port,
        selfInfo.peerID
      );
      // Send the heartbeat message to the peer
      sendFunction(peer, heartbeatMsg);
      console.log(`Sent heartbeat to peer ${peer.peerID}`);

      // Update missed heartbeat count for this peer
      if (missedCounts[peer.peerID] === undefined) {
        // Initialize count if this is the first missed heartbeat
        missedCounts[peer.peerID] = 1;
      } else {
        // Increment the missed count
        missedCounts[peer.peerID]++;
      }
      console.log(
        `Peer ${peer.peerID} has missed ${
          missedCounts[peer.peerID]
        } heartbeat(s).`
      );

      // Remove the peer if it has missed 3 or more heartbeats
      if (missedCounts[peer.peerID] >= 3) {
        console.log(`Removing peer ${peer.peerID} due to missed heartbeats.`);
        routingTable.removePeer(peer.peerID);
        // Clean up the missed count for this peer
        delete missedCounts[peer.peerID];
      }
    });
  }, 20000); // heartbeat interval: 20 seconds
}

/**
 * Resets the missed heartbeat count for a peer when a heartbeat response is received.
 * This function:
 * 1. Resets the missed count to 0
 * 2. Updates the peer's lastSeen timestamp in the routing table
 *
 * @param {string} peerID - The ID of the peer that responded
 */
function handleHeartbeatResponse(peerID) {
  console.log(`Received heartbeat response from peer ${peerID}`);
  // Reset the missed count for this peer
  missedCounts[peerID] = 0;

  // Update the lastSeen timestamp for the peer in the global routing table
  if (global.routingTable) {
    // Search through all buckets for the peer
    global.routingTable.kBuckets.forEach((bucket) => {
      bucket.forEach((peer) => {
        if (peer.peerID === peerID) {
          // Update the lastSeen timestamp to current time
          peer.lastSeen = singleton.getTimestamp();
          console.log(
            `Updated lastSeen for peer ${peerID} to ${peer.lastSeen}`
          );
        }
      });
    });
  }
}

// Export the heartbeat functions
module.exports = {
  startHeartbeat,
  handleHeartbeatResponse,
};
