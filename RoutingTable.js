/**
 * RoutingTable.js
 *
 * This module implements a Kademlia-style routing table for the DHT network that:
 * 1. Maintains k-buckets for storing peer information
 * 2. Handles peer addition and removal
 * 3. Implements XOR-based distance metrics for peer placement
 * 4. Manages peer updates and replacements based on activity
 */

const singleton = require("./Singleton");

/**
 * RoutingTable class implements a Kademlia-style routing table with k-buckets.
 * Each bucket stores peers based on their XOR distance from this peer's ID.
 */
class RoutingTable {
  /**
   * Creates a new routing table with 16 k-buckets.
   * Each bucket can store one peer (k=1) as per assignment requirements.
   *
   * @param {string} peerID - The ID of this peer
   */
  constructor(peerID) {
    this.peerID = peerID; // The ID of this peer
    this.kBuckets = Array(16)
      .fill(null)
      .map(() => []); // 16 k-buckets, each with capacity k = 1
  }

  /**
   * Adds a peer to the appropriate k-bucket based on XOR distance.
   * If the bucket is full, uses tie-breaker rules to decide whether to replace existing peer.
   *
   * @param {Object} peer - The peer object to add (must have peerID, ip, port, senderName, lastSeen)
   */
  pushBucket(peer) {
    // Validate peer object
    if (!peer || !peer.peerID) {
      console.error("Invalid peer object or missing peerID");
      return;
    }

    // Ensure a lastSeen timestamp exists
    if (peer.lastSeen === undefined) {
      peer.lastSeen = singleton.getTimestamp();
    }

    // Get the appropriate bucket index based on XOR distance
    const bucketIndex = this.getBucketIndex(peer.peerID);
    if (bucketIndex === -1) {
      console.error(`Invalid bucket index for peer ${peer.peerID}`);
      return;
    }

    const bucket = this.kBuckets[bucketIndex];

    if (bucket.length === 0) {
      // If the bucket is empty, add the peer
      bucket.push(peer);
      console.log(`Added peer ${peer.peerID} to bucket ${bucketIndex}`);
    } else {
      const existingPeer = bucket[0];
      console.log(`Bucket ${bucketIndex} is full. Evaluating tie-breaker...`);

      // Use comparePeerDistance to decide if the new peer should replace the existing one
      if (this.comparePeerDistance(existingPeer, peer)) {
        console.log(
          `Replacing peer ${existingPeer.peerID} with ${peer.peerID} in bucket ${bucketIndex} (closer or more recently seen)`
        );
        bucket[0] = peer;
      } else {
        console.log(
          `Peer ${peer.peerID} is not closer or more recent than the existing peer ${existingPeer.peerID}. No update.`
        );
      }
    }
  }

  /**
   * Removes a peer from its bucket.
   *
   * @param {string} peerID - The ID of the peer to remove
   */
  removePeer(peerID) {
    try {
      const bucketIndex = this.getBucketIndex(peerID);
      if (bucketIndex !== -1) {
        // Filter out the peer with matching ID
        this.kBuckets[bucketIndex] = this.kBuckets[bucketIndex].filter(
          (peer) => peer.peerID !== peerID
        );
        console.log(`Removed peer ${peerID} from bucket ${bucketIndex}`);
      }
    } catch (error) {
      console.error(`Error removing peer ${peerID}:`, error);
    }
  }

  /**
   * Returns the closest peer(s) based on XOR distance.
   * Currently returns only the closest peer (k=1) as per assignment requirements.
   *
   * @param {string} targetID - The target peer ID to find closest peer to
   * @returns {Array} Array containing the closest peer
   */
  getClosestPeers(targetID) {
    // Flatten all k-buckets into a single array
    let allPeers = this.kBuckets.flat();
    // Sort peers by XOR distance
    allPeers.sort((a, b) => {
      const distanceA = parseInt(
        singleton.XORing(
          singleton.Hex2Bin(this.peerID),
          singleton.Hex2Bin(a.peerID)
        ),
        2
      );
      const distanceB = parseInt(
        singleton.XORing(
          singleton.Hex2Bin(this.peerID),
          singleton.Hex2Bin(b.peerID)
        ),
        2
      );
      return distanceA - distanceB;
    });
    return allPeers.slice(0, 1); // Return the closest peer (k = 1)
  }

  /**
   * Computes the appropriate bucket index based on shared prefix bits.
   * Uses XOR distance to determine which bucket a peer belongs to.
   *
   * @param {string} peerID - The peer ID to compute bucket index for
   * @returns {number} The bucket index (0-15) or -1 if error
   */
  getBucketIndex(peerID) {
    try {
      // Convert both peer IDs to binary
      const thisPeerBinary = singleton.Hex2Bin(this.peerID);
      const otherPeerBinary = singleton.Hex2Bin(peerID);
      // Compute XOR distance
      const xorResult = singleton.XORing(thisPeerBinary, otherPeerBinary);
      // Find first 1 in XOR result to determine bucket index
      const index = xorResult.indexOf("1");
      return index === -1 ? 0 : index;
    } catch (error) {
      console.error(
        `Error calculating bucket index for peer ${peerID}:`,
        error
      );
      return -1;
    }
  }

  /**
   * Compares two peers to determine which should be kept in the bucket.
   * Uses XOR distance and lastSeen timestamp for tie-breaking.
   *
   * @param {Object} existingPeer - The peer currently in the bucket
   * @param {Object} newPeer - The new peer being considered
   * @returns {boolean} True if new peer should replace existing peer
   */
  comparePeerDistance(existingPeer, newPeer) {
    try {
      // Convert all peer IDs to binary for XOR comparison
      const thisPeerBinary = singleton.Hex2Bin(this.peerID);
      const existingPeerBinary = singleton.Hex2Bin(existingPeer.peerID);
      const newPeerBinary = singleton.Hex2Bin(newPeer.peerID);

      // Compute XOR distances
      const distanceExisting = parseInt(
        singleton.XORing(thisPeerBinary, existingPeerBinary),
        2
      );
      const distanceNew = parseInt(
        singleton.XORing(thisPeerBinary, newPeerBinary),
        2
      );

      // Compare distances
      if (distanceNew < distanceExisting) {
        return true; // New peer is closer
      } else if (distanceNew === distanceExisting) {
        // Tie-breaker: use lastSeen timestamps (more recent means higher value)
        if (newPeer.lastSeen > existingPeer.lastSeen) {
          return true;
        } else {
          return false;
        }
      } else {
        return false;
      }
    } catch (error) {
      console.error(`Error comparing peer distances:`, error);
      return false;
    }
  }

  /**
   * Prints the current state of the routing table.
   * Shows all non-empty buckets and their contents.
   */
  printRoutingTable() {
    console.log("\nRouting Table:");
    this.kBuckets.forEach((bucket, index) => {
      if (bucket.length > 0) {
        console.log(
          `Bucket ${index}: ${bucket.map((p) => p.peerID).join(", ")}`
        );
      }
    });
  }

  /**
   * Checks if a peer exists in any bucket.
   *
   * @param {string} peerID - The peer ID to check for
   * @returns {boolean} True if peer exists in any bucket
   */
  hasPeer(peerID) {
    return this.kBuckets.some((bucket) =>
      bucket.some((peer) => peer.peerID === peerID)
    );
  }
}

module.exports = RoutingTable;
