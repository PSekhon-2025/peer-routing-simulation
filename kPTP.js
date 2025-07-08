const kPTP_VERSION = 18;
const MESSAGE_TYPE = {
  WELCOME: 2,
  HELLO: 4,
  HEARTBEAT: 6,
  HEARTBEAT_RESPONSE: 8,
};

/**
 * Decodes a received kPTP message.
 * Returns an object containing:
 *  - version, messageType, numPeers, senderName, peers, and optionally selfInfo if extra payload is present.
 * @param {Buffer} buffer
 * @returns {object}
 */

/**
 * Converts a dotted-decimal IP string into a 4-byte Buffer.
 * @param {string} ip - e.g., "192.168.1.1"
 * @returns {Buffer}
 */
function encodeIP(ip) {
  const parts = ip.split(".").map(Number);
  const buf = Buffer.alloc(4);
  for (let i = 0; i < 4; i++) {
    buf[i] = parts[i];
  }
  return buf;
}

/**
 * Encodes a port number (string or number) into a 2-byte Buffer (big-endian).
 * @param {number|string} port
 * @returns {Buffer}
 */
function encodePort(port) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(parseInt(port, 10), 0);
  return buf;
}

/**
 * Encodes a peerID (a hex string of 4 characters representing 16 bits)
 * into a 2-byte Buffer.
 * @param {string} peerID
 * @returns {Buffer}
 */
function encodePeerID(peerID) {
  return Buffer.from(peerID, "hex");
}

/**
 * Creates a header for the kPTP message.
 * Format:
 *   1 byte: Version (set to 18)
 *   1 byte: Message Type (e.g., 2 for Welcome)
 *   1 byte: Number of Peers in the payload
 *   2 bytes: Sender Name Length (in bytes)
 * @param {number} messageType
 * @param {number} numPeers
 * @param {string} senderName
 * @returns {Buffer}
 */
function createHeader(messageType, numPeers, senderName) {
  const header = Buffer.alloc(5);
  header.writeUInt8(kPTP_VERSION, 0);
  header.writeUInt8(messageType, 1);
  header.writeUInt8(numPeers, 2);
  // Write sender name length as a 2-byte big-endian integer.
  header.writeUInt16BE(Buffer.byteLength(senderName, "utf8"), 3);
  return header;
}

/**
 * Encodes a single peer's information.
 * Each peer entry consists of:
 *   - 4 bytes: IP address
 *   - 2 bytes: Port number
 *   - 2 bytes: Peer ID
 * @param {object} peer - { ip, port, peerID }
 * @returns {Buffer}
 */
function encodePeerInfo(peer) {
  const ipBuf = encodeIP(peer.ip);
  const portBuf = encodePort(peer.port);
  const idBuf = encodePeerID(peer.peerID);
  return Buffer.concat([ipBuf, portBuf, idBuf]);
}

/**
 * Creates a complete kPTP message.
 * Message structure:
 *   Header | (Peer Info repeated for each peer) | Sender Name (UTF8)
 * @param {number} messageType - One of MESSAGE_TYPE
 * @param {string} senderName
 * @param {Array} peers - Array of peer objects: { ip, port, peerID }
 * @returns {Buffer}
 */
function createMessage(messageType, senderName, peers) {
  const numPeers = peers.length;
  const header = createHeader(messageType, numPeers, senderName);

  // Encode peer info blocks
  const peersBuffers = peers.map(encodePeerInfo);
  const peersData = peersBuffers.length
    ? Buffer.concat(peersBuffers)
    : Buffer.alloc(0);

  // Encode sender name as UTF8
  const senderNameBuf = Buffer.from(senderName, "utf8");

  return Buffer.concat([header, peersData, senderNameBuf]);
}

// Exported functions for different message types:
module.exports = {
  /**
   * Creates a Welcome message (Message Type 2).
   * @param {string} senderName
   * @param {Array} peers - Array of known peers ({ ip, port, peerID })
   * @returns {Buffer}
   */
  createWelcomeMessage: function (senderName, peers) {
    return createMessage(MESSAGE_TYPE.WELCOME, senderName, peers);
  },

  /**
   * Creates a Hello message (Message Type 4).
   * @param {string} senderName
   * @param {Array} peers - Array of known peers ({ ip, port, peerID })
   * @returns {Buffer}
   */
  createHelloMessage: function (senderName, peers, selfInfo) {
    // Build the base message as before
    const baseMessage = createMessage(MESSAGE_TYPE.HELLO, senderName, peers);
    // Convert selfInfo (an object containing the correct listening IP and port) into a JSON string,
    // then into a Buffer.
    const selfInfoBuf = Buffer.from(JSON.stringify(selfInfo), "utf8");
    // Append selfInfo to the base message.
    return Buffer.concat([baseMessage, selfInfoBuf]);
  },

  /**
   * Creates a Heartbeat message (Message Type 6).
   * The sender’s own info is included as a single peer entry.
   * @param {string} senderName
   * @param {string} senderIP
   * @param {number|string} senderPort
   * @param {string} senderPeerID
   * @returns {Buffer}
   */
  createHeartbeatMessage: function (
    senderName,
    senderIP,
    senderPort,
    senderPeerID
  ) {
    const peers = [
      {
        ip: senderIP,
        port: senderPort,
        peerID: senderPeerID,
      },
    ];
    return createMessage(MESSAGE_TYPE.HEARTBEAT, senderName, peers);
  },

  /**
   * Creates a Heartbeat Response message (Message Type 8).
   * @param {string} senderName
   * @param {string} senderIP
   * @param {number|string} senderPort
   * @param {string} senderPeerID
   * @returns {Buffer}
   */
  createHeartbeatResponse: function (
    senderName,
    senderIP,
    senderPort,
    senderPeerID
  ) {
    const peers = [
      {
        ip: senderIP,
        port: senderPort,
        peerID: senderPeerID,
      },
    ];
    return createMessage(MESSAGE_TYPE.HEARTBEAT_RESPONSE, senderName, peers);
  },

  /**
   * Decodes a received kPTP message.
   * Returns an object containing:
   *  - version, messageType, numPeers, senderName, and an array of peer info objects.
   * @param {Buffer} buffer
   * @returns {object}
   */
  decodeMessage: function (buffer) {
    const version = buffer.readUInt8(0);
    const messageType = buffer.readUInt8(1);
    const numPeers = buffer.readUInt8(2);
    const senderNameLength = buffer.readUInt16BE(3);
    let offset = 5;
    const peers = [];
    for (let i = 0; i < numPeers; i++) {
      const ipBuf = buffer.slice(offset, offset + 4);
      const ip = Array.from(ipBuf).join(".");
      offset += 4;
      const port = buffer.readUInt16BE(offset);
      offset += 2;
      const peerID = buffer.slice(offset, offset + 2).toString("hex");
      offset += 2;
      peers.push({ ip, port, peerID });
    }
    const senderName = buffer
      .slice(offset, offset + senderNameLength)
      .toString("utf8");
    offset += senderNameLength;
    let selfInfo = null;
    if (offset < buffer.length) {
      try {
        const extraPayload = buffer.slice(offset).toString("utf8");
        selfInfo = JSON.parse(extraPayload);
      } catch (e) {
        console.error("Failed to parse extra payload as JSON:", e);
      }
    }
    return {
      version,
      messageType,
      numPeers,
      senderName,
      peers,
      selfInfo,
    };
  },
};
